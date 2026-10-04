export const MAX_PRICE_TOMAN = 1_000_000_000;
export const MIN_DISCOUNT_PERCENT = 1;
export const MAX_DISCOUNT_PERCENT = 90;

/**
 * Discount percent in effect on a Tehran local date, or null. The range includes the whole last day;
 * comparing ISO dates as strings is exact.
 */
export function activeDiscountPercent(
  discount: { percent: number; startDate: string; endDate: string } | null,
  today: string,
): number | null {
  return discount && discount.startDate <= today && today <= discount.endDate ? discount.percent : null;
}

/** Price the customer pays on `today`. */
export function priceOn(price: number, discount: Parameters<typeof activeDiscountPercent>[0], today: string): number {
  const percent = activeDiscountPercent(discount, today);
  return percent === null ? price : discountedPrice(price, percent);
}

/** Discounted price in Toman: price × (100 − percent) / 100, rounded to the nearest 1,000 Toman. */
export function discountedPrice(price: number, percent: number): number {
  if (!Number.isSafeInteger(price) || price < 0 || price > MAX_PRICE_TOMAN) {
    throw new RangeError('price must be an integer Toman amount within range');
  }
  if (!Number.isInteger(percent) || percent < MIN_DISCOUNT_PERCENT || percent > MAX_DISCOUNT_PERCENT) {
    throw new RangeError('percent must be an integer between 1 and 90');
  }
  // price × (100 − percent) stays below 2^53 for MAX_PRICE_TOMAN, so this is exact integer math.
  // Rounding to 1000 must never make a discounted price higher than the original (e.g. 1,600 at 1 %).
  return Math.min(price, Math.round((price * (100 - percent)) / 100_000) * 1000);
}
