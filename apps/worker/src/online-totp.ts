import * as OTPAuth from "otpauth";
import {
  onlineTotpAccountCreateSchema,
  onlineTotpAccountPayloadSchema,
  onlineTotpAccountsPayloadSchema,
  onlineTotpAccountUpdateSchema,
  onlineTotpPublicPayloadSchema,
} from "@renewlet/shared/schemas/online-totp";
import { requireAuth } from "./auth";
import { accountSecurityKeyRing } from "./account-security-key";
import { newId, nowIso } from "./db";
import { base64Url, base64UrlToArrayBuffer } from "./encoding";
import { HttpError, ok, readJson, requestLocale, successJson } from "./http";
import { randomToken, sha256 } from "./crypto";
import type { Env } from "./types";

interface OnlineTotpRow {
  id: string;
  user_id: string;
  platform_name: string;
  service_name: string;
  account_number: number;
  account: string;
  logo: string | null;
  secret_ciphertext: string;
  enabled: number;
  sharing_enabled: number;
  share_key_hash: string;
  share_key_ciphertext: string;
  created_at: string;
  updated_at: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOTP_PERIOD_SECONDS = 30;

export async function listOnlineTotpAccounts(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const rows = await env.DB.prepare(`
    SELECT * FROM online_totp_accounts WHERE user_id = ?
    ORDER BY lower(platform_name), account_number, created_at LIMIT 1000
  `).bind(auth.user.id).all<OnlineTotpRow>();
  const accounts = await Promise.all(rows.results.map((row) => onlineTotpApi(env, row)));
  return successJson(onlineTotpAccountsPayloadSchema.parse({ accounts, total: accounts.length }));
}

export async function createOnlineTotpAccount(request: Request, env: Env): Promise<Response> {
  const locale = requestLocale(request);
  const auth = await requireAuth(request, env);
  const body = await readJson(request, onlineTotpAccountCreateSchema, locale);
  const secret = normalizeTotpSecret(body.secret);
  await assertAccountNumberAvailable(env, auth.user.id, body.platformName, body.accountNumber);
  const shareKey = randomToken(24);
  const timestamp = nowIso();
  const row: OnlineTotpRow = {
    id: newId("otp"), user_id: auth.user.id, platform_name: body.platformName, service_name: body.serviceName,
    account_number: body.accountNumber, account: body.account, logo: body.logo || null,
    secret_ciphertext: await encryptOnlineTotp(env, secret), enabled: body.enabled ? 1 : 0,
    sharing_enabled: body.sharingEnabled ? 1 : 0, share_key_hash: await sha256(shareKey),
    share_key_ciphertext: await encryptOnlineTotp(env, shareKey), created_at: timestamp, updated_at: timestamp,
  };
  await env.DB.prepare(`
    INSERT INTO online_totp_accounts (
      id,user_id,platform_name,service_name,account_number,account,logo,secret_ciphertext,enabled,
      sharing_enabled,share_key_hash,share_key_ciphertext,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(row.id,row.user_id,row.platform_name,row.service_name,row.account_number,row.account,row.logo,row.secret_ciphertext,
    row.enabled,row.sharing_enabled,row.share_key_hash,row.share_key_ciphertext,row.created_at,row.updated_at).run();
  return successJson(onlineTotpAccountPayloadSchema.parse({ account: await onlineTotpApi(env, row) }), { status: 201 });
}

export async function updateOnlineTotpAccount(request: Request, env: Env, id: string): Promise<Response> {
  const locale = requestLocale(request);
  const auth = await requireAuth(request, env);
  const row = await ownedOnlineTotp(env, auth.user.id, id);
  if (!row) throw new HttpError(404, "TOTP_ACCOUNT_NOT_FOUND", "NOT_FOUND");
  const body = await readJson(request, onlineTotpAccountUpdateSchema, locale);
  await assertAccountNumberAvailable(env, auth.user.id, body.platformName, body.accountNumber, id);
  const secretCiphertext = body.secret ? await encryptOnlineTotp(env, normalizeTotpSecret(body.secret)) : row.secret_ciphertext;
  const updatedAt = nowIso();
  await env.DB.prepare(`
    UPDATE online_totp_accounts SET platform_name=?,service_name=?,account_number=?,account=?,logo=?,secret_ciphertext=?,
      enabled=?,sharing_enabled=?,updated_at=? WHERE id=? AND user_id=?
  `).bind(body.platformName,body.serviceName,body.accountNumber,body.account,body.logo || null,secretCiphertext,
    body.enabled ? 1 : 0,body.sharingEnabled ? 1 : 0,updatedAt,id,auth.user.id).run();
  const updated = await ownedOnlineTotp(env, auth.user.id, id);
  if (!updated) throw new HttpError(404, "TOTP_ACCOUNT_NOT_FOUND", "NOT_FOUND");
  return successJson(onlineTotpAccountPayloadSchema.parse({ account: await onlineTotpApi(env, updated) }));
}

export async function rotateOnlineTotpShare(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const row = await ownedOnlineTotp(env, auth.user.id, id);
  if (!row) throw new HttpError(404, "TOTP_ACCOUNT_NOT_FOUND", "NOT_FOUND");
  const shareKey = randomToken(24);
  await env.DB.prepare(`UPDATE online_totp_accounts SET share_key_hash=?,share_key_ciphertext=?,sharing_enabled=1,updated_at=? WHERE id=? AND user_id=?`)
    .bind(await sha256(shareKey), await encryptOnlineTotp(env, shareKey), nowIso(), id, auth.user.id).run();
  const updated = await ownedOnlineTotp(env, auth.user.id, id);
  return successJson(onlineTotpAccountPayloadSchema.parse({ account: await onlineTotpApi(env, updated!) }));
}

export async function deleteOnlineTotpAccount(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const row = await ownedOnlineTotp(env, auth.user.id, id);
  if (!row) throw new HttpError(404, "TOTP_ACCOUNT_NOT_FOUND", "NOT_FOUND");
  await env.DB.prepare("DELETE FROM online_totp_accounts WHERE id=? AND user_id=?").bind(id, auth.user.id).run();
  return ok();
}

export async function readPublicOnlineTotp(request: Request, env: Env, shareKey: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM online_totp_accounts WHERE share_key_hash=? AND sharing_enabled=1 AND enabled=1 LIMIT 1")
    .bind(await sha256(shareKey)).first<OnlineTotpRow>();
  if (!row) throw new HttpError(404, "TOTP_SHARE_NOT_FOUND", "NOT_FOUND");
  const { code, validUntil } = await currentTotp(env, row.secret_ciphertext);
  return successJson(onlineTotpPublicPayloadSchema.parse({
    platformName: row.platform_name, serviceName: row.service_name, account: row.account,
    logo: row.logo, code, validUntil,
  }));
}

async function onlineTotpApi(env: Env, row: OnlineTotpRow) {
  const shareKey = await decryptOnlineTotp(env, row.share_key_ciphertext);
  const current = row.enabled ? await currentTotp(env, row.secret_ciphertext) : disabledTotp();
  return onlineTotpAccountPayloadSchema.shape.account.parse({
    id: row.id, platformName: row.platform_name, serviceName: row.service_name,
    accountNumber: row.account_number, account: row.account, logo: row.logo,
    enabled: Boolean(row.enabled), sharingEnabled: Boolean(row.sharing_enabled),
    sharePath: `/otp/${shareKey}`, code: current.code, validUntil: current.validUntil, createdAt: row.created_at,
  });
}

async function currentTotp(env: Env, ciphertext: string) {
  const secret = await decryptOnlineTotp(env, ciphertext);
  const now = Date.now();
  const nextStep = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS) + 1;
  return { code: generateOnlineTotpCode(secret, now), validUntil: new Date(nextStep * TOTP_PERIOD_SECONDS * 1000).toISOString() };
}

export function generateOnlineTotpCode(secret: string, timestamp: number): string {
  const totp = new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: TOTP_PERIOD_SECONDS, secret: OTPAuth.Secret.fromBase32(secret) });
  return totp.generate({ timestamp });
}

function disabledTotp() {
  return { code: "000000", validUntil: new Date(Math.ceil(Date.now() / 30_000) * 30_000).toISOString() };
}

export function normalizeTotpSecret(input: string): string {
  let value = input.trim();
  if (value.toLowerCase().startsWith("otpauth://")) {
    try { value = new URL(value).searchParams.get("secret") ?? ""; } catch { value = ""; }
  }
  value = value.replace(/[\s-]+/g, "").toUpperCase().replace(/=+$/g, "");
  if (!/^[A-Z2-7]{16,256}$/.test(value)) throw new HttpError(400, "TOTP_SECRET_INVALID", "INVALID_PAYLOAD");
  try { OTPAuth.Secret.fromBase32(value); } catch { throw new HttpError(400, "TOTP_SECRET_INVALID", "INVALID_PAYLOAD"); }
  return value;
}

async function encryptOnlineTotp(env: Env, plaintext: string): Promise<string> {
  const key = (await accountSecurityKeyRing(env)).onlineTotp;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, encoder.encode(plaintext));
  return `v1.${base64Url(nonce)}.${base64Url(new Uint8Array(ciphertext))}`;
}

async function decryptOnlineTotp(env: Env, value: string): Promise<string> {
  const [version, nonce, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !nonce || !ciphertext || extra) throw new Error("invalid online TOTP ciphertext");
  const key = (await accountSecurityKeyRing(env)).onlineTotp;
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(base64UrlToArrayBuffer(nonce)) }, key, base64UrlToArrayBuffer(ciphertext));
  return decoder.decode(plaintext);
}

async function ownedOnlineTotp(env: Env, userId: string, id: string) {
  return env.DB.prepare("SELECT * FROM online_totp_accounts WHERE id=? AND user_id=? LIMIT 1").bind(id, userId).first<OnlineTotpRow>();
}

async function assertAccountNumberAvailable(env: Env, userId: string, platformName: string, accountNumber: number, excludeId = "") {
  const duplicate = await env.DB.prepare("SELECT id FROM online_totp_accounts WHERE user_id=? AND lower(platform_name)=lower(?) AND account_number=? AND id!=? LIMIT 1")
    .bind(userId, platformName, accountNumber, excludeId).first<{ id: string }>();
  if (duplicate) throw new HttpError(409, "TOTP_ACCOUNT_NUMBER_CONFLICT", "CONFLICT");
}
