import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharedInboxLinkRequestSchema } from "@renewlet/shared/schemas/newszxcn";
import { createSharedInboxLink, publicSharedInboxMessagesProxy, revokeSharedInboxLink } from "./newszxcn";
import type { Env } from "./types";
import { readSuccessData } from "./api-test-helpers";
import { updateSharingSeat } from "./sharing";

const mocks = vi.hoisted(() => ({ upstream: vi.fn(), auth: vi.fn() }));
vi.mock("./auth", () => ({ requireAdmin: mocks.auth, requireAuth: mocks.auth }));
vi.mock("./newszxcn-crypto", () => ({ encryptNewSzxcn: async (_env: unknown, value: string) => `encrypted:${value}`, decryptNewSzxcn: async (_env: unknown, value: string) => value.replace(/^encrypted:/, "") }));
vi.mock("./upstream-http", () => ({ sendUpstreamRequest: mocks.upstream }));
const databases: DatabaseSync[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function fixture() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  for (const name of readdirSync(new URL("../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  database.exec(`INSERT INTO users (id,email,name,role,password_hash,created_at,updated_at) VALUES ('owner','owner@example.test','Owner','admin','','',''),('other','other@example.test','Other','admin','','','');
    INSERT INTO subscriptions (id,user_id,name,price,currency,billing_cycle,category,status,next_billing_date,auto_calculate_next_billing_date,reminder_days,repeat_reminder_enabled,repeat_reminder_interval,repeat_reminder_window,created_at,updated_at,family_sharing_enabled,sharing_login_account)
    VALUES ('subscription','owner','Netflix','10','CNY','monthly','streaming','active','2030-01-01',1,3,0,'daily','all','','v1',1,'shared@example.test');
    UPDATE subscriptions SET platform_name='Netflix',account_number=17 WHERE id='subscription';
    INSERT INTO sharing_accounts (id,user_id,subscription_id,status,created_at,updated_at) VALUES ('account','owner','subscription','active','','v1');
    INSERT INTO sharing_seats (id,user_id,sharing_account_id,seat_number,member_name,status,created_at,updated_at) VALUES ('seat1','owner','account',1,'Alice','active','','v1'),('seat2','owner','account',2,'Bob','active','','v1');
    INSERT INTO newszxcn_integrations (user_id,token_ciphertext,token_mask,created_at,updated_at) VALUES ('owner','encrypted:test-token','masked','','');`);
  function prepare(sql: string, params: SQLInputValue[] = []): D1PreparedStatement {
    return {
      bind: (...values: SQLInputValue[]) => prepare(sql, values),
      first: async () => database.prepare(sql).get(...params) ?? null,
      all: async () => ({ success: true, results: database.prepare(sql).all(...params), meta: {} }),
      run: async () => ({ success: true, results: [], meta: { changes: Number(database.prepare(sql).run(...params).changes) } }),
    } as unknown as D1PreparedStatement;
  }
  const env = { DB: { prepare, batch: async (statements: D1PreparedStatement[]) => {
    database.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); database.exec("COMMIT"); return results; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  } } } as unknown as Env;
  return { database, env };
}
function request(seatId?: string, expiresAt: string | null = "2099-01-01T00:00:00.000Z") {
  return new Request("https://example.test/api/app/admin/shared-inbox-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mailboxId: "mailbox", folderIds: ["inbox"], windowMinutes: 30, ...(seatId ? { seatId } : {}), expiresAt }) });
}
type LinkPayload = { link: { id: string; seatId: string | null; shortUrl: string } };

describe("seat inbox link authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "owner", role: "admin" } });
    let grants = 0;
    mocks.upstream.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/mailboxes")) return Response.json({ items: [{ id: "mailbox", address: "shared@example.test" }] });
      if (init?.method === "POST") return Response.json({ id: `grant-${++grants}` });
      return Response.json({ messages: [] });
    });
  });
  it("requires an expiration for seat grants but keeps generic grants compatible", () => {
    const body = { mailboxId: "mailbox", folderIds: ["inbox"], windowMinutes: 30 };
    expect(sharedInboxLinkRequestSchema.safeParse(body).success).toBe(true);
    expect(sharedInboxLinkRequestSchema.safeParse({ ...body, seatId: "seat1" }).success).toBe(false);
  });
  it("does not overwrite a subscription configured for online 2FA", async () => {
    const { database, env } = fixture();
    database.exec(`UPDATE subscriptions SET extra_json='{"familyVerification":{"mode":"totp"}}',sharing_verification_link='existing-2fa-link'`);
    const { link } = await readSuccessData<LinkPayload>(await createSharedInboxLink(request(undefined, null), env));
    expect(database.prepare("SELECT sharing_verification_link FROM subscriptions").get()).toEqual({ sharing_verification_link: "existing-2fa-link" });
    await revokeSharedInboxLink(new Request("https://example.test"), env, link.id);
    expect(database.prepare("SELECT sharing_verification_link FROM subscriptions").get()).toEqual({ sharing_verification_link: "existing-2fa-link" });
  });
  it("migrates, creates independent grants, and revokes only one seat", async () => {
    const { database, env } = fixture();
    const first = await readSuccessData<LinkPayload>(await createSharedInboxLink(request("seat1"), env));
    const second = await readSuccessData<LinkPayload>(await createSharedInboxLink(request("seat2"), env));
    const generic = await readSuccessData<LinkPayload>(await createSharedInboxLink(request(undefined, null), env));
    expect(first.link.seatId).toBe("seat1");
    expect(first.link.shortUrl).not.toBe(second.link.shortUrl);
    await expect(createSharedInboxLink(request("seat1"), env)).rejects.toThrow("已有链接");
    await revokeSharedInboxLink(new Request("https://example.test"), env, first.link.id);
    expect(database.prepare("SELECT status FROM shared_inbox_links WHERE id=?").get(first.link.id)).toEqual({ status: "revoked" });
    expect(database.prepare("SELECT status FROM shared_inbox_links WHERE id=?").get(second.link.id)).toEqual({ status: "active" });
    expect(database.prepare("SELECT status FROM shared_inbox_links WHERE id=?").get(generic.link.id)).toEqual({ status: "active" });
    expect(database.prepare("SELECT sharing_verification_link FROM subscriptions").get()).toEqual({ sharing_verification_link: generic.link.shortUrl });
  });
  it.each(["status='vacant'", "member_name=''", "user_id='other'"])("rejects unavailable/foreign seats: %s", async (change) => {
    const { database, env } = fixture();
    database.exec(`UPDATE sharing_seats SET ${change} WHERE id='seat1'`);
    await expect(createSharedInboxLink(request("seat1"), env)).rejects.toThrow("车位不存在");
    expect(database.prepare("SELECT count(*) AS total FROM shared_inbox_links").get()).toEqual({ total: 0 });
  });
  it("cleans up the upstream grant if the occupant changes during creation", async () => {
    const { database, env } = fixture();
    mocks.upstream.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/mailboxes")) return Response.json({ items: [{ id: "mailbox", address: "shared@example.test" }] });
      if (init?.method === "POST") { database.exec("UPDATE sharing_seats SET member_name='Replacement',updated_at='v2' WHERE id='seat1'"); return Response.json({ id: "stale-grant" }); }
      return Response.json({});
    });
    await expect(createSharedInboxLink(request("seat1"), env)).rejects.toThrow("发生变化");
    expect(database.prepare("SELECT count(*) AS total FROM shared_inbox_links").get()).toEqual({ total: 0 });
    expect(mocks.upstream).toHaveBeenCalledWith(expect.stringContaining("/grants/stale-grant"), expect.objectContaining({ method: "DELETE" }), expect.anything());
  });
  it("denies an issued link after family sharing is disabled", async () => {
    const { database, env } = fixture();
    const { link } = await readSuccessData<LinkPayload>(await createSharedInboxLink(request("seat1"), env));
    database.exec("UPDATE subscriptions SET family_sharing_enabled=0");
    mocks.upstream.mockClear();
    const key = link.shortUrl.split("/").at(-1)!;
    await expect(publicSharedInboxMessagesProxy(new Request("https://example.test"), env, key)).rejects.toThrow("车位不存在");
    expect(mocks.upstream).not.toHaveBeenCalled();
  });
  it("vacating one seat revokes its grant without touching another seat or generic sharing", async () => {
    const { database, env } = fixture();
    const first = await readSuccessData<LinkPayload>(await createSharedInboxLink(request("seat1"), env));
    const second = await readSuccessData<LinkPayload>(await createSharedInboxLink(request("seat2"), env));
    const generic = await readSuccessData<LinkPayload>(await createSharedInboxLink(request(undefined, null), env));
    await updateSharingSeat(new Request("https://example.test", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberName: "", contact: "", contactType: "", monthlyPrice: "", currency: "CNY", billingMonths: 1, startDate: "", expiresAt: "", status: "vacant", paymentStatus: "paid", notes: "" }) }), env, "seat1");
    expect(database.prepare("SELECT status FROM shared_inbox_links WHERE id=?").get(first.link.id)).toEqual({ status: "revoked" });
    expect(database.prepare("SELECT status FROM shared_inbox_links WHERE id=?").get(second.link.id)).toEqual({ status: "active" });
    expect(database.prepare("SELECT status FROM shared_inbox_links WHERE id=?").get(generic.link.id)).toEqual({ status: "active" });
  });
});
