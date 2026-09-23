import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CalendarClock, CircleDollarSign, Pencil, ReceiptText, Settings2, UserRound } from "lucide-react";

import { useSharingAccountDetail, useUpdateSharingAccount, useUpdateSharingSeat } from "@/hooks/use-sharing";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { SHARING_BILLING_MONTH_PRESETS, sharingExpiryDate } from "@/lib/sharing-billing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import type { SharingAccount, SharingAccountUpdate, SharingSeat, SharingSeatUpdate } from "@renewlet/shared/schemas/sharing";

interface SharingAccountDetailDialogProps {
  account: SharingAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const contactTypes = ["wechat", "telegram", "email", "phone", "other"] as const;
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
  email: "sharing.email",
  phone: "sharing.phone",
  other: "sharing.other",
};

function statusVariant(status: SharingSeat["status"] | "pending" | "paid") {
  if (status === "active" || status === "paid") return "default" as const;
  if (status === "pending") return "destructive" as const;
  return "secondary" as const;
}

export function SharingAccountDetailDialog({ account, open, onOpenChange }: SharingAccountDetailDialogProps) {
  const { t, formatCurrency } = useI18n();
  const detailQuery = useSharingAccountDetail(open ? account?.id ?? null : null);
  const [selectedSeat, setSelectedSeat] = useState<SharingSeat | null>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const detail = detailQuery.data;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto" dismissMode="explicit" closeLabel={t("sharing.cancel")}>
          <DialogHeader>
            <DialogTitle>{account?.name ?? t("sharing.manageAccount")}</DialogTitle>
            <DialogDescription>{account ? `${account.subscription.name} #${account.accountNumber}` : t("sharing.accountSummary")}</DialogDescription>
          </DialogHeader>

          {detailQuery.isPending ? (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : detailQuery.isError || !detail ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("sharing.loadDetailFailed")}</div>
          ) : (
            <div className="space-y-5">
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setAccountDialogOpen(true)}><Settings2 />{t("sharing.editAccount")}</Button>
              </div>
              <section aria-label={t("sharing.accountSummary")} className="grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-5">
                <SummaryMetric label={t("sharing.monthlyRevenue")} value={formatCurrency(Number(detail.totals.monthlyRevenue), detail.account.currency)} icon={<CircleDollarSign />} />
                <SummaryMetric label={t("sharing.monthlyProfit")} value={formatCurrency(detail.totals.monthlyProfit, detail.account.currency)} icon={<ReceiptText />} emphasis={detail.totals.monthlyProfit >= 0 ? "positive" : "negative"} />
                <SummaryMetric label={t("sharing.contractedRevenue")} value={formatCurrency(Number(detail.totals.contractedRevenue), detail.account.currency)} icon={<CalendarClock />} />
                <SummaryMetric label={t("sharing.collectedRevenue")} value={formatCurrency(Number(detail.totals.collectedRevenue), detail.account.currency)} icon={<CircleDollarSign />} />
                <SummaryMetric label={t("sharing.outstandingAmount")} value={formatCurrency(Number(detail.totals.outstandingAmount), detail.account.currency)} icon={<ReceiptText />} emphasis={Number(detail.totals.outstandingAmount) > 0 ? "negative" : undefined} />
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("sharing.seats")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{detail.account.occupiedSeats} / {detail.account.capacity}</p>
                  </div>
                </div>
                <div className="hidden overflow-x-auto rounded-md border sm:block">
                  <table className="w-full min-w-200 text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">{t("sharing.seatNumber")}</th>
                        <th className="px-4 py-3 font-medium">{t("sharing.memberName")}</th>
                        <th className="px-4 py-3 font-medium">{t("sharing.status")}</th>
                        <th className="px-4 py-3 font-medium">{t("sharing.monthlyPrice")}</th>
                        <th className="px-4 py-3 font-medium">{t("sharing.expiresAt")}</th>
                        <th className="px-4 py-3 font-medium">{t("sharing.paymentStatus")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("sharing.actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.seats.map((seat) => (
                        <tr key={seat.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium tabular-nums">#{seat.seatNumber}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{seat.memberName ?? t("sharing.noMember")}</div>
                            {seat.contact && <div className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{seat.contact}</div>}
                          </td>
                          <td className="px-4 py-3"><Badge variant={statusVariant(seat.status)}>{t(seatStatusLabelKeys[seat.status])}</Badge></td>
                          <td className="px-4 py-3 tabular-nums">{seat.monthlyPrice && seat.currency ? formatCurrency(Number(seat.monthlyPrice), seat.currency) : "-"}</td>
                          <td className="px-4 py-3 tabular-nums">{seat.expiresAt ?? "-"}</td>
                          <td className="px-4 py-3">
                            {seat.currentReceivable ? <Badge variant={statusVariant(seat.currentReceivable.status === "paid" ? "paid" : "pending")}>{t(seat.currentReceivable.status === "paid" ? "sharing.paid" : "sharing.pending")}</Badge> : "-"}
                          </td>
                          <td className="px-4 py-3 text-right"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedSeat(seat)}><Pencil />{t("sharing.editSeat")}</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y rounded-md border sm:hidden">
                  {detail.seats.map((seat) => (
                    <article key={seat.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">{t("sharing.seatNumber")} #{seat.seatNumber}</div>
                          <div className="mt-1 truncate font-medium text-foreground">{seat.memberName ?? t("sharing.noMember")}</div>
                          {seat.contact && <div className="mt-0.5 truncate text-xs text-muted-foreground">{seat.contact}</div>}
                        </div>
                        <Badge variant={statusVariant(seat.status)}>{t(seatStatusLabelKeys[seat.status])}</Badge>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div><dt className="text-muted-foreground">{t("sharing.monthlyPrice")}</dt><dd className="mt-0.5 font-medium tabular-nums text-foreground">{seat.monthlyPrice && seat.currency ? formatCurrency(Number(seat.monthlyPrice), seat.currency) : "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{t("sharing.expiresAt")}</dt><dd className="mt-0.5 font-medium tabular-nums text-foreground">{seat.expiresAt ?? "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{t("sharing.paymentStatus")}</dt><dd className="mt-1">{seat.currentReceivable ? <Badge variant={statusVariant(seat.currentReceivable.status === "paid" ? "paid" : "pending")}>{t(seat.currentReceivable.status === "paid" ? "sharing.paid" : "sharing.pending")}</Badge> : "-"}</dd></div>
                      </dl>
                      <Button className="w-full" type="button" size="sm" variant="outline" onClick={() => setSelectedSeat(seat)}><Pencil />{t("sharing.editSeat")}</Button>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {account && <SharingSeatDialog account={account} seat={selectedSeat} open={Boolean(selectedSeat)} onOpenChange={(nextOpen) => !nextOpen && setSelectedSeat(null)} />}
      {detail && <SharingAccountEditDialog account={detail.account} open={accountDialogOpen} onOpenChange={setAccountDialogOpen} />}
    </>
  );
}

function SummaryMetric({ label, value, icon, emphasis }: { label: string; value: string; icon: ReactNode; emphasis?: "positive" | "negative" | undefined }) {
  return (
    <div className="flex min-h-24 items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:nth-last-[-n+2]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 truncate font-semibold tabular-nums ${emphasis === "positive" ? "text-emerald-600 dark:text-emerald-400" : emphasis === "negative" ? "text-destructive" : "text-foreground"}`}>{value}</div></div>
    </div>
  );
}

function emptySeatDraft(seat: SharingSeat, currency: string): SharingSeatUpdate {
  return {
    memberName: seat.memberName ?? "",
    contact: seat.contact ?? "",
    contactType: seat.contactType ?? "",
    monthlyPrice: seat.monthlyPrice ?? "",
    currency: seat.currency ?? currency,
    billingMonths: seat.billingMonths ?? 3,
    startDate: seat.startDate ?? "",
    expiresAt: seat.expiresAt ?? "",
    status: seat.status === "vacant" ? "active" : seat.status,
    paymentStatus: seat.currentReceivable?.status === "paid" ? "paid" : "pending",
    notes: seat.notes ?? "",
  };
}

function SharingSeatDialog({ account, seat, open, onOpenChange }: { account: SharingAccount; seat: SharingSeat | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, formatCurrency } = useI18n();
  const updateSeat = useUpdateSharingSeat(account.id);
  const [draft, setDraft] = useState<SharingSeatUpdate | null>(null);

  useEffect(() => {
    setDraft(seat ? emptySeatDraft(seat, account.currency) : null);
  }, [account.currency, seat]);

  const calculatedReceivable = useMemo(() => {
    if (!draft?.monthlyPrice) return 0;
    return Number(draft.monthlyPrice) * draft.billingMonths;
  }, [draft]);

  if (!seat || !draft) return null;
  const update = <K extends keyof SharingSeatUpdate>(key: K, value: SharingSeatUpdate[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const updateBillingMonths = (billingMonths: number) => setDraft((current) => current ? {
    ...current,
    billingMonths,
    expiresAt: sharingExpiryDate(current.startDate, billingMonths),
  } : current);
  const updateStartDate = (startDate: string) => setDraft((current) => current ? {
    ...current,
    startDate,
    expiresAt: sharingExpiryDate(startDate, current.billingMonths),
  } : current);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateSeat.mutateAsync({ seatId: seat.id, input: draft });
      toast.success(t("sharing.seatSaved"));
      onOpenChange(false);
    } catch {
      toast.error(t("sharing.seatSaveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto" dismissMode="explicit" closeLabel={t("sharing.cancel")}>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("sharing.editSeat")} #{seat.seatNumber}</DialogTitle>
            <DialogDescription>{account.name}</DialogDescription>
          </DialogHeader>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4" />{t("sharing.memberDetails")}</div>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-seat-status" label={t("sharing.status")}>{(field) => <Select value={draft.status} onValueChange={(value) => update("status", value as SharingSeatUpdate["status"])}><SelectTrigger id={field.id} aria-describedby={field.describedBy}><SelectValue /></SelectTrigger><SelectContent>{seatStatuses.map((status) => <SelectItem key={status} value={status}>{t(seatStatusLabelKeys[status])}</SelectItem>)}</SelectContent></Select>}</FormField>
              <FormField id="sharing-seat-member" label={t("sharing.memberName")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.memberName} onChange={(event) => update("memberName", event.target.value)} required={draft.status !== "vacant"} />}</FormField>
            </FormFieldRow>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-seat-contact-type" label={t("sharing.contactType")}>{(field) => <Select value={draft.contactType || "other"} onValueChange={(value) => update("contactType", value as SharingSeatUpdate["contactType"])}><SelectTrigger id={field.id} aria-describedby={field.describedBy}><SelectValue /></SelectTrigger><SelectContent>{contactTypes.map((type) => <SelectItem key={type} value={type}>{t(contactTypeLabelKeys[type])}</SelectItem>)}</SelectContent></Select>}</FormField>
              <FormField id="sharing-seat-contact" label={t("sharing.contact")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.contact} onChange={(event) => update("contact", event.target.value)} />}</FormField>
            </FormFieldRow>
          </section>

          <section className="space-y-4 border-t pt-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="h-4 w-4" />{t("sharing.billingDetails")}</div>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-seat-price" label={t("sharing.monthlyPrice")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} type="number" min="0" step="0.01" value={draft.monthlyPrice} onChange={(event) => update("monthlyPrice", event.target.value)} required={draft.status !== "vacant"} />}</FormField>
              <FormField id="sharing-seat-currency" label={t("sharing.currency")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} maxLength={3} required />}</FormField>
            </FormFieldRow>
            <FormField id="sharing-seat-cycle" label={t("sharing.billingCycle")}>
              {(field) => <div id={field.id} aria-describedby={field.describedBy} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {SHARING_BILLING_MONTH_PRESETS.map((months) => {
                  return <Button key={months} type="button" variant={draft.billingMonths === months ? "default" : "outline"} aria-pressed={draft.billingMonths === months} onClick={() => updateBillingMonths(months)}>{t(billingPresetLabelKeys[months])}</Button>;
                })}
                <Input aria-label={t("sharing.customMonths")} title={t("sharing.customMonths")} type="number" min={1} max={120} value={SHARING_BILLING_MONTH_PRESETS.includes(draft.billingMonths as (typeof SHARING_BILLING_MONTH_PRESETS)[number]) ? "" : draft.billingMonths} placeholder={t("sharing.customMonths")} onChange={(event) => updateBillingMonths(Number(event.target.value))} />
              </div>}
            </FormField>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-seat-start" label={t("sharing.startDate")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} type="date" value={draft.startDate} onChange={(event) => updateStartDate(event.target.value)} required={draft.status !== "vacant"} />}</FormField>
              <FormField id="sharing-seat-expiry" label={t("sharing.expiresAt")} description={t("sharing.expiryAutoHint")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} type="date" value={draft.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} required={draft.status !== "vacant"} />}</FormField>
            </FormFieldRow>
            <FormField id="sharing-seat-payment" label={t("sharing.paymentStatus")}>{(field) => <Select value={draft.paymentStatus} onValueChange={(value) => update("paymentStatus", value as SharingSeatUpdate["paymentStatus"])}><SelectTrigger id={field.id} aria-describedby={field.describedBy}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">{t("sharing.pending")}</SelectItem><SelectItem value="paid">{t("sharing.paid")}</SelectItem></SelectContent></Select>}</FormField>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3 text-sm"><span className="text-muted-foreground">{t("sharing.calculatedReceivable")}</span><strong className="tabular-nums">{formatCurrency(calculatedReceivable, draft.currency)}</strong></div>
          </section>

          <FormField id="sharing-seat-notes" label={t("sharing.notes")}>{(field) => <Textarea id={field.id} aria-describedby={field.describedBy} value={draft.notes} onChange={(event) => update("notes", event.target.value)} />}</FormField>

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{t("sharing.cancel")}</Button></DialogClose>
            <Button type="submit" disabled={updateSeat.isPending}>{updateSeat.isPending ? t("sharing.saving") : t("sharing.saveSeat")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function accountDraft(account: SharingAccount): SharingAccountUpdate {
  return {
    name: account.name,
    accountNumber: account.accountNumber,
    loginAccount: account.loginAccount,
    password: "",
    verificationLink: account.verificationLink ?? "",
    monthlyCost: account.monthlyCost,
    currency: account.currency,
    nextBillingDate: account.nextBillingDate,
    paymentMethod: account.paymentMethod ?? "",
    cardLast4: account.cardLast4 ?? "",
    status: account.status,
    notes: account.notes ?? "",
  };
}

function SharingAccountEditDialog({ account, open, onOpenChange }: { account: SharingAccount; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const updateAccount = useUpdateSharingAccount(account.id);
  const [draft, setDraft] = useState<SharingAccountUpdate>(() => accountDraft(account));

  useEffect(() => {
    if (open) setDraft(accountDraft(account));
  }, [account, open]);

  const update = <K extends keyof SharingAccountUpdate>(key: K, value: SharingAccountUpdate[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateAccount.mutateAsync(draft);
      toast.success(t("sharing.accountSaved"));
      onOpenChange(false);
    } catch {
      toast.error(t("sharing.accountSaveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto" dismissMode="explicit" closeLabel={t("sharing.cancel")}>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("sharing.editAccount")}</DialogTitle>
            <DialogDescription>{account.subscription.name} #{account.accountNumber}</DialogDescription>
          </DialogHeader>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4" />{t("sharing.accountDetails")}</div>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-edit-name" label={t("sharing.accountName")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.name} onChange={(event) => update("name", event.target.value)} required maxLength={120} />}</FormField>
              <FormField id="sharing-edit-number" label={t("sharing.accountNumber")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} type="number" min={1} value={draft.accountNumber} onChange={(event) => update("accountNumber", Number(event.target.value))} required />}</FormField>
            </FormFieldRow>
            <FormField id="sharing-edit-login" label={t("sharing.loginAccount")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.loginAccount} onChange={(event) => update("loginAccount", event.target.value)} required maxLength={320} autoComplete="username" />}</FormField>
            <FormField id="sharing-edit-password" label={t("sharing.password")} description={t("sharing.passwordKeepHint")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.password} onChange={(event) => update("password", event.target.value)} type="password" maxLength={1024} autoComplete="new-password" />}</FormField>
            <FormField id="sharing-edit-link" label={t("sharing.verificationLink")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.verificationLink} onChange={(event) => update("verificationLink", event.target.value)} type="url" />}</FormField>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-edit-cost" label={t("sharing.monthlyCost")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.monthlyCost} onChange={(event) => update("monthlyCost", event.target.value)} type="number" min="0" step="0.01" required />}</FormField>
              <FormField id="sharing-edit-currency" label={t("sharing.currency")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.currency} readOnly />}</FormField>
            </FormFieldRow>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-edit-renewal" label={t("sharing.nextBillingDate")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.nextBillingDate} onChange={(event) => update("nextBillingDate", event.target.value)} type="date" required />}</FormField>
              <FormField id="sharing-edit-status" label={t("sharing.status")}>{(field) => <Select value={draft.status} onValueChange={(value) => update("status", value as SharingAccountUpdate["status"])}><SelectTrigger id={field.id} aria-describedby={field.describedBy}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t("sharing.active")}</SelectItem><SelectItem value="paused">{t("sharing.paused")}</SelectItem><SelectItem value="archived">{t("sharing.archived")}</SelectItem></SelectContent></Select>}</FormField>
            </FormFieldRow>
            <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
              <FormField id="sharing-edit-payment" label={t("sharing.paymentMethod")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)} maxLength={80} />}</FormField>
              <FormField id="sharing-edit-card" label={t("sharing.cardLast4")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} value={draft.cardLast4} onChange={(event) => update("cardLast4", event.target.value)} maxLength={32} />}</FormField>
            </FormFieldRow>
            <FormField id="sharing-edit-notes" label={t("sharing.notes")}>{(field) => <Textarea id={field.id} aria-describedby={field.describedBy} value={draft.notes} onChange={(event) => update("notes", event.target.value)} maxLength={5000} />}</FormField>
          </section>

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{t("sharing.cancel")}</Button></DialogClose>
            <Button type="submit" disabled={updateAccount.isPending}>{updateAccount.isPending ? t("sharing.saving") : t("sharing.saveAccount")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
