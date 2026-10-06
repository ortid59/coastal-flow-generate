/**
 * Parse a money/number entry typed into an editable grid cell.
 *
 * Tolerates the way rates are actually typed ("$7,200", " 7200 "). Returns
 * null for a blank entry (clears the field) and `undefined` for anything that
 * is not a number, which the cell treats as "reject and stay open" rather than
 * writing a bad value to the row.
 */
export const parseNumber = (text: string): number | null | undefined => {
  const t = text.replace(/[$,\s]/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
