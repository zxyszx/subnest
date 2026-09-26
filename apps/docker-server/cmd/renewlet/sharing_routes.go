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
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const sharingAccountsLimit = 500

var sharingCurrencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

type sharingSubscriptionSummary struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	PlatformName string  `json:"platformName"`
	Logo         *string `json:"logo"`
}

type sharingAccountResponse struct {
	ID                       string                     `json:"id"`
	Subscription             sharingSubscriptionSummary `json:"subscription"`
	Name                     string                     `json:"name"`
	AccountNumber            int                        `json:"accountNumber"`
	LoginAccount             string                     `json:"loginAccount"`
	HasPassword              bool                       `json:"hasPassword"`
	VerificationLink         *string                    `json:"verificationLink"`
	MonthlyCost              string                     `json:"monthlyCost"`
	Currency                 string                     `json:"currency"`
	NextBillingDate          string                     `json:"nextBillingDate"`
	PaymentMethod            *string                    `json:"paymentMethod"`
	CardLast4                *string                    `json:"cardLast4"`
	Capacity                 int                        `json:"capacity"`
	OccupiedSeats            int                        `json:"occupiedSeats"`
	MonthlyRevenue           string                     `json:"monthlyRevenue"`
	MonthlyRevenueByCurrency map[string]string          `json:"monthlyRevenueByCurrency"`
	OutstandingAmount        string                     `json:"outstandingAmount"`
	MonthlyProfit            float64                    `json:"monthlyProfit"`
	Status                   string                     `json:"status"`
	Notes                    *string                    `json:"notes"`
	CreatedAt                string                     `json:"createdAt"`
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

type sharingAccountUpdateRequest struct {
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
	Status           string `json:"status"`
	Notes            string `json:"notes"`
}

func handleSharingAccountsList(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	rows, err := app.FindRecordsByFilter(
		"sharing_accounts",
		"user = {:user} && status != 'archived'",
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
	nearestExpiryByAccount, err := sharingNearestSeatExpiries(app, e.Auth.Id)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	sort.SliceStable(accounts, func(i, j int) bool {
		left, right := nearestExpiryByAccount[accounts[i].ID], nearestExpiryByAccount[accounts[j].ID]
		if left == right {
			if accounts[i].Subscription.PlatformName == accounts[j].Subscription.PlatformName {
				return accounts[i].AccountNumber < accounts[j].AccountNumber
			}
			return accounts[i].Subscription.PlatformName < accounts[j].Subscription.PlatformName
		}
		if left == "" {
			return false
		}
		if right == "" {
			return true
		}
		return left < right
	})
	return apiSuccessJSON(e, http.StatusOK, sharingAccountsResponse{Accounts: accounts, Total: int64(len(accounts))})
}

func sharingNearestSeatExpiries(app core.App, userID string) (map[string]string, error) {
	rows, err := app.FindRecordsByFilter(
		"sharing_seats",
		"user = {:user} && status = 'active' && expiresAt != ''",
		"expiresAt,seatNumber",
		sharingAccountsLimit*100,
		0,
		dbx.Params{"user": userID},
	)
	if err != nil {
		return nil, err
	}
	result := make(map[string]string, len(rows))
	for _, row := range rows {
		accountID := row.GetString("sharingAccount")
		if accountID == "" || result[accountID] != "" {
			continue
		}
		result[accountID] = row.GetString("expiresAt")
	}
	return result, nil
}

func syncSubscriptionSharingAccount(app core.App, subscription *core.Record) error {
	userID := subscription.GetString("user")
	account, _ := app.FindFirstRecordByFilter(
		"sharing_accounts",
		"user = {:user} && subscription = {:subscription}",
		dbx.Params{"user": userID, "subscription": subscription.Id},
	)
	if !subscription.GetBool("familySharingEnabled") {
		if account != nil && account.GetString("status") != "archived" {
			account.Set("status", "archived")
			return app.Save(account)
		}
		return nil
	}

	capacity := subscription.GetInt("sharingCapacity")
	if capacity < 1 || capacity > 100 {
		return errors.New("FAMILY_SHARING_CAPACITY_INVALID")
	}
	if account == nil {
		collection, err := app.FindCollectionByNameOrId("sharing_accounts")
		if err != nil {
			return err
		}
		account = core.NewRecord(collection)
		account.Set("user", userID)
		account.Set("subscription", subscription.Id)
		account.Set("notes", "")
	}
	accountNumber := sharingSubscriptionAccountNumber(subscription, account)
	account.Set("name", fmt.Sprintf("编号 %d", accountNumber))
	account.Set("accountNumber", accountNumber)
	account.Set("loginAccount", subscription.GetString("sharingLoginAccount"))
	account.Set("encryptedCredentials", subscription.GetString("sharingEncryptedCredentials"))
	account.Set("verificationLink", subscription.GetString("sharingVerificationLink"))
	account.Set("monthlyCost", moneyForRecord(subscription.Get("price")))
	account.Set("currency", subscription.GetString("currency"))
	account.Set("nextBillingDate", subscription.GetString("nextBillingDate"))
	account.Set("paymentMethod", subscription.GetString("paymentMethod"))
	account.Set("cardLast4", subscription.GetString("cardLast4"))
	account.Set("capacity", capacity)
	account.Set("status", "active")
	if err := app.Save(account); err != nil {
		return err
	}
	return syncSharingSeatsForCapacity(app, userID, account, capacity)
}

func syncSharingSeatsForCapacity(app core.App, userID string, account *core.Record, capacity int) error {
	rows, err := app.FindRecordsByFilter(
		"sharing_seats",
		"user = {:user} && sharingAccount = {:account}",
		"seatNumber",
		100,
		0,
		dbx.Params{"user": userID, "account": account.Id},
	)
	if err != nil {
		return err
	}
	byNumber := make(map[int]*core.Record, len(rows))
	for _, seat := range rows {
		seatNumber := seat.GetInt("seatNumber")
		byNumber[seatNumber] = seat
		if seatNumber > capacity && seat.GetString("status") != "vacant" && seat.GetString("status") != "archived" {
			return errors.New("FAMILY_SHARING_CAPACITY_OCCUPIED")
		}
	}
	collection, err := app.FindCollectionByNameOrId("sharing_seats")
	if err != nil {
		return err
	}
	for seatNumber := 1; seatNumber <= capacity; seatNumber++ {
		if seat := byNumber[seatNumber]; seat != nil {
			if seat.GetString("status") == "archived" {
				seat.Set("status", "vacant")
				if err := app.Save(seat); err != nil {
					return err
				}
			}
			continue
		}
		seat := core.NewRecord(collection)
		seat.Set("user", userID)
		seat.Set("sharingAccount", account.Id)
		seat.Set("seatNumber", seatNumber)
		seat.Set("status", "vacant")
		if err := app.Save(seat); err != nil {
			return err
		}
	}
	for _, seat := range rows {
		if seat.GetInt("seatNumber") > capacity && seat.GetString("status") == "vacant" {
			seat.Set("status", "archived")
			if err := app.Save(seat); err != nil {
				return err
			}
		}
	}
	return nil
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
	existing, _ := app.FindFirstRecordByFilter(
		"sharing_accounts",
		"user = {:user} && subscription = {:subscription}",
		dbx.Params{"user": e.Auth.Id, "subscription": subscription.Id},
	)
	if existing != nil {
		return e.BadRequestError("SHARING_ACCOUNT_ALREADY_EXISTS", nil)
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
	encryptedCredentials := record.GetString("encryptedCredentials")
	if subscription, findErr := app.FindRecordById("subscriptions", record.GetString("subscription")); findErr == nil && subscription.GetBool("familySharingEnabled") {
		encryptedCredentials = subscription.GetString("sharingEncryptedCredentials")
	}
	password, err := decryptSharingCredential(app, encryptedCredentials)
	if err != nil {
		return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	return apiSuccessJSON(e, http.StatusOK, sharingCredentialsResponse{Password: password})
}

func handleSharingAccountUpdate(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	record, err := findOwnedSharingAccount(app, e.Auth.Id, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("SHARING_ACCOUNT_NOT_FOUND", err)
	}
	body, err := decodeStrictJSON[sharingAccountUpdateRequest](e.Request, locale)
	if err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	if err := normalizeSharingAccountUpdateRequest(&body); err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	if body.Currency != record.GetString("currency") {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", errors.New("sharing account currency cannot change")), nil)
	}
	if body.Password != "" {
		ciphertext, encryptErr := encryptSharingCredential(app, body.Password)
		if encryptErr != nil {
			return e.InternalServerError(serverText(locale, "common.internalError"), encryptErr)
		}
		record.Set("encryptedCredentials", ciphertext)
	}
	record.Set("name", body.Name)
	record.Set("accountNumber", body.AccountNumber)
	record.Set("loginAccount", body.LoginAccount)
	record.Set("verificationLink", body.VerificationLink)
	record.Set("monthlyCost", body.MonthlyCost)
	record.Set("nextBillingDate", body.NextBillingDate)
	record.Set("paymentMethod", body.PaymentMethod)
	record.Set("cardLast4", body.CardLast4)
	record.Set("status", body.Status)
	record.Set("notes", body.Notes)
	if err := app.Save(record); err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	payload, err := sharingAccountDetailAPI(app, record)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusOK, payload)
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

func normalizeSharingAccountUpdateRequest(body *sharingAccountUpdateRequest) error {
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
	if body.Name == "" || len(body.Name) > 120 || body.AccountNumber < 1 || body.LoginAccount == "" || len(body.LoginAccount) > 320 || len(body.Password) > 1024 {
		return errors.New("invalid sharing account identity")
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
	if body.Status != "active" && body.Status != "paused" && body.Status != "archived" {
		return errors.New("invalid sharing account status")
	}
	if len(body.PaymentMethod) > 80 || len(body.CardLast4) > 32 || len(body.Notes) > sharingNotesMaxLength {
		return errors.New("sharing account text is too long")
	}
	return nil
}

func validSharingMoney(value string) bool {
	_, err := canonicalMoneyString(value)
	return err == nil
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
	monthlyRevenueUnits, monthlyRevenueByCurrency, outstandingUnits, err := sharingAccountFinancialUnits(app, record)
	if err != nil {
		return sharingAccountResponse{}, err
	}
	monthlyCostUnits, err := sharingSubscriptionMonthlyCostUnits(subscription)
	if err != nil {
		return sharingAccountResponse{}, err
	}
	loginAccount := subscription.GetString("sharingLoginAccount")
	encryptedCredentials := subscription.GetString("sharingEncryptedCredentials")
	verificationLink := subscription.GetString("sharingVerificationLink")
	capacity := subscription.GetInt("sharingCapacity")
	// Existing installations may contain manually-created accounts from before the
	// subscription became the canonical source. Keep those rows readable during migration.
	if !subscription.GetBool("familySharingEnabled") {
		loginAccount = record.GetString("loginAccount")
		encryptedCredentials = record.GetString("encryptedCredentials")
		verificationLink = record.GetString("verificationLink")
		capacity = record.GetInt("capacity")
	}
	return sharingAccountResponse{
		ID: record.Id,
		Subscription: sharingSubscriptionSummary{
			ID:           subscription.Id,
			Name:         subscription.GetString("name"),
			PlatformName: sharingPlatformName(subscription),
			Logo:         optionalSharingString(subscription.GetString("logo")),
		},
		Name:                     record.GetString("name"),
		AccountNumber:            sharingSubscriptionAccountNumber(subscription, record),
		LoginAccount:             loginAccount,
		HasPassword:              encryptedCredentials != "",
		VerificationLink:         safeSharingVerificationLink(verificationLink),
		MonthlyCost:              moneyUnitsToString(monthlyCostUnits),
		Currency:                 subscription.GetString("currency"),
		NextBillingDate:          subscription.GetString("nextBillingDate"),
		PaymentMethod:            optionalSharingString(subscription.GetString("paymentMethod")),
		CardLast4:                optionalSharingString(subscription.GetString("cardLast4")),
		Capacity:                 capacity,
		OccupiedSeats:            int(occupied),
		MonthlyRevenue:           moneyUnitsToString(monthlyRevenueUnits),
		MonthlyRevenueByCurrency: monthlyRevenueByCurrency,
		OutstandingAmount:        moneyUnitsToString(outstandingUnits),
		MonthlyProfit:            float64(monthlyRevenueUnits-monthlyCostUnits) / float64(moneyScaleFactor),
		Status:                   record.GetString("status"),
		Notes:                    optionalSharingString(record.GetString("notes")),
		CreatedAt:                sharingCreatedAt(record),
	}, nil
}

// Legacy records can contain the upstream NewSzxcn share URL, including its
// bearer token. It must never cross the API boundary to the browser.
func safeSharingVerificationLink(raw string) *string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return nil
	}
	if strings.EqualFold(parsed.Hostname(), "mail.newszxcn.com") && strings.EqualFold(strings.TrimSuffix(parsed.EscapedPath(), "/"), "/shared-inbox") {
		return nil
	}
	return optionalSharingString(value)
}

func sharingPlatformName(subscription *core.Record) string {
	if platformName := strings.TrimSpace(subscription.GetString("platformName")); platformName != "" {
		if platformName == "__unbound__" {
			return ""
		}
		return platformName
	}
	return subscription.GetString("name")
}

func sharingSubscriptionAccountNumber(subscription, account *core.Record) int {
	if accountNumber := subscription.GetInt("accountNumber"); accountNumber > 0 {
		return accountNumber
	}
	return account.GetInt("accountNumber")
}

func sharingSubscriptionMonthlyCostUnits(subscription *core.Record) (int64, error) {
	units, err := moneyUnits(moneyForRecord(subscription.Get("price")))
	if err != nil {
		return 0, err
	}
	divisor := int64(1)
	switch subscription.GetString("billingCycle") {
	case "weekly":
		return (units*52 + 6) / 12, nil
	case "quarterly":
		divisor = 3
	case "semi-annual":
		divisor = 6
	case "annual":
		divisor = 12
	case "custom":
		count := int64(subscription.GetInt("customDays"))
		switch subscription.GetString("customCycleUnit") {
		case "day":
			if count > 0 {
				return (units*365 + count*6) / (count * 12), nil
			}
		case "week":
			if count > 0 {
				return (units*52 + count*6) / (count * 12), nil
			}
		case "month":
			divisor = count
		case "year":
			divisor = count * 12
		}
	case "one-time":
		count := int64(subscription.GetInt("oneTimeTermCount"))
		if count > 0 {
			switch subscription.GetString("oneTimeTermUnit") {
			case "day":
				return (units*365 + count*6) / (count * 12), nil
			case "week":
				return (units*52 + count*6) / (count * 12), nil
			case "month":
				divisor = count
			case "year":
				divisor = count * 12
			}
		}
	}
	if divisor <= 0 {
		divisor = 1
	}
	return (units + divisor/2) / divisor, nil
}

func sharingAccountFinancialUnits(app core.App, record *core.Record) (int64, map[string]string, int64, error) {
	seats, err := app.FindRecordsByFilter(
		"sharing_seats",
		"user = {:user} && sharingAccount = {:account} && status = 'active'",
		"seatNumber",
		100,
		0,
		dbx.Params{"user": record.GetString("user"), "account": record.Id},
	)
	if err != nil {
		return 0, nil, 0, err
	}
	var monthlyRevenue int64
	monthlyRevenueByCurrencyUnits := map[string]int64{}
	for _, seat := range seats {
		units, parseErr := moneyUnits(moneyForRecord(seat.GetString("monthlyPrice")))
		if parseErr != nil {
			return 0, nil, 0, parseErr
		}
		monthlyRevenue += units
		currency := strings.ToUpper(strings.TrimSpace(seat.GetString("currency")))
		if currency == "" {
			currency = strings.ToUpper(strings.TrimSpace(record.GetString("currency")))
		}
		monthlyRevenueByCurrencyUnits[currency] += units
	}
	receivables, err := app.FindRecordsByFilter(
		"sharing_receivables",
		"user = {:user} && sharingAccount = {:account} && (status = 'pending' || status = 'partial' || status = 'overdue')",
		"dueDate,id",
		500,
		0,
		dbx.Params{"user": record.GetString("user"), "account": record.Id},
	)
	if err != nil {
		return 0, nil, 0, err
	}
	var outstanding int64
	for _, receivable := range receivables {
		amount, amountErr := moneyUnits(moneyForRecord(receivable.GetString("amount")))
		paid, paidErr := moneyUnits(moneyForRecord(receivable.GetString("paidAmount")))
		fee, feeErr := moneyUnits(moneyForRecord(receivable.GetString("feeAmount")))
		refund, refundErr := moneyUnits(moneyForRecord(receivable.GetString("refundAmount")))
		if amountErr != nil || paidErr != nil || feeErr != nil || refundErr != nil {
			return 0, nil, 0, errInvalidMoney
		}
		remaining := amount + fee - paid - refund
		if remaining > 0 {
			outstanding += remaining
		}
	}
	monthlyRevenueByCurrency := make(map[string]string, len(monthlyRevenueByCurrencyUnits))
	for currency, units := range monthlyRevenueByCurrencyUnits {
		monthlyRevenueByCurrency[currency] = moneyUnitsToString(units)
	}
	return monthlyRevenue, monthlyRevenueByCurrency, outstanding, nil
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
