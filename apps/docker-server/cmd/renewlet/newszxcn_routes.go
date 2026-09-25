package main

import (
	"github.com/pocketbase/pocketbase/core"
	"net/http"
	"net/url"
	"strings"
)

type newszxcnConfigRequest struct {
	BaseURL string `json:"baseUrl"`
	Token   string `json:"token"`
}
type newszxcnConfigResponse struct {
	Integration *newszxcnConfig `json:"integration"`
}
type newszxcnConfig struct {
	BaseURL   string `json:"baseUrl"`
	TokenMask string `json:"tokenMask"`
	TokenSet  bool   `json:"tokenSet"`
}

func handleNewSzxcnConfigRead(app core.App, e *core.RequestEvent) error {
	row, _ := app.FindFirstRecordByFilter("newszxcn_integrations", "user = {:user}", map[string]any{"user": e.Auth.Id})
	if row == nil {
		return apiSuccessJSON(e, http.StatusOK, newszxcnConfigResponse{})
	}
	return apiSuccessJSON(e, http.StatusOK, newszxcnConfigResponse{Integration: &newszxcnConfig{BaseURL: row.GetString("baseUrl"), TokenMask: row.GetString("tokenMask"), TokenSet: true}})
}
func handleNewSzxcnConfigUpdate(app core.App, e *core.RequestEvent) error {
	body, err := decodeStrictJSON[newszxcnConfigRequest](e.Request, requestLocale(e.Request))
	if err != nil {
		return err
	}
	base := strings.TrimSpace(body.BaseURL)
	if base == "" {
		base = "https://mail.newszxcn.com"
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Scheme != "https" {
		return e.BadRequestError("API 地址必须使用 HTTPS", nil)
	}
	if strings.TrimSpace(body.Token) == "" {
		return e.BadRequestError("请输入 API 令牌", nil)
	}
	collection, err := app.FindCollectionByNameOrId("newszxcn_integrations")
	if err != nil {
		return e.InternalServerError("schema unavailable", err)
	}
	row, _ := app.FindFirstRecordByFilter("newszxcn_integrations", "user = {:user}", map[string]any{"user": e.Auth.Id})
	if row == nil {
		row = core.NewRecord(collection)
		row.Set("user", e.Auth.Id)
	}
	encrypted, err := encryptSharingCredential(app, body.Token)
	if err != nil {
		return e.InternalServerError("secret encryption failed", err)
	}
	row.Set("baseUrl", strings.TrimRight(base, "/"))
	row.Set("tokenCiphertext", encrypted)
	row.Set("tokenMask", maskNewSzxcnToken(body.Token))
	if err := app.Save(row); err != nil {
		return e.InternalServerError("save failed", err)
	}
	return apiSuccessJSON(e, http.StatusOK, newszxcnConfigResponse{Integration: &newszxcnConfig{BaseURL: strings.TrimRight(base, "/"), TokenMask: maskNewSzxcnToken(body.Token), TokenSet: true}})
}
func handleNewSzxcnConfigTest(app core.App, e *core.RequestEvent) error {
	return apiSuccessJSON(e, http.StatusOK, map[string]any{"mailboxes": []any{}})
}
func maskNewSzxcnToken(value string) string {
	if len(value) <= 8 {
		return "********"
	}
	return value[:4] + "..." + value[len(value)-4:]
}
