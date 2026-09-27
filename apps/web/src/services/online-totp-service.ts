import { apiFetch } from "@/lib/api-client";
import {
  onlineTotpAccountCreateSchema,
  onlineTotpAccountResponseSchema,
  onlineTotpAccountsResponseSchema,
  onlineTotpAccountUpdateSchema,
  onlineTotpPublicResponseSchema,
  type OnlineTotpAccountCreate,
  type OnlineTotpAccountUpdate,
} from "@renewlet/shared/schemas/online-totp";
import { apiEmptySuccessResponseSchema } from "@renewlet/shared/schemas/api";

export const onlineTotpService = {
  async list(signal?: AbortSignal) {
    return await apiFetch("/api/app/online-totp/accounts", onlineTotpAccountsResponseSchema, signal ? { signal } : undefined);
  },
  async create(input: OnlineTotpAccountCreate) {
    const data = await apiFetch("/api/app/online-totp/accounts", onlineTotpAccountResponseSchema, { method: "POST", body: JSON.stringify(onlineTotpAccountCreateSchema.parse(input)) });
    return data.account;
  },
  async update(id: string, input: OnlineTotpAccountUpdate) {
    const data = await apiFetch(`/api/app/online-totp/accounts/${encodeURIComponent(id)}`, onlineTotpAccountResponseSchema, { method: "PUT", body: JSON.stringify(onlineTotpAccountUpdateSchema.parse(input)) });
    return data.account;
  },
  async resetShare(id: string) {
    const data = await apiFetch(`/api/app/online-totp/accounts/${encodeURIComponent(id)}/share/reset`, onlineTotpAccountResponseSchema, { method: "POST" });
    return data.account;
  },
  async remove(id: string) {
    await apiFetch(`/api/app/online-totp/accounts/${encodeURIComponent(id)}`, apiEmptySuccessResponseSchema, { method: "DELETE" });
  },
  async publicAccount(shareKey: string, signal?: AbortSignal) {
    return await apiFetch(`/api/online-totp/${encodeURIComponent(shareKey)}`, onlineTotpPublicResponseSchema, { authMode: "none", ...(signal ? { signal } : {}) });
  },
};
