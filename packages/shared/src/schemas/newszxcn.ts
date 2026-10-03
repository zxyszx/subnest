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
export const sharedInboxLinkSchema = z.object({ id: z.string(), shortUrl: z.string().url(), mailboxId: z.string(), mailboxAddress: z.string(), seatId: z.string().nullable().optional(), folderIds: z.array(z.string()), windowMinutes: z.number().int(), expiresAt: z.string().nullable(), status: z.enum(["active", "revoked"]), createdAt: z.string(), updatedAt: z.string() }).strict();
export const sharedInboxLinksResponseSchema = apiSuccessResponseSchema(z.object({ links: z.array(sharedInboxLinkSchema) }).strict());
export const sharedInboxLinkRequestSchema = z.object({
  mailboxId: z.string().min(1),
  seatId: z.string().trim().min(1).max(256).optional(),
  folderIds: z.array(z.string()).min(1),
  windowMinutes: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(360),
    z.literal(1440),
    z.literal(10080),
  ]),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict().refine((value) => !value.seatId || Boolean(value.expiresAt), { message: "车位链接必须设置有效期", path: ["expiresAt"] });
export const sharedInboxMessagesResponseSchema = apiSuccessResponseSchema(z.object({ messages: z.array(z.record(z.string(), z.unknown())), nextCursor: z.string().nullable().optional() }).strict());
export const sharedInboxMessageResponseSchema = apiSuccessResponseSchema(z.object({ message: z.record(z.string(), z.unknown()) }).strict());
export type NewSzxcnConfigRequest = z.infer<typeof newszxcnConfigRequestSchema>;
export type SharedInboxLinkRequest = z.infer<typeof sharedInboxLinkRequestSchema>;
