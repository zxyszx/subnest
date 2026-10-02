package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type publicSubscriptionCursorPayload struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

type privateSubscriptionCursorPayload struct {
	Version   int    `json:"v"`
	AsOf      string `json:"asOf"`
	Pinned    int    `json:"pinned"`
	Inactive  int    `json:"inactive"`
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func parsePositiveQueryInt(value string, fallback int, min int, max int) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < min || parsed > max {
		return 0, errors.New("invalid integer query")
	}
	return parsed, nil
}

func parsePublicSubscriptionCursorPayload(value string) (publicSubscriptionCursorPayload, error) {
	var cursor publicSubscriptionCursorPayload
	data, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return cursor, err
	}
	if err := json.Unmarshal(data, &cursor); err != nil {
		return cursor, err
	}
	if strings.TrimSpace(cursor.CreatedAt) == "" || strings.TrimSpace(cursor.ID) == "" {
		return cursor, errors.New("invalid cursor")
	}
	return cursor, nil
}

func encodePublicSubscriptionCursor(record *core.Record) string {
	cursor := publicSubscriptionCursorPayload{
		// PocketBase filter 按 DefaultDateLayout 字符串比较 DateTime；cursor 不能使用对外 API 的 RFC3339 展示格式。
		CreatedAt: record.GetDateTime("created").String(),
		ID:        record.Id,
	}
	data, _ := json.Marshal(cursor)
	return base64.StdEncoding.EncodeToString(data)
}

func parsePrivateSubscriptionCursorPayload(value string) (privateSubscriptionCursorPayload, error) {
	var wire struct {
		Version   int    `json:"v"`
		AsOf      string `json:"asOf"`
		Pinned    *int   `json:"pinned"`
		Inactive  *int   `json:"inactive"`
		CreatedAt string `json:"createdAt"`
		ID        string `json:"id"`
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return privateSubscriptionCursorPayload{}, err
	}
	if err := decodeStrictJSONBytesInto(data, &wire, defaultAppLocale, false); err != nil {
		return privateSubscriptionCursorPayload{}, err
	}
	if wire.Version != 1 || !isValidDateOnly(wire.AsOf) || wire.Pinned == nil || wire.Inactive == nil ||
		(*wire.Pinned != 0 && *wire.Pinned != 1) || (*wire.Inactive != 0 && *wire.Inactive != 1) ||
		strings.TrimSpace(wire.CreatedAt) == "" || strings.TrimSpace(wire.ID) == "" {
		return privateSubscriptionCursorPayload{}, errors.New("invalid private subscription cursor")
	}
	return privateSubscriptionCursorPayload{
		Version: wire.Version, AsOf: wire.AsOf, Pinned: *wire.Pinned, Inactive: *wire.Inactive,
		CreatedAt: wire.CreatedAt, ID: wire.ID,
	}, nil
}

func encodePrivateSubscriptionCursor(row subscriptionListIndexRow, asOf string) string {
	// 私有列表冻结 asOf 并携带全部排序键；Public API 继续使用独立的旧 cursor，避免机器调用契约被 UI 排序演进污染。
	cursor := privateSubscriptionCursorPayload{
		Version: 1, AsOf: asOf, Pinned: row.Pinned, Inactive: row.Inactive,
		CreatedAt: row.CreatedAt, ID: row.SubscriptionID,
	}
	data, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(data)
}
