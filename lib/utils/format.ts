export const formatCurrency = (val: number) => {
  if (!isFinite(val)) return 'ERR';
  if (val === 0) return '₹ 0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}\u20B9 ${(abs / 10000000).toFixed(4)} Cr`;
  return `${sign}\u20B9 ${(abs / 100000).toFixed(2)} L`;
};
