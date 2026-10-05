package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const onlineTotpPeriodSeconds = int64(30)

var onlineTotpSecretPattern = regexp.MustCompile(`^[A-Z2-7]{16,256}$`)

type onlineTotpAccountResponse struct {
	ID             string  `json:"id"`
	PlatformName   string  `json:"platformName"`
	ServiceName    string  `json:"serviceName"`
	AccountNumber  int     `json:"accountNumber"`
	Account        string  `json:"account"`
	Logo           *string `json:"logo"`
	Enabled        bool    `json:"enabled"`
	SharingEnabled bool    `json:"sharingEnabled"`
	SharePath      string  `json:"sharePath"`
	Code           string  `json:"code"`
	ValidUntil     string  `json:"validUntil"`
	CreatedAt      string  `json:"createdAt"`
}

type onlineTotpAccountsPayload struct {
	Accounts []onlineTotpAccountResponse `json:"accounts"`
	Total    int                         `json:"total"`
}
type onlineTotpAccountPayload struct {
	Account onlineTotpAccountResponse `json:"account"`
}
type onlineTotpPublicPayload struct {
	PlatformName string  `json:"platformName"`
	ServiceName  string  `json:"serviceName"`
	Account      string  `json:"account"`
	Logo         *string `json:"logo"`
	Code         string  `json:"code"`
	ValidUntil   string  `json:"validUntil"`
}

type onlineTotpCreateRequest struct {
	PlatformName   string `json:"platformName" validate:"required,max=80"`
	ServiceName    string `json:"serviceName" validate:"max=120"`
	AccountNumber  int    `json:"accountNumber" validate:"required,min=1,max=10000"`
	Account        string `json:"account" validate:"required,max=320"`
	Logo           string `json:"logo" validate:"max=2048"`
	Secret         string `json:"secret" validate:"required,max=4096"`
	Enabled        bool   `json:"enabled"`
	SharingEnabled bool   `json:"sharingEnabled"`
}
type onlineTotpUpdateRequest struct {
	PlatformName   string `json:"platformName" validate:"required,max=80"`
	ServiceName    string `json:"serviceName" validate:"max=120"`
	AccountNumber  int    `json:"accountNumber" validate:"required,min=1,max=10000"`
	Account        string `json:"account" validate:"required,max=320"`
	Logo           string `json:"logo" validate:"max=2048"`
	Secret         string `json:"secret" validate:"max=4096"`
	Enabled        bool   `json:"enabled"`
	SharingEnabled bool   `json:"sharingEnabled"`
}

func validateOnlineTotpFields(locale appLocale, platformName, serviceName, account, logo, secret string, accountNumber int, secretRequired bool) error {
	if platformName == "" || utf8.RuneCountInString(platformName) > 80 || utf8.RuneCountInString(serviceName) > 120 ||
		accountNumber < 1 || accountNumber > 10000 || account == "" || utf8.RuneCountInString(account) > 320 ||
		utf8.RuneCountInString(logo) > 2048 || utf8.RuneCountInString(secret) > 4096 || (secretRequired && secret == "") {
		return errors.New(serverText(locale, "common.invalidRequestParameters"))
	}
	if err := validateOptionalLogoReference(logo); err != nil {
		return errors.New(serverText(locale, "common.invalidRequestParameters"))
	}
	return nil
}

func (r *onlineTotpCreateRequest) Validate(locale appLocale) error {
	r.PlatformName = strings.TrimSpace(r.PlatformName)
	r.ServiceName = strings.TrimSpace(r.ServiceName)
	r.Account = strings.TrimSpace(r.Account)
	r.Logo = strings.TrimSpace(r.Logo)
	r.Secret = strings.TrimSpace(r.Secret)
	return validateOnlineTotpFields(locale, r.PlatformName, r.ServiceName, r.Account, r.Logo, r.Secret, r.AccountNumber, true)
}

func (r *onlineTotpUpdateRequest) Validate(locale appLocale) error {
	r.PlatformName = strings.TrimSpace(r.PlatformName)
	r.ServiceName = strings.TrimSpace(r.ServiceName)
	r.Account = strings.TrimSpace(r.Account)
	r.Logo = strings.TrimSpace(r.Logo)
	r.Secret = strings.TrimSpace(r.Secret)
	return validateOnlineTotpFields(locale, r.PlatformName, r.ServiceName, r.Account, r.Logo, r.Secret, r.AccountNumber, false)
}

func handleOnlineTotpAccountsList(app core.App, e *core.RequestEvent) error {
	rows, err := app.FindRecordsByFilter("online_totp_accounts", "user = {:user}", "platformName,accountNumber,created", 1000, 0, dbx.Params{"user": e.Auth.Id})
	if err != nil {
		return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
	}
	accounts := make([]onlineTotpAccountResponse, 0, len(rows))
	for _, row := range rows {
		item, err := onlineTotpAccountAPI(app, row)
		if err != nil {
			return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
		}
		accounts = append(accounts, item)
	}
	sort.SliceStable(accounts, func(i, j int) bool {
		if accounts[i].PlatformName == accounts[j].PlatformName {
			return accounts[i].AccountNumber < accounts[j].AccountNumber
		}
		return accounts[i].PlatformName < accounts[j].PlatformName
	})
	return apiSuccessJSON(e, http.StatusOK, onlineTotpAccountsPayload{Accounts: accounts, Total: len(accounts)})
}

func handleOnlineTotpAccountCreate(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	body, err := decodeStrictJSON[onlineTotpCreateRequest](e.Request, locale)
	if err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	secret, err := normalizeOnlineTotpSecret(body.Secret)
	if err != nil {
		return e.BadRequestError("TOTP_SECRET_INVALID", err)
	}
	if err := assertOnlineTotpNumberAvailable(app, e.Auth.Id, body.PlatformName, body.AccountNumber, ""); err != nil {
		return apiErrorJSON(e, http.StatusConflict, "TOTP_ACCOUNT_NUMBER_CONFLICT", "TOTP_ACCOUNT_NUMBER_CONFLICT", nil)
	}
	secretCiphertext, err := transformOnlineTotpSecret(app, secret, true)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	shareKey := randomURLToken(24)
	shareCiphertext, err := transformOnlineTotpSecret(app, shareKey, true)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	collection, err := app.FindCollectionByNameOrId("online_totp_accounts")
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	record := core.NewRecord(collection)
	record.Set("user", e.Auth.Id)
	record.Set("platformName", strings.TrimSpace(body.PlatformName))
	record.Set("serviceName", strings.TrimSpace(body.ServiceName))
	record.Set("accountNumber", body.AccountNumber)
	record.Set("account", strings.TrimSpace(body.Account))
	record.Set("logo", strings.TrimSpace(body.Logo))
	record.Set("secretCiphertext", secretCiphertext)
	record.Set("enabled", body.Enabled)
	record.Set("sharingEnabled", body.SharingEnabled)
	record.Set("shareKeyHash", onlineTotpShareHash(shareKey))
	record.Set("shareKeyCiphertext", shareCiphertext)
	if err := app.Save(record); err != nil {
		return e.BadRequestError("TOTP_ACCOUNT_SAVE_FAILED", err)
	}
	item, err := onlineTotpAccountAPI(app, record)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusCreated, onlineTotpAccountPayload{Account: item})
}

func handleOnlineTotpAccountUpdate(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	id := e.Request.PathValue("id")
	record, err := app.FindFirstRecordByFilter("online_totp_accounts", "id = {:id} && user = {:user}", dbx.Params{"id": id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("TOTP_ACCOUNT_NOT_FOUND", err)
	}
	body, err := decodeStrictJSON[onlineTotpUpdateRequest](e.Request, locale)
	if err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	if err := assertOnlineTotpNumberAvailable(app, e.Auth.Id, body.PlatformName, body.AccountNumber, id); err != nil {
		return apiErrorJSON(e, http.StatusConflict, "TOTP_ACCOUNT_NUMBER_CONFLICT", "TOTP_ACCOUNT_NUMBER_CONFLICT", nil)
	}
	if strings.TrimSpace(body.Secret) != "" {
		secret, parseErr := normalizeOnlineTotpSecret(body.Secret)
		if parseErr != nil {
			return e.BadRequestError("TOTP_SECRET_INVALID", parseErr)
		}
		ciphertext, encryptErr := transformOnlineTotpSecret(app, secret, true)
		if encryptErr != nil {
			return e.InternalServerError(serverText(locale, "common.internalError"), encryptErr)
		}
		record.Set("secretCiphertext", ciphertext)
	}
	record.Set("platformName", strings.TrimSpace(body.PlatformName))
	record.Set("serviceName", strings.TrimSpace(body.ServiceName))
	record.Set("accountNumber", body.AccountNumber)
	record.Set("account", strings.TrimSpace(body.Account))
	record.Set("logo", strings.TrimSpace(body.Logo))
	record.Set("enabled", body.Enabled)
	record.Set("sharingEnabled", body.SharingEnabled)
	if err := app.Save(record); err != nil {
		return e.BadRequestError("TOTP_ACCOUNT_SAVE_FAILED", err)
	}
	item, err := onlineTotpAccountAPI(app, record)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusOK, onlineTotpAccountPayload{Account: item})
}

func handleOnlineTotpShareReset(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	record, err := app.FindFirstRecordByFilter("online_totp_accounts", "id = {:id} && user = {:user}", dbx.Params{"id": e.Request.PathValue("id"), "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("TOTP_ACCOUNT_NOT_FOUND", err)
	}
	shareKey := randomURLToken(24)
	ciphertext, err := transformOnlineTotpSecret(app, shareKey, true)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	record.Set("shareKeyHash", onlineTotpShareHash(shareKey))
	record.Set("shareKeyCiphertext", ciphertext)
	if err := app.Save(record); err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	item, err := onlineTotpAccountAPI(app, record)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusOK, onlineTotpAccountPayload{Account: item})
}

func handleOnlineTotpAccountDelete(app core.App, e *core.RequestEvent) error {
	record, err := app.FindFirstRecordByFilter("online_totp_accounts", "id = {:id} && user = {:user}", dbx.Params{"id": e.Request.PathValue("id"), "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("TOTP_ACCOUNT_NOT_FOUND", err)
	}
	if err := app.Delete(record); err != nil {
		return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
	}
	return apiEmptySuccessJSON(e, http.StatusOK)
}

func handlePublicOnlineTotp(app core.App, e *core.RequestEvent) error {
	e.Response.Header().Set("Cache-Control", "no-store")
	record, err := app.FindFirstRecordByFilter("online_totp_accounts", "shareKeyHash = {:hash} && sharingEnabled = true && enabled = true", dbx.Params{"hash": onlineTotpShareHash(e.Request.PathValue("shareKey"))})
	if err != nil {
		record, err = resolvePublicSharingTotp(app, e.Request.PathValue("shareKey"))
	}
	if err != nil {
		return e.NotFoundError("TOTP_SHARE_NOT_FOUND", err)
	}
	code, validUntil, err := currentOnlineTotp(app, record)
	if err != nil {
		return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusOK, onlineTotpPublicPayload{PlatformName: record.GetString("platformName"), ServiceName: record.GetString("serviceName"), Account: record.GetString("account"), Logo: optionalSharingString(record.GetString("logo")), Code: code, ValidUntil: validUntil})
}

func onlineTotpAccountAPI(app core.App, record *core.Record) (onlineTotpAccountResponse, error) {
	shareKey, err := transformOnlineTotpSecret(app, record.GetString("shareKeyCiphertext"), false)
	if err != nil {
		return onlineTotpAccountResponse{}, err
	}
	code, validUntil := "000000", time.Unix(((time.Now().Unix()/onlineTotpPeriodSeconds)+1)*onlineTotpPeriodSeconds, 0).UTC().Format(time.RFC3339)
	if record.GetBool("enabled") {
		code, validUntil, err = currentOnlineTotp(app, record)
		if err != nil {
			return onlineTotpAccountResponse{}, err
		}
	}
	return onlineTotpAccountResponse{ID: record.Id, PlatformName: record.GetString("platformName"), ServiceName: record.GetString("serviceName"), AccountNumber: record.GetInt("accountNumber"), Account: record.GetString("account"), Logo: optionalSharingString(record.GetString("logo")), Enabled: record.GetBool("enabled"), SharingEnabled: record.GetBool("sharingEnabled"), SharePath: "/otp/" + shareKey, Code: code, ValidUntil: validUntil, CreatedAt: record.GetDateTime("created").Time().UTC().Format(time.RFC3339Nano)}, nil
}

func currentOnlineTotp(app core.App, record *core.Record) (string, string, error) {
	secret, err := transformOnlineTotpSecret(app, record.GetString("secretCiphertext"), false)
	if err != nil {
		return "", "", err
	}
	now := time.Now()
	code, err := generateOnlineTotp(secret, now)
	if err != nil {
		return "", "", err
	}
	next := time.Unix(((now.Unix()/onlineTotpPeriodSeconds)+1)*onlineTotpPeriodSeconds, 0).UTC().Format(time.RFC3339)
	return code, next, nil
}

func generateOnlineTotp(secret string, now time.Time) (string, error) {
	decoded, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return "", err
	}
	counter := uint64(now.Unix() / onlineTotpPeriodSeconds)
	message := make([]byte, 8)
	for i := 7; i >= 0; i-- {
		message[i] = byte(counter)
		counter >>= 8
	}
	mac := hmac.New(sha1.New, decoded)
	_, _ = mac.Write(message)
	digest := mac.Sum(nil)
	offset := digest[len(digest)-1] & 0x0f
	value := (uint32(digest[offset])&0x7f)<<24 | uint32(digest[offset+1])<<16 | uint32(digest[offset+2])<<8 | uint32(digest[offset+3])
	return fmt.Sprintf("%06d", value%1_000_000), nil
}

func normalizeOnlineTotpSecret(input string) (string, error) {
	value := strings.TrimSpace(input)
	if strings.HasPrefix(strings.ToLower(value), "otpauth://") {
		parsed, err := url.Parse(value)
		if err != nil {
			return "", err
		}
		value = parsed.Query().Get("secret")
	}
	value = strings.TrimRight(strings.ToUpper(strings.NewReplacer(" ", "", "-", "", "\n", "", "\r", "", "\t", "").Replace(value)), "=")
	if !onlineTotpSecretPattern.MatchString(value) {
		return "", fmt.Errorf("invalid TOTP secret")
	}
	if _, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(value); err != nil {
		return "", err
	}
	return value, nil
}

func transformOnlineTotpSecret(app core.App, value string, encrypt bool) (string, error) {
	ring, err := accountSecurityKeyRingForApp(app)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(ring.onlineTotp)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if encrypt {
		nonce := make([]byte, gcm.NonceSize())
		if _, err := rand.Read(nonce); err != nil {
			return "", err
		}
		ciphertext := gcm.Seal(nil, nonce, []byte(value), nil)
		return "v1." + base64.RawURLEncoding.EncodeToString(nonce) + "." + base64.RawURLEncoding.EncodeToString(ciphertext), nil
	}
	parts := strings.Split(value, ".")
	if len(parts) != 3 || parts[0] != "v1" {
		return "", fmt.Errorf("invalid online TOTP ciphertext")
	}
	nonce, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", err
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func onlineTotpShareHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func assertOnlineTotpNumberAvailable(app core.App, userID, platformName string, accountNumber int, excludeID string) error {
	rows, err := app.FindRecordsByFilter("online_totp_accounts", "user = {:user} && accountNumber = {:number}", "", 1000, 0, dbx.Params{"user": userID, "number": accountNumber})
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.Id != excludeID && strings.EqualFold(strings.TrimSpace(row.GetString("platformName")), strings.TrimSpace(platformName)) {
			return fmt.Errorf("duplicate account number")
		}
	}
	return nil
}
