import type { SubscriptionCollectionItem } from "@/types/subscription";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
import { useI18n } from "@/i18n/I18nProvider";
import { addDateOnly } from "@/lib/time/date-only";
import { sharingMonthlyRevenue } from "@/lib/sharing-financials";
import { renewalWindow } from "./expense-service-model";
import { Panel } from "./expense-components";

type Props={subscriptions:SubscriptionCollectionItem[];accounts:SharingAccount[];today:string;currency:string;convert:(amount:number|string,from:string,to:string)=>number};
export function ExpenseCostCharts({subscriptions,accounts,today,currency,convert}:Props) {
 const {t,locale}=useI18n();
 const format=(n:number)=>new Intl.NumberFormat(locale,{style:'currency',currency,maximumFractionDigits:2}).format(n);
 const renewals=renewalWindow(subscriptions,today,29);
 const values=Array.from({length:30},(_,i)=>{
   const date=addDateOnly(today,{days:i});
   return {date,value:renewals.filter(s=>s.nextBillingDate===date).reduce((n,s)=>n+convert(s.price,s.currency,currency),0)};
 });
 const maximum=Math.max(1,...values.map(p=>p.value));
 return <section className="grid wide">
   <Panel title={t('expenseService.forecastTitle')} hint={t('expenseService.forecastHint')}>
     <div className="renewal-chart" role="img" aria-label={t('expenseService.forecastTitle')}>
       <div className="chart-scale"><span>{format(maximum)}</span><span>{format(maximum/2)}</span><span>{format(0)}</span></div>
       <div className="renewal-bars">{values.map(p=><div key={p.date} title={`${p.date} · ${format(p.value)}`}><i style={{height:`${p.value/maximum*100}%`}}/></div>)}</div>
     </div>
     <div className="chart-dates">{[0,7,14,21,29].map(i=><span key={i}>{values[i]?.date.slice(5)}</span>)}</div>
     <p className="notice">{t('expenseService.forecastTotal')} {format(values.reduce((n,p)=>n+p.value,0))}</p>
   </Panel>
   <Panel title={t('expenseService.comparisonTitle')} hint={t('expenseLive.text12')}>
     <div className="ranking cost-comparison">{accounts.map(a=>{
       const income=sharingMonthlyRevenue(a,currency,convert),cost=convert(a.monthlyCost,a.currency,currency),max=Math.max(income,cost,1);
       return <div key={a.id}><p>{a.name}</p><p><span>{t('expenseLive.text74')}</span><b>{format(income)}</b></p><div className="track income"><i style={{width:`${Math.max(0,income)/max*100}%`}}/></div><p><span>{t('expenseLive.text75')}</span><b>{format(cost)}</b></p><div className="track"><i style={{width:`${Math.max(0,cost)/max*100}%`}}/></div></div>;
     })}{!accounts.length&&<p className="empty">{t('expenseService.noPools')}</p>}</div>
   </Panel>
 </section>;
}
