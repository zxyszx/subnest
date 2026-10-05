import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharingTotpLinks, revokeSharingTotpLink, resolvePublicSharingTotp, familyTotpProjectionStatements } from "./sharing-totp-links";
import { readSuccessData } from "./api-test-helpers";
import type { Env, SubscriptionRow } from "./types";
import type { SharingTotpLink } from "@renewlet/shared/schemas/sharing";

const auth = vi.hoisted(() => ({ userId: "owner" }));
vi.mock("./auth", () => ({ requireAuth: async () => ({ user: { id: auth.userId } }) }));
vi.mock("./online-totp", () => ({ encryptOnlineTotp: async (_env:unknown,value:string) => `encrypted:${value}`, decryptOnlineTotp: async (_env:unknown,value:string) => value.replace(/^encrypted:/, "") }));
const databases: DatabaseSync[]=[];
afterEach(() => { for(const database of databases.splice(0)) database.close(); });

function fixture() {
 const database=new DatabaseSync(":memory:"); databases.push(database);
 for(const name of readdirSync(new URL("../migrations/",import.meta.url)).filter(name=>name.endsWith(".sql")).sort()) database.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8"));
 database.exec(`INSERT INTO users(id,email,name,role,password_hash,created_at,updated_at) VALUES('owner','owner@example.test','Owner','user','','',''),('other','other@example.test','Other','user','','','');
 INSERT INTO subscriptions(id,user_id,name,price,currency,billing_cycle,category,status,next_billing_date,auto_calculate_next_billing_date,reminder_days,repeat_reminder_enabled,repeat_reminder_interval,repeat_reminder_window,created_at,updated_at,family_sharing_enabled,sharing_login_account,sharing_capacity,extra_json)
 VALUES('sub','owner','PrimeVideo','10','CNY','monthly','streaming','active','2099-01-01',1,3,0,'daily','all','','v1',1,'shared@example.test',5,'{"familyVerification":{"mode":"totp","totpAccountId":"otp"}}');
 INSERT INTO sharing_accounts(id,user_id,subscription_id,status,created_at,updated_at) VALUES('account','owner','sub','active','','v1');
 INSERT INTO sharing_seats(id,user_id,sharing_account_id,seat_number,member_name,status,expires_at,created_at,updated_at) VALUES('seat1','owner','account',1,'Alice','active','2099-01-01','','v1'),('seat2','owner','account',2,'Bob','active','2099-01-01','','v1'),('vacant','owner','account',3,NULL,'vacant',NULL,'','v1');
 INSERT INTO online_totp_accounts(id,user_id,platform_name,service_name,account_number,account,secret_ciphertext,enabled,sharing_enabled,share_key_hash,share_key_ciphertext,created_at,updated_at)
 VALUES('otp','owner','PrimeVideo','PrimeVideo',3,'SHARED@example.test','private-key',1,0,'original-hash','encrypted:original','','v1'),('foreign','other','PrimeVideo','PrimeVideo',3,'shared@example.test','foreign-key',1,0,'foreign-hash','encrypted:foreign','','v1');`);
 function prepare(sql:string,params:SQLInputValue[]=[]):D1PreparedStatement { return {bind:(...values:SQLInputValue[])=>prepare(sql,values),first:async()=>database.prepare(sql).get(...params)??null,all:async()=>({success:true,results:database.prepare(sql).all(...params),meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(database.prepare(sql).run(...params).changes)}})} as unknown as D1PreparedStatement; }
 const env={DB:{prepare,batch:async(statements:D1PreparedStatement[])=> { database.exec("BEGIN");try{const result=[];for(const statement of statements) result.push(await statement.run());database.exec("COMMIT");return result;}catch(error){database.exec("ROLLBACK");throw error;}}}} as unknown as Env;
 return {database,env};
}
function request(command?:{seatId?:string;reset?:boolean}) {return new Request("https://example.test/api/app/sharing/accounts/account/totp-links",command?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(command)}:undefined);}
async function generate(env:Env) {return readSuccessData<{links:SharingTotpLink[]}>(await sharingTotpLinks(request({}),env,"account"));}
const token=(link:SharingTotpLink)=>link.path.replace("/otp/","");

describe("family 2FA scopes",()=> {
 beforeEach(()=>{auth.userId="owner";});
 it("creates independent default and occupied seat tokens without exposing the key",async()=>{
  const {env}=fixture(); const {links}=await generate(env);expect(links).toHaveLength(3);expect(new Set(links.map(link=>link.path)).size).toBe(3);
  expect(JSON.stringify(links)).not.toContain("private-key");for(const link of links) expect(await resolvePublicSharingTotp(env,token(link))).toMatchObject({id:"otp"});
 });
 it("rotates and revokes only the requested scope and does not resurrect a revoked link",async()=>{
  const {env}=fixture();const {links}=await generate(env);const first=links.find(link=>link.seatId==="seat1")!;const second=links.find(link=>link.seatId==="seat2")!;
  await sharingTotpLinks(request({seatId:"seat1",reset:true}),env,"account");expect(await resolvePublicSharingTotp(env,token(first))).toBeNull();expect(await resolvePublicSharingTotp(env,token(second))).not.toBeNull();
  await revokeSharingTotpLink(request(),env,"account",second.id);await generate(env);expect(await resolvePublicSharingTotp(env,token(second))).toBeNull();
 });
 it("checks ownership, key ownership, vacant and expired seats",async()=>{
  const {env,database}=fixture();const {links}=await generate(env);auth.userId="other";await expect(sharingTotpLinks(request(),env,"account")).rejects.toThrow("SHARING_ACCOUNT_NOT_FOUND");auth.userId="owner";
  await expect(sharingTotpLinks(request({seatId:"vacant"}),env,"account")).rejects.toThrow("SEAT_UNAVAILABLE");
  database.exec("UPDATE sharing_seats SET expires_at='2000-01-01' WHERE id='seat1'");expect(await resolvePublicSharingTotp(env,token(links.find(link=>link.seatId==="seat1")!))).toBeNull();
  database.exec(`UPDATE subscriptions SET extra_json='{"familyVerification":{"mode":"totp","totpAccountId":"foreign"}}' WHERE id='sub'`);
  await expect(generate(env)).rejects.toThrow("2FA_ACCOUNT_NOT_MATCHED");expect(await resolvePublicSharingTotp(env,token(links.find(link=>!link.seatId)!))).toBeNull();
 });
 it("rejects expired tokens, changed credentials, disabled TOTP and mailbox mode",async()=>{
  const {env,database}=fixture();const {links}=await generate(env);const general=links.find(link=>!link.seatId)!;
  database.exec("UPDATE sharing_totp_links SET expires_at='2000-01-01T00:00:00Z'");expect(await resolvePublicSharingTotp(env,token(general))).toBeNull();
  database.exec("UPDATE sharing_totp_links SET expires_at='2099-01-01T00:00:00Z';UPDATE online_totp_accounts SET secret_ciphertext='changed' WHERE id='otp'");expect(await resolvePublicSharingTotp(env,token(general))).toBeNull();
  database.exec("UPDATE online_totp_accounts SET secret_ciphertext='private-key',enabled=0 WHERE id='otp'");expect(await resolvePublicSharingTotp(env,token(general))).toBeNull();
  database.exec("UPDATE online_totp_accounts SET enabled=1;UPDATE subscriptions SET extra_json='{}'");expect(await resolvePublicSharingTotp(env,token(general))).toBeNull();
 });
 it("provisions a new subscription atomically before its sharing projection exists",async()=>{
  const {env,database}=fixture();const sub=database.prepare("SELECT * FROM subscriptions WHERE id='sub'").get() as unknown as SubscriptionRow;
  const statements=await familyTotpProjectionStatements(env,{...sub,id:"new-sub"},"new-account");expect(statements).toHaveLength(1);
 });
});
