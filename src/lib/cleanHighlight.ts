// Strips PDF artifact unit-stamps and tidies highlight prose.
// Idempotent: running on already-clean text is a no-op.
// Returns "" when the input is just spec labels (City:/County:/State:/Geopath/
// Latitude/Longitude/Direction Facing/Hours of Illumination) or a unit-number +
// format stub — those must never surface as a client-facing highlight.
export function cleanHighlight(text: string | null | undefined): string {
  if (!text) return "";
  let cleaned = String(text)
    // Leading artifacts
    .replace(/^SITE\s*#?\s*\d{3,6}\s*(PANEL\s*)?/i, "")
    .replace(/^[A-Z]{0,4}[-\u2010-\u2015\u2212]\d{4,6}[A-Z]?\s*(PANEL\s*)?/i, "")
    .replace(/^#?\d{4,6}\s*(PANEL\s*)?/i, "")
    .replace(/^PANEL\s+/i, "")
    .trim();

  // Mid-text unit stamps: truncate at "...SITE # 18280 PANEL Spa..." → "..."
  cleaned = cleaned.replace(/\s*SITE\s*#\s*\d{3,6}.*$/i, "").trim();
  // " Panel <digits>..." tail; lookbehind protects words like "DePaul".
  cleaned = cleaned.replace(/(?<![a-zA-Z])\s+Panel\s+\d.*$/i, "").trim();
  cleaned = cleaned.replace(/(?<![a-zA-Z])\s+Panel\s+Dimension.*$/i, "").trim();
  cleaned = cleaned.replace(/\s+Panel\.?\.?\.?$/i, "").trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  cleaned = cleaned.replace(/\s*\.\.\.\s*$/, "").trim();

  // Reject spec-label dumps (Adams-style scraped labels, no marketing prose).
  const SPEC_LABEL_PATTERNS: RegExp[] = [
    /\bCity\s*:/i,
    /\bCounty\s*:/i,
    /\bState\s*:/i,
    /\bGeopath\b/i,
    /\bLatitude\b/i,
    /\bLongitude\b/i,
    /\bDirection\s+Facing\b/i,
    /\bHours\s+of\s+Illumination\b/i,
  ];
  if (SPEC_LABEL_PATTERNS.some((re) => re.test(cleaned))) return "";

  // Reject unit-number + format stubs like "BUL89W - Digital" or "12345 Bulletin".
  if (/^[A-Z0-9\-]{3,10}\s*[-–—]?\s*(Digital|Bulletin|Poster|Junior|Spectacular|Wallscape|Static)\s*$/i.test(cleaned)) {
    return "";
  }

  // Must contain at least one sentence-like structure (a lowercase word) —
  // pure Title Case label soup ("Garrett DeKalb Indiana") is rejected.
  if (!/[a-z]{3,}\s+[a-z]{2,}/.test(cleaned)) return "";

  return cleaned;
}
