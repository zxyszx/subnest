import { assertDateOnly } from "@/lib/time/date-only";
import { describe, expect, it } from "vitest";
import type { SubscriptionCollectionItem } from "@/types/subscription";
import { renewalWindow, serviceDays, serviceProgress, nextMonth } from "./expense-service-model";
const service=(overrides:Partial<SubscriptionCollectionItem>={}) => ({id:'s',name:'Service',status:'active',billingCycle:'monthly',nextBillingDate:assertDateOnly('2026-12-01'),startDate:'2026-11-01',...overrides}) as SubscriptionCollectionItem;
describe('expense service forecasts',()=>{
 it('excludes paused, cancelled, buyout, expired dates and terms without recurring charges',()=>{
  const rows=[service(),service({status:'paused'}),service({status:'cancelled'}),service({billingCycle:'one-time',oneTimeTermCount:undefined}),service({nextBillingDate:assertDateOnly('2026-11-01')}),service({nextBillingDate:assertDateOnly('2027-01-01')})];
  expect(renewalWindow(rows,'2026-11-23',30)).toEqual([rows[0]]);
  expect(serviceDays(service({billingCycle:'one-time',oneTimeTermCount:undefined}),'2026-11-23')).toBeNull();
 });
 it('uses date-only windows across months and bounds recorded term progress',()=>{
  expect(nextMonth('2026-12-31')).toBe('2027-01');
  expect(serviceProgress(service(),'2026-11-16')).toBe(50);
  expect(serviceProgress(service(),'2027-01-01')).toBe(100);
  expect(serviceProgress(service({startDate:null}),'2026-11-23')).toBeNull();
  expect(renewalWindow([service({nextBillingDate:assertDateOnly('2026-11-23')})],'2026-11-23',0)).toHaveLength(1);
 });
});
