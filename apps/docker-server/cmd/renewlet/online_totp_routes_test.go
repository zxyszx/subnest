package main

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

const rfcOnlineTotpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

func TestGenerateOnlineTotpUsesSixDigitRFC6238Code(t *testing.T) {
	code, err := generateOnlineTotp(rfcOnlineTotpSecret, time.Unix(59, 0))
	if err != nil {
		t.Fatal(err)
	}
	if code != "287082" {
		t.Fatalf("generateOnlineTotp() = %q, want 287082", code)
	}
}

func TestNormalizeOnlineTotpSecretAcceptsBase32AndOtpauth(t *testing.T) {
	for _, input := range []string{
		rfcOnlineTotpSecret,
		"gezd-gnbv gy3tqojq gezdgnbvgy3tqojq====",
		"otpauth://totp/Prime?issuer=Example&secret=" + rfcOnlineTotpSecret,
	} {
		got, err := normalizeOnlineTotpSecret(input)
		if err != nil {
			t.Fatalf("normalizeOnlineTotpSecret(%q): %v", input, err)
		}
		if got != rfcOnlineTotpSecret {
			t.Fatalf("normalizeOnlineTotpSecret(%q) = %q", input, got)
		}
	}
}

func TestNormalizeOnlineTotpSecretRejectsInvalidInput(t *testing.T) {
	for _, input := range []string{"", "not-a-secret", "ABC2", "otpauth://totp/Test?issuer=Example"} {
		if _, err := normalizeOnlineTotpSecret(input); err == nil {
			t.Fatalf("normalizeOnlineTotpSecret(%q) unexpectedly succeeded", input)
		}
	}
}

func TestOnlineTotpRoutesProtectSecretsOwnershipAndShareRotation(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	_, ownerToken := createRouteTestUser(t, app, "online-totp-owner")
	_, otherToken := createRouteTestUser(t, app, "online-totp-other")
	body := `{"platformName":"PrimeVideo","serviceName":"Singapore","accountNumber":1,"account":"prime@example.com","logo":"","secret":"` + rfcOnlineTotpSecret + `","enabled":true,"sharingEnabled":true}`

	createdResponse := serveTestRequest(t, app, http.MethodPost, "/api/app/online-totp/accounts", body, ownerToken)
	if createdResponse.Code != http.StatusCreated {
		t.Fatalf("create returned %d: %s", createdResponse.Code, createdResponse.Body.String())
	}
	if strings.Contains(createdResponse.Body.String(), rfcOnlineTotpSecret) || strings.Contains(createdResponse.Body.String(), "secretCiphertext") {
		t.Fatalf("create response leaked TOTP secret material: %s", createdResponse.Body.String())
	}
	created := decodeAPISuccessDataForTest[onlineTotpAccountPayload](t, createdResponse.Body.Bytes()).Account
	if created.ID == "" || !strings.HasPrefix(created.SharePath, "/otp/") || len(created.Code) != 6 {
		t.Fatalf("unexpected create payload: %#v", created)
	}

	publicResponse := serveTestRequest(t, app, http.MethodGet, "/api/online-totp/"+strings.TrimPrefix(created.SharePath, "/otp/"), "", "")
	if publicResponse.Code != http.StatusOK || strings.Contains(publicResponse.Body.String(), rfcOnlineTotpSecret) {
		t.Fatalf("public response returned %d or leaked secret: %s", publicResponse.Code, publicResponse.Body.String())
	}

	otherListResponse := serveTestRequest(t, app, http.MethodGet, "/api/app/online-totp/accounts", "", otherToken)
	otherList := decodeAPISuccessDataForTest[onlineTotpAccountsPayload](t, otherListResponse.Body.Bytes())
	if otherList.Total != 0 {
		t.Fatalf("other user can list owner account: %#v", otherList)
	}
	foreignUpdate := serveTestRequest(t, app, http.MethodPut, "/api/app/online-totp/accounts/"+created.ID, strings.Replace(body, `"serviceName":"Singapore"`, `"serviceName":"Foreign"`, 1), otherToken)
	if foreignUpdate.Code != http.StatusNotFound {
		t.Fatalf("foreign update returned %d: %s", foreignUpdate.Code, foreignUpdate.Body.String())
	}

	resetResponse := serveTestRequest(t, app, http.MethodPost, "/api/app/online-totp/accounts/"+created.ID+"/share/reset", "", ownerToken)
	if resetResponse.Code != http.StatusOK {
		t.Fatalf("reset returned %d: %s", resetResponse.Code, resetResponse.Body.String())
	}
	reset := decodeAPISuccessDataForTest[onlineTotpAccountPayload](t, resetResponse.Body.Bytes()).Account
	if reset.SharePath == created.SharePath {
		t.Fatal("share reset did not rotate the link")
	}
	oldPublic := serveTestRequest(t, app, http.MethodGet, "/api/online-totp/"+strings.TrimPrefix(created.SharePath, "/otp/"), "", "")
	if oldPublic.Code != http.StatusNotFound {
		t.Fatalf("old share link remained active after reset: %d", oldPublic.Code)
	}

	pausedBody := strings.Replace(body, `"sharingEnabled":true`, `"sharingEnabled":false`, 1)
	pausedBody = strings.Replace(pausedBody, `"secret":"`+rfcOnlineTotpSecret+`"`, `"secret":""`, 1)
	pausedResponse := serveTestRequest(t, app, http.MethodPut, "/api/app/online-totp/accounts/"+created.ID, pausedBody, ownerToken)
	if pausedResponse.Code != http.StatusOK {
		t.Fatalf("pause returned %d: %s", pausedResponse.Code, pausedResponse.Body.String())
	}
	newPublic := serveTestRequest(t, app, http.MethodGet, "/api/online-totp/"+strings.TrimPrefix(reset.SharePath, "/otp/"), "", "")
	if newPublic.Code != http.StatusNotFound {
		t.Fatalf("paused share link returned %d", newPublic.Code)
	}
	pausedResetResponse := serveTestRequest(t, app, http.MethodPost, "/api/app/online-totp/accounts/"+created.ID+"/share/reset", "", ownerToken)
	if pausedResetResponse.Code != http.StatusOK {
		t.Fatalf("paused reset returned %d: %s", pausedResetResponse.Code, pausedResetResponse.Body.String())
	}
	pausedReset := decodeAPISuccessDataForTest[onlineTotpAccountPayload](t, pausedResetResponse.Body.Bytes()).Account
	if pausedReset.SharingEnabled {
		t.Fatal("reset unexpectedly enabled a paused share link")
	}
	pausedResetPublic := serveTestRequest(t, app, http.MethodGet, "/api/online-totp/"+strings.TrimPrefix(pausedReset.SharePath, "/otp/"), "", "")
	if pausedResetPublic.Code != http.StatusNotFound {
		t.Fatalf("reset paused share link returned %d", pausedResetPublic.Code)
	}
}
