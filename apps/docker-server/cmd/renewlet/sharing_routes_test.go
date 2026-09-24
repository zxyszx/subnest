package main

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestSubscriptionFamilySharingAutomaticallyProjectsAccount(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	_, token := createRouteTestUser(t, app, "family-sharing-owner")
	var body map[string]interface{}
	if err := json.Unmarshal([]byte(subscriptionCreateBody("Netflix Premium")), &body); err != nil {
		t.Fatal(err)
	}
	body["platformName"] = "Netflix"
	body["accountNumber"] = 7
	body["cardLast4"] = "6109"
	body["familySharing"] = map[string]interface{}{
		"enabled": true, "loginAccount": "netflix07@example.com", "password": "secret-password",
		"verificationLink": "https://mail.example.com/code", "capacity": 5,
	}
	encoded, _ := json.Marshal(body)
	created := serveTestRequest(t, app, http.MethodPost, "/api/app/subscriptions", string(encoded), token)
	if created.Code != http.StatusCreated {
		t.Fatalf("subscription create status = %d body=%s", created.Code, created.Body.String())
	}
	var envelope struct {
		Data subscriptionResponse `json:"data"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	sharing := envelope.Data.Subscription.FamilySharing
	if sharing == nil || sharing.LoginAccount != "netflix07@example.com" || sharing.PasswordMask != "s*************d" || !sharing.HasPassword || sharing.Capacity != 5 {
		t.Fatalf("unexpected family sharing response: %#v", sharing)
	}
	accounts, err := app.FindRecordsByFilter("sharing_accounts", "subscription = {:subscription}", "created", 10, 0, map[string]interface{}{"subscription": envelope.Data.Subscription.ID})
	if err != nil || len(accounts) != 1 {
		t.Fatalf("projected accounts = %d err=%v", len(accounts), err)
	}
	seats, err := app.FindRecordsByFilter("sharing_seats", "sharingAccount = {:account}", "seatNumber", 10, 0, map[string]interface{}{"account": accounts[0].Id})
	if err != nil || len(seats) != 5 {
		t.Fatalf("projected seats = %d err=%v", len(seats), err)
	}

	patch := `{"familySharing":null}`
	disabled := serveTestRequest(t, app, http.MethodPatch, "/api/app/subscriptions/"+envelope.Data.Subscription.ID, patch, token)
	if disabled.Code != http.StatusOK {
		t.Fatalf("disable status = %d body=%s", disabled.Code, disabled.Body.String())
	}
	account, err := app.FindRecordById("sharing_accounts", accounts[0].Id)
	if err != nil || account.GetString("status") != "archived" {
		t.Fatalf("disabled account status = %q err=%v", account.GetString("status"), err)
	}
}

func TestSharingAccountCreateListAndCredentialAccess(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	user, token := createRouteTestUser(t, app, "sharing-owner")
	_, foreignToken := createRouteTestUser(t, app, "sharing-foreign")
	subscription := createRouteTestSubscription(t, app, user.Id, map[string]interface{}{
		"name":            "Netflix",
		"logo":            "https://example.com/netflix.png",
		"price":           "45",
		"currency":        "CNY",
		"billingCycle":    "monthly",
		"nextBillingDate": "2026-10-01",
		"paymentMethod":   "Visa",
		"cardLast4":       "6109",
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
	paidSeatBody := `{
		"memberName":"Alice","contact":"alice@example.com","contactType":"email",
		"monthlyPrice":"15","currency":"CNY","billingMonths":3,
		"startDate":"2026-10-01","expiresAt":"2026-12-31","status":"active",
		"paymentStatus":"paid","notes":"quarterly"
	}`
	paidSeat := serveTestRequest(t, app, http.MethodPut, "/api/app/sharing/seats/"+seats[0].Id, paidSeatBody, token)
	if paidSeat.Code != http.StatusOK {
		t.Fatalf("paid seat update status = %d body=%s", paidSeat.Code, paidSeat.Body.String())
	}
	pendingSeatBody := `{
		"memberName":"Bob","contact":"bob","contactType":"wechat",
		"monthlyPrice":"15","currency":"CNY","billingMonths":3,
		"startDate":"2026-10-01","expiresAt":"2026-12-31","status":"active",
		"paymentStatus":"pending","notes":"quarterly"
	}`
	pendingSeat := serveTestRequest(t, app, http.MethodPut, "/api/app/sharing/seats/"+seats[1].Id, pendingSeatBody, token)
	if pendingSeat.Code != http.StatusOK {
		t.Fatalf("pending seat update status = %d body=%s", pendingSeat.Code, pendingSeat.Body.String())
	}
	detail := serveTestRequest(t, app, http.MethodGet, "/api/app/sharing/accounts/"+accountID, "", token)
	if detail.Code != http.StatusOK {
		t.Fatalf("detail status = %d body=%s", detail.Code, detail.Body.String())
	}
	var detailEnvelope struct {
		Data sharingAccountDetailPayload `json:"data"`
	}
	if err := json.Unmarshal(detail.Body.Bytes(), &detailEnvelope); err != nil {
		t.Fatal(err)
	}
	if detailEnvelope.Data.Account.OccupiedSeats != 2 || detailEnvelope.Data.Totals.MonthlyRevenue != "30" || detailEnvelope.Data.Totals.ContractedRevenue != "90" || detailEnvelope.Data.Totals.CollectedRevenue != "45" || detailEnvelope.Data.Totals.OutstandingAmount != "45" || detailEnvelope.Data.Totals.MonthlyProfit != -15 {
		t.Fatalf("unexpected sharing totals: %#v", detailEnvelope.Data)
	}
	if len(detailEnvelope.Data.Seats) != 5 || detailEnvelope.Data.Seats[0].CurrentReceivable == nil || detailEnvelope.Data.Seats[0].CurrentReceivable.Amount != "45" || detailEnvelope.Data.Seats[0].CurrentReceivable.Status != "paid" {
		t.Fatalf("unexpected seat detail: %#v", detailEnvelope.Data.Seats)
	}
	foreignSeatUpdate := serveTestRequest(t, app, http.MethodPut, "/api/app/sharing/seats/"+seats[0].Id, paidSeatBody, foreignToken)
	if foreignSeatUpdate.Code != http.StatusNotFound {
		t.Fatalf("foreign seat update status = %d, want 404", foreignSeatUpdate.Code)
	}
	crossCurrencyBody := `{
		"memberName":"Alice","contact":"alice@example.com","contactType":"email",
		"monthlyPrice":"15","currency":"USD","billingMonths":3,
		"startDate":"2026-10-01","expiresAt":"2026-12-31","status":"active",
		"paymentStatus":"paid","notes":"quarterly"
	}`
	crossCurrency := serveTestRequest(t, app, http.MethodPut, "/api/app/sharing/seats/"+seats[0].Id, crossCurrencyBody, token)
	if crossCurrency.Code != http.StatusOK || !containsJSONText(crossCurrency.Body.Bytes(), "USD") {
		t.Fatalf("cross-currency seat update status = %d body=%s", crossCurrency.Code, crossCurrency.Body.String())
	}

	list := serveTestRequest(t, app, http.MethodGet, "/api/app/sharing/accounts", "", token)
	if list.Code != http.StatusOK || !json.Valid(list.Body.Bytes()) {
		t.Fatalf("list status = %d body=%s", list.Code, list.Body.String())
	}
	accountUpdateBody := `{
		"name":"Netflix Family #1","accountNumber":1,
		"loginAccount":"netflix-family@example.com","password":"updated-password",
		"verificationLink":"https://mail.example.com/new-code","monthlyCost":"48",
		"currency":"CNY","nextBillingDate":"2026-11-01","paymentMethod":"Mastercard",
		"cardLast4":"9988","status":"active","notes":"updated account"
	}`
	accountUpdate := serveTestRequest(t, app, http.MethodPut, "/api/app/sharing/accounts/"+accountID, accountUpdateBody, token)
	if accountUpdate.Code != http.StatusOK || !containsJSONText(accountUpdate.Body.Bytes(), "netflix-family@example.com") || !containsJSONText(accountUpdate.Body.Bytes(), "https://mail.example.com/new-code") {
		t.Fatalf("account update status = %d body=%s", accountUpdate.Code, accountUpdate.Body.String())
	}
	credentials := serveTestRequest(t, app, http.MethodGet, "/api/app/sharing/accounts/"+accountID+"/credentials", "", token)
	if credentials.Code != http.StatusOK || !containsJSONText(credentials.Body.Bytes(), "updated-password") {
		t.Fatalf("credentials status = %d body=%s", credentials.Code, credentials.Body.String())
	}
	keepPasswordBody := `{
		"name":"Netflix Family #1","accountNumber":1,
		"loginAccount":"netflix-family@example.com","password":"",
		"verificationLink":"https://mail.example.com/new-code","monthlyCost":"48",
		"currency":"CNY","nextBillingDate":"2026-11-01","paymentMethod":"Mastercard",
		"cardLast4":"9988","status":"active","notes":"keep current password"
	}`
	keepPassword := serveTestRequest(t, app, http.MethodPut, "/api/app/sharing/accounts/"+accountID, keepPasswordBody, token)
	if keepPassword.Code != http.StatusOK {
		t.Fatalf("keep password update status = %d body=%s", keepPassword.Code, keepPassword.Body.String())
	}
	credentialsAfterKeep := serveTestRequest(t, app, http.MethodGet, "/api/app/sharing/accounts/"+accountID+"/credentials", "", token)
	if credentialsAfterKeep.Code != http.StatusOK || !containsJSONText(credentialsAfterKeep.Body.Bytes(), "updated-password") {
		t.Fatalf("credentials after keep status = %d body=%s", credentialsAfterKeep.Code, credentialsAfterKeep.Body.String())
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
