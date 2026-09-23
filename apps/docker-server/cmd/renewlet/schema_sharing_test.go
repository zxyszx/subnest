package main

import "testing"

func TestEnsureSharingCollectionsCreatesPrivateDomainSchema(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}

	tests := map[string][]string{
		"sharing_accounts":    {"user", "subscription", "accountNumber", "loginAccount", "encryptedCredentials", "verificationLink", "monthlyCost", "nextBillingDate", "capacity", "status"},
		"sharing_seats":       {"user", "sharingAccount", "seatNumber", "memberName", "monthlyPrice", "billingMonths", "expiresAt", "status"},
		"sharing_receivables": {"user", "sharingAccount", "seat", "dueDate", "amount", "paidAmount", "feeAmount", "refundAmount", "status"},
		"sharing_expenses":    {"user", "sharingAccount", "dueDate", "amount", "status"},
	}

	for collectionName, fieldNames := range tests {
		collection, err := app.FindCollectionByNameOrId(collectionName)
		if err != nil {
			t.Fatalf("find %s: %v", collectionName, err)
		}
		if collection.ListRule != nil || collection.ViewRule != nil || collection.CreateRule != nil || collection.UpdateRule != nil || collection.DeleteRule != nil {
			t.Fatalf("%s must stay closed to the native record API", collectionName)
		}
		for _, fieldName := range fieldNames {
			if collection.Fields.GetByName(fieldName) == nil {
				t.Errorf("%s missing field %s", collectionName, fieldName)
			}
		}
	}
}
