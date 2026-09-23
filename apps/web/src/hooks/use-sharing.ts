import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sharingService } from "@/services/sharing-service";
import type { SharingAccountCreate } from "@renewlet/shared/schemas/sharing";

export const sharingQueryKeys = {
  all: ["sharing"] as const,
  accounts: ["sharing", "accounts"] as const,
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
