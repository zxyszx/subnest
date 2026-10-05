import { sharingTotpLinkCommandSchema, sharingTotpLinksResponseSchema } from "@renewlet/shared/schemas/sharing";
import { requireAuth } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { newId } from "./db";
import { HttpError, ok, readJson, requestLocale, successJson } from "./http";
import { decryptOnlineTotp, encryptOnlineTotp, type OnlineTotpRow } from "./online-totp";
import type { Env, SubscriptionRow } from "./types";
import { getSettings } from "./db";
import { addDays, dateOnlyInZone } from "./time";
import { scheduleOccurrence } from "./notification-schedule";

interface LinkRow { id:string; user_id:string; account_id:string; seat_id:string; totp_id:string; token_hash:string; token_ciphertext:string; binding_hash:string; expires_at:string; revoked:number }
interface SeatRow { id:string; seat_number:number; status:string; member_name:string|null; contact:string|null; contact_type:string|null; expires_at:string|null; updated_at:string }

export function familyVerificationConfig(row: SubscriptionRow) {
 const extra = JSON.parse(row.extra_json || "{}");
 const mode=extra.familyVerification?.mode === "totp" ? "totp" : "email";
 return { mode, totpAccountId: mode==="totp" ? String(extra.familyVerification?.totpAccountId || "") : "" };
}

async function binding(env:Env,userId:string,accountId:string,seatId:string, supplied?:SubscriptionRow,seatOverride?:SeatRow) {
 const account=await env.DB.prepare("SELECT * FROM sharing_accounts WHERE id=? AND user_id=? AND status='active'").bind(accountId,userId).first<{subscription_id:string}>();
 if(!account && !supplied) throw new HttpError(404,"SHARING_ACCOUNT_NOT_FOUND","NOT_FOUND");
 const sub=supplied ?? await env.DB.prepare("SELECT * FROM subscriptions WHERE id=? AND user_id=?").bind(account!.subscription_id,userId).first<SubscriptionRow>();
 if(!sub || !sub.family_sharing_enabled || familyVerificationConfig(sub).mode!=="totp") throw new HttpError(403,"2FA_SHARING_DISABLED","FORBIDDEN");
 const otp=await env.DB.prepare("SELECT * FROM online_totp_accounts WHERE id=? AND user_id=? AND enabled=1").bind(familyVerificationConfig(sub).totpAccountId,userId).first<OnlineTotpRow>();
 if(!otp || otp.account.trim().toLowerCase() !== sub.sharing_login_account?.trim().toLowerCase()) throw new HttpError(400,"2FA_ACCOUNT_NOT_MATCHED","INVALID_PAYLOAD");
 const parts=[accountId,otp.id,sub.sharing_login_account!.trim().toLowerCase(),otp.secret_ciphertext];
 let seat:SeatRow|null=null;
 if(seatId) {
  seat=seatOverride ?? await env.DB.prepare("SELECT * FROM sharing_seats WHERE id=? AND user_id=? AND sharing_account_id=? AND status='active' AND length(trim(member_name))>0 AND seat_number<=?").bind(seatId,userId,accountId,sub.sharing_capacity).first<SeatRow>();
  if(!seat || seat.id!==seatId || seat.status!=="active" || !seat.member_name?.trim() || seat.seat_number>(sub.sharing_capacity??0)) throw new HttpError(403,"SEAT_UNAVAILABLE","FORBIDDEN");
  if(seat.expires_at && seat.expires_at<dateOnlyInZone(new Date(),(await getSettings(env,userId)).timezone)) throw new HttpError(403,"SEAT_EXPIRED","FORBIDDEN");
  parts.push(seatId,seat.member_name || "",seat.contact || "",seat.contact_type || "");
 }
 return {otp,seat,hash:await sha256(JSON.stringify(parts))};
}

async function valid(env:Env,row:LinkRow) {
 if(row.revoked || !(Date.parse(row.expires_at)>Date.now())) return false;
 try { return (await binding(env,row.user_id,row.account_id,row.seat_id)).hash===row.binding_hash; } catch { return false; }
}

async function linkStatement(env:Env,userId:string,accountId:string,seatId:string,reset=false,sub?:SubscriptionRow,seatOverride?:SeatRow) {
 const context=await binding(env,userId,accountId,seatId,sub,seatOverride);
 const existing=await env.DB.prepare("SELECT * FROM sharing_totp_links WHERE user_id=? AND account_id=? AND seat_id=?").bind(userId,accountId,seatId).first<LinkRow>();
 if(existing && !reset && !existing.revoked && existing.binding_hash===context.hash && Date.parse(existing.expires_at)>Date.now()) return null;
 if(existing && !reset && existing.revoked && existing.binding_hash===context.hash) return null;
 let expiry=Date.now()+30*86400000;
 if(context.seat?.expires_at) { const timezone=(await getSettings(env,userId)).timezone; const seatExpiry=Date.parse(scheduleOccurrence(addDays(context.seat.expires_at,1),"00:00",timezone).scheduledInstantUtc)-1000; if(!(seatExpiry>Date.now())) throw new HttpError(400,"SEAT_EXPIRED","INVALID_PAYLOAD"); expiry=Math.min(expiry,seatExpiry); }
 const token=randomToken(24);
 return env.DB.prepare(`INSERT INTO sharing_totp_links(id,user_id,account_id,seat_id,totp_id,token_hash,token_ciphertext,binding_hash,expires_at,revoked)
 VALUES(?,?,?,?,?,?,?,?,?,0) ON CONFLICT(user_id,account_id,seat_id) DO UPDATE SET totp_id=excluded.totp_id,token_hash=excluded.token_hash,token_ciphertext=excluded.token_ciphertext,binding_hash=excluded.binding_hash,expires_at=excluded.expires_at,revoked=0`)
 .bind(existing?.id??newId("otplink"),userId,accountId,seatId,context.otp.id,await sha256(token),await encryptOnlineTotp(env,token),context.hash,new Date(expiry).toISOString());
}

export async function familyTotpProjectionStatements(env:Env,sub:SubscriptionRow,accountId:string):Promise<D1PreparedStatement[]> {
 if(!sub.family_sharing_enabled || familyVerificationConfig(sub).mode!=="totp") return [];
 const result:D1PreparedStatement[]=[];
 const general=await linkStatement(env,sub.user_id,accountId,"",false,sub); if(general) result.push(general);
 const seats=await env.DB.prepare("SELECT * FROM sharing_seats WHERE user_id=? AND sharing_account_id=? AND status='active' AND length(trim(member_name))>0 AND seat_number<=?").bind(sub.user_id,accountId,sub.sharing_capacity).all<SeatRow>();
 const today=dateOnlyInZone(new Date(),(await getSettings(env,sub.user_id)).timezone);
 for(const seat of seats.results) {
  if(seat.expires_at && seat.expires_at<today) continue;
  const statement=await linkStatement(env,sub.user_id,accountId,seat.id,false,sub); if(statement) result.push(statement);
 }
 return result;
}

export async function familyTotpSeatStatement(env:Env,sub:SubscriptionRow,accountId:string,seat:SeatRow,reset:boolean) {
 if(!sub.family_sharing_enabled || familyVerificationConfig(sub).mode!=="totp" || seat.status!=="active") return null;
 if(seat.expires_at && seat.expires_at<dateOnlyInZone(new Date(),(await getSettings(env,sub.user_id)).timezone)) return null;
 return linkStatement(env,sub.user_id,accountId,seat.id,reset,sub,seat);
}

export async function sharingTotpLinks(request:Request,env:Env,accountId:string) {
 const auth=await requireAuth(request,env);
 const account=await env.DB.prepare("SELECT subscription_id FROM sharing_accounts WHERE id=? AND user_id=?").bind(accountId,auth.user.id).first<{subscription_id:string}>();
 if(!account) throw new HttpError(404,"SHARING_ACCOUNT_NOT_FOUND","NOT_FOUND");
 if(request.method==="POST") {
  const body=await readJson(request,sharingTotpLinkCommandSchema,requestLocale(request));
  if(body.seatId!==undefined) { const statement=await linkStatement(env,auth.user.id,accountId,body.seatId,body.reset); if(statement) await statement.run(); }
  else { const sub=await env.DB.prepare("SELECT * FROM subscriptions WHERE id=? AND user_id=?").bind(account.subscription_id,auth.user.id).first<SubscriptionRow>(); const statements=await familyTotpProjectionStatements(env,sub!,accountId); if(statements.length) await env.DB.batch(statements); }
 }
 const rows=await env.DB.prepare("SELECT * FROM sharing_totp_links WHERE user_id=? AND account_id=? ORDER BY seat_id LIMIT 101").bind(auth.user.id,accountId).all<LinkRow>();
 const links=await Promise.all(rows.results.map(async row=> { const active=await valid(env,row); return {id:row.id,seatId:row.seat_id,path:active?`/otp/${await decryptOnlineTotp(env,row.token_ciphertext)}`:"",expiresAt:row.expires_at,valid:active}; }));
 return successJson(sharingTotpLinksResponseSchema.shape.data.parse({links}),{headers:{"cache-control":"no-store"}});
}

export async function revokeSharingTotpLink(request:Request,env:Env,accountId:string,linkId:string) {
 const auth=await requireAuth(request,env);
 await env.DB.prepare("UPDATE sharing_totp_links SET revoked=1 WHERE id=? AND account_id=? AND user_id=?").bind(linkId,accountId,auth.user.id).run(); return ok();
}

export async function resolvePublicSharingTotp(env:Env,token:string):Promise<OnlineTotpRow|null> {
 const link=await env.DB.prepare("SELECT * FROM sharing_totp_links WHERE token_hash=?").bind(await sha256(token)).first<LinkRow>();
 if(!link || !await valid(env,link)) return null;
 return env.DB.prepare("SELECT * FROM online_totp_accounts WHERE id=? AND user_id=? AND enabled=1").bind(link.totp_id,link.user_id).first<OnlineTotpRow>();
}
