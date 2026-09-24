import { z } from "zod";
import { apiSuccessResponseSchema } from "./api";
import { dateInputSchema } from "./subscriptions";
import { moneyStringSchema } from "../money";

export const SHARING_ACCOUNT_STATUSES = ["active", "paused", "archived"] as const;
export const SHARING_SEAT_STATUSES = ["vacant", "active", "paused", "archived"] as const;
export const SHARING_CONTACT_TYPES = ["wechat", "telegram", "email", "phone", "other"] as const;
export const SHARING_PAYMENT_STATUSES = ["pending", "paid"] as const;

export const sharingSubscriptionSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platformName: z.string().min(1),
  logo: z.string().nullable(),
}).strict();

export const sharingAccountSchema = z.object({
  id: z.string().min(1),
  subscription: sharingSubscriptionSummarySchema,
  name: z.string().min(1),
  accountNumber: z.number().int().positive(),
  loginAccount: z.string().min(1),
  hasPassword: z.boolean(),
  verificationLink: z.url().nullable(),
  monthlyCost: moneyStringSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  nextBillingDate: dateInputSchema,
  paymentMethod: z.string().nullable(),
  cardLast4: z.string().nullable(),
  capacity: z.number().int().min(1).max(100),
  occupiedSeats: z.number().int().nonnegative(),
  monthlyRevenue: moneyStringSchema,
  monthlyRevenueByCurrency: z.record(z.string().regex(/^[A-Z]{3}$/), moneyStringSchema),
  outstandingAmount: moneyStringSchema,
  monthlyProfit: z.number().finite(),
  status: z.enum(SHARING_ACCOUNT_STATUSES),
  notes: z.string().nullable(),
  createdAt: z.string(),
}).strict();

export const sharingAccountsPayloadSchema = z.object({
  accounts: z.array(sharingAccountSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const sharingAccountPayloadSchema = z.object({
  account: sharingAccountSchema,
}).strict();

export const sharingCredentialsPayloadSchema = z.object({
  password: z.string(),
}).strict();

export const sharingReceivableSchema = z.object({
  id: z.string().min(1),
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
  dueDate: dateInputSchema,
  amount: moneyStringSchema,
  paidAmount: moneyStringSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["pending", "partial", "paid", "overdue", "waived"]),
  paidAt: z.string().nullable(),
}).strict();

export const sharingSeatSchema = z.object({
  id: z.string().min(1),
  seatNumber: z.number().int().positive(),
  memberName: z.string().nullable(),
  contact: z.string().nullable(),
  contactType: z.enum(SHARING_CONTACT_TYPES).nullable(),
  monthlyPrice: moneyStringSchema.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  billingMonths: z.number().int().positive().nullable(),
  startDate: dateInputSchema.nullable(),
  expiresAt: dateInputSchema.nullable(),
  status: z.enum(SHARING_SEAT_STATUSES),
  notes: z.string().nullable(),
  currentReceivable: sharingReceivableSchema.nullable(),
}).strict();

export const sharingAccountTotalsSchema = z.object({
  monthlyRevenue: moneyStringSchema,
  contractedRevenue: moneyStringSchema,
  collectedRevenue: moneyStringSchema,
  outstandingAmount: moneyStringSchema,
  monthlyProfit: z.number().finite(),
}).strict();

export const sharingAccountDetailPayloadSchema = z.object({
  account: sharingAccountSchema,
  seats: z.array(sharingSeatSchema),
  totals: sharingAccountTotalsSchema,
}).strict();

export const sharingAccountsResponseSchema = apiSuccessResponseSchema(sharingAccountsPayloadSchema);
export const sharingAccountResponseSchema = apiSuccessResponseSchema(sharingAccountPayloadSchema);
export const sharingCredentialsResponseSchema = apiSuccessResponseSchema(sharingCredentialsPayloadSchema);
export const sharingAccountDetailResponseSchema = apiSuccessResponseSchema(sharingAccountDetailPayloadSchema);

export const sharingAccountCreateSchema = z.object({
  subscriptionId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  accountNumber: z.number().int().positive(),
  loginAccount: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  verificationLink: z.union([z.literal(""), z.url()]),
  monthlyCost: moneyStringSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  nextBillingDate: dateInputSchema,
  paymentMethod: z.string().max(80),
  cardLast4: z.string().max(32),
  capacity: z.number().int().min(1).max(100),
  status: z.enum(SHARING_ACCOUNT_STATUSES),
  notes: z.string().max(5000),
}).strict();

export const sharingAccountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  accountNumber: z.number().int().positive(),
  loginAccount: z.string().trim().min(1).max(320),
  password: z.string().max(1024),
  verificationLink: z.union([z.literal(""), z.url()]),
  monthlyCost: moneyStringSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  nextBillingDate: dateInputSchema,
  paymentMethod: z.string().max(80),
  cardLast4: z.string().max(32),
  status: z.enum(SHARING_ACCOUNT_STATUSES),
  notes: z.string().max(5000),
}).strict();

export const sharingSeatUpdateSchema = z.object({
  memberName: z.string().trim().max(120),
  contact: z.string().trim().max(320),
  contactType: z.union([z.literal(""), z.enum(SHARING_CONTACT_TYPES)]),
  monthlyPrice: z.union([z.literal(""), moneyStringSchema]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  billingMonths: z.number().int().min(1).max(120),
  startDate: z.union([z.literal(""), dateInputSchema]),
  expiresAt: z.union([z.literal(""), dateInputSchema]),
  status: z.enum(SHARING_SEAT_STATUSES),
  paymentStatus: z.enum(SHARING_PAYMENT_STATUSES),
  notes: z.string().max(5000),
}).strict();

export type SharingAccount = z.infer<typeof sharingAccountSchema>;
export type SharingAccountCreate = z.infer<typeof sharingAccountCreateSchema>;
export type SharingAccountUpdate = z.infer<typeof sharingAccountUpdateSchema>;
export type SharingAccountDetail = z.infer<typeof sharingAccountDetailPayloadSchema>;
export type SharingSeat = z.infer<typeof sharingSeatSchema>;
export type SharingSeatUpdate = z.infer<typeof sharingSeatUpdateSchema>;
