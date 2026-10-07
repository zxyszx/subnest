package main

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestSeatInboxLinksAreIndependentAndOwnershipChecked(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	user := createSchemaTestUser(t, app, "seat-owner@example.com")
	subscription := createSchemaTestSubscriptionNoValidate(t, app, user.Id, map[string]interface{}{
		"familySharingEnabled": true, "sharingLoginAccount": "shared@example.com",
	})
	account := saveInboxTestRecord(t, app, "sharing_accounts", map[string]any{
		"user": user.Id, "subscription": subscription.Id, "status": "active", "loginAccount": "shared@example.com", "accountNumber": 1,
	})
	seat1 := saveInboxTestRecord(t, app, "sharing_seats", map[string]any{"user": user.Id, "sharingAccount": account.Id, "seatNumber": 1, "memberName": "Alice", "status": "active"})
	seat2 := saveInboxTestRecord(t, app, "sharing_seats", map[string]any{"user": user.Id, "sharingAccount": account.Id, "seatNumber": 2, "memberName": "Bob", "status": "active"})
	for _, seat := range []*core.Record{seat1, seat2} {
		if err := validateInboxSeat(app, user.Id, seat.Id, " SHARED@example.com "); err != nil {
			t.Fatal(err)
		}
	}
	if err := validateInboxSeat(app, "another-owner", seat1.Id, "shared@example.com"); err == nil {
		t.Fatal("another owner was allowed")
	}
	if err := validateInboxSeat(app, user.Id, seat1.Id, "other@example.com"); err == nil {
		t.Fatal("another mailbox was allowed")
	}

	link1 := saveInboxTestLink(t, app, user.Id, seat1.Id, "seat1-key")
	link2 := saveInboxTestLink(t, app, user.Id, seat2.Id, "seat2-key")
	generic := saveInboxTestLink(t, app, user.Id, "", "generic-key")
	if err := revokeInboxSeatLinks(app, user.Id, seat1.Id); err != nil {
		t.Fatal(err)
	}
	assertInboxTestStatus(t, app, link1.Id, "revoked")
	assertInboxTestStatus(t, app, link2.Id, "active")
	assertInboxTestStatus(t, app, generic.Id, "active")
	if err := revokeInboxSubscriptionLinks(app, user.Id, subscription.Id); err != nil {
		t.Fatal(err)
	}
	assertInboxTestStatus(t, app, link2.Id, "revoked")
	assertInboxTestStatus(t, app, generic.Id, "active")

	seat1.Set("status", "paused")
	if err := app.SaveNoValidate(seat1); err != nil {
		t.Fatal(err)
	}
	if err := validateInboxSeat(app, user.Id, seat1.Id, "shared@example.com"); err == nil {
		t.Fatal("paused seat was allowed")
	}
	seat1.Set("status", "active")
	seat1.Set("memberName", "")
	if err := app.SaveNoValidate(seat1); err != nil {
		t.Fatal(err)
	}
	if err := validateInboxSeat(app, user.Id, seat1.Id, "shared@example.com"); err == nil {
		t.Fatal("empty seat was allowed")
	}
}

func TestSeatInboxProxyFailsClosedWithoutUpstreamRequest(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	user := createSchemaTestUser(t, app, "proxy-owner@example.com")
	link := saveInboxTestLink(t, app, user.Id, "missing-seat", "missing-seat-key")
	link.Set("expiresAt", "2099-01-01T00:00:00Z")
	if err := app.SaveNoValidate(link); err != nil {
		t.Fatal(err)
	}
	response := serveTestRequest(t, app, http.MethodGet, "/api/shared-inbox/missing-seat-key/messages", "", "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("missing seat status = %d", response.Code)
	}
	link.Set("seatId", "")
	link.Set("expiresAt", "2020-01-01T00:00:00Z")
	if err := app.Save(link); err != nil {
		t.Fatal(err)
	}
	response = serveTestRequest(t, app, http.MethodGet, "/api/shared-inbox/missing-seat-key/messages", "", "")
	if response.Code != http.StatusForbidden {
		t.Fatalf("expired link status = %d", response.Code)
	}
}

func TestSeatInboxCreationAllowsPermanentLinksAndRequiresAdmin(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	_, adminToken := createRouteTestUser(t, app, "admin")
	_, userToken := createRouteTestUser(t, app, "user")
	body := `{"mailboxId":"mailbox","seatId":"seat","folderIds":["inbox"],"windowMinutes":30}`
	response := serveTestRequest(t, app, http.MethodPost, "/api/app/admin/shared-inbox-links", body, adminToken)
	if response.Code == http.StatusBadRequest {
		t.Fatalf("permanent seat link was rejected: %s", response.Body.String())
	}
	response = serveTestRequest(t, app, http.MethodPost, "/api/app/admin/shared-inbox-links", body, userToken)
	if response.Code != http.StatusForbidden {
		t.Fatalf("non-admin status = %d", response.Code)
	}
}

func saveInboxTestRecord(t *testing.T, app core.App, collectionName string, fields map[string]any) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	for name, value := range fields {
		record.Set(name, value)
	}
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func saveInboxTestLink(t *testing.T, app core.App, userID, seatID, key string) *core.Record {
	t.Helper()
	return saveInboxTestRecord(t, app, "shared_inbox_links", map[string]any{
		"user": userID, "seatId": seatID, "shortKeyHash": tokenHash(key), "shortKeyCiphertext": "test-cipher",
		"grantId": key, "mailboxId": "mailbox", "mailboxAddress": "shared@example.com", "status": "active",
	})
}

func assertInboxTestStatus(t *testing.T, app core.App, id, expected string) {
	t.Helper()
	record, err := app.FindRecordById("shared_inbox_links", id)
	if err != nil {
		t.Fatal(err)
	}
	if record.GetString("status") != expected {
		t.Fatalf("link status = %s, expected %s", record.GetString("status"), expected)
	}
}

func TestSyncSharedInboxLinkToSubscriptionsScopesUpdates(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	user := createSchemaTestUser(t, app, "owner@example.com")
	matching := createSchemaTestSubscriptionNoValidate(t, app, user.Id, map[string]interface{}{
		"name":                    "Matching",
		"familySharingEnabled":    true,
		"sharingLoginAccount":     " Netflix16@NewSzxcn.com ",
		"sharingVerificationLink": "https://dingyue.xzys.me/s/old",
	})
	matchingSecond := createSchemaTestSubscriptionNoValidate(t, app, user.Id, map[string]interface{}{
		"name":                    "Matching second",
		"familySharingEnabled":    true,
		"sharingLoginAccount":     "netflix16@newszxcn.com",
		"sharingVerificationLink": "https://dingyue.xzys.me/s/old",
	})
	otherMailbox := createSchemaTestSubscriptionNoValidate(t, app, user.Id, map[string]interface{}{
		"name":                    "Other mailbox",
		"familySharingEnabled":    true,
		"sharingLoginAccount":     "netflix15@newszxcn.com",
		"sharingVerificationLink": "https://dingyue.xzys.me/s/other",
	})
	disabled := createSchemaTestSubscriptionNoValidate(t, app, user.Id, map[string]interface{}{
		"name":                    "Disabled",
		"familySharingEnabled":    false,
		"sharingLoginAccount":     "netflix16@newszxcn.com",
		"sharingVerificationLink": "https://dingyue.xzys.me/s/disabled",
	})

	if err := syncSharedInboxLinkToSubscriptions(app, user.Id, "netflix16@newszxcn.com", "", "https://dingyue.xzys.me/s/new"); err != nil {
		t.Fatal(err)
	}
	assertSharedInboxSubscriptionLink(t, app, matching.Id, "https://dingyue.xzys.me/s/new")
	assertSharedInboxSubscriptionLink(t, app, matchingSecond.Id, "https://dingyue.xzys.me/s/new")
	assertSharedInboxSubscriptionLink(t, app, otherMailbox.Id, "https://dingyue.xzys.me/s/other")
	assertSharedInboxSubscriptionLink(t, app, disabled.Id, "https://dingyue.xzys.me/s/disabled")

	matchingRecord, err := app.FindRecordById("subscriptions", matching.Id)
	if err != nil {
		t.Fatal(err)
	}
	matchingRecord.Set("sharingVerificationLink", "https://example.com/manual")
	if err := app.SaveNoValidate(matchingRecord); err != nil {
		t.Fatal(err)
	}
	if err := syncSharedInboxLinkToSubscriptions(app, user.Id, "netflix16@newszxcn.com", "https://dingyue.xzys.me/s/new", ""); err != nil {
		t.Fatal(err)
	}
	assertSharedInboxSubscriptionLink(t, app, matching.Id, "https://example.com/manual")
	assertSharedInboxSubscriptionLink(t, app, matchingSecond.Id, "")
}

func assertSharedInboxSubscriptionLink(t *testing.T, app core.App, id, expected string) {
	t.Helper()
	record, err := app.FindRecordById("subscriptions", id)
	if err != nil {
		t.Fatal(err)
	}
	if actual := record.GetString("sharingVerificationLink"); actual != expected {
		t.Fatalf("expected sharing link %q, got %q", expected, actual)
	}
}
