import type { SharingSeat } from "@renewlet/shared/schemas/sharing";
import type { DateOnly } from "@/lib/time/date-only";

export type SharingSeatDisplayState = "active" | "expired" | "paused" | "vacant";

export function sharingSeatDisplayState(
  seat: Pick<SharingSeat, "status" | "memberName" | "expiresAt"> | undefined,
  today: DateOnly | string,
): SharingSeatDisplayState {
  if (!seat || !seat.memberName || seat.status === "vacant" || seat.status === "archived") return "vacant";
  if (seat.status === "paused") return "paused";
  if (seat.expiresAt && seat.expiresAt < today) return "expired";
  return "active";
}

export function sharingSeatLinkEligible(
  seat: Pick<SharingSeat, "status" | "memberName" | "expiresAt">,
  today: DateOnly | string,
) {
  return Boolean(seat.memberName)
    && (seat.status === "active" || seat.status === "paused")
    && (!seat.expiresAt || seat.expiresAt >= today);
}

export function sharingAccountHasVacancy(
  seats: readonly Pick<SharingSeat, "status" | "memberName" | "expiresAt">[],
  today: DateOnly | string,
) {
  return seats.some((seat) => sharingSeatDisplayState(seat, today) !== "active");
}
