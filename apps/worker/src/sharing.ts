import {
  sharingAccountDetailPayloadSchema,
  sharingAccountPayloadSchema,
  sharingAccountsPayloadSchema,
  sharingCredentialsPayloadSchema,
  sharingSeatUpdateSchema,
  sharingSeatMoveSchema,
} from "@renewlet/shared/schemas/sharing";
import { addMoney, divideMoney, moneyFromNumber, moneyToNumber, multiplyMoney, subtractMoney } from "@renewlet/shared/money";
import { toMonthlyAmount } from "@renewlet/shared/subscription-billing";
import { requireAuth } from "./auth";
import { decryptSharingCredential } from "./sharing-credential";
import { HttpError, readJson, requestLocale, successJson } from "./http";
import { newId, nowIso } from "./db";
import type { Env, SubscriptionRow } from "./types";

interface SharingAccountRow {
  id: string;
  user_id: string;
  subscription_id: string;
  status: "active" | "paused" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SharingSeatRow {
  id: string;
  user_id: string;
  sharing_account_id: string;
  seat_number: number;
  member_name: string | null;
  contact: string | null;
  contact_type: "wechat" | "telegram" | "email" | "phone" | "other" | null;
  monthly_price: string | null;
  currency: string | null;
  billing_months: number | null;
  start_date: string | null;
  expires_at: string | null;
  status: "vacant" | "active" | "paused" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SharingReceivableRow {
  id: string;
  user_id: string;
  sharing_account_id: string;
  seat_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount: string;
  paid_amount: string;
  fee_amount: string;
  refund_amount: string;
  currency: string;
  status: "pending" | "partial" | "paid" | "overdue" | "waived";
  paid_at: string | null;
}

export async function readSharingAccounts(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`
    SELECT a.* FROM sharing_accounts a
    JOIN subscriptions s ON s.id = a.subscription_id AND s.user_id = a.user_id
    WHERE a.user_id = ? AND a.status != 'archived' AND s.family_sharing_enabled = 1
    ORDER BY COALESCE((SELECT MIN(expires_at) FROM sharing_seats WHERE sharing_account_id = a.id AND status IN ('active', 'paused')), '9999-12-31'),
      lower(s.platform_name), s.account_number, a.created_at
    LIMIT 500
  `).bind(auth.user.id).all<SharingAccountRow>();
  const accounts = await Promise.all(result.results.map((row) => sharingAccountApi(env, row)));
  return successJson(sharingAccountsPayloadSchema.parse({ accounts, total: accounts.length }));
}

export async function readSharingAccountDetail(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const account = await ownedAccount(env, auth.user.id, id);
  if (!account) throw new HttpError(404, "SHARING_ACCOUNT_NOT_FOUND", "NOT_FOUND");
  const accountApi = await sharingAccountApi(env, account);
  const seatsResult = await env.DB.prepare(`
    SELECT * FROM sharing_seats WHERE user_id = ? AND sharing_account_id = ? AND seat_number <= ?
    ORDER BY seat_number LIMIT 100
  `).bind(auth.user.id, account.id, accountApi.capacity).all<SharingSeatRow>();
  const receivables = await receivablesBySeat(env, auth.user.id, account.id);
  const seats = seatsResult.results.map((seat) => seatApi(seat, receivables.get(seat.id) ?? null));
  const allReceivables = [...receivables.values()];
  const contractedRevenue = addMoney(...allReceivables.map((row) => row.amount));
  const collectedRevenue = addMoney(...allReceivables.map((row) => row.paid_amount));
  return successJson(sharingAccountDetailPayloadSchema.parse({
    account: accountApi,
    seats,
    totals: {
      monthlyRevenue: accountApi.monthlyRevenue,
      contractedRevenue,
      collectedRevenue,
      outstandingAmount: accountApi.outstandingAmount,
      monthlyProfit: accountApi.monthlyProfit,
    },
  }));
}

export async function readSharingAccountCredentials(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const row = await env.DB.prepare(`
    SELECT s.sharing_encrypted_credentials AS credential FROM sharing_accounts a
    JOIN subscriptions s ON s.id = a.subscription_id AND s.user_id = a.user_id
    WHERE a.id = ? AND a.user_id = ? AND s.family_sharing_enabled = 1 LIMIT 1
  `).bind(id, auth.user.id).first<{ credential: string }>();
  if (!row?.credential) throw new HttpError(404, "SHARING_ACCOUNT_NOT_FOUND", "NOT_FOUND");
  const password = await decryptSharingCredential(env, row.credential);
  return successJson(sharingCredentialsPayloadSchema.parse({ password }), { headers: { "cache-control": "no-store" } });
}

export async function updateSharingSeat(request: Request, env: Env, id: string): Promise<Response> {
  const locale = requestLocale(request);
  const auth = await requireAuth(request, env);
  const body = await readJson(request, sharingSeatUpdateSchema, locale);
  const seat = await env.DB.prepare("SELECT * FROM sharing_seats WHERE id = ? AND user_id = ? LIMIT 1").bind(id, auth.user.id).first<SharingSeatRow>();
  if (!seat) throw new HttpError(404, "SHARING_SEAT_NOT_FOUND", "NOT_FOUND");
  const account = await ownedAccount(env, auth.user.id, seat.sharing_account_id);
  if (!account) throw new HttpError(404, "SHARING_ACCOUNT_NOT_FOUND", "NOT_FOUND");
  if (body.status !== "vacant") {
    if (!body.memberName || !body.monthlyPrice || !body.startDate || !body.expiresAt || body.expiresAt < body.startDate) {
      throw new HttpError(400, "INVALID_SHARING_SEAT", "INVALID_PAYLOAD");
    }
  }
  const timestamp = nowIso();
  const statements: D1PreparedStatement[] = [];
  if (body.status === "vacant") {
    statements.push(env.DB.prepare(`
      UPDATE sharing_seats SET member_name = NULL, contact = NULL, contact_type = NULL, monthly_price = NULL,
        currency = NULL, billing_months = NULL, start_date = NULL, expires_at = NULL, status = 'vacant', notes = NULL, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(timestamp, id, auth.user.id));
  } else {
    const billing = sharingBillingAmounts(body.monthlyPrice, body.billingAmount, body.billingMonths);
    statements.push(env.DB.prepare(`
      UPDATE sharing_seats SET member_name = ?, contact = ?, contact_type = ?, monthly_price = ?, currency = ?,
        billing_months = ?, start_date = ?, expires_at = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(body.memberName, body.contact || null, body.contactType || null, billing.monthlyPrice, body.currency,
      body.billingMonths, body.startDate, body.expiresAt, body.status, body.notes || null, timestamp, id, auth.user.id));
    const existing = await env.DB.prepare(`
      SELECT id FROM sharing_receivables WHERE user_id = ? AND seat_id = ? AND period_start = ? AND period_end = ? LIMIT 1
    `).bind(auth.user.id, id, body.startDate, body.expiresAt).first<{ id: string }>();
    const receivableId = existing?.id ?? newId("recv");
    const amount = billing.amount;
    const paid = body.paymentStatus === "paid";
    statements.push(env.DB.prepare(`
      INSERT INTO sharing_receivables (
        id, user_id, sharing_account_id, seat_id, period_start, period_end, due_date, amount, paid_amount,
        fee_amount, refund_amount, currency, status, paid_at, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '0', '0', ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, paid_amount = excluded.paid_amount,
        currency = excluded.currency, status = excluded.status, paid_at = excluded.paid_at, updated_at = excluded.updated_at
    `).bind(receivableId, auth.user.id, account.id, id, body.startDate, body.expiresAt, body.startDate, amount,
      paid ? amount : "0", body.currency, paid ? "paid" : "pending", paid ? timestamp : null, timestamp, timestamp));
  }
  await env.DB.batch(statements);
  return readSharingAccountDetail(request, env, account.id);
}

export async function moveSharingSeat(request: Request, env: Env, id: string): Promise<Response> {
  const locale = requestLocale(request);
  const auth = await requireAuth(request, env);
  const body = await readJson(request, sharingSeatMoveSchema, locale);
  if (body.targetSeatId === id) throw new HttpError(400, "SHARING_SEAT_MOVE_NOT_ALLOWED", "INVALID_PAYLOAD");
  const source = await env.DB.prepare(`
    SELECT seat.*, lower(COALESCE(NULLIF(subscription.platform_name, ''), subscription.name)) AS platform
    FROM sharing_seats seat
    JOIN sharing_accounts account ON account.id = seat.sharing_account_id AND account.user_id = seat.user_id
    JOIN subscriptions subscription ON subscription.id = account.subscription_id AND subscription.user_id = account.user_id
    WHERE seat.id = ? AND seat.user_id = ? LIMIT 1
  `).bind(id, auth.user.id).first<SharingSeatRow & { platform: string }>();
  const target = await env.DB.prepare(`
    SELECT seat.*, lower(COALESCE(NULLIF(subscription.platform_name, ''), subscription.name)) AS platform
    FROM sharing_seats seat
    JOIN sharing_accounts account ON account.id = seat.sharing_account_id AND account.user_id = seat.user_id
    JOIN subscriptions subscription ON subscription.id = account.subscription_id AND subscription.user_id = account.user_id
    WHERE seat.id = ? AND seat.user_id = ? LIMIT 1
  `).bind(body.targetSeatId, auth.user.id).first<SharingSeatRow & { platform: string }>();
  if (!source || !target) throw new HttpError(404, "SHARING_SEAT_NOT_FOUND", "NOT_FOUND");
  if (source.status === "vacant" || !source.member_name || target.status !== "vacant" || source.platform !== target.platform) {
    throw new HttpError(400, "SHARING_SEAT_MOVE_NOT_ALLOWED", "INVALID_PAYLOAD");
  }
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE sharing_seats SET member_name = ?, contact = ?, contact_type = ?, monthly_price = ?, currency = ?,
        billing_months = ?, start_date = ?, expires_at = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'vacant'
    `).bind(source.member_name, source.contact, source.contact_type, source.monthly_price, source.currency,
      source.billing_months, source.start_date, source.expires_at, source.status, source.notes, timestamp, target.id, auth.user.id),
    env.DB.prepare(`
      UPDATE sharing_receivables SET sharing_account_id = ?, seat_id = ?, updated_at = ?
      WHERE user_id = ? AND seat_id = ? AND status IN ('pending', 'partial', 'overdue')
    `).bind(target.sharing_account_id, target.id, timestamp, auth.user.id, source.id),
    env.DB.prepare(`
      UPDATE sharing_seats SET member_name = NULL, contact = NULL, contact_type = NULL, monthly_price = NULL,
        currency = NULL, billing_months = NULL, start_date = NULL, expires_at = NULL, status = 'vacant', notes = NULL, updated_at = ?
      WHERE id = ? AND user_id = ? AND status != 'vacant'
    `).bind(timestamp, source.id, auth.user.id),
  ]);
  return readSharingAccountDetail(request, env, target.sharing_account_id);
}

export function sharingBillingAmounts(monthlyPrice: string, billingAmount: string | undefined, billingMonths: number) {
  if (!billingAmount) return { monthlyPrice, amount: multiplyMoney(monthlyPrice, billingMonths) };
  return { monthlyPrice: divideMoney(billingAmount, billingMonths), amount: billingAmount };
}

export async function rejectLegacySharingAccountMutation(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  throw new HttpError(409, "EDIT_SUBSCRIPTION_FAMILY_SHARING_INSTEAD", "SHARING_ACCOUNT_MANAGED_BY_SUBSCRIPTION");
}

async function ownedAccount(env: Env, userId: string, id: string): Promise<SharingAccountRow | null> {
  return env.DB.prepare("SELECT * FROM sharing_accounts WHERE id = ? AND user_id = ? LIMIT 1").bind(id, userId).first<SharingAccountRow>();
}

async function subscriptionForAccount(env: Env, account: SharingAccountRow): Promise<SubscriptionRow> {
  const subscription = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(account.subscription_id, account.user_id).first<SubscriptionRow>();
  if (!subscription) throw new HttpError(404, "SUBSCRIPTION_NOT_FOUND", "NOT_FOUND");
  return subscription;
}

async function sharingAccountApi(env: Env, account: SharingAccountRow) {
  const subscription = await subscriptionForAccount(env, account);
  const seats = await env.DB.prepare("SELECT status, monthly_price, currency FROM sharing_seats WHERE user_id = ? AND sharing_account_id = ? AND seat_number <= ?")
    .bind(account.user_id, account.id, subscription.sharing_capacity ?? 5).all<Pick<SharingSeatRow, "status" | "monthly_price" | "currency">>();
  // A paused seat means "stop at expiry": it remains occupied and earns revenue
  // through the current paid period, but renewal notifications exclude it.
  const activeSeats = seats.results.filter((seat) => seat.status === "active" || seat.status === "paused");
  const monthlyRevenue = addMoney(...activeSeats.map((seat) => seat.monthly_price ?? "0"));
  const monthlyRevenueByCurrency = Object.fromEntries(Object.entries(activeSeats.reduce<Record<string, number>>((totals, seat) => {
    const currency = (seat.currency || subscription.currency).toUpperCase();
    totals[currency] = (totals[currency] ?? 0) + moneyToNumber(seat.monthly_price ?? "0");
    return totals;
  }, {})).map(([currency, amount]) => [currency, moneyFromNumber(amount)]));
  const due = await env.DB.prepare(`
    SELECT amount, paid_amount, fee_amount, refund_amount FROM sharing_receivables
    WHERE user_id = ? AND sharing_account_id = ? AND status IN ('pending', 'partial', 'overdue')
  `).bind(account.user_id, account.id).all<Pick<SharingReceivableRow, "amount" | "paid_amount" | "fee_amount" | "refund_amount">>();
  const outstanding = due.results.reduce((total, item) => total + Math.max(0,
    moneyToNumber(item.amount) + moneyToNumber(item.fee_amount) - moneyToNumber(item.paid_amount) - moneyToNumber(item.refund_amount)), 0);
  const monthlyCost = toMonthlyAmount(subscription.price, subscription.billing_cycle as Parameters<typeof toMonthlyAmount>[1], subscription.custom_days, subscription.custom_cycle_unit, subscription.one_time_term_count, subscription.one_time_term_unit);
  return sharingAccountPayloadSchema.shape.account.parse({
    id: account.id,
    subscription: {
      id: subscription.id,
      name: subscription.name,
      platformName: subscription.platform_name || subscription.name,
      logo: subscription.logo,
      status: subscription.status,
    },
    name: `编号 ${subscription.account_number ?? 1}`,
    accountNumber: subscription.account_number ?? 1,
    loginAccount: subscription.sharing_login_account ?? "",
    hasPassword: Boolean(subscription.sharing_encrypted_credentials),
    verificationLink: subscription.sharing_verification_link ?? null,
    monthlyCost: moneyFromNumber(monthlyCost),
    currency: subscription.currency,
    nextBillingDate: subscription.next_billing_date,
    paymentMethod: subscription.payment_method,
    cardLast4: subscription.card_last4 ?? null,
    capacity: subscription.sharing_capacity ?? 5,
    occupiedSeats: activeSeats.length,
    monthlyRevenue,
    monthlyRevenueByCurrency,
    outstandingAmount: moneyFromNumber(outstanding),
    monthlyProfit: subtractMoney(monthlyRevenue, monthlyCost),
    status: account.status,
    notes: account.notes,
    createdAt: account.created_at,
  });
}

async function receivablesBySeat(env: Env, userId: string, accountId: string): Promise<Map<string, SharingReceivableRow>> {
  const result = await env.DB.prepare(`
    SELECT * FROM sharing_receivables WHERE user_id = ? AND sharing_account_id = ? ORDER BY period_end DESC, created_at DESC
  `).bind(userId, accountId).all<SharingReceivableRow>();
  const bySeat = new Map<string, SharingReceivableRow>();
  for (const row of result.results) if (!bySeat.has(row.seat_id)) bySeat.set(row.seat_id, row);
  return bySeat;
}

function seatApi(seat: SharingSeatRow, receivable: SharingReceivableRow | null) {
  return {
    id: seat.id,
    seatNumber: seat.seat_number,
    memberName: seat.member_name,
    contact: seat.contact,
    contactType: seat.contact_type,
    monthlyPrice: seat.monthly_price,
    currency: seat.currency,
    billingMonths: seat.billing_months,
    startDate: seat.start_date,
    expiresAt: seat.expires_at,
    status: seat.status,
    notes: seat.notes,
    currentReceivable: receivable ? {
      id: receivable.id,
      periodStart: receivable.period_start,
      periodEnd: receivable.period_end,
      dueDate: receivable.due_date,
      amount: receivable.amount,
      paidAmount: receivable.paid_amount,
      currency: receivable.currency,
      status: receivable.status,
      paidAt: receivable.paid_at,
    } : null,
  };
}
