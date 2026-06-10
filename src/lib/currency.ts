/**
 * Launch currency — India-first, so INR everywhere. `priceCents` columns
 * hold paise (both are 1/100 of the major unit, so no data migration).
 * The international phase makes currency per-order (`Order.currency`
 * already exists per-row); until then this is the single switch.
 *
 * Client-safe: no env import (NEXT_PUBLIC_ plumbing isn't worth it for a
 * constant that changes once, at the international-launch boundary).
 */
export const CURRENCY = {
  code: "inr",
  symbol: "₹",
  locale: "en-IN",
} as const;

/**
 * Course-price display: "Free" for 0, whole rupees with en-IN grouping
 * otherwise (₹1,49,900-style lakh separators above ₹99,999).
 */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `${CURRENCY.symbol}${(cents / 100).toLocaleString(CURRENCY.locale, {
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Money amounts that are never "Free" — fees, earnings, payouts,
 * receipts. Always 2 decimal places.
 */
export function formatMoney(cents: number): string {
  return `${CURRENCY.symbol}${(cents / 100).toLocaleString(CURRENCY.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
