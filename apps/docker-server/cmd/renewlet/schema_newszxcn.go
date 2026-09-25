package main

import "github.com/pocketbase/pocketbase/core"

func ensureNewSzxcnCollections(app core.App, users *core.Collection) error {
	if err := ensureCollection(app, "newszxcn_integrations", func(c *core.Collection) error {
		closeNativeRecordRules(c)
		if err := upsertField(c, userRelation(users)); err != nil {
			return err
		}
		for _, field := range []core.Field{
			&core.TextField{Name: "baseUrl", Required: true, Max: 2048},
			&core.TextField{Name: "tokenCiphertext", Required: true, Max: 65536},
			&core.TextField{Name: "tokenMask", Required: true, Max: 128},
		} {
			if err := upsertField(c, field); err != nil {
				return err
			}
		}
		if err := ensureAutodates(c); err != nil {
			return err
		}
		c.AddIndex("idx_newszxcn_integrations_user_unique", true, "user", "")
		return nil
	}); err != nil {
		return err
	}
	return ensureCollection(app, "shared_inbox_links", func(c *core.Collection) error {
		closeNativeRecordRules(c)
		if err := upsertField(c, userRelation(users)); err != nil {
			return err
		}
		fields := []core.Field{&core.TextField{Name: "shortKeyHash", Required: true, Max: 128}, &core.TextField{Name: "shortKeyCiphertext", Required: true, Max: 65536}, &core.TextField{Name: "grantId", Required: true, Max: 256}, &core.TextField{Name: "mailboxId", Required: true, Max: 256}, &core.TextField{Name: "mailboxAddress", Required: true, Max: 320}, &core.JSONField{Name: "folderIds"}, &core.NumberField{Name: "windowMinutes", OnlyInt: true}, &core.TextField{Name: "expiresAt", Max: 40}, &core.SelectField{Name: "status", Required: true, Values: []string{"active", "revoked"}}}
		for _, field := range fields {
			if err := upsertField(c, field); err != nil {
				return err
			}
		}
		if err := ensureAutodates(c); err != nil {
			return err
		}
		c.AddIndex("idx_shared_inbox_links_short_hash_unique", true, "shortKeyHash", "")
		return nil
	})
}
