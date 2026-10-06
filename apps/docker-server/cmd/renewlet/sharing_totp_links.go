package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type sharingTotpLink struct {
	ID        string  `json:"id"`
	SeatID    string  `json:"seatId"`
	Path      string  `json:"path"`
	ExpiresAt *string `json:"expiresAt"`
	Valid     bool    `json:"valid"`
}
type sharingTotpLinkCommand struct {
	SeatID *string `json:"seatId"`
	Reset  bool    `json:"reset"`
}

func ensureSharingTotpLinksCollection(app core.App, users *core.Collection) error {
	err := ensureCollection(app, "sharing_totp_links", func(c *core.Collection) error {
		secretCollectionRules(c)
		for _, f := range []core.Field{userRelation(users),
			&core.TextField{Name: "accountId", Required: true, Max: 128}, &core.TextField{Name: "seatId", Max: 128},
			&core.TextField{Name: "scopeKey", Required: true, Max: 160},
			&core.TextField{Name: "totpId", Required: true, Max: 128}, &core.TextField{Name: "tokenHash", Required: true, Max: 128},
			&core.TextField{Name: "tokenCiphertext", Required: true, Max: 16384}, &core.TextField{Name: "bindingHash", Required: true, Max: 128},
			&core.TextField{Name: "expiresAt", Max: 64}, &core.BoolField{Name: "revoked"},
		} {
			if err := upsertField(c, f); err != nil {
				return err
			}
		}
		c.AddIndex("idx_sharing_totp_token", true, "tokenHash", "")
		c.AddIndex("idx_sharing_totp_scope", true, "user, accountId, scopeKey", "")
		return ensureAutodates(c)
	})
	if err != nil {
		return err
	}
	// Upgrade live default tokens without reviving expired or revoked grants.
	_, err = app.DB().NewQuery("UPDATE sharing_totp_links SET expiresAt='' WHERE seatId='' AND revoked=0 AND julianday(expiresAt)>julianday('now')").Execute()
	return err
}

func familyVerificationMode(sub *core.Record) string {
	config, _ := subscriptionRecordJSONMap(sub, "extra")["familyVerification"].(map[string]interface{})
	if config["mode"] == "totp" {
		return "totp"
	}
	return "email"
}

func familyVerificationBindingKey(sub *core.Record) string {
	if familyVerificationMode(sub) != "totp" {
		return "email"
	}
	config, _ := subscriptionRecordJSONMap(sub, "extra")["familyVerification"].(map[string]interface{})
	id, _ := config["totpAccountId"].(string)
	return "totp:" + id
}

func familyTotpBinding(app core.App, userID, accountID, seatID string) (*core.Record, string, error) {
	account, err := findOwnedSharingAccount(app, userID, accountID)
	if err != nil || account.GetString("status") != "active" {
		return nil, "", fmt.Errorf("sharing account unavailable")
	}
	sub, err := app.FindRecordById("subscriptions", account.GetString("subscription"))
	if err != nil || sub.GetString("user") != userID || !sub.GetBool("familySharingEnabled") || familyVerificationMode(sub) != "totp" {
		return nil, "", fmt.Errorf("2FA sharing unavailable")
	}
	config, _ := subscriptionRecordJSONMap(sub, "extra")["familyVerification"].(map[string]interface{})
	totpID, _ := config["totpAccountId"].(string)
	otp, err := app.FindFirstRecordByFilter("online_totp_accounts", "id={:id} && user={:user} && enabled=true", dbx.Params{"id": totpID, "user": userID})
	if err != nil || !strings.EqualFold(strings.TrimSpace(otp.GetString("account")), strings.TrimSpace(sub.GetString("sharingLoginAccount"))) {
		return nil, "", fmt.Errorf("matching online 2FA account required")
	}
	parts := []string{accountID, totpID, strings.ToLower(strings.TrimSpace(sub.GetString("sharingLoginAccount"))), otp.GetString("secretCiphertext")}
	if seatID != "" {
		seat, err := findOwnedSharingSeat(app, userID, seatID)
		if err != nil || seat.GetString("sharingAccount") != accountID || seat.GetString("status") != "active" || strings.TrimSpace(seat.GetString("memberName")) == "" || seat.GetInt("seatNumber") > sub.GetInt("sharingCapacity") {
			return nil, "", fmt.Errorf("seat unavailable")
		}
		if date := seat.GetString("expiresAt"); date != "" && date < todayDateOnly(time.Now(), schedulerSettingsForUser(app, userID).Timezone) {
			return nil, "", fmt.Errorf("seat expired")
		}
		parts = append(parts, seatID, seat.GetString("memberName"), seat.GetString("contact"), seat.GetString("contactType"))
	}
	encoded, _ := json.Marshal(parts)
	return otp, onlineTotpShareHash(string(encoded)), nil
}

func sharingTotpLinkValid(app core.App, link *core.Record) bool {
	expiry, err := time.Parse(time.RFC3339Nano, link.GetString("expiresAt"))
	permanentDefault := link.GetString("seatId") == "" && link.GetString("expiresAt") == ""
	if link.GetBool("revoked") || (!permanentDefault && (err != nil || !expiry.After(time.Now()))) {
		return false
	}
	_, hash, err := familyTotpBinding(app, link.GetString("user"), link.GetString("accountId"), link.GetString("seatId"))
	return err == nil && hash == link.GetString("bindingHash")
}

// A scope has its own token; rotating one never touches the TOTP account's original share key.
func ensureFamilyTotpLink(app core.App, userID, accountID, seatID string, reset bool) error {
	otp, hash, err := familyTotpBinding(app, userID, accountID, seatID)
	if err != nil {
		return err
	}
	scopeKey := "default"
	if seatID != "" {
		scopeKey = "seat:" + seatID
	}
	record, err := app.FindFirstRecordByFilter("sharing_totp_links", "user={:user} && accountId={:account} && scopeKey={:scope}", dbx.Params{"user": userID, "account": accountID, "scope": scopeKey})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("scope lookup: %w", err)
	}
	if err == nil && !reset && sharingTotpLinkValid(app, record) {
		return nil
	}
	if err == nil && !reset && record.GetBool("revoked") && record.GetString("bindingHash") == hash {
		return nil
	}
	if record == nil {
		collection, err := app.FindCollectionByNameOrId("sharing_totp_links")
		if err != nil {
			return err
		}
		record = core.NewRecord(collection)
	}
	token := randomURLToken(24)
	ciphertext, err := transformOnlineTotpSecret(app, token, true)
	if err != nil {
		return err
	}
	expiry := time.Now().Add(30 * 24 * time.Hour)
	if seatID != "" {
		seat, err := findOwnedSharingSeat(app, userID, seatID)
		if err != nil {
			return err
		}
		if date := seat.GetString("expiresAt"); date != "" {
			location, err := time.LoadLocation(schedulerSettingsForUser(app, userID).Timezone)
			if err != nil {
				location = time.UTC
			}
			day, err := time.ParseInLocation("2006-01-02", date, location)
			end := day.AddDate(0, 0, 1).Add(-time.Second)
			if err != nil || !end.After(time.Now()) {
				return fmt.Errorf("seat expired")
			}
			if end.Before(expiry) {
				expiry = end
			}
		}
	}
	expiresAt := ""
	if seatID != "" {
		expiresAt = expiry.UTC().Format(time.RFC3339)
	}
	for key, value := range map[string]any{"user": userID, "accountId": accountID, "seatId": seatID, "scopeKey": scopeKey, "totpId": otp.Id, "tokenHash": onlineTotpShareHash(token), "tokenCiphertext": ciphertext, "bindingHash": hash, "expiresAt": expiresAt, "revoked": false} {
		record.Set(key, value)
	}
	if err := app.Save(record); err != nil {
		return fmt.Errorf("save scope %q record %s: %w", seatID, record.Id, err)
	}
	return nil
}

func syncFamilyTotpLinks(app core.App, sub *core.Record) error {
	if !sub.GetBool("familySharingEnabled") || familyVerificationMode(sub) != "totp" {
		return nil
	}
	account, err := app.FindFirstRecordByFilter("sharing_accounts", "user={:user} && subscription={:sub}", dbx.Params{"user": sub.GetString("user"), "sub": sub.Id})
	if err != nil {
		return err
	}
	if err := ensureFamilyTotpLink(app, sub.GetString("user"), account.Id, "", false); err != nil {
		return err
	}
	seats, err := app.FindRecordsByFilter("sharing_seats", "user={:user} && sharingAccount={:account} && status='active' && memberName!=''", "seatNumber", 100, 0, dbx.Params{"user": sub.GetString("user"), "account": account.Id})
	if err != nil {
		return err
	}
	for _, seat := range seats {
		if seat.GetInt("seatNumber") > sub.GetInt("sharingCapacity") {
			continue
		}
		if date := seat.GetString("expiresAt"); date != "" && date < todayDateOnly(time.Now(), schedulerSettingsForUser(app, sub.GetString("user")).Timezone) {
			continue
		}
		if err := ensureFamilyTotpLink(app, sub.GetString("user"), account.Id, seat.Id, false); err != nil {
			return err
		}
	}
	return nil
}

func handleSharingTotpLinks(app core.App, e *core.RequestEvent) error {
	accountID := e.Request.PathValue("id")
	account, err := findOwnedSharingAccount(app, e.Auth.Id, accountID)
	if err != nil {
		return e.NotFoundError("SHARING_ACCOUNT_NOT_FOUND", err)
	}
	if _, _, err := familyTotpBinding(app, e.Auth.Id, accountID, ""); err != nil {
		return e.ForbiddenError("2FA_SHARING_DISABLED", nil)
	}
	if e.Request.Method == http.MethodPost {
		body, err := decodeStrictJSON[sharingTotpLinkCommand](e.Request, requestLocale(e.Request))
		if err != nil {
			return e.BadRequestError("INVALID_PAYLOAD", err)
		}
		if body.SeatID != nil && len(*body.SeatID) > 128 {
			return e.BadRequestError("INVALID_PAYLOAD", nil)
		}
		err = app.RunInTransaction(func(tx core.App) error {
			if body.SeatID != nil {
				return ensureFamilyTotpLink(tx, e.Auth.Id, accountID, *body.SeatID, body.Reset)
			}
			sub, err := tx.FindRecordById("subscriptions", account.GetString("subscription"))
			if err != nil {
				return err
			}
			return syncFamilyTotpLinks(tx, sub)
		})
		if err != nil {
			return e.BadRequestError("2FA 账号未匹配、车位未启用或已过期", err)
		}
	}
	records, err := app.FindRecordsByFilter("sharing_totp_links", "user={:user} && accountId={:account}", "seatId", 101, 0, dbx.Params{"user": e.Auth.Id, "account": accountID})
	if err != nil {
		return e.InternalServerError("INTERNAL_ERROR", err)
	}
	links := make([]sharingTotpLink, 0, len(records))
	for _, record := range records {
		valid := sharingTotpLinkValid(app, record)
		path := ""
		if valid {
			token, err := transformOnlineTotpSecret(app, record.GetString("tokenCiphertext"), false)
			if err != nil {
				return e.InternalServerError("INTERNAL_ERROR", err)
			}
			path = "/otp/" + token
		}
		links = append(links, sharingTotpLink{ID: record.Id, SeatID: record.GetString("seatId"), Path: path, ExpiresAt: nullableStringPointer(record.GetString("expiresAt")), Valid: valid})
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	return apiSuccessJSON(e, http.StatusOK, map[string]any{"links": links})
}

func handleRevokeSharingTotpLink(app core.App, e *core.RequestEvent) error {
	link, err := app.FindFirstRecordByFilter("sharing_totp_links", "id={:link} && accountId={:account} && user={:user}", dbx.Params{"link": e.Request.PathValue("linkId"), "account": e.Request.PathValue("id"), "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("LINK_NOT_FOUND", err)
	}
	link.Set("revoked", true)
	if err := app.Save(link); err != nil {
		return e.InternalServerError("INTERNAL_ERROR", err)
	}
	return apiEmptySuccessJSON(e, http.StatusOK)
}

func resolvePublicSharingTotp(app core.App, token string) (*core.Record, error) {
	link, err := app.FindFirstRecordByFilter("sharing_totp_links", "tokenHash={:hash}", dbx.Params{"hash": onlineTotpShareHash(token)})
	if err != nil || !sharingTotpLinkValid(app, link) {
		return nil, fmt.Errorf("link unavailable")
	}
	return app.FindRecordById("online_totp_accounts", link.GetString("totpId"))
}
