import { apiFetch } from "@/lib/api-client";
import {
  sharingAccountCreateSchema,
  sharingAccountDetailResponseSchema,
  sharingAccountResponseSchema,
  sharingAccountUpdateSchema,
  sharingAccountsResponseSchema,
  sharingCredentialsResponseSchema,
  sharingSeatUpdateSchema,
  type SharingAccount,
  type SharingAccountCreate,
  type SharingAccountDetail,
  type SharingAccountUpdate,
  type SharingSeatUpdate,
} from "@renewlet/shared/schemas/sharing";

function signalInit(signal?: AbortSignal): RequestInit | undefined {
  return signal ? { signal } : undefined;
}

export const sharingService = {
  async list(signal?: AbortSignal): Promise<{ accounts: SharingAccount[]; total: number }> {
    return await apiFetch("/api/app/sharing/accounts", sharingAccountsResponseSchema, signalInit(signal));
  },

  async create(input: SharingAccountCreate): Promise<SharingAccount> {
    const payload = sharingAccountCreateSchema.parse(input);
    const data = await apiFetch("/api/app/sharing/accounts", sharingAccountResponseSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data.account;
  },

  async password(id: string): Promise<string> {
    const data = await apiFetch(
      `/api/app/sharing/accounts/${encodeURIComponent(id)}/credentials`,
      sharingCredentialsResponseSchema,
      { cache: "no-store" },
    );
    return data.password;
  },

  async detail(id: string, signal?: AbortSignal): Promise<SharingAccountDetail> {
    return await apiFetch(
      `/api/app/sharing/accounts/${encodeURIComponent(id)}`,
      sharingAccountDetailResponseSchema,
      signalInit(signal),
    );
  },

  async updateSeat(id: string, input: SharingSeatUpdate): Promise<SharingAccountDetail> {
    const payload = sharingSeatUpdateSchema.parse(input);
    return await apiFetch(
      `/api/app/sharing/seats/${encodeURIComponent(id)}`,
      sharingAccountDetailResponseSchema,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  async updateAccount(id: string, input: SharingAccountUpdate): Promise<SharingAccountDetail> {
    const payload = sharingAccountUpdateSchema.parse(input);
    return await apiFetch(
      `/api/app/sharing/accounts/${encodeURIComponent(id)}`,
      sharingAccountDetailResponseSchema,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },
};
