package main

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

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
