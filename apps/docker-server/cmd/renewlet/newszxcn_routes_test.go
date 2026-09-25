package main

import "testing"

func TestDecodeNewSzxcnMailboxItems(t *testing.T) {
	raw := []byte(`{"items":[{"id":"mbx_1","address":"netflix05@newszxcn.com","displayName":"Netflix","status":"active"}],"nextCursor":""}`)

	items, err := decodeNewSzxcnItems[newszxcnMailbox](raw)
	if err != nil {
		t.Fatalf("decode mailboxes: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("mailbox count = %d, want 1", len(items))
	}
	if items[0].ID != "mbx_1" || items[0].Address != "netflix05@newszxcn.com" || items[0].DisplayName != "Netflix" || items[0].Status != "active" {
		t.Fatalf("unexpected mailbox: %+v", items[0])
	}
}

func TestDecodeNewSzxcnFolderItems(t *testing.T) {
	raw := []byte(`{"items":[{"id":"fld_inbox","name":"INBOX","role":"inbox","totalCount":12}]}`)

	items, err := decodeNewSzxcnItems[newszxcnFolder](raw)
	if err != nil {
		t.Fatalf("decode folders: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("folder count = %d, want 1", len(items))
	}
	if items[0].ID != "fld_inbox" || items[0].Role != "inbox" || items[0].TotalCount != 12 {
		t.Fatalf("unexpected folder: %+v", items[0])
	}
}
