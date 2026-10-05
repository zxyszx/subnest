package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type sharedInboxLinkRequest struct {
	SeatID        string   `json:"seatId"`
	MailboxID     string   `json:"mailboxId"`
	FolderIDs     []string `json:"folderIds"`
	WindowMinutes int      `json:"windowMinutes"`
	ExpiresAt     *string  `json:"expiresAt"`
}

type sharedInboxLinkResponse struct {
	SeatID         string   `json:"seatId"`
	ID             string   `json:"id"`
	ShortURL       string   `json:"shortUrl"`
	MailboxID      string   `json:"mailboxId"`
	MailboxAddress string   `json:"mailboxAddress"`
	FolderIDs      []string `json:"folderIds"`
	WindowMinutes  int      `json:"windowMinutes"`
	ExpiresAt      *string  `json:"expiresAt"`
	Status         string   `json:"status"`
	CreatedAt      string   `json:"createdAt"`
	UpdatedAt      string   `json:"updatedAt"`
}

type newszxcnGrantResponse struct {
	ID string `json:"id"`
}

func handleSharedInboxLinks(app core.App, e *core.RequestEvent) error {
	records, err := app.FindRecordsByFilter("shared_inbox_links", "user = {:user}", "-created", 0, 0, map[string]any{"user": e.Auth.Id})
	if err != nil {
		return e.InternalServerError("load shared inbox links failed", err)
	}
	links := make([]sharedInboxLinkResponse, 0, len(records))
	syncedMailboxes := map[string]bool{}
	for _, record := range records {
		link, err := sharedInboxLinkFromRecord(app, e.Request, record)
		if err != nil {
			return e.InternalServerError("shared inbox link decryption failed", err)
		}
		mailboxKey := strings.ToLower(strings.TrimSpace(link.MailboxAddress))
		if link.SeatID == "" && link.Status == "active" && !syncedMailboxes[mailboxKey] {
			if err := syncSharedInboxLinkToSubscriptions(app, e.Auth.Id, link.MailboxAddress, "", link.ShortURL); err != nil {
				return e.InternalServerError("sync shared inbox link failed", err)
			}
			syncedMailboxes[mailboxKey] = true
		}
		links = append(links, link)
	}
	return apiSuccessJSON(e, http.StatusOK, map[string]any{"links": links})
}

func handleSharedInboxLinkCreate(app core.App, e *core.RequestEvent) error {
	body, err := decodeStrictJSON[sharedInboxLinkRequest](e.Request, requestLocale(e.Request))
	if err != nil {
		return err
	}
	body.MailboxID = strings.TrimSpace(body.MailboxID)
	body.SeatID = strings.TrimSpace(body.SeatID)
	if len(body.SeatID) > 256 {
		return e.BadRequestError("车位编号无效", nil)
	}
	if body.SeatID != "" && body.ExpiresAt == nil {
		return e.BadRequestError("车位链接必须设置有效期", nil)
	}
	if body.MailboxID == "" || len(body.FolderIDs) == 0 {
		return e.BadRequestError("请选择邮箱和至少一个文件夹", nil)
	}
	if body.WindowMinutes != 30 && body.WindowMinutes != 60 && body.WindowMinutes != 360 && body.WindowMinutes != 1440 && body.WindowMinutes != 10080 {
		return e.BadRequestError("邮件范围无效", nil)
	}
	if body.ExpiresAt != nil {
		value := strings.TrimSpace(*body.ExpiresAt)
		parsed, parseErr := time.Parse(time.RFC3339, value)
		if parseErr != nil || !parsed.After(time.Now().UTC()) {
			return e.BadRequestError("链接到期时间无效", nil)
		}
		body.ExpiresAt = &value
	}
	mailboxes, err := fetchNewSzxcn[newszxcnMailbox](app, e.Auth.Id, "/api/open/v1/subnest/mailboxes")
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "无法读取 NewSzxcn 邮箱", err)
	}
	var mailbox *newszxcnMailbox
	for index := range mailboxes {
		if mailboxes[index].ID == body.MailboxID {
			mailbox = &mailboxes[index]
			break
		}
	}
	if mailbox == nil {
		return e.BadRequestError("邮箱不存在", nil)
	}
	var seatVersion string
	if body.SeatID != "" {
		seatVersion, err = inboxSeatVersion(app, e.Auth.Id, body.SeatID, mailbox.Address)
		if err != nil {
			return e.BadRequestError("车位不存在、未启用合租或邮箱不匹配", nil)
		}
	}
	if existing, _ := app.FindFirstRecordByFilter("shared_inbox_links", "user = {:user} && mailboxId = {:mailbox} && seatId = {:seat} && status = 'active'", map[string]any{"user": e.Auth.Id, "mailbox": body.MailboxID, "seat": body.SeatID}); existing != nil {
		return apiErrorJSON(e, http.StatusConflict, "SHARE_ALREADY_ACTIVE", "该邮箱已开启分享，请先管理现有链接", nil)
	}

	externalGrantID := "subnest_" + randomURLToken(18)
	grantPayload := map[string]any{"externalGrantId": externalGrantID, "mailboxId": body.MailboxID, "folderIds": body.FolderIDs, "windowMinutes": body.WindowMinutes}
	if body.ExpiresAt != nil {
		grantPayload["expiresAt"] = *body.ExpiresAt
	}
	grantRaw, err := requestNewSzxcn(app, e.Auth.Id, http.MethodPost, "/api/open/v1/subnest/grants", grantPayload)
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "创建邮箱授权失败", err)
	}
	var grant newszxcnGrantResponse
	if err := json.Unmarshal(grantRaw, &grant); err != nil || strings.TrimSpace(grant.ID) == "" {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_INVALID_RESPONSE", "邮箱授权响应无效", err)
	}

	shortKey := randomURLToken(24)
	encryptedKey, err := encryptSharingCredential(app, shortKey)
	if err != nil {
		_, _ = requestNewSzxcn(app, e.Auth.Id, http.MethodDelete, "/api/open/v1/subnest/grants/"+url.PathEscape(grant.ID), nil)
		return e.InternalServerError("short link encryption failed", err)
	}
	var record *core.Record
	shortURL := externalRequestURL(e.Request, "/s/"+shortKey, nil)
	if err := app.RunInTransaction(func(txApp core.App) error {
		if body.SeatID != "" {
			currentVersion, err := inboxSeatVersion(txApp, e.Auth.Id, body.SeatID, mailbox.Address)
			if err != nil || currentVersion != seatVersion {
				return fmt.Errorf("seat changed during link creation")
			}
		}
		collection, err := txApp.FindCollectionByNameOrId("shared_inbox_links")
		if err != nil {
			return err
		}
		record = core.NewRecord(collection)
		record.Set("user", e.Auth.Id)
		record.Set("seatId", body.SeatID)
		record.Set("shortKeyHash", tokenHash(shortKey))
		record.Set("shortKeyCiphertext", encryptedKey)
		record.Set("grantId", grant.ID)
		record.Set("externalGrantId", externalGrantID)
		record.Set("mailboxId", body.MailboxID)
		record.Set("mailboxAddress", mailbox.Address)
		record.Set("folderIds", body.FolderIDs)
		record.Set("windowMinutes", body.WindowMinutes)
		if body.ExpiresAt != nil {
			record.Set("expiresAt", *body.ExpiresAt)
		}
		record.Set("status", "active")
		if err := txApp.Save(record); err != nil {
			return err
		}
		if body.SeatID != "" {
			return validateInboxSeat(txApp, e.Auth.Id, body.SeatID, mailbox.Address)
		}
		return syncSharedInboxLinkToSubscriptions(txApp, e.Auth.Id, mailbox.Address, "", shortURL)
	}); err != nil {
		_, _ = requestNewSzxcn(app, e.Auth.Id, http.MethodDelete, "/api/open/v1/subnest/grants/"+url.PathEscape(grant.ID), nil)
		return e.InternalServerError("save shared inbox link failed", err)
	}
	link, err := sharedInboxLinkFromRecord(app, e.Request, record)
	if err != nil {
		return e.InternalServerError("short link decryption failed", err)
	}
	return apiSuccessJSON(e, http.StatusCreated, map[string]any{"link": link})
}

func handleSharedInboxLinkRevoke(app core.App, e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	record, err := app.FindRecordById("shared_inbox_links", id)
	if err != nil || record.GetString("user") != e.Auth.Id || record.GetString("status") != "active" {
		return e.NotFoundError("短链接不存在", nil)
	}
	if _, err := requestNewSzxcn(app, e.Auth.Id, http.MethodDelete, "/api/open/v1/subnest/grants/"+url.PathEscape(record.GetString("grantId")), nil); err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "撤销邮箱授权失败", err)
	}
	oldLink, err := sharedInboxLinkFromRecord(app, e.Request, record)
	if err != nil {
		return e.InternalServerError("short link decryption failed", err)
	}
	if err := app.RunInTransaction(func(txApp core.App) error {
		txRecord, findErr := txApp.FindRecordById("shared_inbox_links", record.Id)
		if findErr != nil {
			return findErr
		}
		txRecord.Set("status", "revoked")
		if saveErr := txApp.Save(txRecord); saveErr != nil {
			return saveErr
		}
		if record.GetString("seatId") != "" {
			return nil
		}
		return syncSharedInboxLinkToSubscriptions(txApp, e.Auth.Id, record.GetString("mailboxAddress"), oldLink.ShortURL, "")
	}); err != nil {
		return e.InternalServerError("revoke shared inbox link failed", err)
	}
	return apiEmptySuccessJSON(e, http.StatusOK)
}

// Keep subscription quick actions on the same short URL as the managed mailbox.
// User ownership and mailbox matching are checked again here even though callers
// are authenticated, because this mutates every matching subscription at once.
func syncSharedInboxLinkToSubscriptions(app core.App, userID, mailboxAddress, expectedOldURL, newURL string) error {
	mailboxAddress = strings.TrimSpace(mailboxAddress)
	if mailboxAddress == "" {
		return nil
	}
	const pageSize = 200
	for offset := 0; ; offset += pageSize {
		records, err := app.FindRecordsByFilter("subscriptions", "user = {:user} && familySharingEnabled = true", "id", pageSize, offset, map[string]any{"user": userID})
		if err != nil {
			return err
		}
		for _, subscription := range records {
			if familyVerificationMode(subscription) != "email" {
				continue
			}
			if !strings.EqualFold(strings.TrimSpace(subscription.GetString("sharingLoginAccount")), mailboxAddress) {
				continue
			}
			if expectedOldURL != "" && strings.TrimSpace(subscription.GetString("sharingVerificationLink")) != expectedOldURL {
				continue
			}
			if strings.TrimSpace(subscription.GetString("sharingVerificationLink")) == newURL {
				continue
			}
			subscription.Set("sharingVerificationLink", newURL)
			if err := app.Save(subscription); err != nil {
				return err
			}
		}
		if len(records) < pageSize {
			break
		}
	}
	return nil
}

func handleSharedInboxProxy(app core.App, e *core.RequestEvent, suffix string) error {
	shortKey := strings.TrimSpace(e.Request.PathValue("shortKey"))
	if shortKey == "" || len(shortKey) > 128 {
		return e.NotFoundError("短链接不存在或已失效", nil)
	}
	record, err := app.FindFirstRecordByFilter("shared_inbox_links", "shortKeyHash = {:hash} && status = 'active'", map[string]any{"hash": tokenHash(shortKey)})
	if err != nil || record == nil {
		return e.NotFoundError("短链接不存在或已失效", nil)
	}
	if seatID := record.GetString("seatId"); seatID != "" {
		if strings.TrimSpace(record.GetString("expiresAt")) == "" {
			return apiErrorJSON(e, http.StatusForbidden, "LINK_EXPIRED", "短链接已过期", nil)
		}
		if err := validateInboxSeat(app, record.GetString("user"), seatID, record.GetString("mailboxAddress")); err != nil {
			return e.NotFoundError("车位分享已关闭", nil)
		}
	}
	if expiresAt := strings.TrimSpace(record.GetString("expiresAt")); expiresAt != "" {
		parsed, parseErr := time.Parse(time.RFC3339, expiresAt)
		if parseErr != nil || !parsed.After(time.Now().UTC()) {
			return apiErrorJSON(e, http.StatusForbidden, "LINK_EXPIRED", "短链接已过期", nil)
		}
	}
	query := e.Request.URL.Query().Encode()
	path := "/api/open/v1/subnest/grants/" + url.PathEscape(record.GetString("grantId")) + suffix
	if query != "" {
		path += "?" + query
	}
	raw, contentType, err := requestNewSzxcnRaw(app, record.GetString("user"), http.MethodGet, path, nil)
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "读取共享收件箱失败", err)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	e.Response.Header().Set("X-Content-Type-Options", "nosniff")
	if strings.Contains(strings.ToLower(contentType), "json") {
		var payload any
		if err := json.Unmarshal(raw, &payload); err != nil {
			return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_INVALID_RESPONSE", "共享收件箱响应无效", nil)
		}
		return apiSuccessJSON(e, http.StatusOK, payload)
	}
	e.Response.Header().Set("Content-Type", contentType)
	e.Response.WriteHeader(http.StatusOK)
	_, err = e.Response.Write(raw)
	return err
}

func sharedInboxLinkFromRecord(app core.App, request *http.Request, record *core.Record) (sharedInboxLinkResponse, error) {
	shortKey, err := decryptSharingCredential(app, record.GetString("shortKeyCiphertext"))
	if err != nil {
		return sharedInboxLinkResponse{}, err
	}
	var expiresAt *string
	if value := strings.TrimSpace(record.GetString("expiresAt")); value != "" {
		expiresAt = &value
	}
	return sharedInboxLinkResponse{
		SeatID: record.GetString("seatId"),
		ID:     record.Id, ShortURL: externalRequestURL(request, "/s/"+shortKey, nil), MailboxID: record.GetString("mailboxId"), MailboxAddress: record.GetString("mailboxAddress"), FolderIDs: record.GetStringSlice("folderIds"), WindowMinutes: record.GetInt("windowMinutes"), ExpiresAt: expiresAt, Status: record.GetString("status"), CreatedAt: record.GetDateTime("created").Time().UTC().Format(time.RFC3339), UpdatedAt: record.GetDateTime("updated").Time().UTC().Format(time.RFC3339),
	}, nil
}

func validateInboxSeat(app core.App, userID, seatID, address string) error {
	seat, err := findOwnedSharingSeat(app, userID, seatID)
	if err != nil || seat.GetString("status") != "active" || strings.TrimSpace(seat.GetString("memberName")) == "" {
		return fmt.Errorf("seat unavailable")
	}
	account, err := findOwnedSharingAccount(app, userID, seat.GetString("sharingAccount"))
	if err != nil || account.GetString("status") != "active" || !strings.EqualFold(strings.TrimSpace(account.GetString("loginAccount")), strings.TrimSpace(address)) {
		return fmt.Errorf("account unavailable")
	}
	subscription, err := app.FindRecordById("subscriptions", account.GetString("subscription"))
	if err != nil || subscription.GetString("user") != userID || !subscription.GetBool("familySharingEnabled") || !strings.EqualFold(strings.TrimSpace(subscription.GetString("sharingLoginAccount")), strings.TrimSpace(address)) {
		return fmt.Errorf("subscription unavailable")
	}
	if familyVerificationMode(subscription) == "totp" {
		return fmt.Errorf("mailbox sharing disabled")
	}
	return nil
}

func inboxSeatVersion(app core.App, userID, seatID, address string) (string, error) {
	if err := validateInboxSeat(app, userID, seatID, address); err != nil {
		return "", err
	}
	seat, err := findOwnedSharingSeat(app, userID, seatID)
	if err != nil {
		return "", err
	}
	account, err := findOwnedSharingAccount(app, userID, seat.GetString("sharingAccount"))
	if err != nil {
		return "", err
	}
	subscription, err := app.FindRecordById("subscriptions", account.GetString("subscription"))
	if err != nil {
		return "", err
	}
	return seat.GetString("updated") + "/" + account.GetString("updated") + "/" + subscription.GetString("updated"), nil
}

// Local revocation is the access boundary; no external network call belongs in a seat transaction.
func revokeInboxSeatLinks(app core.App, userID, seatID string) error {
	if _, err := app.DB().NewQuery("UPDATE sharing_totp_links SET revoked=1 WHERE user={:user} AND seatId={:seat}").Bind(dbx.Params{"user": userID, "seat": seatID}).Execute(); err != nil {
		return err
	}
	records, err := app.FindRecordsByFilter("shared_inbox_links", "user = {:user} && seatId = {:seat} && status = 'active'", "", 0, 0, map[string]any{"user": userID, "seat": seatID})
	if err != nil {
		return err
	}
	for _, record := range records {
		record.Set("status", "revoked")
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func revokeInboxSubscriptionLinks(app core.App, userID, subscriptionID string) error {
	account, err := app.FindFirstRecordByFilter("sharing_accounts", "user = {:user} && subscription = {:subscription}", map[string]any{"user": userID, "subscription": subscriptionID})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	seats, err := app.FindRecordsByFilter("sharing_seats", "user = {:user} && sharingAccount = {:account}", "", 0, 0, map[string]any{"user": userID, "account": account.Id})
	if err != nil {
		return err
	}
	for _, seat := range seats {
		if err := revokeInboxSeatLinks(app, userID, seat.Id); err != nil {
			return err
		}
	}
	return nil
}

func requestNewSzxcn(app core.App, userID, method, path string, payload any) ([]byte, error) {
	raw, _, err := requestNewSzxcnRaw(app, userID, method, path, payload)
	return raw, err
}

func requestNewSzxcnRaw(app core.App, userID, method, path string, payload any) ([]byte, string, error) {
	row, err := app.FindFirstRecordByFilter("newszxcn_integrations", "user = {:user}", map[string]any{"user": userID})
	if err != nil || row == nil {
		return nil, "", fmt.Errorf("NewSzxcn 邮箱尚未配置")
	}
	token, err := decryptSharingCredential(app, row.GetString("tokenCiphertext"))
	if err != nil {
		return nil, "", err
	}
	var body []byte
	if payload != nil {
		body, err = json.Marshal(payload)
		if err != nil {
			return nil, "", err
		}
	}
	headers := make(http.Header)
	headers.Set("Authorization", "Bearer "+token)
	headers.Set("Accept", "application/json")
	if payload != nil {
		headers.Set("Content-Type", "application/json")
	}
	response, err := sendUpstreamRequestBytes(method, strings.TrimRight(row.GetString("baseUrl"), "/")+path, headers, body, upstreamHTTPRequestOptions{Provider: "NewSzxcn 邮箱", Secrets: []string{token}})
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, "", fmt.Errorf("upstream status %d", response.StatusCode)
	}
	return raw, response.Header.Get("Content-Type"), nil
}
