/** Shared display formatters for impressions, money, etc. */

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));

export const fmtMoney = (n: number | null | undefined): string =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);

/** "149K impr/wk" — short label for index chips. */
export const fmtCompactImpressions = (n: number | null | undefined): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M impr/wk`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K impr/wk`;
  return `${n} impr/wk`;
};

/** "$960 flight total" — short label for index chips. */
export const fmtRateShort = (n: number | null | undefined): string =>
  n == null ? "—" : `${fmtMoney(n)} flight total`;

/** Dynamic flight-rate label based on # of 4-week periods, e.g. "2-Week Rate". */
export const flightWeeks = (fourWeekPeriods: number | null | undefined): number => {
  const p = fourWeekPeriods && fourWeekPeriods > 0 ? fourWeekPeriods : 1;
  return Math.max(1, Math.round(p * 4));
};

export const flightRateLabel = (fourWeekPeriods: number | null | undefined): string =>
  `${flightWeeks(fourWeekPeriods)}-Week Rate`;

export const flightRateValue = (
  negotiatedRate4wk: number | null | undefined,
  marginMult: number,
  fourWeekPeriods: number | null | undefined,
): number => {
  const p = fourWeekPeriods && fourWeekPeriods > 0 ? fourWeekPeriods : 1;
  return (negotiatedRate4wk ?? 0) * marginMult * p;
};

export const flightImpressionsLabel = (fourWeekPeriods: number | null | undefined): string =>
  `${flightWeeks(fourWeekPeriods)}-Week Impressions`;

export const flightImpressionsValue = (
  fourWeekImpressions: number | null | undefined,
  fourWeekPeriods: number | null | undefined,
): number => {
  const p = fourWeekPeriods && fourWeekPeriods > 0 ? fourWeekPeriods : 1;
  return Math.round((fourWeekImpressions ?? 0) * p);
};


/** "Production: Included" when 0/null, "Production: $672" otherwise. */
export const fmtCostLine = (label: string, n: number | null | undefined): string => {
  if (n == null || n === 0) return `${label}: Included`;
  return `${label}: ${fmtMoney(n)}`;
};
