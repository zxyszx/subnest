package main

import (
	"encoding/json"
	"fmt"
	"github.com/pocketbase/pocketbase/core"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type newszxcnMailbox struct {
	ID          string `json:"id"`
	Address     string `json:"address"`
	DisplayName string `json:"displayName,omitempty"`
	Status      string `json:"status,omitempty"`
}
type newszxcnFolder struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Role       string `json:"role,omitempty"`
	TotalCount int    `json:"totalCount,omitempty"`
}

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
	if err != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Hostname(), "mail.newszxcn.com") || parsed.Port() != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return e.BadRequestError("API 地址必须是 https://mail.newszxcn.com", nil)
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
	token := strings.TrimSpace(body.Token)
	if token == "" && row != nil {
		token, err = decryptSharingCredential(app, row.GetString("tokenCiphertext"))
		if err != nil {
			return e.InternalServerError("secret decryption failed", err)
		}
	}
	if token == "" {
		return e.BadRequestError("请输入 API 令牌", nil)
	}
	encrypted, err := encryptSharingCredential(app, token)
	if err != nil {
		return e.InternalServerError("secret encryption failed", err)
	}
	row.Set("baseUrl", strings.TrimRight(base, "/"))
	row.Set("tokenCiphertext", encrypted)
	row.Set("tokenMask", maskNewSzxcnToken(token))
	if err := app.Save(row); err != nil {
		return e.InternalServerError("save failed", err)
	}
	return apiSuccessJSON(e, http.StatusOK, newszxcnConfigResponse{Integration: &newszxcnConfig{BaseURL: strings.TrimRight(base, "/"), TokenMask: maskNewSzxcnToken(token), TokenSet: true}})
}
func handleNewSzxcnConfigTest(app core.App, e *core.RequestEvent) error {
	items, err := fetchNewSzxcn[newszxcnMailbox](app, e.Auth.Id, "/api/open/v1/subnest/mailboxes")
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "NewSzxcn 邮箱连接失败", err)
	}
	return apiSuccessJSON(e, http.StatusOK, map[string]any{"mailboxes": items})
}

func handleNewSzxcnMailboxes(app core.App, e *core.RequestEvent) error {
	items, err := fetchNewSzxcn[newszxcnMailbox](app, e.Auth.Id, "/api/open/v1/subnest/mailboxes")
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "NewSzxcn 邮箱请求失败", err)
	}
	return apiSuccessJSON(e, http.StatusOK, map[string]any{"items": items})
}
func handleNewSzxcnFolders(app core.App, e *core.RequestEvent) error {
	mailboxID := strings.TrimSpace(e.Request.PathValue("mailboxId"))
	if mailboxID == "" {
		return e.BadRequestError("邮箱 ID 不能为空", nil)
	}
	items, err := fetchNewSzxcn[newszxcnFolder](app, e.Auth.Id, "/api/open/v1/subnest/mailboxes/"+url.PathEscape(mailboxID)+"/folders")
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "NewSzxcn 文件夹请求失败", err)
	}
	return apiSuccessJSON(e, http.StatusOK, map[string]any{"items": items})
}

func fetchNewSzxcn[T any](app core.App, userID, path string) ([]T, error) {
	row, err := app.FindFirstRecordByFilter("newszxcn_integrations", "user = {:user}", map[string]any{"user": userID})
	if err != nil || row == nil {
		return nil, fmt.Errorf("NewSzxcn 邮箱尚未配置")
	}
	token, err := decryptSharingCredential(app, row.GetString("tokenCiphertext"))
	if err != nil {
		return nil, err
	}
	endpoint := strings.TrimRight(row.GetString("baseUrl"), "/") + path
	headers := make(http.Header)
	headers.Set("Authorization", "Bearer "+token)
	headers.Set("Accept", "application/json")
	response, err := sendUpstreamRequestBytes(http.MethodGet, endpoint, headers, nil, upstreamHTTPRequestOptions{Provider: "NewSzxcn 邮箱", Secrets: []string{token}})
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream status %d", response.StatusCode)
	}
	return decodeNewSzxcnItems[T](raw)
}

func decodeNewSzxcnItems[T any](raw []byte) ([]T, error) {
	var envelope struct {
		Items []T `json:"items"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	return envelope.Items, nil
}
func maskNewSzxcnToken(value string) string {
	if len(value) <= 8 {
		return "********"
	}
	return value[:4] + "..." + value[len(value)-4:]
}
