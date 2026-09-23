package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const sharingAccountsLimit = 500

var sharingCurrencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

type sharingSubscriptionSummary struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Logo *string `json:"logo"`
}

type sharingAccountResponse struct {
	ID               string                     `json:"id"`
	Subscription     sharingSubscriptionSummary `json:"subscription"`
	Name             string                     `json:"name"`
	AccountNumber    int                        `json:"accountNumber"`
	LoginAccount     string                     `json:"loginAccount"`
	HasPassword      bool                       `json:"hasPassword"`
	VerificationLink *string                    `json:"verificationLink"`
	MonthlyCost      string                     `json:"monthlyCost"`
	Currency         string                     `json:"currency"`
	NextBillingDate  string                     `json:"nextBillingDate"`
	PaymentMethod    *string                    `json:"paymentMethod"`
	CardLast4        *string                    `json:"cardLast4"`
	Capacity         int                        `json:"capacity"`
	OccupiedSeats    int                        `json:"occupiedSeats"`
	Status           string                     `json:"status"`
	Notes            *string                    `json:"notes"`
	CreatedAt        string                     `json:"createdAt"`
}

type sharingAccountsResponse struct {
	Accounts []sharingAccountResponse `json:"accounts"`
	Total    int64                    `json:"total"`
}

type sharingAccountPayload struct {
	Account sharingAccountResponse `json:"account"`
}

type sharingCredentialsResponse struct {
	Password string `json:"password"`
}

type sharingAccountCreateRequest struct {
	SubscriptionID   string `json:"subscriptionId"`
	Name             string `json:"name"`
	AccountNumber    int    `json:"accountNumber"`
	LoginAccount     string `json:"loginAccount"`
	Password         string `json:"password"`
	VerificationLink string `json:"verificationLink"`
	MonthlyCost      string `json:"monthlyCost"`
	Currency         string `json:"currency"`
	NextBillingDate  string `json:"nextBillingDate"`
	PaymentMethod    string `json:"paymentMethod"`
	CardLast4        string `json:"cardLast4"`
	Capacity         int    `json:"capacity"`
	Status           string `json:"status"`
	Notes            string `json:"notes"`
}

func handleSharingAccountsList(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	rows, err := app.FindRecordsByFilter(
		"sharing_accounts",
		"user = {:user}",
		"subscription,accountNumber,created",
		sharingAccountsLimit,
		0,
		dbx.Params{"user": e.Auth.Id},
	)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	accounts := make([]sharingAccountResponse, 0, len(rows))
	for _, row := range rows {
		account, err := sharingAccountAPIFromRecord(app, row)
		if err != nil {
			return e.InternalServerError(serverText(locale, "common.internalError"), err)
		}
		accounts = append(accounts, account)
	}
	return apiSuccessJSON(e, http.StatusOK, sharingAccountsResponse{Accounts: accounts, Total: int64(len(accounts))})
}

func handleSharingAccountCreate(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	body, err := decodeStrictJSON[sharingAccountCreateRequest](e.Request, locale)
	if err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	if err := normalizeSharingAccountCreateRequest(&body); err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	subscription, err := app.FindFirstRecordByFilter(
		"subscriptions",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": body.SubscriptionID, "user": e.Auth.Id},
	)
	if err != nil || subscription == nil {
		return e.NotFoundError("SUBSCRIPTION_NOT_FOUND", err)
	}
	ciphertext, err := encryptSharingCredential(app, body.Password)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}

	var account *core.Record
	err = app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId("sharing_accounts")
		if err != nil {
			return err
		}
		account = core.NewRecord(collection)
		account.Set("user", e.Auth.Id)
		account.Set("subscription", subscription.Id)
		account.Set("name", body.Name)
		account.Set("accountNumber", body.AccountNumber)
		account.Set("loginAccount", body.LoginAccount)
		account.Set("encryptedCredentials", ciphertext)
		account.Set("verificationLink", body.VerificationLink)
		account.Set("monthlyCost", body.MonthlyCost)
		account.Set("currency", body.Currency)
		account.Set("nextBillingDate", body.NextBillingDate)
		account.Set("paymentMethod", body.PaymentMethod)
		account.Set("cardLast4", body.CardLast4)
		account.Set("capacity", body.Capacity)
		account.Set("status", body.Status)
		account.Set("notes", body.Notes)
		if err := txApp.Save(account); err != nil {
			return err
		}
		seats, err := txApp.FindCollectionByNameOrId("sharing_seats")
		if err != nil {
			return err
		}
		for seatNumber := 1; seatNumber <= body.Capacity; seatNumber++ {
			seat := core.NewRecord(seats)
			seat.Set("user", e.Auth.Id)
			seat.Set("sharingAccount", account.Id)
			seat.Set("seatNumber", seatNumber)
			seat.Set("status", "vacant")
			if err := txApp.Save(seat); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	response, err := sharingAccountAPIFromRecord(app, account)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusCreated, sharingAccountPayload{Account: response})
}

func handleSharingAccountCredentials(app core.App, e *core.RequestEvent) error {
	record, err := app.FindFirstRecordByFilter(
		"sharing_accounts",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": strings.TrimSpace(e.Request.PathValue("id")), "user": e.Auth.Id},
	)
	if err != nil || record == nil {
		return e.NotFoundError("SHARING_ACCOUNT_NOT_FOUND", err)
	}
	password, err := decryptSharingCredential(app, record.GetString("encryptedCredentials"))
	if err != nil {
		return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	return apiSuccessJSON(e, http.StatusOK, sharingCredentialsResponse{Password: password})
}

func normalizeSharingAccountCreateRequest(body *sharingAccountCreateRequest) error {
	body.SubscriptionID = strings.TrimSpace(body.SubscriptionID)
	body.Name = strings.TrimSpace(body.Name)
	body.LoginAccount = strings.TrimSpace(body.LoginAccount)
	body.VerificationLink = strings.TrimSpace(body.VerificationLink)
	body.MonthlyCost = strings.TrimSpace(body.MonthlyCost)
	body.Currency = strings.ToUpper(strings.TrimSpace(body.Currency))
	body.NextBillingDate = strings.TrimSpace(body.NextBillingDate)
	body.PaymentMethod = strings.TrimSpace(body.PaymentMethod)
	body.CardLast4 = strings.TrimSpace(body.CardLast4)
	body.Status = strings.TrimSpace(body.Status)
	body.Notes = strings.TrimSpace(body.Notes)
	if body.SubscriptionID == "" || body.Name == "" || len(body.Name) > 120 || body.AccountNumber < 1 || body.Capacity < 1 || body.Capacity > 100 {
		return errors.New("invalid sharing account identity")
	}
	if body.LoginAccount == "" || len(body.LoginAccount) > 320 || body.Password == "" || len(body.Password) > 1024 {
		return errors.New("invalid sharing account credentials")
	}
	if !validSharingMoney(body.MonthlyCost) || !sharingCurrencyPattern.MatchString(body.Currency) || !isValidDateOnly(body.NextBillingDate) {
		return errors.New("invalid sharing account billing")
	}
	if body.VerificationLink != "" {
		parsed, err := url.ParseRequestURI(body.VerificationLink)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil {
			return errors.New("invalid verification link")
		}
	}
	if body.Status == "" {
		body.Status = "active"
	}
	if body.Status != "active" && body.Status != "paused" && body.Status != "archived" {
		return errors.New("invalid sharing account status")
	}
	if len(body.PaymentMethod) > 80 || len(body.CardLast4) > 32 || len(body.Notes) > sharingNotesMaxLength {
		return errors.New("sharing account text is too long")
	}
	return nil
}

func validSharingMoney(value string) bool {
	amount, err := strconv.ParseFloat(value, 64)
	return err == nil && amount >= 0 && amount < 1e12
}

func sharingAccountAPIFromRecord(app core.App, record *core.Record) (sharingAccountResponse, error) {
	subscription, err := app.FindRecordById("subscriptions", record.GetString("subscription"))
	if err != nil {
		return sharingAccountResponse{}, err
	}
	occupied, err := app.CountRecords("sharing_seats", dbx.HashExp{
		"user":           record.GetString("user"),
		"sharingAccount": record.Id,
		"status":         "active",
	})
	if err != nil {
		return sharingAccountResponse{}, err
	}
	return sharingAccountResponse{
		ID: record.Id,
		Subscription: sharingSubscriptionSummary{
			ID:   subscription.Id,
			Name: subscription.GetString("name"),
			Logo: optionalSharingString(subscription.GetString("logo")),
		},
		Name:             record.GetString("name"),
		AccountNumber:    record.GetInt("accountNumber"),
		LoginAccount:     record.GetString("loginAccount"),
		HasPassword:      record.GetString("encryptedCredentials") != "",
		VerificationLink: optionalSharingString(record.GetString("verificationLink")),
		MonthlyCost:      record.GetString("monthlyCost"),
		Currency:         record.GetString("currency"),
		NextBillingDate:  record.GetString("nextBillingDate"),
		PaymentMethod:    optionalSharingString(record.GetString("paymentMethod")),
		CardLast4:        optionalSharingString(record.GetString("cardLast4")),
		Capacity:         record.GetInt("capacity"),
		OccupiedSeats:    int(occupied),
		Status:           record.GetString("status"),
		Notes:            optionalSharingString(record.GetString("notes")),
		CreatedAt:        sharingCreatedAt(record),
	}, nil
}

func sharingCreatedAt(record *core.Record) string {
	if record.GetDateTime("created").IsZero() {
		return ""
	}
	return record.GetDateTime("created").Time().UTC().Format(time.RFC3339Nano)
}

func optionalSharingString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func encryptSharingCredential(app core.App, plaintext string) (string, error) {
	return transformSharingCredential(app, plaintext, true)
}

func decryptSharingCredential(app core.App, value string) (string, error) {
	return transformSharingCredential(app, value, false)
}

func transformSharingCredential(app core.App, value string, encrypt bool) (string, error) {
	ring, err := accountSecurityKeyRingForApp(app)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(ring.sharingCredential)
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
		return "", fmt.Errorf("invalid sharing credential ciphertext")
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
