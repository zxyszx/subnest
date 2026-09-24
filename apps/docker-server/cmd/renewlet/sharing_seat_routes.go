package main

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type sharingReceivableResponse struct {
	ID          string  `json:"id"`
	PeriodStart string  `json:"periodStart"`
	PeriodEnd   string  `json:"periodEnd"`
	DueDate     string  `json:"dueDate"`
	Amount      string  `json:"amount"`
	PaidAmount  string  `json:"paidAmount"`
	Currency    string  `json:"currency"`
	Status      string  `json:"status"`
	PaidAt      *string `json:"paidAt"`
}

type sharingSeatResponse struct {
	ID                string                     `json:"id"`
	SeatNumber        int                        `json:"seatNumber"`
	MemberName        *string                    `json:"memberName"`
	Contact           *string                    `json:"contact"`
	ContactType       *string                    `json:"contactType"`
	MonthlyPrice      *string                    `json:"monthlyPrice"`
	Currency          *string                    `json:"currency"`
	BillingMonths     *int                       `json:"billingMonths"`
	StartDate         *string                    `json:"startDate"`
	ExpiresAt         *string                    `json:"expiresAt"`
	Status            string                     `json:"status"`
	Notes             *string                    `json:"notes"`
	CurrentReceivable *sharingReceivableResponse `json:"currentReceivable"`
}

type sharingAccountTotalsResponse struct {
	MonthlyRevenue    string  `json:"monthlyRevenue"`
	ContractedRevenue string  `json:"contractedRevenue"`
	CollectedRevenue  string  `json:"collectedRevenue"`
	OutstandingAmount string  `json:"outstandingAmount"`
	MonthlyProfit     float64 `json:"monthlyProfit"`
}

type sharingAccountDetailPayload struct {
	Account sharingAccountResponse       `json:"account"`
	Seats   []sharingSeatResponse        `json:"seats"`
	Totals  sharingAccountTotalsResponse `json:"totals"`
}

type sharingSeatUpdateRequest struct {
	MemberName    string `json:"memberName"`
	Contact       string `json:"contact"`
	ContactType   string `json:"contactType"`
	MonthlyPrice  string `json:"monthlyPrice"`
	Currency      string `json:"currency"`
	BillingMonths int    `json:"billingMonths"`
	StartDate     string `json:"startDate"`
	ExpiresAt     string `json:"expiresAt"`
	Status        string `json:"status"`
	PaymentStatus string `json:"paymentStatus"`
	Notes         string `json:"notes"`
}

func handleSharingAccountDetail(app core.App, e *core.RequestEvent) error {
	account, err := findOwnedSharingAccount(app, e.Auth.Id, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("SHARING_ACCOUNT_NOT_FOUND", err)
	}
	payload, err := sharingAccountDetailAPI(app, account)
	if err != nil {
		return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusOK, payload)
}

func handleSharingSeatUpdate(app core.App, e *core.RequestEvent) error {
	locale := requestLocale(e.Request)
	seat, err := findOwnedSharingSeat(app, e.Auth.Id, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("SHARING_SEAT_NOT_FOUND", err)
	}
	var body sharingSeatUpdateRequest
	body, err = decodeStrictJSON[sharingSeatUpdateRequest](e.Request, locale)
	if err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	if err := normalizeSharingSeatUpdateRequest(&body); err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	account, err := findOwnedSharingAccount(app, e.Auth.Id, seat.GetString("sharingAccount"))
	if err != nil {
		return e.NotFoundError("SHARING_ACCOUNT_NOT_FOUND", err)
	}
	if err := saveSharingSeatAndReceivable(app, e.Auth.Id, seat, body); err != nil {
		return e.BadRequestError(validationErrorMessage(locale, "common.invalidRequestBody", err), err)
	}
	payload, err := sharingAccountDetailAPI(app, account)
	if err != nil {
		return e.InternalServerError(serverText(locale, "common.internalError"), err)
	}
	return apiSuccessJSON(e, http.StatusOK, payload)
}

func findOwnedSharingAccount(app core.App, userID, accountID string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(
		"sharing_accounts",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": strings.TrimSpace(accountID), "user": userID},
	)
}

func findOwnedSharingSeat(app core.App, userID, seatID string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(
		"sharing_seats",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": strings.TrimSpace(seatID), "user": userID},
	)
}

func normalizeSharingSeatUpdateRequest(body *sharingSeatUpdateRequest) error {
	body.MemberName = strings.TrimSpace(body.MemberName)
	body.Contact = strings.TrimSpace(body.Contact)
	body.ContactType = strings.TrimSpace(body.ContactType)
	body.MonthlyPrice = strings.TrimSpace(body.MonthlyPrice)
	body.Currency = strings.ToUpper(strings.TrimSpace(body.Currency))
	body.StartDate = strings.TrimSpace(body.StartDate)
	body.ExpiresAt = strings.TrimSpace(body.ExpiresAt)
	body.Status = strings.TrimSpace(body.Status)
	body.PaymentStatus = strings.TrimSpace(body.PaymentStatus)
	body.Notes = strings.TrimSpace(body.Notes)
	if len(body.MemberName) > 120 || len(body.Contact) > 320 || len(body.Notes) > sharingNotesMaxLength {
		return errors.New("sharing seat text is too long")
	}
	if body.ContactType != "" && body.ContactType != "wechat" && body.ContactType != "telegram" && body.ContactType != "email" && body.ContactType != "phone" && body.ContactType != "other" {
		return errors.New("invalid sharing contact type")
	}
	if body.Status != "vacant" && body.Status != "active" && body.Status != "paused" && body.Status != "archived" {
		return errors.New("invalid sharing seat status")
	}
	if body.PaymentStatus != "pending" && body.PaymentStatus != "paid" {
		return errors.New("invalid sharing payment status")
	}
	if body.Status == "vacant" {
		return nil
	}
	if body.MemberName == "" || !validSharingMoney(body.MonthlyPrice) || !sharingCurrencyPattern.MatchString(body.Currency) || body.BillingMonths < 1 || body.BillingMonths > 120 {
		return errors.New("invalid sharing seat billing")
	}
	if !isValidDateOnly(body.StartDate) || !isValidDateOnly(body.ExpiresAt) || body.ExpiresAt < body.StartDate {
		return errors.New("invalid sharing seat dates")
	}
	priceUnits, err := moneyUnits(body.MonthlyPrice)
	if err != nil || priceUnits > maxMoneyUnits/int64(body.BillingMonths) {
		return errors.New("sharing receivable amount is too large")
	}
	return nil
}

func saveSharingSeatAndReceivable(app core.App, userID string, original *core.Record, body sharingSeatUpdateRequest) error {
	return app.RunInTransaction(func(txApp core.App) error {
		seat, err := txApp.FindRecordById("sharing_seats", original.Id)
		if err != nil || seat.GetString("user") != userID {
			return errors.New("sharing seat not found")
		}
		seat.Set("status", body.Status)
		if body.Status == "vacant" {
			for _, field := range []string{"memberName", "contact", "contactType", "monthlyPrice", "currency", "startDate", "expiresAt", "notes"} {
				seat.Set(field, "")
			}
			seat.Set("billingMonths", nil)
			return txApp.Save(seat)
		}
		seat.Set("memberName", body.MemberName)
		seat.Set("contact", body.Contact)
		seat.Set("contactType", body.ContactType)
		seat.Set("monthlyPrice", body.MonthlyPrice)
		seat.Set("currency", body.Currency)
		seat.Set("billingMonths", body.BillingMonths)
		seat.Set("startDate", body.StartDate)
		seat.Set("expiresAt", body.ExpiresAt)
		seat.Set("notes", body.Notes)
		if err := txApp.Save(seat); err != nil {
			return err
		}
		return upsertSharingReceivable(txApp, userID, seat, body)
	})
}

func upsertSharingReceivable(app core.App, userID string, seat *core.Record, body sharingSeatUpdateRequest) error {
	rows, err := app.FindRecordsByFilter(
		"sharing_receivables",
		"user = {:user} && seat = {:seat} && periodStart = {:start} && periodEnd = {:end}",
		"-created",
		1,
		0,
		dbx.Params{"user": userID, "seat": seat.Id, "start": body.StartDate, "end": body.ExpiresAt},
	)
	if err != nil {
		return err
	}
	var receivable *core.Record
	if len(rows) > 0 {
		receivable = rows[0]
	} else {
		collection, collectionErr := app.FindCollectionByNameOrId("sharing_receivables")
		if collectionErr != nil {
			return collectionErr
		}
		receivable = core.NewRecord(collection)
		receivable.Set("user", userID)
		receivable.Set("sharingAccount", seat.GetString("sharingAccount"))
		receivable.Set("seat", seat.Id)
	}
	priceUnits, err := moneyUnits(body.MonthlyPrice)
	if err != nil {
		return err
	}
	amount := moneyUnitsToString(priceUnits * int64(body.BillingMonths))
	receivable.Set("periodStart", body.StartDate)
	receivable.Set("periodEnd", body.ExpiresAt)
	receivable.Set("dueDate", body.StartDate)
	receivable.Set("amount", amount)
	receivable.Set("feeAmount", "0")
	receivable.Set("refundAmount", "0")
	receivable.Set("currency", body.Currency)
	if body.PaymentStatus == "paid" {
		receivable.Set("paidAmount", amount)
		receivable.Set("status", "paid")
		receivable.Set("paidAt", time.Now().UTC().Format(time.RFC3339Nano))
	} else {
		receivable.Set("paidAmount", "0")
		receivable.Set("status", "pending")
		receivable.Set("paidAt", "")
	}
	return app.Save(receivable)
}

func sharingAccountDetailAPI(app core.App, record *core.Record) (sharingAccountDetailPayload, error) {
	account, err := sharingAccountAPIFromRecord(app, record)
	if err != nil {
		return sharingAccountDetailPayload{}, err
	}
	rows, err := app.FindRecordsByFilter(
		"sharing_seats",
		"user = {:user} && sharingAccount = {:account} && seatNumber <= {:capacity}",
		"seatNumber",
		100,
		0,
		dbx.Params{"user": record.GetString("user"), "account": record.Id, "capacity": account.Capacity},
	)
	if err != nil {
		return sharingAccountDetailPayload{}, err
	}
	seats := make([]sharingSeatResponse, 0, len(rows))
	for _, row := range rows {
		seat, seatErr := sharingSeatAPIFromRecord(app, row)
		if seatErr != nil {
			return sharingAccountDetailPayload{}, seatErr
		}
		seats = append(seats, seat)
	}
	totals, err := sharingAccountTotalsAPI(app, record, account)
	if err != nil {
		return sharingAccountDetailPayload{}, err
	}
	return sharingAccountDetailPayload{Account: account, Seats: seats, Totals: totals}, nil
}

func sharingSeatAPIFromRecord(app core.App, record *core.Record) (sharingSeatResponse, error) {
	receivables, err := app.FindRecordsByFilter("sharing_receivables", "user = {:user} && seat = {:seat}", "-periodEnd,-created", 1, 0, dbx.Params{"user": record.GetString("user"), "seat": record.Id})
	if err != nil {
		return sharingSeatResponse{}, err
	}
	var current *sharingReceivableResponse
	if len(receivables) > 0 {
		value := sharingReceivableAPIFromRecord(receivables[0])
		current = &value
	}
	var billingMonths *int
	if value := record.GetInt("billingMonths"); value > 0 {
		billingMonths = &value
	}
	return sharingSeatResponse{
		ID: record.Id, SeatNumber: record.GetInt("seatNumber"), MemberName: optionalSharingString(record.GetString("memberName")),
		Contact: optionalSharingString(record.GetString("contact")), ContactType: optionalSharingString(record.GetString("contactType")),
		MonthlyPrice: optionalSharingString(record.GetString("monthlyPrice")), Currency: optionalSharingString(record.GetString("currency")), BillingMonths: billingMonths,
		StartDate: optionalSharingString(record.GetString("startDate")), ExpiresAt: optionalSharingString(record.GetString("expiresAt")), Status: record.GetString("status"),
		Notes: optionalSharingString(record.GetString("notes")), CurrentReceivable: current,
	}, nil
}

func sharingReceivableAPIFromRecord(record *core.Record) sharingReceivableResponse {
	return sharingReceivableResponse{
		ID: record.Id, PeriodStart: record.GetString("periodStart"), PeriodEnd: record.GetString("periodEnd"), DueDate: record.GetString("dueDate"),
		Amount: moneyForRecord(record.GetString("amount")), PaidAmount: moneyForRecord(record.GetString("paidAmount")), Currency: record.GetString("currency"),
		Status: record.GetString("status"), PaidAt: optionalSharingString(record.GetString("paidAt")),
	}
}

func sharingAccountTotalsAPI(app core.App, record *core.Record, account sharingAccountResponse) (sharingAccountTotalsResponse, error) {
	receivables, err := app.FindRecordsByFilter("sharing_receivables", "user = {:user} && sharingAccount = {:account}", "dueDate,id", 500, 0, dbx.Params{"user": record.GetString("user"), "account": record.Id})
	if err != nil {
		return sharingAccountTotalsResponse{}, err
	}
	var contracted, collected int64
	for _, receivable := range receivables {
		amount, amountErr := moneyUnits(moneyForRecord(receivable.GetString("amount")))
		paid, paidErr := moneyUnits(moneyForRecord(receivable.GetString("paidAmount")))
		if amountErr != nil || paidErr != nil {
			return sharingAccountTotalsResponse{}, errInvalidMoney
		}
		contracted += amount
		collected += paid
	}
	return sharingAccountTotalsResponse{
		MonthlyRevenue: account.MonthlyRevenue, ContractedRevenue: moneyUnitsToString(contracted), CollectedRevenue: moneyUnitsToString(collected),
		OutstandingAmount: account.OutstandingAmount, MonthlyProfit: account.MonthlyProfit,
	}, nil
}
