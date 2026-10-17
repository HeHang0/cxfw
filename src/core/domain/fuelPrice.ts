import type { FuelPriceQuote } from '../contracts/FuelPriceDataSource';
import { round } from './numbers';

export const FUEL_GRADES = ['0#', '89#', '92#', '95#', '98#'] as const;
export type FuelGrade = (typeof FUEL_GRADES)[number];

const PREMIUM_98_MARKUP = 2;

/** 取各标号油价；98# 接口未提供时按 95# + 2 元/L 估算。 */
export function priceForGrade(
  quote: FuelPriceQuote | null,
  grade: FuelGrade
): number | null {
  if (!quote) return null;
  if (grade === '0#') return quote.p0;
  if (grade === '89#') return quote.p89;
  if (grade === '92#') return quote.p92;
  if (grade === '95#') return quote.p95;
  return quote.p95 === null ? null : round(quote.p95 + PREMIUM_98_MARKUP, 2);
}
