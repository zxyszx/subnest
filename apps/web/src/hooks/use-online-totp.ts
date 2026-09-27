import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { onlineTotpService } from "@/services/online-totp-service";
import type { OnlineTotpAccountCreate, OnlineTotpAccountUpdate } from "@renewlet/shared/schemas/online-totp";

export const onlineTotpQueryKey = ["online-totp", "accounts"] as const;

export function useOnlineTotpAccounts() {
  return useQuery({ queryKey: onlineTotpQueryKey, queryFn: ({ signal }) => onlineTotpService.list(signal), staleTime: 5_000, refetchInterval: 30_000 });
}

export function useCreateOnlineTotpAccount() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: OnlineTotpAccountCreate) => onlineTotpService.create(input), onSuccess: () => client.invalidateQueries({ queryKey: onlineTotpQueryKey }) });
}

export function useUpdateOnlineTotpAccount(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: OnlineTotpAccountUpdate) => onlineTotpService.update(id, input), onSuccess: () => client.invalidateQueries({ queryKey: onlineTotpQueryKey }) });
}

export function useResetOnlineTotpShare() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => onlineTotpService.resetShare(id), onSuccess: () => client.invalidateQueries({ queryKey: onlineTotpQueryKey }) });
}

export function useDeleteOnlineTotpAccount() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => onlineTotpService.remove(id), onSuccess: () => client.invalidateQueries({ queryKey: onlineTotpQueryKey }) });
}

export function usePublicOnlineTotp(shareKey: string) {
  return useQuery({ queryKey: ["online-totp", "public", shareKey], queryFn: ({ signal }) => onlineTotpService.publicAccount(shareKey, signal), refetchInterval: 30_000, staleTime: 5_000 });
}
