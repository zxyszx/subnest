package main

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestSharingOutstandingExcludesCorrectedDraftAndPreservesHistoricalDebt(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	user, _ := createRouteTestUser(t, app, "outstanding-owner")
	subscription := createRouteTestSubscription(t, app, user.Id, map[string]interface{}{"name": "Netflix", "currency": "NGN"})
	accounts, _ := app.FindCollectionByNameOrId("sharing_accounts")
	account := core.NewRecord(accounts)
	for key, value := range map[string]interface{}{"user": user.Id, "subscription": subscription.Id, "name": "Test", "accountNumber": 1, "loginAccount": "test@example.test", "monthlyCost": "8500", "currency": "NGN", "nextBillingDate": "2099-01-01", "capacity": 5, "status": "active"} {
		account.Set(key, value)
	}
	if err := app.Save(account); err != nil {
		t.Fatal(err)
	}
	seats, _ := app.FindCollectionByNameOrId("sharing_seats")
	seat := core.NewRecord(seats)
	for key, value := range map[string]interface{}{"user": user.Id, "sharingAccount": account.Id, "seatNumber": 1, "memberName": "Member", "monthlyPrice": "15", "currency": "CNY", "billingMonths": 1, "startDate": "2099-01-01", "expiresAt": "2099-02-01", "status": "active"} {
		seat.Set(key, value)
	}
	if err := app.Save(seat); err != nil {
		t.Fatal(err)
	}
	bills, _ := app.FindCollectionByNameOrId("sharing_receivables")
	addBill := func(start, end, amount, paid, status string) *core.Record {
		bill := core.NewRecord(bills)
		for key, value := range map[string]interface{}{"user": user.Id, "sharingAccount": account.Id, "seat": seat.Id, "periodStart": start, "periodEnd": end, "dueDate": start, "amount": amount, "paidAmount": paid, "feeAmount": "0", "refundAmount": "0", "currency": "CNY", "status": status} {
			bill.Set(key, value)
		}
		if err := app.Save(bill); err != nil {
			t.Fatal(err)
		}
		return bill
	}
	old := addBill("2099-01-01", "2099-04-01", "45", "0", "pending")
	addBill("2099-01-01", "2099-02-01", "15", "15", "paid")
	_, _, pending, currencies, err := sharingAccountFinancialUnits(app, account)
	if err != nil || pending != 0 || len(currencies) != 0 {
		t.Fatalf("corrected draft still counted: %d %#v %v", pending, currencies, err)
	}
	seat.Set("startDate", "2099-02-01")
	seat.Set("expiresAt", "2099-03-01")
	if err := app.Save(seat); err != nil {
		t.Fatal(err)
	}
	addBill("2099-02-01", "2099-03-01", "15", "15", "paid")
	_, _, pending, currencies, err = sharingAccountFinancialUnits(app, account)
	if err != nil || pending != 0 || len(currencies) != 0 {
		t.Fatalf("corrected draft returned after renewal: %d %#v %v", pending, currencies, err)
	}
	old.Set("feeAmount", "1")
	if err := app.Save(old); err != nil {
		t.Fatal(err)
	}
	_, _, _, currencies, err = sharingAccountFinancialUnits(app, account)
	if err != nil || currencies["CNY"] != "46" {
		t.Fatalf("bill with a fee was discarded: %#v %v", currencies, err)
	}
	old.Set("feeAmount", "0")
	if err := app.Save(old); err != nil {
		t.Fatal(err)
	}
	addBill("2098-12-01", "2099-01-01", "15", "0", "pending")
	_, _, pending, currencies, err = sharingAccountFinancialUnits(app, account)
	if err != nil || moneyUnitsToString(pending) != "15" || currencies["CNY"] != "15" {
		t.Fatalf("historical CNY debt lost: %d %#v %v", pending, currencies, err)
	}
	old.Set("paidAmount", "5")
	old.Set("status", "partial")
	if err := app.Save(old); err != nil {
		t.Fatal(err)
	}
	_, _, pending, currencies, err = sharingAccountFinancialUnits(app, account)
	if err != nil || currencies["CNY"] != "55" {
		t.Fatalf("partially collected bill lost: %d %#v %v", pending, currencies, err)
	}
}
