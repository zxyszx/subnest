import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CalendarClock, CircleDollarSign, Copy, Eye, EyeOff, KeyRound, Link2, Loader2, Mail, MessageCircle, MessageSquare, Pencil, Phone, ReceiptText, RotateCw, Send, ShoppingBag, UserRound } from "lucide-react";

import { useSharingAccountDetail, useUpdateSharingSeat } from "@/hooks/use-sharing";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettingsEnvelope } from "@/hooks/use-settings";
import { useManagedCurrencyOptions } from "@/hooks/use-managed-currency-options";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { rescaleSharingBillingAmount, SHARING_BILLING_MONTH_PRESETS, sharingExpiryDate, sharingRenewalDates } from "@/lib/sharing-billing";
import { Badge } from "@/components/ui/badge";
import { SharingPaymentSummary } from "@/components/sharing-payment-summary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateOnlyPickerField } from "@/components/date-only-picker-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import type { SharingAccount, SharingSeat, SharingSeatUpdate } from "@renewlet/shared/schemas/sharing";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { sharingService } from "@/services/sharing-service";
import { divideMoney } from "@renewlet/shared/money";
import { getDisplayErrorMessage } from "@/lib/display-error";

const inboxCopy = { copy: "复制验证码链接", copied: "验证码链接已复制", failed: "复制验证码链接失败" };

export type SharingAccountDetailMode = "account" | "seats";

interface SharingAccountDetailDialogProps {
  account: SharingAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: SharingAccountDetailMode;
}

const contactTypes = ["wechat", "telegram", "ns", "xianyu", "email", "phone", "other"] as const;
const seatStatuses = ["active", "vacant", "paused", "archived"] as const;
const billingPresetLabelKeys: Record<(typeof SHARING_BILLING_MONTH_PRESETS)[number], MessageKey> = {
  1: "sharing.monthly",
  3: "sharing.quarterly",
  6: "sharing.semiAnnual",
  12: "sharing.annual",
};
const seatStatusLabelKeys: Record<SharingSeat["status"], MessageKey> = {
  active: "sharing.active",
  vacant: "sharing.vacant",
  paused: "sharing.paused",
  archived: "sharing.archived",
};
const contactTypeLabelKeys: Record<(typeof contactTypes)[number], MessageKey> = {
  wechat: "sharing.wechat",
  telegram: "sharing.telegram",
  ns: "sharing.ns",
  xianyu: "sharing.xianyu",
  email: "sharing.email",
  phone: "sharing.phone",
  other: "sharing.other",
};

function ContactTypeIcon({ type }: { type: string | null | undefined }) {
  const Icon = type === "wechat" ? MessageCircle
    : type === "telegram" ? Send
      : type === "ns" ? MessageSquare
        : type === "xianyu" ? ShoppingBag
          : type === "email" ? Mail
            : type === "phone" ? Phone
              : MessageSquare;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

function statusVariant(status: SharingSeat["status"] | "pending" | "paid") {
  if (status === "active" || status === "paid") return "default" as const;
  if (status === "pending") return "destructive" as const;
  return "secondary" as const;
}

export function SharingAccountDetailDialog({ account, open, onOpenChange, mode = "account" }: SharingAccountDetailDialogProps) {
  const { t, formatCurrency } = useI18n();
  const detailQuery = useSharingAccountDetail(open ? account?.id ?? null : null);
  const settingsQuery = useSettingsEnvelope();
  const { convert } = useExchangeRates(settingsQuery.data?.settings.exchangeRateProvider);
  const defaultCurrency = settingsQuery.data?.settings.defaultCurrency ?? "CNY";
  const [selectedSeat, setSelectedSeat] = useState<SharingSeat | null>(null);
  const [seatDialogMode, setSeatDialogMode] = useState<"edit" | "renew">("edit");
  const [password, setPassword] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const detail = detailQuery.data;
  useEffect(() => {
    setPassword(null);
    setPasswordVisible(false);
    setPasswordLoading(false);
  }, [account?.id, open]);

  const copyValue = async (value: string) => {
    const result = await copyTextToClipboard(value);
    toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed"));
  };
  const readPassword = async () => {
    if (!account?.id) return null;
    if (password !== null) return password;
    setPasswordLoading(true);
    try {
      const value = await sharingService.password(account.id);
      setPassword(value);
      return value;
    } catch {
      toast.error(t("sharing.passwordUnavailable"));
      return null;
    } finally {
      setPasswordLoading(false);
    }
  };
  const copyPassword = async () => {
    const value = await readPassword();
    if (value !== null) await copyValue(value);
  };
  const togglePassword = async () => {
    if (!passwordVisible && password === null) {
      const value = await readPassword();
      if (value === null) return;
    }
    setPasswordVisible((current) => !current);
  };
  const copyAll = async () => {
    if (!detail) return;
    const value = await readPassword();
    if (value === null) return;
    await copyValue(t("sharing.accountCopyTemplate", {
      account: detail.account.loginAccount,
      password: value,
      link: detail.account.verificationLink ?? t("sharing.noVerificationLink"),
    }));
  };
  const convertedTotals = useMemo(() => {
    if (!detail) return null;
    const accountCurrency = detail.account.currency;
    const activeSeats = detail.seats.filter((seat) => seat.status === "active" && seat.monthlyPrice && seat.currency);
    const monthlyRevenue = activeSeats.reduce(
      (total, seat) => total + convert(Number(seat.monthlyPrice), seat.currency ?? accountCurrency, defaultCurrency),
      0,
    );
    const receivables = detail.seats.map((seat) => ({ seat, receivable: seat.currentReceivable })).filter(
      (item): item is { seat: SharingSeat; receivable: NonNullable<SharingSeat["currentReceivable"]> } => Boolean(item.receivable && item.seat.currency),
    );
    const contractedRevenue = receivables.reduce(
      (total, { seat, receivable }) => total + convert(Number(receivable.amount), seat.currency ?? accountCurrency, defaultCurrency),
      0,
    );
    const collectedRevenue = receivables.reduce(
      (total, { seat, receivable }) => total + convert(Number(receivable.paidAmount), seat.currency ?? accountCurrency, defaultCurrency),
      0,
    );
    const outstandingAmount = receivables.reduce((total, { seat, receivable }) => {
      const remaining = Number(receivable.amount) - Number(receivable.paidAmount);
      return total + convert(Math.max(remaining, 0), seat.currency ?? accountCurrency, defaultCurrency);
    }, 0);
    const monthlyProfit = monthlyRevenue - convert(Number(detail.account.monthlyCost), accountCurrency, defaultCurrency);
    return { monthlyRevenue, monthlyProfit, contractedRevenue, collectedRevenue, outstandingAmount };
  }, [convert, defaultCurrency, detail]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          layout="frame"
          className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] max-w-6xl gap-3 overflow-hidden p-4 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:p-5"
          dismissMode="explicit"
          closeLabel={t("sharing.cancel")}
        >
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>{account?.name ?? t("sharing.manageAccount")}</DialogTitle>
            <DialogDescription>{account ? `${account.subscription.name} #${account.accountNumber}` : t("sharing.accountSummary")}</DialogDescription>
          </DialogHeader>

          {detailQuery.isPending ? (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : detailQuery.isError || !detail ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("sharing.loadDetailFailed")}</div>
          ) : (
            <div className={mode === "seats" ? "flex min-h-0 flex-1 flex-col gap-3" : "min-h-0 flex-1 space-y-3 overflow-y-auto"}>
              <section aria-label={t("sharing.accountSummary")} className="grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-5">
                <SummaryMetric label={t("sharing.monthlyRevenue")} value={formatCurrency(convertedTotals?.monthlyRevenue ?? 0, defaultCurrency)} icon={<CircleDollarSign />} />
                <SummaryMetric label={t("sharing.monthlyProfit")} value={formatCurrency(convertedTotals?.monthlyProfit ?? 0, defaultCurrency)} icon={<ReceiptText />} emphasis={(convertedTotals?.monthlyProfit ?? 0) >= 0 ? "positive" : "negative"} />
                <SummaryMetric label={t("sharing.contractedRevenue")} value={formatCurrency(convertedTotals?.contractedRevenue ?? 0, defaultCurrency)} icon={<CalendarClock />} />
                <SummaryMetric label={t("sharing.collectedRevenue")} value={formatCurrency(convertedTotals?.collectedRevenue ?? 0, defaultCurrency)} icon={<CircleDollarSign />} />
                <SummaryMetric label={t("sharing.outstandingAmount")} value={formatCurrency(convertedTotals?.outstandingAmount ?? 0, defaultCurrency)} icon={<ReceiptText />} emphasis={(convertedTotals?.outstandingAmount ?? 0) > 0 ? "negative" : undefined} />
              </section>

              <section aria-label={t("sharing.accountDetails")} className="shrink-0 overflow-hidden rounded-md border">
                <div className="grid items-center gap-x-5 gap-y-3 border-b bg-muted/20 px-3 py-2.5 text-sm sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
                  <AccountDetail label={t("sharing.nextBillingDate")} value={detail.account.nextBillingDate} tabular />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{t("sharing.paymentMethod")}</div>
                    <div className="mt-0.5 truncate font-medium text-foreground"><SharingPaymentSummary paymentMethod={detail.account.paymentMethod} cardLast4={null} />{detail.account.paymentMethod ? null : "-"}</div>
                  </div>
                  <AccountDetail label={t("sharing.cardLast4")} value={detail.account.cardLast4 ? `•••• ${detail.account.cardLast4}` : "-"} tabular />
                  <Button type="button" variant="outline" className="sm:col-span-3 lg:col-span-1" disabled={passwordLoading || !detail.account.hasPassword} onClick={() => void copyAll()}>
                    {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    {t("sharing.copyAll")}
                  </Button>
                </div>
                <div className="grid lg:grid-cols-3 lg:divide-x">
                  <AccountCopyRow
                    icon={<UserRound />}
                    label={t("sharing.loginAccount")}
                    value={detail.account.loginAccount}
                    copyLabel={t("sharing.copyAccount")}
                    onCopy={() => void copyValue(detail.account.loginAccount)}
                  />
                  <AccountCopyRow
                    icon={<KeyRound />}
                    label={t("sharing.password")}
                    value={detail.account.hasPassword ? (passwordVisible && password !== null ? password : "••••••••") : "-"}
                    copyLabel={t("sharing.copyPassword")}
                    onCopy={detail.account.hasPassword ? () => void copyPassword() : undefined}
                    trailing={detail.account.hasPassword ? (
                      <Button type="button" size="icon" variant="ghost" disabled={passwordLoading} aria-label={t(passwordVisible ? "subscription.familySharing.hidePassword" : "subscription.familySharing.showPassword")} onClick={() => void togglePassword()}>
                        {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    ) : undefined}
                  />
                  <AccountCopyRow
                    icon={<Link2 />}
                    label={t("sharing.verificationLink")}
                    value={detail.account.verificationLink ?? "-"}
                    copyLabel={inboxCopy.copy}
                    onCopy={detail.account.verificationLink ? () => void copyValue(detail.account.verificationLink ?? "") : undefined}
                  />
                </div>
              </section>

              {mode === "seats" ? <section className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex shrink-0 items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{t("sharing.seats")}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">{detail.account.occupiedSeats} / {detail.account.capacity}</span>
                </div>
                <div className="hidden min-h-0 flex-1 overflow-auto rounded-md border sm:block">
                  <table className="w-full min-w-200 text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="sticky top-0 bg-muted px-3 py-2 font-medium">{t("sharing.seatNumber")}</th>
                        <th className="sticky top-0 bg-muted px-3 py-2 font-medium">{t("sharing.memberName")}</th>
                        <th className="sticky top-0 bg-muted px-3 py-2 font-medium">{t("sharing.status")}</th>
                        <th className="sticky top-0 bg-muted px-3 py-2 font-medium">{t("sharing.monthlyPrice")}</th>
                        <th className="sticky top-0 bg-muted px-3 py-2 font-medium">{t("sharing.expiresAt")}</th>
                        <th className="sticky top-0 bg-muted px-3 py-2 font-medium">{t("sharing.paymentStatus")}</th>
                        <th className="sticky top-0 bg-muted px-3 py-2 text-right font-medium">{t("sharing.actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.seats.map((seat) => (
                        <tr key={seat.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary font-semibold tabular-nums text-primary-foreground shadow-sm">{seat.seatNumber}</span></td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-foreground">{seat.memberName ?? t("sharing.noMember")}</div>
                            {seat.contact && <button type="button" className="mt-0.5 flex max-w-56 items-center gap-1 truncate text-left text-xs text-muted-foreground hover:text-primary" title={t("sharing.copyContact")} onClick={async () => { const result = await copyTextToClipboard(seat.contact ?? ""); toast[result.ok ? "success" : "error"](result.ok ? t("sharing.copySuccess") : t("sharing.copyFailed")); }}><ContactTypeIcon type={seat.contactType} /><span className="truncate">{seat.contact}</span><Copy className="h-3 w-3 shrink-0" /></button>}
                          </td>
                          <td className="px-3 py-2"><Badge variant={statusVariant(seat.status)}>{t(seatStatusLabelKeys[seat.status])}</Badge></td>
                          <td className="px-3 py-2 tabular-nums">{seat.monthlyPrice && seat.currency ? formatCurrency(Number(seat.monthlyPrice), seat.currency) : "-"}</td>
                          <td className="px-3 py-2 tabular-nums">{seat.expiresAt ?? "-"}</td>
                          <td className="px-3 py-2">
                            {seat.currentReceivable ? <Badge variant={statusVariant(seat.currentReceivable.status === "paid" ? "paid" : "pending")}>{t(seat.currentReceivable.status === "paid" ? "sharing.paid" : "sharing.pending")}</Badge> : "-"}
                          </td>
                          <td className="px-3 py-2 text-right"><div className="flex justify-end gap-2">
                            {seat.status === "active" ? <Button type="button" size="sm" variant="outline" onClick={() => { setSeatDialogMode("renew"); setSelectedSeat(seat); }}><RotateCw />{t("sharing.renewSeat")}</Button> : null}
                            <Button type="button" size="sm" variant="outline" onClick={() => { setSeatDialogMode("edit"); setSelectedSeat(seat); }}><Pencil />{t("sharing.editSeat")}</Button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border sm:hidden">
                  {detail.seats.map((seat) => (
                    <article key={seat.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary font-semibold tabular-nums text-primary-foreground shadow-sm">{seat.seatNumber}</span><span className="text-xs text-muted-foreground">{t("sharing.seatNumber")}</span></div>
                          <div className="mt-1 truncate font-medium text-foreground">{seat.memberName ?? t("sharing.noMember")}</div>
                          {seat.contact && <button type="button" className="mt-0.5 flex max-w-full items-center gap-1 truncate text-left text-xs text-muted-foreground hover:text-primary" title={t("sharing.copyContact")} onClick={async () => { const result = await copyTextToClipboard(seat.contact ?? ""); toast[result.ok ? "success" : "error"](result.ok ? t("sharing.copySuccess") : t("sharing.copyFailed")); }}><ContactTypeIcon type={seat.contactType} /><span className="truncate">{seat.contact}</span><Copy className="h-3 w-3 shrink-0" /></button>}
                        </div>
                        <Badge variant={statusVariant(seat.status)}>{t(seatStatusLabelKeys[seat.status])}</Badge>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div><dt className="text-muted-foreground">{t("sharing.monthlyPrice")}</dt><dd className="mt-0.5 font-medium tabular-nums text-foreground">{seat.monthlyPrice && seat.currency ? formatCurrency(Number(seat.monthlyPrice), seat.currency) : "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{t("sharing.expiresAt")}</dt><dd className="mt-0.5 font-medium tabular-nums text-foreground">{seat.expiresAt ?? "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{t("sharing.paymentStatus")}</dt><dd className="mt-1">{seat.currentReceivable ? <Badge variant={statusVariant(seat.currentReceivable.status === "paid" ? "paid" : "pending")}>{t(seat.currentReceivable.status === "paid" ? "sharing.paid" : "sharing.pending")}</Badge> : "-"}</dd></div>
                      </dl>
                      <div className="grid grid-cols-2 gap-2">
                        {seat.status === "active" ? <Button type="button" size="sm" variant="outline" onClick={() => { setSeatDialogMode("renew"); setSelectedSeat(seat); }}><RotateCw />{t("sharing.renewSeat")}</Button> : <span />}
                        <Button type="button" size="sm" variant="outline" onClick={() => { setSeatDialogMode("edit"); setSelectedSeat(seat); }}><Pencil />{t("sharing.editSeat")}</Button>
                      </div>
                    </article>
                  ))}
                </div>
              </section> : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {mode === "seats" && account ? <SharingSeatDialog account={account} seat={selectedSeat} mode={seatDialogMode} open={Boolean(selectedSeat)} onOpenChange={(nextOpen) => !nextOpen && setSelectedSeat(null)} /> : null}
    </>
  );
}

function SummaryMetric({ label, value, icon, emphasis }: { label: string; value: string; icon: ReactNode; emphasis?: "positive" | "negative" | undefined }) {
  return (
    <div className="flex min-h-16 items-center gap-2.5 border-b px-3 py-2 last:border-b-0 sm:nth-last-[-n+2]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-0.5 whitespace-normal break-words text-sm font-semibold leading-5 tabular-nums ${emphasis === "positive" ? "text-emerald-600 dark:text-emerald-400" : emphasis === "negative" ? "text-destructive" : "text-foreground"}`} title={value}>{value}</div></div>
    </div>
  );
}

function AccountDetail({ label, value, tabular = false }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 truncate font-medium text-foreground ${tabular ? "tabular-nums" : ""}`} title={value}>{value}</div>
    </div>
  );
}

function AccountCopyRow({
  icon,
  label,
  value,
  copyLabel,
  onCopy,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  copyLabel: string;
  onCopy?: (() => void) | undefined;
  trailing?: ReactNode;
}) {
  return (
    <div className="grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b px-3 py-2 last:border-b-0 lg:border-b-0">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 truncate text-sm font-medium text-foreground" title={value}>{value}</div>
      </div>
      <div className="flex items-center gap-1">
        {trailing}
        {onCopy ? (
          <Button type="button" size="icon" variant="ghost" aria-label={copyLabel} title={copyLabel} onClick={onCopy}>
            <Copy className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type SharingSeatDraft = SharingSeatUpdate & { billingAmount: string };

function emptySeatDraft(seat: SharingSeat, mode: "edit" | "renew"): SharingSeatDraft {
  // 新建/未设置周期默认按月收费；已有周期仍完整保留，避免打开编辑时改变金额。
  const billingMonths = seat.billingMonths ?? 1;
  const renewalStartDate = seat.expiresAt ?? seat.startDate ?? "";
  const renewalDates = sharingRenewalDates(renewalStartDate, billingMonths);
  return {
    memberName: seat.memberName ?? "",
    contact: seat.contact ?? "",
    contactType: seat.contactType ?? "",
    monthlyPrice: seat.monthlyPrice ?? "",
    // 本期收费是用户本次实际收款的总额，留空便于直接录入；历史应收仍然回显。
    billingAmount: seat.currentReceivable && Number(seat.currentReceivable.amount) > 0
      ? seat.currentReceivable.amount
      : "",
    currency: seat.currency ?? "CNY",
    billingMonths,
    startDate: mode === "renew" ? renewalDates.startDate : seat.startDate ?? "",
    expiresAt: mode === "renew" ? renewalDates.expiresAt : seat.expiresAt ?? "",
    status: seat.status === "vacant" ? "active" : seat.status,
    paymentStatus: mode === "renew" ? "pending" : seat.currentReceivable?.status === "paid" ? "paid" : "pending",
    notes: seat.notes ?? "",
  };
}

function SharingSeatDialog({ account, seat, mode, open, onOpenChange }: { account: SharingAccount; seat: SharingSeat | null; mode: "edit" | "renew"; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, formatCurrency, locale } = useI18n();
  const { config } = useCustomConfigState();
  const updateSeat = useUpdateSharingSeat(account.id);
  const [draft, setDraft] = useState<SharingSeatDraft | null>(null);
  const [customBillingOpen, setCustomBillingOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<"member" | "amount" | "dates", string>>>({});
  const currencyOptions = useManagedCurrencyOptions({
    currencies: config.currencies,
    includeDisabledCurrent: draft?.currency ?? "CNY",
    locale,
  });

  useEffect(() => {
    setDraft(seat ? emptySeatDraft(seat, mode) : null);
    setCustomBillingOpen(Boolean(seat && !SHARING_BILLING_MONTH_PRESETS.includes((seat.billingMonths ?? 1) as (typeof SHARING_BILLING_MONTH_PRESETS)[number])));
    setValidationErrors({});
  }, [mode, seat]);

  const calculatedReceivable = useMemo(() => {
    if (!draft?.billingAmount) return 0;
    return Number(draft.billingAmount);
  }, [draft]);

  if (!seat || !draft) return null;
  const update = <K extends keyof SharingSeatDraft>(key: K, value: SharingSeatDraft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const updateBillingMonths = (billingMonths: number) => {
    if (!Number.isInteger(billingMonths) || billingMonths < 1 || billingMonths > 120) return;
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        billingMonths,
        billingAmount: rescaleSharingBillingAmount(current.billingAmount, current.billingMonths, billingMonths),
        expiresAt: sharingExpiryDate(current.startDate, billingMonths),
      };
    });
  };
  const updateStartDate = (startDate: string) => setDraft((current) => current ? {
    ...current,
    startDate,
    expiresAt: sharingExpiryDate(startDate, current.billingMonths),
  } : current);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.status !== "vacant") {
      const errors: typeof validationErrors = {};
      if (!draft.memberName.trim()) errors.member = t("sharing.memberRequired");
      if (!draft.billingAmount.trim() || !Number.isFinite(Number(draft.billingAmount)) || Number(draft.billingAmount) < 0) errors.amount = t("sharing.periodChargeRequired");
      if (!draft.startDate || !draft.expiresAt) errors.dates = t("sharing.datesRequired");
      else if (draft.expiresAt < draft.startDate) errors.dates = t("sharing.dateRangeInvalid");
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        toast.error(t("sharing.seatSaveFailed"), { description: Object.values(errors)[0] });
        return;
      }
    }
    setValidationErrors({});
    try {
      const monthlyPrice = draft.billingAmount ? divideMoney(draft.billingAmount, draft.billingMonths) : "";
      await updateSeat.mutateAsync({ seatId: seat.id, input: { ...draft, monthlyPrice } });
      toast.success(t("sharing.seatSaved"));
      onOpenChange(false);
    } catch (error) {
      toast.error(t("sharing.seatSaveFailed"), { description: getDisplayErrorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto bg-card" dismissMode="explicit" closeLabel={t("sharing.cancel")}>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <DialogHeader>
            <DialogTitle>{t(mode === "renew" ? "sharing.renewSeat" : "sharing.editSeat")} #{seat.seatNumber}</DialogTitle>
            <DialogDescription>{mode === "renew" ? t("sharing.renewSeatDescription") : account.name}</DialogDescription>
          </DialogHeader>

          <FormField id="sharing-seat-status" label={t("sharing.status")} description={draft.status === "vacant" ? t("sharing.vacantClearsSeat") : undefined}>
            {(field) => <div id={field.id} aria-describedby={field.describedBy} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {seatStatuses.map((status) => <Button key={status} type="button" variant={draft.status === status ? "default" : "outline"} aria-pressed={draft.status === status} onClick={() => update("status", status)}>{t(seatStatusLabelKeys[status])}</Button>)}
            </div>}
          </FormField>

          {draft.status !== "vacant" ? <>
          <section className="space-y-3 rounded-lg border border-border/80 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4" />{t("sharing.memberDetails")}</div>
            <FormField id="sharing-seat-member" label={t("sharing.memberName")} error={validationErrors.member}>{(field) => <Input className="bg-secondary" id={field.id} name="sharing-member-alias" aria-describedby={field.describedBy} aria-invalid={field.invalid} autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" value={draft.memberName} onChange={(event) => update("memberName", event.target.value)} />}</FormField>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-seat-contact-type" label={t("sharing.contactType")}>{(field) => <Select value={draft.contactType || "other"} onValueChange={(value) => update("contactType", value as SharingSeatUpdate["contactType"])}><SelectTrigger className="bg-secondary" id={field.id} aria-describedby={field.describedBy}><SelectValue /></SelectTrigger><SelectContent>{contactTypes.map((type) => <SelectItem key={type} value={type}><span className="flex items-center gap-2"><ContactTypeIcon type={type} />{t(contactTypeLabelKeys[type])}</span></SelectItem>)}</SelectContent></Select>}</FormField>
              <FormField id="sharing-seat-contact" label={t("sharing.contact")}>{(field) => <Input className="bg-secondary" id={field.id} name="sharing-member-contact" aria-describedby={field.describedBy} autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" value={draft.contact} onChange={(event) => update("contact", event.target.value)} />}</FormField>
            </FormFieldRow>
          </section>

          <section className="space-y-3 rounded-lg border border-border/80 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="h-4 w-4" />{t("sharing.billingDetails")}</div>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-seat-price" label={t("sharing.periodCharge")} error={validationErrors.amount} description={draft.billingAmount ? `${t("sharing.monthlyEquivalent")} ${formatCurrency(Number(divideMoney(draft.billingAmount, draft.billingMonths)), draft.currency)}` : undefined}>{(field) => <Input className="bg-secondary" id={field.id} aria-describedby={field.describedBy} aria-invalid={field.invalid} type="text" inputMode="decimal" value={draft.billingAmount} placeholder={t("sharing.periodChargePlaceholder")} onChange={(event) => update("billingAmount", event.target.value)} />}</FormField>
              <FormField id="sharing-seat-currency" label={t("sharing.currency")}>{(field) => <SearchableSelect id={field.id} aria-describedby={field.describedBy} value={draft.currency} onValueChange={(value) => update("currency", value)} options={currencyOptions} className="bg-secondary" aria-label={t("sharing.currency")} />}</FormField>
            </FormFieldRow>
            <FormField id="sharing-seat-cycle" label={t("sharing.billingCycle")}>
              {(field) => <div id={field.id} aria-describedby={field.describedBy} className="space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {SHARING_BILLING_MONTH_PRESETS.map((months) => (
                    <Button
                      key={months}
                      type="button"
                      className="min-w-0 px-2"
                      variant={!customBillingOpen && draft.billingMonths === months ? "default" : "outline"}
                      aria-pressed={!customBillingOpen && draft.billingMonths === months}
                      onClick={() => {
                        setCustomBillingOpen(false);
                        updateBillingMonths(months);
                      }}
                    >
                      {t(billingPresetLabelKeys[months])}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    className="min-w-0 px-2"
                    variant={customBillingOpen ? "default" : "outline"}
                    aria-pressed={customBillingOpen}
                    onClick={() => setCustomBillingOpen(true)}
                  >
                    {t("sharing.custom")}
                  </Button>
                </div>
                {customBillingOpen ? (
                  <Input
                    className="bg-secondary sm:max-w-44"
                    aria-label={t("sharing.customMonths")}
                    title={t("sharing.customMonths")}
                    type="number"
                    min={1}
                    max={120}
                    value={SHARING_BILLING_MONTH_PRESETS.includes(draft.billingMonths as (typeof SHARING_BILLING_MONTH_PRESETS)[number]) ? "" : draft.billingMonths}
                    placeholder={t("sharing.customMonths")}
                    onChange={(event) => { if (event.target.value !== "") updateBillingMonths(Number(event.target.value)); }}
                  />
                ) : null}
              </div>}
            </FormField>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2" errors={[{ id: "sharing-seat-dates-error", message: validationErrors.dates }]}>
              <FormField id="sharing-seat-start" label={t("sharing.startDate")}>{(field) => <DateOnlyPickerField id={field.id} value={draft.startDate || undefined} onChange={(value) => updateStartDate(value ?? "")} placeholder={t("sharing.startDate")} describedBy={field.describedBy} buttonClassName="bg-secondary" />}</FormField>
              <FormField id="sharing-seat-expiry" label={t("sharing.expiresAt")} description={t("sharing.expiryAutoHint")}>{(field) => <DateOnlyPickerField id={field.id} value={draft.expiresAt || undefined} onChange={(value) => update("expiresAt", value ?? "")} placeholder={t("sharing.expiresAt")} describedBy={field.describedBy} defaultMonth={draft.startDate || undefined} buttonClassName="bg-secondary" />}</FormField>
            </FormFieldRow>
            <FormField id="sharing-seat-payment" label={t("sharing.paymentStatus")}>{(field) => <Select value={draft.paymentStatus} onValueChange={(value) => update("paymentStatus", value as SharingSeatUpdate["paymentStatus"])}><SelectTrigger className="bg-secondary" id={field.id} aria-describedby={field.describedBy}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">{t("sharing.pending")}</SelectItem><SelectItem value="paid">{t("sharing.paid")}</SelectItem></SelectContent></Select>}</FormField>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3 text-sm"><span className="text-muted-foreground">{t("sharing.calculatedReceivable")}</span><strong className="tabular-nums">{formatCurrency(calculatedReceivable, draft.currency)}</strong></div>
          </section>
          </> : null}

          <FormField id="sharing-seat-notes" label={t("sharing.notes")}>{(field) => <Textarea className="bg-secondary" id={field.id} aria-describedby={field.describedBy} value={draft.notes} onChange={(event) => update("notes", event.target.value)} />}</FormField>

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{t("sharing.cancel")}</Button></DialogClose>
            <Button type="submit" disabled={updateSeat.isPending}>{updateSeat.isPending ? t("sharing.saving") : t(mode === "renew" ? "sharing.confirmRenewal" : "sharing.saveSeat")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
