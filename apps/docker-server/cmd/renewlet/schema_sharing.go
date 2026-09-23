package main

import (
	"github.com/pocketbase/pocketbase/core"
)

const (
	sharingMoneyMaxLength      = 32
	sharingCredentialMaxLength = 16 * 1024
	sharingNotesMaxLength      = 5000
)

func ensureSharingCollections(app core.App, users *core.Collection) error {
	subscriptions, err := app.FindCollectionByNameOrId("subscriptions")
	if err != nil {
		return err
	}
	if err := ensureSharingAccountsCollection(app, users, subscriptions); err != nil {
		return err
	}
	accounts, err := app.FindCollectionByNameOrId("sharing_accounts")
	if err != nil {
		return err
	}
	if err := ensureSharingSeatsCollection(app, users, accounts); err != nil {
		return err
	}
	seats, err := app.FindCollectionByNameOrId("sharing_seats")
	if err != nil {
		return err
	}
	if err := ensureSharingReceivablesCollection(app, users, accounts, seats); err != nil {
		return err
	}
	return ensureSharingExpensesCollection(app, users, accounts)
}

// Sharing collections contain credentials and financial records. They stay closed to
// PocketBase's generic record API and are exposed only through SubNest product routes.
func closeNativeRecordRules(collection *core.Collection) {
	collection.ListRule = nil
	collection.ViewRule = nil
	collection.CreateRule = nil
	collection.UpdateRule = nil
	collection.DeleteRule = nil
}

func sharingRelation(name string, collection *core.Collection, required bool) *core.RelationField {
	minSelect := 0
	if required {
		minSelect = 1
	}
	return &core.RelationField{
		Name:          name,
		CollectionId:  collection.Id,
		CascadeDelete: false,
		MinSelect:     minSelect,
		MaxSelect:     1,
		Required:      required,
	}
}

func sharingMoneyField(name string, required bool) *core.TextField {
	return &core.TextField{Name: name, Required: required, Max: sharingMoneyMaxLength}
}

func sharingDateField(name string, required bool) *core.TextField {
	return &core.TextField{Name: name, Required: required, Max: 10, Pattern: `^$|^\d{4}-\d{2}-\d{2}$`}
}

func sharingDateTimeField(name string) *core.TextField {
	return &core.TextField{Name: name, Max: 40}
}

func ensureSharingAccountsCollection(app core.App, users, subscriptions *core.Collection) error {
	return ensureCollection(app, "sharing_accounts", func(c *core.Collection) error {
		closeNativeRecordRules(c)
		minOne := 1.0
		maxCapacity := 100.0
		fields := []core.Field{
			userRelation(users),
			sharingRelation("subscription", subscriptions, true),
			&core.TextField{Name: "name", Required: true, Max: 120},
			&core.NumberField{Name: "accountNumber", Required: true, OnlyInt: true, Min: &minOne},
			&core.TextField{Name: "loginAccount", Required: true, Max: 320},
			&core.TextField{Name: "encryptedCredentials", Max: sharingCredentialMaxLength},
			&core.URLField{Name: "verificationLink"},
			sharingMoneyField("monthlyCost", true),
			&core.TextField{Name: "currency", Required: true, Max: 8, Pattern: `^[A-Z]{3}$`},
			sharingDateField("nextBillingDate", true),
			&core.TextField{Name: "paymentMethod", Max: 80},
			&core.TextField{Name: "cardLast4", Max: 32},
			&core.NumberField{Name: "capacity", Required: true, OnlyInt: true, Min: &minOne, Max: &maxCapacity},
			&core.SelectField{Name: "status", Required: true, Values: []string{"active", "paused", "archived"}},
			&core.TextField{Name: "notes", Max: sharingNotesMaxLength},
		}
		for _, field := range fields {
			if err := upsertField(c, field); err != nil {
				return err
			}
		}
		if err := ensureAutodates(c); err != nil {
			return err
		}
		c.AddIndex("idx_sharing_accounts_user_subscription_number", true, "user, subscription, accountNumber", "")
		c.AddIndex("idx_sharing_accounts_user_next_billing", false, "user, nextBillingDate, id", "")
		return nil
	})
}

func ensureSharingSeatsCollection(app core.App, users, accounts *core.Collection) error {
	return ensureCollection(app, "sharing_seats", func(c *core.Collection) error {
		closeNativeRecordRules(c)
		minOne := 1.0
		maxBillingMonths := 120.0
		fields := []core.Field{
			userRelation(users),
			sharingRelation("sharingAccount", accounts, true),
			&core.NumberField{Name: "seatNumber", Required: true, OnlyInt: true, Min: &minOne},
			&core.TextField{Name: "memberName", Max: 120},
			&core.TextField{Name: "contact", Max: 320},
			&core.SelectField{Name: "contactType", Values: []string{"wechat", "telegram", "email", "phone", "other"}},
			sharingMoneyField("monthlyPrice", false),
			&core.TextField{Name: "currency", Max: 8, Pattern: `^$|^[A-Z]{3}$`},
			&core.NumberField{Name: "billingMonths", OnlyInt: true, Min: &minOne, Max: &maxBillingMonths},
			sharingDateField("startDate", false),
			sharingDateField("expiresAt", false),
			&core.SelectField{Name: "status", Required: true, Values: []string{"vacant", "active", "paused", "archived"}},
			&core.TextField{Name: "notes", Max: sharingNotesMaxLength},
		}
		for _, field := range fields {
			if err := upsertField(c, field); err != nil {
				return err
			}
		}
		if err := ensureAutodates(c); err != nil {
			return err
		}
		c.AddIndex("idx_sharing_seats_user_account_number", true, "user, sharingAccount, seatNumber", "")
		c.AddIndex("idx_sharing_seats_user_expiry", false, "user, expiresAt, id", "")
		return nil
	})
}

func ensureSharingReceivablesCollection(app core.App, users, accounts, seats *core.Collection) error {
	return ensureCollection(app, "sharing_receivables", func(c *core.Collection) error {
		closeNativeRecordRules(c)
		fields := []core.Field{
			userRelation(users),
			sharingRelation("sharingAccount", accounts, true),
			sharingRelation("seat", seats, true),
			sharingDateField("periodStart", true),
			sharingDateField("periodEnd", true),
			sharingDateField("dueDate", true),
			sharingMoneyField("amount", true),
			sharingMoneyField("paidAmount", true),
			sharingMoneyField("feeAmount", true),
			sharingMoneyField("refundAmount", true),
			&core.TextField{Name: "currency", Required: true, Max: 8, Pattern: `^[A-Z]{3}$`},
			&core.SelectField{Name: "status", Required: true, Values: []string{"pending", "partial", "paid", "overdue", "waived"}},
			sharingDateTimeField("paidAt"),
			&core.TextField{Name: "notes", Max: sharingNotesMaxLength},
		}
		for _, field := range fields {
			if err := upsertField(c, field); err != nil {
				return err
			}
		}
		if err := ensureAutodates(c); err != nil {
			return err
		}
		c.AddIndex("idx_sharing_receivables_user_due", false, "user, dueDate, status, id", "")
		c.AddIndex("idx_sharing_receivables_user_account_period", false, "user, sharingAccount, periodStart, id", "")
		return nil
	})
}

func ensureSharingExpensesCollection(app core.App, users, accounts *core.Collection) error {
	return ensureCollection(app, "sharing_expenses", func(c *core.Collection) error {
		closeNativeRecordRules(c)
		fields := []core.Field{
			userRelation(users),
			sharingRelation("sharingAccount", accounts, true),
			sharingDateField("periodStart", true),
			sharingDateField("periodEnd", true),
			sharingDateField("dueDate", true),
			sharingMoneyField("amount", true),
			&core.TextField{Name: "currency", Required: true, Max: 8, Pattern: `^[A-Z]{3}$`},
			&core.SelectField{Name: "status", Required: true, Values: []string{"scheduled", "paid", "cancelled"}},
			sharingDateTimeField("paidAt"),
			&core.TextField{Name: "notes", Max: sharingNotesMaxLength},
		}
		for _, field := range fields {
			if err := upsertField(c, field); err != nil {
				return err
			}
		}
		if err := ensureAutodates(c); err != nil {
			return err
		}
		c.AddIndex("idx_sharing_expenses_user_due", false, "user, dueDate, status, id", "")
		c.AddIndex("idx_sharing_expenses_user_account_period", false, "user, sharingAccount, periodStart, id", "")
		return nil
	})
}
