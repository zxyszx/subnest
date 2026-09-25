import { z } from "zod";
import { apiSuccessResponseSchema } from "./api";

export const newszxcnConfigSchema = z.object({
  baseUrl: z.string().url(),
  tokenMask: z.string(),
  tokenSet: z.boolean(),
}).strict();
export const newszxcnConfigResponseSchema = apiSuccessResponseSchema(z.object({ integration: newszxcnConfigSchema.nullable() }).strict());
export const newszxcnConfigRequestSchema = z.object({ baseUrl: z.string().url().default("https://mail.newszxcn.com"), token: z.string().trim().min(8).optional() }).strict();
export const newszxcnTestResponseSchema = apiSuccessResponseSchema(z.object({ mailboxes: z.array(z.object({ id: z.string(), address: z.string(), displayName: z.string().optional(), status: z.string().optional() }).passthrough()) }).strict());
export const sharedInboxLinkSchema = z.object({ id: z.string(), shortUrl: z.string().url(), mailboxId: z.string(), mailboxAddress: z.string(), folderIds: z.array(z.string()), windowMinutes: z.number().int(), expiresAt: z.string().nullable(), status: z.enum(["active", "revoked"]), createdAt: z.string(), updatedAt: z.string() }).strict();
export const sharedInboxLinksResponseSchema = apiSuccessResponseSchema(z.object({ links: z.array(sharedInboxLinkSchema) }).strict());
export const sharedInboxLinkRequestSchema = z.object({ mailboxId: z.string().min(1), folderIds: z.array(z.string()).min(1), windowMinutes: z.number().int().min(0).max(10080), expiresAt: z.string().datetime().nullable().optional() }).strict();
export const sharedInboxMessagesResponseSchema = apiSuccessResponseSchema(z.object({ messages: z.array(z.record(z.string(), z.unknown())), nextCursor: z.string().nullable().optional() }).strict());
export const sharedInboxMessageResponseSchema = apiSuccessResponseSchema(z.object({ message: z.record(z.string(), z.unknown()) }).strict());
export type NewSzxcnConfigRequest = z.infer<typeof newszxcnConfigRequestSchema>;
export type SharedInboxLinkRequest = z.infer<typeof sharedInboxLinkRequestSchema>;
