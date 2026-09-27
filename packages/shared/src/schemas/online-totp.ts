import { z } from "zod";
import { apiSuccessResponseSchema } from "./api";

const privateAssetPathPattern = /^\/api\/app\/assets\/[A-Za-z0-9_-]+$/;
const onlineTotpLogoSchema = z.string().trim().max(2048).refine((value) => {
  if (!value || privateAssetPathPattern.test(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Invalid logo URL");

export const onlineTotpAccountSchema = z.object({
  id: z.string().min(1),
  platformName: z.string().min(1),
  serviceName: z.string(),
  accountNumber: z.number().int().positive(),
  account: z.string().min(1),
  logo: z.string().nullable(),
  enabled: z.boolean(),
  sharingEnabled: z.boolean(),
  sharePath: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
  validUntil: z.string().datetime(),
  createdAt: z.string(),
}).strict();

export const onlineTotpAccountsPayloadSchema = z.object({
  accounts: z.array(onlineTotpAccountSchema),
  total: z.number().int().nonnegative(),
}).strict();

export const onlineTotpAccountPayloadSchema = z.object({
  account: onlineTotpAccountSchema,
}).strict();

export const onlineTotpPublicPayloadSchema = z.object({
  platformName: z.string().min(1),
  serviceName: z.string(),
  account: z.string().min(1),
  logo: z.string().nullable(),
  code: z.string().regex(/^\d{6}$/),
  validUntil: z.string().datetime(),
}).strict();

const secretInputSchema = z.string().trim().min(8).max(4096);

export const onlineTotpAccountCreateSchema = z.object({
  platformName: z.string().trim().min(1).max(80),
  serviceName: z.string().trim().max(120),
  accountNumber: z.number().int().min(1).max(10000),
  account: z.string().trim().min(1).max(320),
  logo: onlineTotpLogoSchema,
  secret: secretInputSchema,
  enabled: z.boolean(),
  sharingEnabled: z.boolean(),
}).strict();

export const onlineTotpAccountUpdateSchema = z.object({
  platformName: z.string().trim().min(1).max(80),
  serviceName: z.string().trim().max(120),
  accountNumber: z.number().int().min(1).max(10000),
  account: z.string().trim().min(1).max(320),
  logo: onlineTotpLogoSchema,
  secret: z.string().trim().max(4096),
  enabled: z.boolean(),
  sharingEnabled: z.boolean(),
}).strict();

export const onlineTotpAccountsResponseSchema = apiSuccessResponseSchema(onlineTotpAccountsPayloadSchema);
export const onlineTotpAccountResponseSchema = apiSuccessResponseSchema(onlineTotpAccountPayloadSchema);
export const onlineTotpPublicResponseSchema = apiSuccessResponseSchema(onlineTotpPublicPayloadSchema);

export type OnlineTotpAccount = z.infer<typeof onlineTotpAccountSchema>;
export type OnlineTotpAccountCreate = z.infer<typeof onlineTotpAccountCreateSchema>;
export type OnlineTotpAccountUpdate = z.infer<typeof onlineTotpAccountUpdateSchema>;
