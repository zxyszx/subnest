package main

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestFamilyTotpLinksIsolateSeatsAndProtectOwnership(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	owner, token := createRouteTestUser(t, app, "totp-family-owner")
	_, foreignToken := createRouteTestUser(t, app, "totp-family-other")
	response := serveTestRequest(t, app, http.MethodPost, "/api/app/online-totp/accounts", `{"platformName":"PrimeVideo","serviceName":"PrimeVideo","accountNumber":3,"account":"prime@example.com","logo":"","secret":"`+rfcOnlineTotpSecret+`","enabled":true,"sharingEnabled":false}`, token)
	if response.Code != http.StatusCreated {
		t.Fatal(response.Body.String())
	}
	otp := decodeAPISuccessDataForTest[onlineTotpAccountPayload](t, response.Body.Bytes()).Account
	sub := createSchemaTestSubscriptionNoValidate(t, app, owner.Id, map[string]interface{}{"platformName": "PrimeVideo", "accountNumber": 3, "familySharingEnabled": true, "sharingLoginAccount": " PRIME@example.com ", "sharingCapacity": 5, "extra": map[string]any{"familyVerification": map[string]any{"mode": "totp", "totpAccountId": otp.ID}}})
	if err := syncSubscriptionSharingAccount(app, sub); err != nil {
		t.Fatal(err)
	}
	account, err := app.FindFirstRecordByFilter("sharing_accounts", "subscription={:sub}", map[string]any{"sub": sub.Id})
	if err != nil {
		t.Fatal(err)
	}
	seats, err := app.FindRecordsByFilter("sharing_seats", "sharingAccount={:account}", "seatNumber", 5, 0, map[string]any{"account": account.Id})
	if err != nil {
		t.Fatal(err)
	}
	for i, seat := range seats[:2] {
		seat.Set("memberName", fmt.Sprintf("Member %d", i))
		seat.Set("status", "active")
		seat.Set("expiresAt", "2099-01-01")
		if err := app.Save(seat); err != nil {
			t.Fatal(err)
		}
	}
	if err := syncFamilyTotpLinks(app, sub); err != nil {
		t.Fatal(err)
	}
	route := "/api/app/sharing/accounts/" + account.Id + "/totp-links"
	get := serveTestRequest(t, app, http.MethodGet, route, "", token)
	payload := decodeAPISuccessDataForTest[struct {
		Links []sharingTotpLink `json:"links"`
	}](t, get.Body.Bytes())
	if len(payload.Links) != 3 {
		t.Fatalf("expected default + two assigned seats, got %s", get.Body.String())
	}
	bySeat := map[string]sharingTotpLink{}
	for _, link := range payload.Links {
		bySeat[link.SeatID] = link
		if !link.Valid {
			t.Fatal("new link invalid")
		}
	}
	if bySeat[seats[0].Id].Path == bySeat[seats[1].Id].Path {
		t.Fatal("shared seat token")
	}
	public := func(path string) int {
		return serveTestRequest(t, app, http.MethodGet, "/api/online-totp/"+strings.TrimPrefix(path, "/otp/"), "", "").Code
	}
	for _, link := range payload.Links {
		if public(link.Path) != http.StatusOK {
			t.Fatal("public seat link unavailable")
		}
	}
	if strings.Contains(get.Body.String(), rfcOnlineTotpSecret) || strings.Contains(get.Body.String(), "secretCiphertext") {
		t.Fatal("secret exposed")
	}
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		r := serveTestRequest(t, app, method, route, `{}`, foreignToken)
		if r.Code != http.StatusNotFound {
			t.Fatalf("foreign %s status %d", method, r.Code)
		}
	}
	old := bySeat[seats[0].Id]
	rotated := serveTestRequest(t, app, http.MethodPost, route, `{"seatId":"`+seats[0].Id+`","reset":true}`, token)
	if rotated.Code != http.StatusOK {
		t.Fatal(rotated.Body.String())
	}
	if public(old.Path) != http.StatusNotFound || public(bySeat[seats[1].Id].Path) != http.StatusOK || public(bySeat[""].Path) != http.StatusOK {
		t.Fatal("reset affected other scopes or left old token valid")
	}
	// Updating another seat's billing metadata must not invalidate its token.
	seats[1].Set("notes", "renewed")
	if err := app.Save(seats[1]); err != nil {
		t.Fatal(err)
	}
	if public(bySeat[seats[1].Id].Path) != http.StatusOK {
		t.Fatal("unrelated seat update invalidated token")
	}
	revoked := serveTestRequest(t, app, http.MethodDelete, route+"/"+bySeat[seats[1].Id].ID, "", token)
	if revoked.Code != http.StatusOK {
		t.Fatal(revoked.Body.String())
	}
	if err := syncFamilyTotpLinks(app, sub); err != nil {
		t.Fatal(err)
	}
	if public(bySeat[seats[1].Id].Path) != http.StatusNotFound {
		t.Fatal("revoked token resurrected")
	}
	if err := ensureFamilyTotpLink(app, owner.Id, account.Id, seats[2].Id, true); err == nil {
		t.Fatal("vacant seat issued token")
	}
	generic, err := app.FindRecordById("sharing_totp_links", bySeat[""].ID)
	if err != nil {
		t.Fatal(err)
	}
	generic.Set("expiresAt", time.Now().Add(-time.Minute).UTC().Format(time.RFC3339))
	if err := app.Save(generic); err != nil {
		t.Fatal(err)
	}
	if public(bySeat[""].Path) != http.StatusNotFound {
		t.Fatal("expired token accepted")
	}
	otpRecord, err := app.FindRecordById("online_totp_accounts", otp.ID)
	if err != nil {
		t.Fatal(err)
	}
	otpRecord.Set("enabled", false)
	if err := app.Save(otpRecord); err != nil {
		t.Fatal(err)
	}
	if _, _, err := familyTotpBinding(app, owner.Id, account.Id, seats[0].Id); err == nil {
		t.Fatal("disabled TOTP accepted")
	}
}

func TestFamilyTotpBindingRejectsForeignKeyAndMailboxMode(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	user := createSchemaTestUser(t, app, "family-key-owner@example.test")
	sub := createSchemaTestSubscriptionNoValidate(t, app, user.Id, map[string]interface{}{"platformName": "PrimeVideo", "accountNumber": 3, "familySharingEnabled": true, "sharingLoginAccount": "shared@example.com", "sharingCapacity": 5})
	if err := syncSubscriptionSharingAccount(app, sub); err != nil {
		t.Fatal(err)
	}
	account, err := app.FindFirstRecordByFilter("sharing_accounts", "subscription={:sub}", map[string]any{"sub": sub.Id})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := familyTotpBinding(app, user.Id, account.Id, ""); err == nil {
		t.Fatal("mailbox mode accepted")
	}
	sub.Set("extra", map[string]any{"familyVerification": map[string]any{"mode": "totp", "totpAccountId": "foreign-id"}})
	if err := app.SaveNoValidate(sub); err != nil {
		t.Fatal(err)
	}
	if _, _, err := familyTotpBinding(app, user.Id, account.Id, ""); err == nil {
		t.Fatal("unknown key accepted")
	}
}
