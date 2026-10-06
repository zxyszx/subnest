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
		t.Fatalf("expected default and two seat links, got %s", get.Body.String())
	}
	bySeat := map[string]sharingTotpLink{}
	for _, link := range payload.Links {
		bySeat[link.SeatID] = link
		if !link.Valid {
			t.Fatal("new link invalid")
		}
	}
	if bySeat[""].ExpiresAt != nil {
		t.Fatal("default link must not have a fixed expiration")
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
	seatReset := serveTestRequest(t, app, http.MethodPost, route, `{"seatId":"`+seats[0].Id+`","reset":true}`, token)
	if seatReset.Code != http.StatusOK {
		t.Fatal(seatReset.Body.String())
	}
	old := bySeat[""]
	rotated := serveTestRequest(t, app, http.MethodPost, route, `{"seatId":"","reset":true}`, token)
	if rotated.Code != http.StatusOK {
		t.Fatal(rotated.Body.String())
	}
	if public(old.Path) != http.StatusNotFound {
		t.Fatal("old default token still valid")
	}
	newPayload := decodeAPISuccessDataForTest[struct {
		Links []sharingTotpLink `json:"links"`
	}](t, rotated.Body.Bytes())
	bySeat[""] = newPayload.Links[0]
	revoked := serveTestRequest(t, app, http.MethodDelete, route+"/"+bySeat[""].ID, "", token)
	if revoked.Code != http.StatusOK {
		t.Fatal(revoked.Body.String())
	}
	if err := syncFamilyTotpLinks(app, sub); err != nil {
		t.Fatal(err)
	}
	if public(bySeat[""].Path) != http.StatusNotFound {
		t.Fatal("revoked token resurrected")
	}
	if err := ensureFamilyTotpLink(app, owner.Id, account.Id, "", true); err != nil {
		t.Fatal(err)
	}
	generic, err := app.FindRecordById("sharing_totp_links", bySeat[""].ID)
	if err != nil {
		t.Fatal(err)
	}
	currentToken, err := transformOnlineTotpSecret(app, generic.GetString("tokenCiphertext"), false)
	if err != nil {
		t.Fatal(err)
	}
	currentPath := "/otp/" + currentToken
	if public(currentPath) != http.StatusOK {
		t.Fatal("new permanent default token unavailable")
	}
	generic.Set("expiresAt", time.Now().Add(-time.Minute).UTC().Format(time.RFC3339))
	if err := app.Save(generic); err != nil {
		t.Fatal(err)
	}
	if public(currentPath) != http.StatusNotFound {
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
