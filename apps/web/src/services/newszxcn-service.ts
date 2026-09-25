import { z } from "zod";
import { apiSuccessResponseSchema } from "@renewlet/shared/schemas/api";
import { newszxcnConfigResponseSchema, newszxcnTestResponseSchema, sharedInboxLinkSchema, sharedInboxLinksResponseSchema } from "@renewlet/shared/schemas/newszxcn";
import { apiFetch } from "@/lib/api-client";

const mailboxSchema = z.object({ id: z.string(), address: z.string(), displayName: z.string().optional(), status: z.string().optional() }).passthrough();
const folderSchema = z.object({ id: z.string(), name: z.string(), role: z.string().optional(), totalCount: z.number().optional() }).passthrough();
const mailboxesSchema = apiSuccessResponseSchema(z.object({ items: z.array(mailboxSchema) }));
const foldersSchema = apiSuccessResponseSchema(z.object({ items: z.array(folderSchema) }));
const createSchema = apiSuccessResponseSchema(z.object({ link: sharedInboxLinkSchema }));
const emptySuccess = apiSuccessResponseSchema(z.object({}).passthrough());
const publicSuccess = apiSuccessResponseSchema(z.record(z.string(), z.unknown()));

export type NewSzxcnMailbox = z.infer<typeof mailboxSchema>;
export type NewSzxcnFolder = z.infer<typeof folderSchema>;
export type SharedInboxLink = z.infer<typeof sharedInboxLinkSchema>;

export const newszxcnService = {
  getConfig: () => apiFetch("/api/app/admin/newszxcn", newszxcnConfigResponseSchema),
  saveConfig: (body: { baseUrl: string; token?: string }) => apiFetch("/api/app/admin/newszxcn", newszxcnConfigResponseSchema, { method: "PUT", body: JSON.stringify(body) }),
  test: () => apiFetch("/api/app/admin/newszxcn", newszxcnTestResponseSchema, { method: "POST", body: JSON.stringify({}) }),
  mailboxes: () => apiFetch("/api/app/admin/newszxcn/mailboxes", mailboxesSchema),
  folders: (mailboxId: string) => apiFetch(`/api/app/admin/newszxcn/mailboxes/${encodeURIComponent(mailboxId)}/folders`, foldersSchema),
  links: () => apiFetch("/api/app/admin/shared-inbox-links", sharedInboxLinksResponseSchema),
  create: (body: { mailboxId: string; folderIds: string[]; windowMinutes: number; expiresAt?: string | null }) => apiFetch("/api/app/admin/shared-inbox-links", createSchema, { method: "POST", body: JSON.stringify(body) }),
  revoke: (id: string) => apiFetch(`/api/app/admin/shared-inbox-links/${encodeURIComponent(id)}`, emptySuccess, { method: "DELETE" }),
  publicMessages: (key: string) => apiFetch(`/api/shared-inbox/${encodeURIComponent(key)}/messages`, publicSuccess, { authMode: "none" }),
  publicMessage: (key: string, id: string) => apiFetch(`/api/shared-inbox/${encodeURIComponent(key)}/messages/${encodeURIComponent(id)}`, publicSuccess, { authMode: "none" }),
};
