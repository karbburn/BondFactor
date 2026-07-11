import { Cashflow } from "./types";

export function subtractMonths(dt: Date, months: number): Date {
  const year = dt.getFullYear();
  const month = dt.getMonth(); // 0-indexed
  const day = dt.getDate();
  
  const targetMonthTotal = year * 12 + month - months;
  const targetYear = Math.floor(targetMonthTotal / 12);
  const targetMonth = targetMonthTotal % 12;
  
  // Get last day of target year and month
  const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(day, maxDays);
  
  return new Date(targetYear, targetMonth, targetDay);
}

export function generateCouponDates(
  issueDate: Date, 
  maturityDate: Date, 
  couponFrequency: number = 2
): Date[] {
  const dates: Date[] = [];
  const monthsPerPeriod = 12 / couponFrequency;
  let k = 0;
  
  while (true) {
    const dt = subtractMonths(maturityDate, k * monthsPerPeriod);
    dates.push(dt);
    if (dt.getTime() <= issueDate.getTime()) {
      break;
    }
    k++;
  }
  
  dates.reverse();
  return dates;
}

export function generateCashflows(
  issueDate: Date,
  maturityDate: Date,
  couponRate: number,
  couponFrequency: number = 2,
  faceValue: number = 100.0
): Cashflow[] {
  const dates = generateCouponDates(issueDate, maturityDate, couponFrequency);
  if (dates.length < 2) {
    return [{ date: maturityDate, amount: faceValue, type: "redemption" }];
  }
  
  const cashflows: Cashflow[] = [];
  const regularCoupon = faceValue * (couponRate / 100.0) / couponFrequency;
  
  for (let i = 1; i < dates.length; i++) {
    const payDate = dates[i];
    let amount = regularCoupon;
    
    if (i === 1) {
      const t0 = dates[0];
      const t1 = dates[1];
      if (issueDate.getTime() > t0.getTime()) {
        const periodDays = Math.round((t1.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24));
        const accruedDays = Math.round((t1.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
        amount = periodDays > 0 ? regularCoupon * (accruedDays / periodDays) : 0.0;
      }
    }
    
    const isLast = (i === dates.length - 1);
    if (isLast) {
      cashflows.push({
        date: payDate,
        amount: amount + faceValue,
        type: "both"
      });
    } else {
      cashflows.push({
        date: payDate,
        amount: amount,
        type: "coupon"
      });
    }
  }
  
  return cashflows;
}
