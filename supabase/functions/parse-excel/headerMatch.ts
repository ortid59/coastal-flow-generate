// Header normalization + the fuzzy header matcher.
//
// Split out of index.ts so it can be unit-tested from the Vite side
// (src/test/headerMatch.test.ts). Keep this file dependency-free so it stays
// importable by both Deno (the edge function) and vitest.

// Normalize: strip surrounding whitespace, collapse internal whitespace
// (including embedded newlines), unify hyphens & non-breaking spaces, lowercase.
export const norm = (s: string) =>
  s
    .replace(/ /g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Fuzzy fallback for headers that don't match an exact dictionary key.
// PRIORITY ORDER is critical: a header containing "total" NEVER maps to a
// rate field; "negotiated" beats "rate card" beats "net rate".
export function fuzzyFieldFor(headerNorm: string): string | null {
  const h = headerNorm;
  const hasTotal = h.includes("total");
  if (!hasTotal && h.includes("proposed price")) return "negotiated_rate_4wk";
  if (!hasTotal && h.includes("negotiated")) return "negotiated_rate_4wk";
  if (!hasTotal && h.includes("rate card")) return "rate_card_4wk";
  if (!hasTotal && h.includes("net rate")) return "negotiated_rate_4wk";
  if (!hasTotal && h.includes("net media cost")) return "negotiated_rate_4wk";
  if (hasTotal && (h.includes("cost") || h.includes("investment") || h.includes("gross") || /\btotal\b/.test(h))) return "total_cost";
  if (h.includes("internal") && (h.includes("week") || h.includes("wk"))) return "rate_4week";
  if (h.includes("production")) return "production_cost";
  if (/\binstall/.test(h)) return "install_cost";
  if (/\bcpm\b/.test(h)) return "cpm";

  // Impressions only from an explicit impression header. Audience/traffic
  // counts ("Avg. Monthly Passenger Stats", "Daily Traffic") are NOT
  // impressions and must never land here.
  const isImpr = h.includes("impression") || /\bimp\b/.test(h) || h.includes("a18+") || h.includes("18+");
  if (isImpr) {
    if ((h.includes("4") || h.includes("four")) && (h.includes("week") || h.includes("wk"))) return "four_week_impressions";
    if (h.includes("week") || h.includes("wk") || h.includes("weekly")) return "weekly_impressions";
  }

  // Structural columns. Vendors phrase these a dozen ways; match on intent so
  // a new media owner's sheet parses without anyone adding a dictionary entry.
  if (/\b(unit|panel|inventory|site|frame|asset)\b/.test(h) && /(#|\bno\b|num|number|\bid\b|code)/.test(h)) return "unit_number";
  if (/\bqty\b/.test(h) || h.includes("quantity") || /#\s*of\s*(units|panels|screens|faces|displays)/.test(h)) return "unit_count";
  if (h.includes("size") || h.includes("dimension") || /\bh\s*x\s*w\b/.test(h)) return "size";
  // \bmarket\b, not includes("market") — "Rationale / Marketing Description"
  // is prose, not a market column.
  if (/\bmarket\b/.test(h) || /\bdma\b/.test(h)) return "market";
  if (h.includes("environment") || h.includes("media type") || h.includes("product type") || /\bformat\b/.test(h)) return "format";
  if (h.includes("location") && h.includes("descri")) return "location_description";
  if (h.includes("spot length") || h.includes("spot len")) return "spot_length";
  if (/\bsov\b/.test(h) || h.includes("share of voice")) return "sov_pct";
  if (h.includes("loop")) return "loop_length";
  if (/\bfacing\b/.test(h)) return "facing";
  if (h.includes("latitude")) return "latitude";
  if (h.includes("longitude")) return "longitude";

  return null;
}
