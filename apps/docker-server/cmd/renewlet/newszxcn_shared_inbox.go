package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

type sharedInboxLinkRequest struct {
	MailboxID     string   `json:"mailboxId"`
	FolderIDs     []string `json:"folderIds"`
	WindowMinutes int      `json:"windowMinutes"`
	ExpiresAt     *string  `json:"expiresAt"`
}

type sharedInboxLinkResponse struct {
	ID             string   `json:"id"`
	ShortURL       string   `json:"shortUrl"`
	MailboxID      string   `json:"mailboxId"`
	MailboxAddress string   `json:"mailboxAddress"`
	FolderIDs      []string `json:"folderIds"`
	WindowMinutes  int      `json:"windowMinutes"`
	ExpiresAt      *string  `json:"expiresAt"`
	Status         string   `json:"status"`
	CreatedAt      string   `json:"createdAt"`
	UpdatedAt      string   `json:"updatedAt"`
}

type newszxcnGrantResponse struct {
	ID string `json:"id"`
}

func handleSharedInboxLinks(app core.App, e *core.RequestEvent) error {
	records, err := app.FindRecordsByFilter("shared_inbox_links", "user = {:user}", "-created", 0, 0, map[string]any{"user": e.Auth.Id})
	if err != nil {
		return e.InternalServerError("load shared inbox links failed", err)
	}
	links := make([]sharedInboxLinkResponse, 0, len(records))
	syncedMailboxes := map[string]bool{}
	for _, record := range records {
		link, err := sharedInboxLinkFromRecord(app, e.Request, record)
		if err != nil {
			return e.InternalServerError("shared inbox link decryption failed", err)
		}
		mailboxKey := strings.ToLower(strings.TrimSpace(link.MailboxAddress))
		if link.Status == "active" && !syncedMailboxes[mailboxKey] {
			if err := syncSharedInboxLinkToSubscriptions(app, e.Auth.Id, link.MailboxAddress, "", link.ShortURL); err != nil {
				return e.InternalServerError("sync shared inbox link failed", err)
			}
			syncedMailboxes[mailboxKey] = true
		}
		links = append(links, link)
	}
	return apiSuccessJSON(e, http.StatusOK, map[string]any{"links": links})
}

func handleSharedInboxLinkCreate(app core.App, e *core.RequestEvent) error {
	body, err := decodeStrictJSON[sharedInboxLinkRequest](e.Request, requestLocale(e.Request))
	if err != nil {
		return err
	}
	body.MailboxID = strings.TrimSpace(body.MailboxID)
	if body.MailboxID == "" || len(body.FolderIDs) == 0 {
		return e.BadRequestError("请选择邮箱和至少一个文件夹", nil)
	}
	if body.WindowMinutes != 30 && body.WindowMinutes != 60 && body.WindowMinutes != 360 && body.WindowMinutes != 1440 && body.WindowMinutes != 10080 {
		return e.BadRequestError("邮件范围无效", nil)
	}
	if body.ExpiresAt != nil {
		value := strings.TrimSpace(*body.ExpiresAt)
		parsed, parseErr := time.Parse(time.RFC3339, value)
		if parseErr != nil || !parsed.After(time.Now().UTC()) {
			return e.BadRequestError("链接到期时间无效", nil)
		}
		body.ExpiresAt = &value
	}
	mailboxes, err := fetchNewSzxcn[newszxcnMailbox](app, e.Auth.Id, "/api/open/v1/subnest/mailboxes")
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "无法读取 NewSzxcn 邮箱", err)
	}
	var mailbox *newszxcnMailbox
	for index := range mailboxes {
		if mailboxes[index].ID == body.MailboxID {
			mailbox = &mailboxes[index]
			break
		}
	}
	if mailbox == nil {
		return e.BadRequestError("邮箱不存在", nil)
	}
	if existing, _ := app.FindFirstRecordByFilter("shared_inbox_links", "user = {:user} && mailboxId = {:mailbox} && status = 'active'", map[string]any{"user": e.Auth.Id, "mailbox": body.MailboxID}); existing != nil {
		return apiErrorJSON(e, http.StatusConflict, "SHARE_ALREADY_ACTIVE", "该邮箱已开启分享，请先管理现有链接", nil)
	}

	externalGrantID := "subnest_" + randomURLToken(18)
	grantPayload := map[string]any{"externalGrantId": externalGrantID, "mailboxId": body.MailboxID, "folderIds": body.FolderIDs, "windowMinutes": body.WindowMinutes}
	if body.ExpiresAt != nil {
		grantPayload["expiresAt"] = *body.ExpiresAt
	}
	grantRaw, err := requestNewSzxcn(app, e.Auth.Id, http.MethodPost, "/api/open/v1/subnest/grants", grantPayload)
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "创建邮箱授权失败", err)
	}
	var grant newszxcnGrantResponse
	if err := json.Unmarshal(grantRaw, &grant); err != nil || strings.TrimSpace(grant.ID) == "" {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_INVALID_RESPONSE", "邮箱授权响应无效", err)
	}

	shortKey := randomURLToken(24)
	encryptedKey, err := encryptSharingCredential(app, shortKey)
	if err != nil {
		return e.InternalServerError("short link encryption failed", err)
	}
	var record *core.Record
	shortURL := externalRequestURL(e.Request, "/s/"+shortKey, nil)
	if err := app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId("shared_inbox_links")
		if err != nil {
			return err
		}
		record = core.NewRecord(collection)
		record.Set("user", e.Auth.Id)
		record.Set("shortKeyHash", tokenHash(shortKey))
		record.Set("shortKeyCiphertext", encryptedKey)
		record.Set("grantId", grant.ID)
		record.Set("externalGrantId", externalGrantID)
		record.Set("mailboxId", body.MailboxID)
		record.Set("mailboxAddress", mailbox.Address)
		record.Set("folderIds", body.FolderIDs)
		record.Set("windowMinutes", body.WindowMinutes)
		if body.ExpiresAt != nil {
			record.Set("expiresAt", *body.ExpiresAt)
		}
		record.Set("status", "active")
		if err := txApp.Save(record); err != nil {
			return err
		}
		return syncSharedInboxLinkToSubscriptions(txApp, e.Auth.Id, mailbox.Address, "", shortURL)
	}); err != nil {
		_, _ = requestNewSzxcn(app, e.Auth.Id, http.MethodDelete, "/api/open/v1/subnest/grants/"+url.PathEscape(grant.ID), nil)
		return e.InternalServerError("save shared inbox link failed", err)
	}
	link, err := sharedInboxLinkFromRecord(app, e.Request, record)
	if err != nil {
		return e.InternalServerError("short link decryption failed", err)
	}
	return apiSuccessJSON(e, http.StatusCreated, map[string]any{"link": link})
}

func handleSharedInboxLinkRevoke(app core.App, e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	record, err := app.FindRecordById("shared_inbox_links", id)
	if err != nil || record.GetString("user") != e.Auth.Id || record.GetString("status") != "active" {
		return e.NotFoundError("短链接不存在", nil)
	}
	if _, err := requestNewSzxcn(app, e.Auth.Id, http.MethodDelete, "/api/open/v1/subnest/grants/"+url.PathEscape(record.GetString("grantId")), nil); err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "撤销邮箱授权失败", err)
	}
	oldLink, err := sharedInboxLinkFromRecord(app, e.Request, record)
	if err != nil {
		return e.InternalServerError("short link decryption failed", err)
	}
	if err := app.RunInTransaction(func(txApp core.App) error {
		txRecord, findErr := txApp.FindRecordById("shared_inbox_links", record.Id)
		if findErr != nil {
			return findErr
		}
		txRecord.Set("status", "revoked")
		if saveErr := txApp.Save(txRecord); saveErr != nil {
			return saveErr
		}
		return syncSharedInboxLinkToSubscriptions(txApp, e.Auth.Id, record.GetString("mailboxAddress"), oldLink.ShortURL, "")
	}); err != nil {
		return e.InternalServerError("revoke shared inbox link failed", err)
	}
	return apiEmptySuccessJSON(e, http.StatusOK)
}

// Keep subscription quick actions on the same short URL as the managed mailbox.
// User ownership and mailbox matching are checked again here even though callers
// are authenticated, because this mutates every matching subscription at once.
func syncSharedInboxLinkToSubscriptions(app core.App, userID, mailboxAddress, expectedOldURL, newURL string) error {
	mailboxAddress = strings.TrimSpace(mailboxAddress)
	if mailboxAddress == "" {
		return nil
	}
	const pageSize = 200
	for offset := 0; ; offset += pageSize {
		records, err := app.FindRecordsByFilter("subscriptions", "user = {:user} && familySharingEnabled = true", "id", pageSize, offset, map[string]any{"user": userID})
		if err != nil {
			return err
		}
		for _, subscription := range records {
			if !strings.EqualFold(strings.TrimSpace(subscription.GetString("sharingLoginAccount")), mailboxAddress) {
				continue
			}
			if expectedOldURL != "" && strings.TrimSpace(subscription.GetString("sharingVerificationLink")) != expectedOldURL {
				continue
			}
			if strings.TrimSpace(subscription.GetString("sharingVerificationLink")) == newURL {
				continue
			}
			subscription.Set("sharingVerificationLink", newURL)
			if err := app.Save(subscription); err != nil {
				return err
			}
		}
		if len(records) < pageSize {
			break
		}
	}
	return nil
}

// Local status is checked on every public proxy request. Revoke it before a
// subscription change is committed so an old short link cannot remain usable.
// The upstream grant cleanup is best effort because the local proxy is the
// authoritative access boundary for SubNest links.
func revokeSharedInboxLinksForMailbox(app core.App, userID, mailboxAddress string) error {
	mailboxAddress = strings.TrimSpace(mailboxAddress)
	if mailboxAddress == "" {
		return nil
	}
	records, err := app.FindRecordsByFilter("shared_inbox_links", "user = {:user} && mailboxAddress = {:address} && status = 'active'", "", 500, 0, map[string]any{"user": userID, "address": mailboxAddress})
	if err != nil {
		return err
	}
	for _, record := range records {
		_, _ = requestNewSzxcn(app, userID, http.MethodDelete, "/api/open/v1/subnest/grants/"+url.PathEscape(record.GetString("grantId")), nil)
		record.Set("status", "revoked")
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func handleSharedInboxProxy(app core.App, e *core.RequestEvent, suffix string) error {
	shortKey := strings.TrimSpace(e.Request.PathValue("shortKey"))
	if shortKey == "" || len(shortKey) > 128 {
		return e.NotFoundError("短链接不存在或已失效", nil)
	}
	record, err := app.FindFirstRecordByFilter("shared_inbox_links", "shortKeyHash = {:hash} && status = 'active'", map[string]any{"hash": tokenHash(shortKey)})
	if err != nil || record == nil {
		return e.NotFoundError("短链接不存在或已失效", nil)
	}
	if expiresAt := strings.TrimSpace(record.GetString("expiresAt")); expiresAt != "" {
		parsed, parseErr := time.Parse(time.RFC3339, expiresAt)
		if parseErr != nil || !parsed.After(time.Now().UTC()) {
			return apiErrorJSON(e, http.StatusForbidden, "LINK_EXPIRED", "短链接已过期", nil)
		}
	}
	query := e.Request.URL.Query().Encode()
	path := "/api/open/v1/subnest/grants/" + url.PathEscape(record.GetString("grantId")) + suffix
	if query != "" {
		path += "?" + query
	}
	raw, contentType, err := requestNewSzxcnRaw(app, record.GetString("user"), http.MethodGet, path, nil)
	if err != nil {
		return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_UPSTREAM_FAILED", "读取共享收件箱失败", err)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	e.Response.Header().Set("X-Content-Type-Options", "nosniff")
	if strings.Contains(strings.ToLower(contentType), "json") {
		var payload any
		if err := json.Unmarshal(raw, &payload); err != nil {
			return apiErrorJSON(e, http.StatusBadGateway, "NEWSZXCN_INVALID_RESPONSE", "共享收件箱响应无效", nil)
		}
		return apiSuccessJSON(e, http.StatusOK, payload)
	}
	e.Response.Header().Set("Content-Type", contentType)
	e.Response.WriteHeader(http.StatusOK)
	_, err = e.Response.Write(raw)
	return err
}

func sharedInboxLinkFromRecord(app core.App, request *http.Request, record *core.Record) (sharedInboxLinkResponse, error) {
	shortKey, err := decryptSharingCredential(app, record.GetString("shortKeyCiphertext"))
	if err != nil {
		return sharedInboxLinkResponse{}, err
	}
	var expiresAt *string
	if value := strings.TrimSpace(record.GetString("expiresAt")); value != "" {
		expiresAt = &value
	}
	return sharedInboxLinkResponse{
		ID: record.Id, ShortURL: externalRequestURL(request, "/s/"+shortKey, nil), MailboxID: record.GetString("mailboxId"), MailboxAddress: record.GetString("mailboxAddress"), FolderIDs: record.GetStringSlice("folderIds"), WindowMinutes: record.GetInt("windowMinutes"), ExpiresAt: expiresAt, Status: record.GetString("status"), CreatedAt: record.GetDateTime("created").Time().UTC().Format(time.RFC3339), UpdatedAt: record.GetDateTime("updated").Time().UTC().Format(time.RFC3339),
	}, nil
}

func requestNewSzxcn(app core.App, userID, method, path string, payload any) ([]byte, error) {
	raw, _, err := requestNewSzxcnRaw(app, userID, method, path, payload)
	return raw, err
}

func requestNewSzxcnRaw(app core.App, userID, method, path string, payload any) ([]byte, string, error) {
	row, err := app.FindFirstRecordByFilter("newszxcn_integrations", "user = {:user}", map[string]any{"user": userID})
	if err != nil || row == nil {
		return nil, "", fmt.Errorf("NewSzxcn 邮箱尚未配置")
	}
	token, err := decryptSharingCredential(app, row.GetString("tokenCiphertext"))
	if err != nil {
		return nil, "", err
	}
	var body []byte
	if payload != nil {
		body, err = json.Marshal(payload)
		if err != nil {
			return nil, "", err
		}
	}
	headers := make(http.Header)
	headers.Set("Authorization", "Bearer "+token)
	headers.Set("Accept", "application/json")
	if payload != nil {
		headers.Set("Content-Type", "application/json")
	}
	response, err := sendUpstreamRequestBytes(method, strings.TrimRight(row.GetString("baseUrl"), "/")+path, headers, body, upstreamHTTPRequestOptions{Provider: "NewSzxcn 邮箱", Secrets: []string{token}})
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, "", fmt.Errorf("upstream status %d", response.StatusCode)
	}
	return raw, response.Header.Get("Content-Type"), nil
}
