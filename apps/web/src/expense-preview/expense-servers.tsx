import { getEffectiveSubscriptionStatus } from "@/modules/subscriptions/domain/subscription-status";
import { useState } from "react";
import type { SubscriptionCollectionItem } from "@/types/subscription";
import type { SharingAccount, SharingAccountDetail } from "@renewlet/shared/schemas/sharing";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBillingCycleLabel } from "@/lib/subscription-billing";
import { daysBetweenDateOnly } from "@/lib/time/date-only";
import { sharingMonthlyRevenue } from "@/lib/sharing-financials";
import { Panel, Icon } from "./expense-components";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { isRenewableService, nextMonth, renewalWindow, serviceDays, serviceProgress } from "./expense-service-model";

type Props = {
  subscriptions: SubscriptionCollectionItem[];
  accounts: SharingAccount[];
  details: SharingAccountDetail[];
  today: string;
  currency: string;
  convert: (value: number | string, from: string, to: string) => number;
  incomplete: boolean;
};
export function ExpenseServers({subscriptions, accounts, details, today, currency, convert, incomplete}: Props) {
  const {t, locale} = useI18n();
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState("all");
  const [sort,setSort] = useState("due");
  const format = (n: number) => new Intl.NumberFormat(locale,{style:"currency",currency}).format(n);
  const renewals = renewalWindow(subscriptions,today,60);
  const sum = (items: SubscriptionCollectionItem[]) => format(items.reduce((n,s) => n + convert(s.price,s.currency,currency),0));
  const rows = subscriptions.filter(s => {
    const days = serviceDays(s,today);
    return s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (filter === "all" || (filter === "paused" ? s.status === "paused" :
        filter === "expired" ? s.status === "expired" || (days !== null && days < 0 && isRenewableService(s)) :
        days !== null && days >= 0 && days <= Number(filter) && isRenewableService(s)));
  }).sort((a,b) => sort === "name" ? a.name.localeCompare(b.name,locale) :
    sort === "cost" ? convert(b.price,b.currency,currency)-convert(a.price,a.currency,currency) :
    sort === "seats" ? accounts.filter(c=>c.subscription.id===b.id).reduce((n,c)=>n+c.occupiedSeats,0)-accounts.filter(c=>c.subscription.id===a.id).reduce((n,c)=>n+c.occupiedSeats,0) :
    (serviceDays(a,today) ?? Infinity)-(serviceDays(b,today) ?? Infinity));
  const dots = details.flatMap(d => d.seats.flatMap(s => {
    const r=s.currentReceivable;
    if (!r || s.status === "vacant" || s.status === "archived" || Number(r.amount)<=0) return [];
    const span=daysBetweenDateOnly(r.periodStart,r.periodEnd);
    return [{id:s.id,name:`${s.memberName || s.seatNumber} · ${d.account.name}`,
      x:span>0?Math.max(0,Math.min(100,daysBetweenDateOnly(r.periodStart,today)/span*100)):100,
      y:Math.max(0,Math.min(100,Number(r.paidAmount)/Number(r.amount)*100))}];
  }));
  return <>
    <section className="grid halves">
      <Panel title={t("expenseLive.text61")} hint={t("expenseService.scatterHint")}>
        {incomplete ? <p className="empty">{t("expenseLive.text43")}</p> : dots.length ? <>
          <svg className="scatter" viewBox="0 0 600 320" role="img" aria-label={t("expenseService.scatterHint")}>
            <path d="M40 20V280H570 M40 280L570 20" stroke="currentColor" strokeDasharray="4 5" fill="none" opacity=".5"/>
            {[0,25,50,75,100].map(n=><g key={n}><text x={40+n*5.3} y="305" textAnchor="middle" fill="currentColor" fontSize="12">{n}%</text><text x="32" y={284-n*2.6} textAnchor="end" fill="currentColor" fontSize="12">{n}%</text></g>)}
            {dots.map(p=><circle key={p.id} cx={40+p.x*5.3} cy={280-p.y*2.6} r="6" fill="#45c8be"><title>{p.name}: {Math.round(p.x)}% / {Math.round(p.y)}%</title></circle>)}
          </svg>
          <div className="scatter-legend">{dots.map(p=><p key={p.id}>{p.name}<span>{Math.round(p.x)}% / {Math.round(p.y)}%</span></p>)}</div>
        </> : <p className="empty">{t("expenseService.noReceivables")}</p>}
      </Panel>
      <Panel title={t("expenseLive.text62")} hint={t("expenseService.calendarHint")}>
        <div className="timeline service-timeline">{renewals.map(s=><a href="/subscriptions" key={s.id}>
          <b className="name-label"><Icon/>{s.name}</b><span>{s.nextBillingDate} · {s.currency} {s.price}</span>
          <small>{t("expenseService.days",{days:serviceDays(s,today) ?? 0})}</small>
        </a>)}{!renewals.length&&<p className="empty">{t("expenseService.noRenewals")}</p>}</div>
        <div className="totals"><p>{t("expenseService.thisMonth")}<b>{sum(renewals.filter(s=>s.nextBillingDate.slice(0,7)===today.slice(0,7)))}</b></p><p>{t("expenseService.nextMonth")}<b>{sum(renewals.filter(s=>s.nextBillingDate.slice(0,7)===nextMonth(today)))}</b></p></div>
      </Panel>
    </section>
    <Panel title={t("expenseService.all")} hint={t("expenseLive.text64")}>
      <div className="filters">
        <Input aria-label={t("expensePreview.text149")} placeholder={t("expensePreview.text149")} value={query} onChange={e=>setQuery(e.target.value)}/>
        {([['all','expenseLive.text65'],['expired','expenseService.expired'],['7','expenseLive.text23'],['30','expenseService.due30'],['paused','expenseService.paused']] as const).map(([value,key])=><Button key={value} variant={filter===value?'default':'outline'} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{t(key)}</Button>)}
        <label className="service-sort">{t("expenseService.sort")}<select value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="due">{t("expenseLive.text70")}</option><option value="cost">{t("expenseService.price")}</option><option value="seats">{t("expenseLive.text67")}</option><option value="name">{t("expenseService.name")}</option>
        </select></label>
      </div>
      <div className="subscriptions">{rows.map(s=>{
        const cars=accounts.filter(a=>a.subscription.id===s.id), days=serviceDays(s,today),progress=serviceProgress(s,today);
        return <article className="subscription pixel-card" key={s.id}>
          <h3 className="name-label"><Icon/>{s.name}</h3>
          <span className="service-badge">{days===null?t("expenseService.noTerm"):days<0?t("expenseService.overdue",{days:Math.abs(days)}):t("expenseService.days",{days})}</span>
          <p>{t(`status.${getEffectiveSubscriptionStatus(s,today)}`)}</p>
          <p>{t("expenseLive.text34")} · {days===null?'—':s.nextBillingDate}</p>
          <p>{formatBillingCycleLabel(s,locale)}</p>
          {progress!==null&&<><div className="track" role="meter" aria-label={t("expenseService.progress")} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${progress}%`}}/></div><p>{t("expenseService.progress")} {Math.round(progress)}%</p></>}
          <div className="summary"><span>{t("expenseLive.text77")} {cars.length}</span><span>{t("expenseLive.text67")} {cars.reduce((n,a)=>n+a.occupiedSeats,0)} / {cars.reduce((n,a)=>n+a.capacity,0)}</span></div>
          <p>{t("expenseLive.text13")} {format(cars.reduce((n,a)=>n+sharingMonthlyRevenue(a,currency,convert),0))}</p>
          <div className="service-price"><span>{t("expenseService.price")}</span><b>{s.currency} {s.price}</b></div>
          <a className="service-manage" href="/subscriptions">{t("expenseLive.text78")}</a>
        </article>;
      })}</div>{!rows.length&&<p className="empty">{t("expensePreview.text171")}</p>}
    </Panel>
  </>;
}
