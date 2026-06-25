// Strips PDF artifact unit-stamps and tidies highlight prose.
// Idempotent: running on already-clean text is a no-op.
export function cleanHighlight(text: string | null | undefined): string {
  if (!text) return (text ?? "") as string;
  let cleaned = String(text)
    .replace(/^SITE\s*#?\s*\d{3,6}\s*(PANEL\s*)?/i, "")
    .replace(/^[A-Z]{0,4}[-\u2010-\u2015\u2212]\d{4,6}[A-Z]?\s*(PANEL\s*)?/i, "")
    .replace(/^#?\d{4,6}\s*(PANEL\s*)?/i, "")
    .replace(/^PANEL\s+/i, "")
    .trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  cleaned = cleaned.replace(/\s*\.\.\.\s*$/, "").trim();
  return cleaned;
}
