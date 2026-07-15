import { generateCouponDates } from "./cashflow";

export const COUPON_FREQUENCY = 2;
export const DAY_COUNT = "ACT/ACT";
export const SETTLEMENT_DAYS = 1;

export function getSettlementDate(tradeDate: Date): Date {
  const date = new Date(tradeDate.getTime());
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  
  if (day === 5) { // Friday trade -> settles Monday (T+3)
    date.setDate(date.getDate() + 3);
  } else if (day === 6) { // Saturday trade -> settles Monday (T+2)
    date.setDate(date.getDate() + 2);
  } else if (day === 0) { // Sunday trade -> settles Tuesday (T+2)
    date.setDate(date.getDate() + 2);
  } else { // Mon-Thu trade -> settles next business day (T+1)
    date.setDate(date.getDate() + 1);
  }
  return date;
}

export function calculateAccruedInterest(
  settlementDate: Date,
  issueDate: Date,
  maturityDate: Date,
  couponRate: number,
  couponFrequency: number = 2,
  faceValue: number = 100.0
): number {
  if (settlementDate.getTime() <= issueDate.getTime()) {
    return 0.0;
  }
  if (settlementDate.getTime() >= maturityDate.getTime()) {
    return 0.0;
  }

  const dates = generateCouponDates(issueDate, maturityDate, couponFrequency);
  
  let activeIdx = -1;
  for (let i = 0; i < dates.length - 1; i++) {
    const periodStart = i === 0 ? issueDate : dates[i];
    const periodEnd = dates[i + 1];
    
    if (settlementDate.getTime() >= periodStart.getTime() && settlementDate.getTime() < periodEnd.getTime()) {
      activeIdx = i;
      break;
    }
  }

  if (activeIdx === -1) {
    return 0.0;
  }

  const tStart = dates[activeIdx];
  const tEnd = dates[activeIdx + 1];
  
  const periodDays = Math.round((tEnd.getTime() - tStart.getTime()) / (1000 * 60 * 60 * 24));
  if (periodDays === 0) {
    return 0.0;
  }

  const accrualStart = activeIdx === 0 ? issueDate : tStart;
  const accruedDays = Math.round((settlementDate.getTime() - accrualStart.getTime()) / (1000 * 60 * 60 * 24));
  
  const couponPayment = faceValue * (couponRate / 100.0) / couponFrequency;
  return couponPayment * (accruedDays / periodDays);
}
