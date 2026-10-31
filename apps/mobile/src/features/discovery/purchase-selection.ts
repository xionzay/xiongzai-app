/** A UI quantity is only a preview input; the order API still validates it. */
export function parsePurchaseQuantity(value: string | undefined): number {
  return value && /^(?:[1-9]|1\d|20)$/.test(value) ? Number(value) : 1;
}

export function selectionSubtotal(priceCent: string, quantity: number): string {
  if (!/^\d+$/.test(priceCent) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Invalid purchase selection');
  return (BigInt(priceCent) * BigInt(quantity)).toString();
}
