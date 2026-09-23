import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sharingService } from "@/services/sharing-service";
import type { SharingAccountCreate, SharingAccountUpdate, SharingSeatUpdate } from "@renewlet/shared/schemas/sharing";

export const sharingQueryKeys = {
  all: ["sharing"] as const,
  accounts: ["sharing", "accounts"] as const,
  detail: (id: string) => ["sharing", "accounts", id] as const,
};

export function sharingAccountsQueryOptions() {
  return queryOptions({
    queryKey: sharingQueryKeys.accounts,
    queryFn: ({ signal }) => sharingService.list(signal),
    staleTime: 30_000,
  });
}

export function useSharingAccounts() {
  return useQuery(sharingAccountsQueryOptions());
}

export function useCreateSharingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SharingAccountCreate) => sharingService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sharingQueryKeys.accounts }),
  });
}

export function useSharingAccountDetail(id: string | null) {
  return useQuery({
    queryKey: sharingQueryKeys.detail(id ?? ""),
    queryFn: ({ signal }) => sharingService.detail(id ?? "", signal),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useUpdateSharingSeat(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seatId, input }: { seatId: string; input: SharingSeatUpdate }) => sharingService.updateSeat(seatId, input),
    onSuccess: (detail) => {
      queryClient.setQueryData(sharingQueryKeys.detail(accountId), detail);
      void queryClient.invalidateQueries({ queryKey: sharingQueryKeys.accounts });
    },
  });
}

export function useUpdateSharingAccount(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SharingAccountUpdate) => sharingService.updateAccount(accountId, input),
    onSuccess: (detail) => {
      queryClient.setQueryData(sharingQueryKeys.detail(accountId), detail);
      void queryClient.invalidateQueries({ queryKey: sharingQueryKeys.accounts });
    },
  });
}
