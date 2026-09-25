import { newszxcnConfigRequestSchema, newszxcnConfigResponseSchema, newszxcnTestResponseSchema, sharedInboxLinkRequestSchema, sharedInboxLinksResponseSchema, sharedInboxMessagesResponseSchema, sharedInboxMessageResponseSchema } from "@renewlet/shared/schemas/newszxcn";
import { requireAdmin, requireAuth } from "./auth";
import { decryptNewSzxcn, encryptNewSzxcn } from "./newszxcn-crypto";
import { HttpError, json, readJson, requestLocale, successJson, type AppLocale } from "./http";
import { newId, nowIso } from "./db";
import { randomToken, sha256 } from "./crypto";
import type { Env } from "./types";
import { sendUpstreamRequest } from "./upstream-http";

const DEFAULT_BASE_URL = "https://mail.newszxcn.com";
type SharedLinkRow = { id: string; short_key_ciphertext: string; grant_id: string; mailbox_id: string; mailbox_address: string; folder_ids_json: string; window_minutes: number; expires_at: string | null; status: string; created_at: string; updated_at: string; user_id: string };
const tokenMask = (token: string) => token.length <= 8 ? "********" : `${token.slice(0, 4)}...${token.slice(-4)}`;
function baseUrl(value: string): string { const parsed = new URL(value); if (parsed.protocol !== "https:" || parsed.hostname !== "mail.newszxcn.com") throw new HttpError(400, "API 地址必须是 https://mail.newszxcn.com", "INVALID_BASE_URL"); return parsed.toString().replace(/\/$/, ""); }
async function upstream(env: Env, userId: string, path: string, init?: RequestInit): Promise<Response> {
  const row = await env.DB.prepare("SELECT base_url, token_ciphertext FROM newszxcn_integrations WHERE user_id = ?").bind(userId).first<{base_url:string;token_ciphertext:string}>();
  if (!row) throw new HttpError(400, "请先配置 NewSzxcn 邮箱 API", "INTEGRATION_NOT_CONFIGURED");
  const token = await decryptNewSzxcn(env, row.token_ciphertext);
  const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${token}`); headers.set("Accept", "application/json");
  const response = await sendUpstreamRequest(`${row.base_url}${path}`, { ...init, headers, redirect: "error" }, { provider: "NewSzxcn 邮箱", secrets: [token] });
  if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 502 : 502, "NewSzxcn 邮箱服务请求失败", "UPSTREAM_FAILED");
  return response;
}
async function upstreamJson<T>(env: Env, userId: string, path: string, init?: RequestInit): Promise<T> { return await (await upstream(env, userId, path, init)).json() as T; }
function locale(request: Request): AppLocale { return requestLocale(request); }

export async function readNewSzxcnConfig(request: Request, env: Env): Promise<Response> {
  const { user } = await requireAdmin(request, env); const row = await env.DB.prepare("SELECT base_url, token_mask FROM newszxcn_integrations WHERE user_id = ?").bind(user.id).first<{base_url:string;token_mask:string}>();
  return successJson({ integration: row ? { baseUrl: row.base_url, tokenMask: row.token_mask, tokenSet: true } : null });
}
export async function updateNewSzxcnConfig(request: Request, env: Env): Promise<Response> {
  const { user } = await requireAdmin(request, env); const body = await readJson(request, newszxcnConfigRequestSchema, locale(request)); const url = baseUrl(body.baseUrl || DEFAULT_BASE_URL);
  const existing = await env.DB.prepare("SELECT token_ciphertext, token_mask FROM newszxcn_integrations WHERE user_id = ?").bind(user.id).first<{token_ciphertext:string;token_mask:string}>();
  if (!body.token && !existing) throw new HttpError(400, "请输入 API 令牌", "TOKEN_REQUIRED");
  const timestamp = nowIso(); const cipher = body.token ? await encryptNewSzxcn(env, body.token) : existing!.token_ciphertext; const mask = body.token ? tokenMask(body.token) : existing!.token_mask;
  await env.DB.prepare(`INSERT INTO newszxcn_integrations (user_id,base_url,token_ciphertext,token_mask,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,token_ciphertext=excluded.token_ciphertext,token_mask=excluded.token_mask,updated_at=excluded.updated_at`).bind(user.id,url,cipher,mask,timestamp,timestamp).run();
  return successJson({ integration: { baseUrl: url, tokenMask: mask, tokenSet: true } });
}
export async function testNewSzxcnConnection(request: Request, env: Env): Promise<Response> {
  const { user } = await requireAdmin(request, env); const data = await upstreamJson<{items?:unknown[]}>(env, user.id, "/api/open/v1/subnest/mailboxes");
  return successJson({ mailboxes: data.items ?? [] });
}
export async function listNewSzxcnMailboxes(request: Request, env: Env): Promise<Response> { const {user}=await requireAdmin(request,env); return successJson(await upstreamJson(env,user.id,"/api/open/v1/subnest/mailboxes")); }
export async function listNewSzxcnFolders(request: Request, env: Env, mailboxId: string): Promise<Response> { const {user}=await requireAdmin(request,env); return successJson(await upstreamJson(env,user.id,`/api/open/v1/subnest/mailboxes/${encodeURIComponent(mailboxId)}/folders`)); }

async function linkResponse(request: Request, env: Env, row: SharedLinkRow): Promise<Record<string, unknown>> { const key=await decryptNewSzxcn(env,row.short_key_ciphertext); return { id: row.id, shortUrl: `${new URL(request.url).origin}/s/${key}`, mailboxId: row.mailbox_id, mailboxAddress: row.mailbox_address, folderIds: JSON.parse(row.folder_ids_json), windowMinutes: row.window_minutes, expiresAt: row.expires_at ?? null, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }; }
export async function listSharedInboxLinks(request: Request, env: Env): Promise<Response> { const {user}=await requireAdmin(request,env); const result=await env.DB.prepare("SELECT * FROM shared_inbox_links WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all<SharedLinkRow>(); const links=await Promise.all((result.results??[]).map((row)=>linkResponse(request,env,row))); return successJson({links}); }
export async function createSharedInboxLink(request: Request, env: Env): Promise<Response> {
  const {user}=await requireAdmin(request,env); const body=await readJson(request,sharedInboxLinkRequestSchema,locale(request));
  const boxes=await upstreamJson<{items?:Array<{id:string;address:string}>}>(env,user.id,"/api/open/v1/subnest/mailboxes"); const box=boxes.items?.find(item=>item.id===body.mailboxId); if(!box) throw new HttpError(400,"邮箱不存在","MAILBOX_NOT_FOUND");
  const existing=await env.DB.prepare("SELECT id FROM shared_inbox_links WHERE user_id=? AND mailbox_id=? AND status='active'").bind(user.id,body.mailboxId).first<{id:string}>(); if(existing) throw new HttpError(409,"该邮箱已开启分享，请先管理现有链接","SHARE_ALREADY_ACTIVE");
  const shortKey=randomToken(24), grantExternal=`subnest_${newId("grant")}`; const grant=await upstreamJson<{id:string}>(env,user.id,"/api/open/v1/subnest/grants",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({externalGrantId:grantExternal,mailboxId:body.mailboxId,folderIds:body.folderIds,windowMinutes:body.windowMinutes,expiresAt:body.expiresAt??undefined})});
  const timestamp=nowIso(), id=newId("sil"); await env.DB.prepare("INSERT INTO shared_inbox_links (id,user_id,short_key_hash,short_key_ciphertext,external_grant_id,grant_id,mailbox_id,mailbox_address,folder_ids_json,window_minutes,expires_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,await sha256(shortKey),await encryptNewSzxcn(env,shortKey),grantExternal,grant.id,body.mailboxId,box.address,JSON.stringify(body.folderIds),body.windowMinutes,body.expiresAt??null,"active",timestamp,timestamp).run();
  return successJson({ link: { id, shortUrl:`${new URL(request.url).origin}/s/${shortKey}`, mailboxId:body.mailboxId, mailboxAddress:box.address, folderIds:body.folderIds, windowMinutes:body.windowMinutes, expiresAt:body.expiresAt??null, status:"active", createdAt:timestamp, updatedAt:timestamp } }, { status: 201 });
}
export async function revokeSharedInboxLink(request: Request, env: Env, id: string): Promise<Response> { const {user}=await requireAdmin(request,env); const row=await env.DB.prepare("SELECT grant_id FROM shared_inbox_links WHERE id=? AND user_id=? AND status='active'").bind(id,user.id).first<{grant_id:string}>(); if(!row) throw new HttpError(404,"短链接不存在","NOT_FOUND"); await upstream(env,user.id,`/api/open/v1/subnest/grants/${encodeURIComponent(row.grant_id)}`,{method:"DELETE"}); await env.DB.prepare("UPDATE shared_inbox_links SET status='revoked',revoked_at=?,updated_at=? WHERE id=? AND user_id=?").bind(nowIso(),nowIso(),id,user.id).run(); return json({ok:true}); }

async function publicLink(env: Env, shortKey: string) { const hash=await sha256(shortKey); const row=await env.DB.prepare("SELECT * FROM shared_inbox_links WHERE short_key_hash=? AND status='active'").bind(hash).first<SharedLinkRow>(); if(!row) throw new HttpError(404,"短链接不存在或已失效","NOT_FOUND"); if(row.expires_at && new Date(row.expires_at).getTime()<=Date.now()) throw new HttpError(403,"短链接已过期","LINK_EXPIRED"); return row; }
export async function publicSharedInboxMessagesProxy(request: Request, env: Env, shortKey: string, suffix = ""): Promise<Response> { const row=await publicLink(env,shortKey); const path=`/api/open/v1/subnest/grants/${encodeURIComponent(row.grant_id)}${suffix}`; const upstreamResponse=await upstream(env,row.user_id,path + new URL(request.url).search); const contentType=upstreamResponse.headers.get("content-type")??"application/json"; if (contentType.includes("json")) { const payload=await upstreamResponse.json(); return successJson(payload,{headers:{"cache-control":"no-store"}}); } return new Response(upstreamResponse.body,{status:200,headers:{"content-type":contentType,"cache-control":"no-store","x-content-type-options":"nosniff"}}); }
