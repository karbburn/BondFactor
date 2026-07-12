export const formatCurrency = (val: number) => {
  if (val >= 10000000) return `\u20B9 ${(val / 10000000).toFixed(4)} Cr`;
  return `\u20B9 ${(val / 100000).toFixed(2)} L`;
};
