import { useState } from "react";
import { Pencil, RotateCw, Eye, MoreHorizontal } from "lucide-react";
import { isManualRenewEligible } from "@renewlet/shared/subscription-renewal";
import type { SubscriptionGridProps } from "@/components/subscription-grid";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { SubscriptionStatusBadge } from "@/components/subscription-status-badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { getEffectiveSubscriptionStatus } from "@/modules/subscriptions/domain/subscription-status";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export function SubscriptionWorkspaceList({
  subscriptions,
  today,
  onEdit,
  onRenew,
  onViewDetails,
  onDelete,
  onClone,
  onTogglePinned,
  onTogglePublicHidden,
  onAddToCalendar,
}: Omit<SubscriptionGridProps, "viewMode">) {
  const { t, formatCurrency, formatDateOnly } = useI18n();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleting = subscriptions.find((item) => item.id === deletingId);
  return (
    <>
      <table
        className="w-full min-w-180 text-left text-sm"
        data-testid="subscription-workspace-list"
      >
        <thead className="sticky top-0 z-1 bg-card text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-medium">
              {t("subscription.field.platformName")}
            </th>
            <th className="px-3 py-3 font-medium">
              {t("subscription.field.price")}
            </th>
            <th className="px-3 py-3 font-medium">
              {t("calendar.nextBilling")}
            </th>
            <th className="px-3 py-3 font-medium">
              {t("subscription.field.status")}
            </th>
            <th className="px-3 py-3 text-right font-medium">
              {t("sharing.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {subscriptions.map((subscription) => (
            <tr
              key={subscription.id}
              data-testid="subscription-workspace-row"
              className="h-18 hover:bg-muted/30"
            >
              <td className="px-3 py-2">
                <button
                  className="flex min-w-0 items-center gap-3 text-left"
                  onClick={() => onViewDetails(subscription.id)}
                >
                  <SubscriptionLogo
                    name={subscription.platformName || subscription.name}
                    logo={subscription.logo ?? undefined}
                    size="sm"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {subscription.platformName || subscription.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        #{subscription.accountNumber ?? 1}
                      </span>
                    </span>
                    <span className="block max-w-64 truncate text-xs text-muted-foreground">
                      {subscription.name}
                    </span>
                  </span>
                </button>
              </td>
              <td className="px-3 py-2 font-medium tabular-nums">
                {formatCurrency(subscription.price, subscription.currency)}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatDateOnly(subscription.nextBillingDate)}
              </td>
              <td className="px-3 py-2">
                <SubscriptionStatusBadge
                  status={getEffectiveSubscriptionStatus(subscription, today)}
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("subscription.viewDetailsLabel", {
                      name: subscription.name,
                    })}
                    aria-label={t("subscription.viewDetailsLabel", {
                      name: subscription.name,
                    })}
                    onClick={() => onViewDetails(subscription.id)}
                  >
                    <Eye />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title={t("common.edit")}
                    aria-label={t("common.edit")}
                    onClick={() => onEdit(subscription.id)}
                  >
                    <Pencil />
                  </Button>
                  {isManualRenewEligible(subscription) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRenew(subscription.id)}
                    >
                      <RotateCw />
                      {t("subscription.renew")}
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("subscription.moreActions")}
                        title={t("subscription.moreActions")}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(subscription.id)}>
                        {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onClone(subscription.id)}
                      >
                        {t("subscription.copy")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onAddToCalendar(subscription.id)}
                      >
                        {t("subscription.addToCalendar")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onTogglePinned(subscription.id)}
                      >
                        {t(
                          subscription.pinned
                            ? "subscription.unpin"
                            : "subscription.pin",
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onTogglePublicHidden(subscription.id)}
                      >
                        {t(
                          subscription.publicHidden
                            ? "subscription.publicShow"
                            : "subscription.publicHide",
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingId(subscription.id)}
                      >
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AlertDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("subscription.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("subscription.deleteDescription", {
                name: deleting?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) onDelete(deletingId);
                setDeletingId(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
