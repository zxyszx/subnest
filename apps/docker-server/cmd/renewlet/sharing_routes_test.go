package main

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestSharingAccountCreateListAndCredentialAccess(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	user, token := createRouteTestUser(t, app, "sharing-owner")
	_, foreignToken := createRouteTestUser(t, app, "sharing-foreign")
	subscription := createRouteTestSubscription(t, app, user.Id, map[string]interface{}{
		"name": "Netflix",
		"logo": "https://example.com/netflix.png",
	})

	body := `{
		"subscriptionId":"` + subscription.Id + `",
		"name":"Netflix #1",
		"accountNumber":1,
		"loginAccount":"netflix01@example.com",
		"password":"secret-password",
		"verificationLink":"https://mail.example.com/code",
		"monthlyCost":"45",
		"currency":"CNY",
		"nextBillingDate":"2026-10-01",
		"paymentMethod":"Visa",
		"cardLast4":"6109",
		"capacity":5,
		"status":"active",
		"notes":"primary account"
	}`
	created := serveTestRequest(t, app, http.MethodPost, "/api/app/sharing/accounts", body, token)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d body=%s", created.Code, created.Body.String())
	}
	var createdEnvelope struct {
		Data sharingAccountPayload `json:"data"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &createdEnvelope); err != nil {
		t.Fatal(err)
	}
	accountID := createdEnvelope.Data.Account.ID
	if accountID == "" || createdEnvelope.Data.Account.OccupiedSeats != 0 || createdEnvelope.Data.Account.Capacity != 5 {
		t.Fatalf("unexpected account response: %#v", createdEnvelope.Data.Account)
	}

	record, err := app.FindRecordById("sharing_accounts", accountID)
	if err != nil {
		t.Fatal(err)
	}
	if stored := record.GetString("encryptedCredentials"); stored == "" || stored == "secret-password" {
		t.Fatalf("password must be encrypted at rest: %q", stored)
	}
	seats, err := app.FindRecordsByFilter("sharing_seats", "sharingAccount = {:account}", "seatNumber", 10, 0, map[string]interface{}{"account": accountID})
	if err != nil {
		t.Fatal(err)
	}
	if len(seats) != 5 {
		t.Fatalf("seat count = %d, want 5", len(seats))
	}

	list := serveTestRequest(t, app, http.MethodGet, "/api/app/sharing/accounts", "", token)
	if list.Code != http.StatusOK || !json.Valid(list.Body.Bytes()) {
		t.Fatalf("list status = %d body=%s", list.Code, list.Body.String())
	}
	credentials := serveTestRequest(t, app, http.MethodGet, "/api/app/sharing/accounts/"+accountID+"/credentials", "", token)
	if credentials.Code != http.StatusOK || !containsJSONText(credentials.Body.Bytes(), "secret-password") {
		t.Fatalf("credentials status = %d body=%s", credentials.Code, credentials.Body.String())
	}
	foreign := serveTestRequest(t, app, http.MethodGet, "/api/app/sharing/accounts/"+accountID+"/credentials", "", foreignToken)
	if foreign.Code != http.StatusNotFound {
		t.Fatalf("foreign credential read status = %d, want 404", foreign.Code)
	}
}

func containsJSONText(payload []byte, expected string) bool {
	var value interface{}
	if json.Unmarshal(payload, &value) != nil {
		return false
	}
	return findJSONText(value, expected)
}

func findJSONText(value interface{}, expected string) bool {
	switch typed := value.(type) {
	case string:
		return typed == expected
	case []interface{}:
		for _, item := range typed {
			if findJSONText(item, expected) {
				return true
			}
		}
	case map[string]interface{}:
		for _, item := range typed {
			if findJSONText(item, expected) {
				return true
			}
		}
	}
	return false
}
