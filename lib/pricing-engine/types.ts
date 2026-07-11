export interface NSSParameters {
  beta0: number;
  beta1: number;
  beta2: number;
  beta3: number;
  tau1: number;
  tau2: number;
}

export interface Cashflow {
  date: Date;
  amount: number;
  type: "coupon" | "redemption" | "both";
}
