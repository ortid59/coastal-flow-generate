/**
 * Convert a verbose vendor location_description into a clean,
 * client-friendly short address string.
 *
 * Vendor format examples:
 *   "Phillips Hwy WS 700ft S/O Baymeadows Road F/N - 1"
 *   "I-295 N/B 0.5mi E/O San Jose Blvd F/N"
 *   "Beach Blvd ES 200ft N/O Hodges Blvd"
 *
 * Returns: "Phillips Hwy, near Baymeadows Rd"
 */

const ROAD_SUFFIX_FIX: Record<string, string> = {
  road: "Rd",
  rd: "Rd",
  street: "St",
  st: "St",
  avenue: "Ave",
  ave: "Ave",
  boulevard: "Blvd",
  blvd: "Blvd",
  highway: "Hwy",
  hwy: "Hwy",
  parkway: "Pkwy",
  pkwy: "Pkwy",
  drive: "Dr",
  dr: "Dr",
  lane: "Ln",
  ln: "Ln",
  expressway: "Expy",
  expy: "Expy",
  turnpike: "Tpke",
  tpke: "Tpke",
};

function tidyRoad(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word, i, arr) => {
      const isLast = i === arr.length - 1;
      const lower = word.toLowerCase().replace(/[.,]/g, "");
      if (isLast && ROAD_SUFFIX_FIX[lower]) return ROAD_SUFFIX_FIX[lower];
      // Keep highway designators like "I-295", "US-1", "SR-9A" uppercased
      if (/^(i|us|sr|cr|fl)-\d+/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Strip directional / facing tokens that follow the street name.
 * Common vendor codes:
 *  WS / NS / ES / SS  → side of street
 *  N/B S/B E/B W/B    → bound
 *  F/N F/S F/E F/W    → facing
 *  LHR / RHR          → read-side
 */
const DIRECTIONAL_RE =
  /\b(WS|NS|ES|SS|N\/B|S\/B|E\/B|W\/B|F\/N|F\/S|F\/E|F\/W|LHR|RHR|NB|SB|EB|WB)\b/i;

export function parseShortAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();

  // 1. Street = everything before the first directional token (or before a "###ft/mi" marker)
  let street = cleaned;
  const dirMatch = cleaned.match(DIRECTIONAL_RE);
  const distMatch = cleaned.match(/\b\d+(?:\.\d+)?\s*(?:ft|mi|m|miles|feet)\b/i);
  const cuts: number[] = [];
  if (dirMatch?.index != null) cuts.push(dirMatch.index);
  if (distMatch?.index != null) cuts.push(distMatch.index);
  if (cuts.length > 0) {
    street = cleaned.slice(0, Math.min(...cuts)).trim();
  }
  // Fallback: if street is empty, take first 3 words
  if (!street) street = cleaned.split(" ").slice(0, 3).join(" ");

  // 2. Landmark/cross-street = part after N/O, S/O, E/O, W/O (or "near"/"at")
  let landmark = "";
  const crossMatch = cleaned.match(/\b[NSEW]\/O\b\s+(.+?)(?:\s+(?:F\/[NSEW]|LHR|RHR|-|–|\d+\s*(?:ft|mi))|$)/i);
  if (crossMatch) {
    landmark = crossMatch[1].trim();
  } else {
    const nearMatch = cleaned.match(/\b(?:near|at|@|by)\s+(.+?)(?:\s+(?:F\/[NSEW]|LHR|RHR|-|–)|$)/i);
    if (nearMatch) landmark = nearMatch[1].trim();
  }
  // Strip trailing punctuation
  landmark = landmark.replace(/[\s,–-]+\d+\s*$/, "").trim();
  landmark = landmark.replace(/[,;].*$/, "").trim();

  const tidyStreet = tidyRoad(street);
  if (!landmark) return tidyStreet;
  return `${tidyStreet}, near ${tidyRoad(landmark)}`;
}
