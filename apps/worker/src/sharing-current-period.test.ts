import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { readSharingAccountDetail } from "./sharing";
import type { Env } from "./types";

vi.mock("./auth", () => ({ requireAuth: async () => ({ user: { id: "owner" } }) }));
vi.mock("./db", async (original) => ({
  ...await original<typeof import("./db")>(),
  getSettings: async () => ({ timezone: "Asia/Shanghai" }),
}));

it("reads the saved seat period instead of a longer historical pending charge", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    for (const name of readdirSync(new URL("../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
      database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    }
    database.exec(`
      INSERT INTO users(id,email,name,role,password_hash,created_at,updated_at)
      VALUES('owner','owner@example.test','Owner','user','','','');
      INSERT INTO subscriptions(id,user_id,name,price,currency,billing_cycle,category,status,next_billing_date,
        auto_calculate_next_billing_date,reminder_days,repeat_reminder_enabled,repeat_reminder_interval,
        repeat_reminder_window,created_at,updated_at,family_sharing_enabled,sharing_login_account,sharing_capacity)
      VALUES('sub','owner','Netflix','10','CNY','monthly','streaming','active','2099-01-01',1,3,0,'daily','all','','',1,'shared@example.test',5);
      UPDATE subscriptions SET platform_name='Netflix',account_number=1 WHERE id='sub';
      INSERT INTO sharing_accounts(id,user_id,subscription_id,status,created_at,updated_at)
      VALUES('account','owner','sub','active','','');
      INSERT INTO sharing_seats(id,user_id,sharing_account_id,seat_number,member_name,monthly_price,currency,
        billing_months,start_date,expires_at,status,created_at,updated_at)
      VALUES('seat','owner','account',1,'Member','15','CNY',1,'2026-10-16','2026-11-16','active','','');
      INSERT INTO sharing_receivables(id,user_id,sharing_account_id,seat_id,period_start,period_end,due_date,
        amount,paid_amount,currency,status,created_at,updated_at)
      VALUES('old','owner','account','seat','2026-10-16','2027-01-16','2026-10-16','45','0','CNY','pending','',''),
        ('current','owner','account','seat','2026-10-16','2026-11-16','2026-10-16','15','15','CNY','paid','','');
    `);
    const env = { DB: {
      prepare(sql: string) {
        let values: SQLInputValue[] = [];
        const statement = {
          bind(...params: SQLInputValue[]) { values = params; return statement; },
          async first() { return database.prepare(sql).get(...values) ?? null; },
          async all() { return { results: database.prepare(sql).all(...values), success: true }; },
        };
        return statement;
      },
    } } as unknown as Env;
    const response = await readSharingAccountDetail(new Request("https://example.test/api/app/sharing/accounts/account"), env, "account");
    const body = await response.json() as { data: { seats: { currentReceivable: { amount: string; status: string } | null }[] } };
    expect(body.data.seats[0]?.currentReceivable).toMatchObject({ amount: "15", status: "paid" });
    // History is retained, and a seat without a matching period must not inherit it.
    database.exec("UPDATE sharing_seats SET expires_at='2026-12-16' WHERE id='seat'");
    const unmatched = await readSharingAccountDetail(new Request("https://example.test/api/app/sharing/accounts/account"), env, "account");
    const unmatchedBody = await unmatched.json() as typeof body;
    expect(unmatchedBody.data.seats[0]?.currentReceivable).toBeNull();
    expect(database.prepare("SELECT COUNT(*) AS count FROM sharing_receivables").get()?.["count"]).toBe(2);
  } finally {
    database.close();
  }
});
