import { apiFetch } from "@/lib/api-client";
import { z } from "zod";
import { apiSuccessResponseSchema } from "@renewlet/shared/schemas/api";
const anySuccess = apiSuccessResponseSchema(z.record(z.string(), z.unknown()));
const mailboxesSchema = apiSuccessResponseSchema(z.object({ mailboxes: z.array(z.record(z.string(), z.unknown())) }));
const createSchema = apiSuccessResponseSchema(z.object({ link: z.object({ shortUrl: z.string(), grantId: z.string() }) }));
const configSchema = apiSuccessResponseSchema(z.object({ integration: z.any().nullable() }));
const linksSchema = apiSuccessResponseSchema(z.object({ links: z.array(z.any()) }));
export const newszxcnService = {
  getConfig: () => apiFetch("/api/app/admin/newszxcn", configSchema),
  saveConfig: (body: { baseUrl: string; token?: string }) => apiFetch("/api/app/admin/newszxcn", configSchema, { method: "PUT", body: JSON.stringify(body) }),
  test: () => apiFetch("/api/app/admin/newszxcn", mailboxesSchema, { method: "POST", body: JSON.stringify({}) }),
  mailboxes: () => apiFetch("/api/app/admin/newszxcn/mailboxes", anySuccess),
  folders: (mailboxId: string) => apiFetch(`/api/app/admin/newszxcn/mailboxes/${encodeURIComponent(mailboxId)}/folders`, anySuccess),
  links: () => apiFetch("/api/app/admin/shared-inbox-links", linksSchema),
  create: (body: unknown) => apiFetch("/api/app/admin/shared-inbox-links", createSchema, { method: "POST", body: JSON.stringify(body) }),
  revoke: (id: string) => apiFetch(`/api/app/admin/shared-inbox-links/${encodeURIComponent(id)}`, anySuccess, { method: "DELETE" }),
  publicMessages: (key: string) => apiFetch(`/api/shared-inbox/${encodeURIComponent(key)}/messages`, anySuccess, { authMode: "none" }),
  publicMessage: (key: string, id: string) => apiFetch(`/api/shared-inbox/${encodeURIComponent(key)}/messages/${encodeURIComponent(id)}`, anySuccess, { authMode: "none" }),
};
