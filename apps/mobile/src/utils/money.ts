export function formatCent(cent: string, currency = "¥"): string {
  if (!/^-?\d+$/u.test(cent)) throw new Error("金额必须是十进制整数分字符串");
  const negative = cent.startsWith("-");
  const raw = negative ? cent.slice(1) : cent;
  const padded = raw.padStart(3, "0");
  const integer = padded.slice(0, -2).replace(/^0+(?=\d)/u, "").replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const fraction = padded.slice(-2);
  return `${negative ? "-" : ""}${currency}${integer}.${fraction}`;
}
