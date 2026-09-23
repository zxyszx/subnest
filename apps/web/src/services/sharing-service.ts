import { apiFetch } from "@/lib/api-client";
import {
  sharingAccountCreateSchema,
  sharingAccountResponseSchema,
  sharingAccountsResponseSchema,
  sharingCredentialsResponseSchema,
  type SharingAccount,
  type SharingAccountCreate,
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
};
