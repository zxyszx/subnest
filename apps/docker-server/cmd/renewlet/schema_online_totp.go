package main

import (
	"github.com/pocketbase/pocketbase/core"
)

func ensureOnlineTotpAccountsCollection(app core.App, users *core.Collection) error {
	return ensureCollection(app, "online_totp_accounts", func(c *core.Collection) error {
		secretCollectionRules(c)
		minOne, maxNumber := 1.0, 10000.0
		fields := []core.Field{
			userRelation(users),
			&core.TextField{Name: "platformName", Required: true, Max: 80},
			&core.TextField{Name: "serviceName", Max: 120},
			&core.NumberField{Name: "accountNumber", Required: true, OnlyInt: true, Min: &minOne, Max: &maxNumber},
			&core.TextField{Name: "account", Required: true, Max: 320},
			&core.TextField{Name: "logo", Max: maxLogoReferenceLength},
			&core.TextField{Name: "secretCiphertext", Required: true, Max: 16384},
			&core.BoolField{Name: "enabled"},
			&core.BoolField{Name: "sharingEnabled"},
			&core.TextField{Name: "shareKeyHash", Required: true, Max: 128},
			&core.TextField{Name: "shareKeyCiphertext", Required: true, Max: 16384},
		}
		for _, field := range fields {
			if err := upsertField(c, field); err != nil {
				return err
			}
		}
		if err := ensureAutodates(c); err != nil {
			return err
		}
		c.AddIndex("idx_online_totp_share_hash_unique", true, "shareKeyHash", "")
		c.AddIndex("idx_online_totp_user_platform_number_unique", true, "user, platformName COLLATE NOCASE, accountNumber", "")
		c.AddIndex("idx_online_totp_user_order", false, "user, platformName, accountNumber, created", "")
		return nil
	})
}
