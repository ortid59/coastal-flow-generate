import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Image as ImageIcon,
  ImageOff,
  AlertCircle,
  Share2,
  FileText,
  Eye,
  Upload,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { UnitPhotoUpload } from "@/components/UnitPhotoUpload";
import { UnitMapUpload } from "@/components/UnitMapUpload";
import { SharePortalDialog } from "@/components/SharePortalDialog";
import { ReuploadFilesDialog } from "@/components/ReuploadFilesDialog";
import { CampaignFilesHistory } from "@/components/CampaignFilesHistory";

import { HighlightsCell } from "@/components/HighlightsCell";
import { cleanHighlight } from "@/lib/cleanHighlight";
import { LogoReplace } from "@/components/LogoReplace";
import { Progress } from "@/components/ui/progress";
import { parseShortAddress, displayAddress } from "@/lib/shortAddress";

type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
  proposal_name: string | null;
  client_logo_url: string | null;
  status: string | null;
  markets: string[] | null;
  show_tier_a: boolean | null;
  show_tier_b: boolean | null;
  show_tier_c: boolean | null;
  option_a_start: string | null;
  option_a_end: string | null;
  option_b_start: string | null;
  option_b_end: string | null;
  option_c_start: string | null;
  option_c_end: string | null;
  margin_pct: number | null;
};


type Unit = {
  id: string;
  unit_number: string;
  market: string | null;
  vendor: string | null;
  format: string | null;
  size: string | null;
  location_description: string | null;
  address: string | null;
  insight_bullets: string[] | null;
  highlights: string | null;
  four_week_impressions: number | null;
  total_cost: number | null;
  negotiated_rate_4wk: number | null;
  four_week_periods: number | null;
  cpm: number | null;
  recommended: boolean | null;
  included: boolean | null;
  billboard_photo_url: string | null;
  inset_map_url: string | null;
  low_res_flag: boolean | null;
  latitude: number | null;
  longitude: number | null;
  tier_a: boolean | null;
  tier_b: boolean | null;
  tier_c: boolean | null;
};

type TierKey = "tier_a" | "tier_b" | "tier_c";
type ShowTierKey = "show_tier_a" | "show_tier_b" | "show_tier_c";
type DateKey = "option_a_start" | "option_a_end" | "option_b_start" | "option_b_end" | "option_c_start" | "option_c_end";
const TIERS: { key: TierKey; show: ShowTierKey; label: string; short: string; startField: DateKey; endField: DateKey }[] = [
  { key: "tier_a", show: "show_tier_a", label: "Option A", short: "A", startField: "option_a_start", endField: "option_a_end" },
  { key: "tier_b", show: "show_tier_b", label: "Option B", short: "B", startField: "option_b_start", endField: "option_b_end" },
  { key: "tier_c", show: "show_tier_c", label: "Option C", short: "C", startField: "option_c_start", endField: "option_c_end" },
];

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMoney = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

type ExtractableUnit = {
  id: string;
  unit_number: string | null;
  vendor?: string | null;
  location_description?: string | null;
};

type CropBox = { x: number; y: number; w: number; h: number };
type VendorCropProfile = {
  vendor: string;
  has_inset_map: boolean;
  photo_x: number | null;
  photo_y: number | null;
  photo_w: number | null;
  photo_h: number | null;
  map_x: number | null;
  map_y: number | null;
  map_w: number | null;
  map_h: number | null;
};

const normalizeMatchText = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeVendor = (value: string | null | undefined) =>
  normalizeMatchText(value).replace(/\b(MEDIA|GROUP|LLC|INC|COMPANY|CO)\b/g, "").replace(/\s+/g, " ").trim();

// Parse "Latitude: 41.36638" and "Longitude: -85.1097" from PDF page text and
// match to a vendor unit whose lat/lon are both within ~0.002 absolute diff.
// Returns null if the page has no lat/lon or no unit is within tolerance.
const GEO_TOLERANCE = 0.002;
function matchUnitByGeo(text: string, units: Array<any>): any | null {
  const latM = /Latitude\s*[:\s]\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  const lonM = /Longitude\s*[:\s]\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (!latM || !lonM) return null;
  const lat = parseFloat(latM[1]);
  const lon = parseFloat(lonM[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: any = null;
  let bestDist = Infinity;
  for (const u of units) {
    if (u.latitude == null || u.longitude == null) continue;
    const dLat = Math.abs(u.latitude - lat);
    const dLon = Math.abs(u.longitude - lon);
    if (dLat <= GEO_TOLERANCE && dLon <= GEO_TOLERANCE) {
      const d = dLat + dLon;
      if (d < bestDist) { bestDist = d; best = u; }
    }
  }
  return best;
}

// ---------- Vendor profile registry ----------
type VendorMatchStrategy = "unit_number" | "address" | "order" | "manual" | "district_text" | "unit_number_partial" | "geo";
type VendorCropMode = "single_midband" | "single_left" | "full_bleed" | "photo_plus_map" | "image_regions" | "image_regions_left";
type VendorProfile = {
  matchStrategy: VendorMatchStrategy;
  unitRegex?: string;
  crop?: VendorCropMode;
  hasMap?: boolean;
  mapBox?: CropBox;
  pagesPerUnit?: number;
  skipCoverPages?: number;
  skipUntilFirstPhotoPage?: boolean;
  /** If a unit_number pass yields zero matches, retry the file with the
   *  order strategy. */
  orderFallback?: boolean;
  /** Alternate vendor spellings that also resolve to this profile. */
  aliases?: string[];
  /** Vendor delivers Excel only — no PDF headsheet expected. Suppresses
   *  "no PDF for market" warnings and auto-extraction for its files. */
  excelOnly?: boolean;
};

const VENDOR_PROFILES: Record<string, VendorProfile> = {
  "Alchemy Media": { matchStrategy: "unit_number", unitRegex: "SITE\\s*#\\s*([0-9]{3,6})", crop: "single_midband", hasMap: false, aliases: ["Alchemy"] },
  "Adkom":         { matchStrategy: "unit_number", unitRegex: "(IL[-\\u2010-\\u2015\\u2212][0-9]{4,6})", crop: "image_regions_left", hasMap: false },
  "Tasty Media":   { matchStrategy: "district_text", crop: "full_bleed", hasMap: false },
  "CCO":           { matchStrategy: "unit_number", unitRegex: "\\b(\\d{4,6})\\s*[\\u2013\\u2014-]\\s*[A-Za-z]", crop: "image_regions", hasMap: true, orderFallback: true, skipUntilFirstPhotoPage: true, aliases: ["Clear Channel Outdoor", "Clear Channel", "ClearChannel"] },
  "Lamar":         { matchStrategy: "unit_number", unitRegex: "PANEL\\s*#\\s*(\\d+)", crop: "image_regions", hasMap: true, skipCoverPages: 1, orderFallback: true, aliases: ["Lamar Advertising"] },
  "Adams Outdoor": { matchStrategy: "geo",         crop: "image_regions", hasMap: true, skipCoverPages: 1, orderFallback: true, aliases: ["Adams", "Adams Outdoor Advertising"] },
  "Be Seen":       { matchStrategy: "order",      crop: "full_bleed", hasMap: false, pagesPerUnit: 2, aliases: ["BeSeen", "Be Seen Media"] },
  "OFM":           { matchStrategy: "manual" },
  "New Tradition": { matchStrategy: "unit_number_partial", crop: "full_bleed", hasMap: false, aliases: ["New Tradition Media"] },
  "Orange Barrel": { matchStrategy: "manual", excelOnly: true, aliases: ["Orange Barrel Media", "OBM", "IKE"] },
};

// Generic profile used ONLY when a single-vendor campaign has a file whose
// vendor string doesn't resolve to a registered profile.
const GENERIC_PROFILE: VendorProfile = {
  matchStrategy: "unit_number",
  crop: "image_regions",
  hasMap: true,
  orderFallback: true,
};

const resolveVendorProfile = (vendor: string | null | undefined): VendorProfile | null => {
  if (!vendor) return null;
  const norm = normalizeVendor(vendor);
  if (!norm) return null;
  for (const [name, profile] of Object.entries(VENDOR_PROFILES)) {
    const keys = [name, ...(profile.aliases ?? [])]
      .map((n) => normalizeVendor(n))
      .filter(Boolean) as string[];
    for (const key of keys) {
      if (key === norm || norm.includes(key) || key.includes(norm)) return profile;
    }
  }
  return null;
};


// Pick the vendor identifier + profile for a single PDF file. Resolution
// order (per-file, never guess against the wrong vendor's units):
//   1. file.vendor resolves to a known profile → use it.
//   2. Fuzzy-match file.vendor against the campaign's DISTINCT units.vendor
//      values (normalized bidirectional substring). If exactly one hits and
//      resolves to a profile → use it.
//   3. Campaign has exactly ONE distinct units.vendor → fall back to that
//      dominant vendor (preserves single-vendor behaviour).
//   4. Otherwise return no profile — caller must skip this file. NEVER assign
//      Lamar photos to Alchemy units just because Alchemy is the biggest
//      vendor in the campaign.
function resolveEffectiveVendor<T extends { vendor?: string | null }>(
  fileVendor: string | null | undefined,
  unitsPool: T[],
): { vendor: string | null; profile: VendorProfile | null } {
  // 1. Direct hit off the file's own vendor string.
  const fromFile = resolveVendorProfile(fileVendor);
  if (fromFile) return { vendor: fileVendor ?? null, profile: fromFile };

  // Distinct units.vendor values in this campaign.
  const distinctVendors = Array.from(
    new Set(unitsPool.map((u) => (u.vendor ?? "").trim()).filter(Boolean)),
  );

  // 2. Fuzzy match file.vendor against the distinct units.vendor list.
  const fileNorm = normalizeVendor(fileVendor);
  if (fileNorm) {
    const candidates = distinctVendors.filter((v) => {
      const un = normalizeVendor(v);
      if (!un) return false;
      return un === fileNorm || un.includes(fileNorm) || fileNorm.includes(un);
    });
    if (candidates.length === 1) {
      const p = resolveVendorProfile(candidates[0]);
      if (p) return { vendor: candidates[0], profile: p };
    }
  }

  // 3. Single-vendor campaign → safe to fall back to that dominant vendor.
  if (distinctVendors.length === 1) {
    const only = distinctVendors[0];
    const p = resolveVendorProfile(only);
    return { vendor: only, profile: p };
  }

  // 4. Multi-vendor and no confident match — do NOT guess.
  return { vendor: fileVendor ?? null, profile: null };
}

// Filter unitsPool to those matching effectiveVendor (bidirectional substring
// on normalized strings). Empty target → return the full pool. Otherwise
// return only the matches; callers decide what to do with an empty result.
function filterUnitsForVendor<T extends { vendor?: string | null }>(
  unitsPool: T[],
  effectiveVendor: string | null | undefined,
): T[] {
  const target = normalizeVendor(effectiveVendor);
  if (!target) return unitsPool;
  return unitsPool.filter((u) => {
    const uv = normalizeVendor(u.vendor);
    if (!uv) return true;
    return uv === target || uv.includes(target) || target.includes(uv);
  });
}

// True when the campaign contains exactly one distinct units.vendor. Only in
// that case is it safe to fall back to the full unit pool when the per-vendor
// filter is empty.
function isSingleVendorCampaign<T extends { vendor?: string | null }>(pool: T[]): boolean {
  const distinct = new Set<string>();
  for (const u of pool) {
    const v = (u.vendor ?? "").trim();
    if (v) distinct.add(v);
    if (distinct.size > 1) return false;
  }
  return distinct.size === 1;
}

const normalizeUnitToken = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/^#+/, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim()
    // Strip leading zeros so "003167" and "3167" match. Only strips when the
    // remainder still contains at least one digit — keeps "0" from vanishing.
    .replace(/^0+(?=\d)/, "");


const fuzzyAddressMatch = (pageLine: string, locationDescription: string | null | undefined): boolean => {
  if (!locationDescription) return false;
  const clean = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const a = clean(pageLine);
  const b = clean(locationDescription);
  if (!a || !b) return false;
  // Use first significant chunk of the address (street number + name)
  const streetMatch = b.match(/\b\d{2,6}\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,4}/);
  const needle = streetMatch?.[0] ?? b.split(/\s+/).slice(0, 4).join(" ");
  return needle.length >= 6 && a.includes(needle);
};


const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasBoundedToken = (text: string, token: string) => {
  const normalized = normalizeMatchText(token);
  if (normalized.length < 4) return false;
  return new RegExp(`(^|[^A-Z0-9])${escapeRe(normalized)}([^A-Z0-9]|$)`).test(text);
};

const unitNumberTokens = (unitNumber: string | null | undefined) => {
  const raw = normalizeMatchText(unitNumber);
  const tokens = new Set<string>();
  if (raw) tokens.add(raw);
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 5) {
    tokens.add(digits);
    tokens.add(String(parseInt(digits, 10)));
    if (digits.length < 6) tokens.add(digits.padStart(6, "0"));
  }
  return Array.from(tokens).filter((token) => token && token !== "NAN").sort((a, b) => b.length - a.length);
};

// Per-step timeout is 90s to survive brief tab throttling. Background tabs
// throttle rAF far more aggressively; the visibility gate below stops the
// loop when hidden so this ceiling is only exhausted on a genuinely stuck page.
const EXTRACTION_STEP_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = EXTRACTION_STEP_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isTransientRenderError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("timed out") || msg.includes("upload failed") || msg.includes("network");
}

// Resolve once the tab is visible again. Chrome throttles rAF in background
// tabs, so pdf.js page rendering will exceed our per-page ceiling — pause
// the loop instead of burning pages into guaranteed timeouts.
function waitForVisible(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onVis);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", onVis);
  });
}

const locationTokens = (location: string | null | undefined) => {
  const normalized = normalizeMatchText(location).replace(/[,.();:/]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const tokens = new Set<string>();
  const street = normalized.match(/\b\d{2,6}\s+[A-Z0-9]+(?:\s+[A-Z0-9]+){0,5}\b/);
  if (street?.[0] && street[0].length >= 8) tokens.add(street[0]);
  normalized
    .split(/\s+(?:AND|AT|@|&|E\/O|W\/O|N\/O|S\/O)\s+|\s+-\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 10 && /[A-Z]{3}/.test(part))
    .slice(0, 3)
    .forEach((part) => tokens.add(part));
  return Array.from(tokens).sort((a, b) => b.length - a.length);
};

function findUnitForPage<T extends ExtractableUnit>(text: string, units: T[], fileVendor?: string | null): T | undefined {
  const haystack = normalizeMatchText(text);
  if (!haystack || !units.length) return undefined;

  const targetVendor = normalizeVendor(fileVendor);
  const vendorUnits = targetVendor
    ? units.filter((u) => {
        const unitVendor = normalizeVendor(u.vendor);
        return unitVendor && (unitVendor === targetVendor || unitVendor.includes(targetVendor) || targetVendor.includes(unitVendor));
      })
    : [];
  const pool = vendorUnits.length ? vendorUnits : units;

  const scored = pool
    .map((unit) => {
      let score = 0;
      for (const token of unitNumberTokens(unit.unit_number)) {
        if (hasBoundedToken(haystack, token)) score = Math.max(score, 100 + token.length);
      }
      for (const token of locationTokens(unit.location_description)) {
        if (haystack.includes(token)) score = Math.max(score, 45 + Math.min(25, token.length / 2));
      }
      return { unit, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return undefined;
  const [best, second] = scored;
  if (second && best.score >= 100 && second.score >= 100 && best.score - second.score <= 5) return undefined;
  return best.score >= 45 ? best.unit : undefined;
}

const BOILERPLATE_PATTERNS: RegExp[] = [
  /geopath/i,
  /audience\s+location\s+measurement/i,
  /all\s+rights\s+reserved/i,
  /copyright/i,
  /proprietary/i,
  /source\s*:/i,
  /spot\s+in\s+rotation/i,
  /proposal\s*\/\s*photosheet/i,
];

function stripBoilerplateSentences(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text];
  return sentences
    .filter((sentence) => !BOILERPLATE_PATTERNS.some((re) => re.test(sentence)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHighlightText(items: Array<{ str: string; transform?: number[] }>, rawText?: string) {
  // 1) Prefer the labeled capture: many vendor sheets literally print
  //    "Highlights:" before the descriptive paragraph. Grab everything after
  //    the label up to the next blank paragraph or end of the page text.
  const labeled = (() => {
    const source = (rawText ?? items.map((it) => it.str ?? "").join(" ")).replace(/\r/g, "");
    const m = /highlights\s*[:\-]\s*([\s\S]+)$/i.exec(source);
    if (!m) return "";
    // Stop at the first paragraph break, or trailing common section labels.
    let chunk = m[1];
    const stop = /\n{2,}|\s{5,}(?:additional\s+info|source|geopath|©|copyright|proposal|photo\s*sheet)/i.exec(chunk);
    if (stop) chunk = chunk.slice(0, stop.index);
    return chunk.replace(/\s+/g, " ").trim();
  })();
  if (labeled && labeled.length >= 30) {
    return stripBoilerplateSentences(labeled);
  }

  const lines: { y: number; text: string }[] = [];
  for (const item of items) {
    const text = (item.str ?? "").trim();
    if (!text) continue;
    const y = item.transform?.[5] ?? 0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) < 2) last.text += ` ${text}`;
    else lines.push({ y, text });
  }
  if (!lines.length) return "";
  lines.sort((a, b) => b.y - a.y);

  const gaps = lines.slice(1).map((line, index) => Math.abs(lines[index].y - line.y));
  const medianGap = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 14;
  const paragraphs: string[] = [];
  let current = lines[0].text;
  for (let i = 1; i < lines.length; i++) {
    const gap = Math.abs(lines[i - 1].y - lines[i].y);
    if (gap > medianGap * 1.8) {
      if (current.trim()) paragraphs.push(current.trim());
      current = lines[i].text;
    } else {
      current += ` ${lines[i].text}`;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());

  const bestParagraph = paragraphs
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 45)
    .filter((paragraph) => /[A-Za-z]{3}/.test(paragraph))
    .filter((paragraph) => !/^[\s\d$%.,:/\-]+$/.test(paragraph))
    .filter((paragraph) => !BOILERPLATE_PATTERNS.some((re) => re.test(paragraph)))
    .map((paragraph) => {
      const words = paragraph.split(/\s+/).length;
      const sentences = (paragraph.match(/[.!?]/g) ?? []).length;
      const numericRatio = (paragraph.match(/\d/g)?.length ?? 0) / paragraph.length;
      return { paragraph, score: words + sentences * 5 - numericRatio * 40 };
    })
    .sort((a, b) => b.score - a.score)[0]?.paragraph;

  if (bestParagraph) return stripBoilerplateSentences(bestParagraph);

  const fallbackLine = lines
    .map((line) => line.text.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 30 && line.length <= 220)
    .filter((line) => /[A-Za-z]{3}/.test(line))
    .filter((line) => !BOILERPLATE_PATTERNS.some((re) => re.test(line)))
    .sort((a, b) => b.length - a.length)[0];

  return fallbackLine ? stripBoilerplateSentences(fallbackLine) : "";
}

export default function CampaignReview() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [reparsing, setReparsing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractingHl, setExtractingHl] = useState(false);
  const [extractionPaused, setExtractionPaused] = useState(false);
  // Subscribe to visibility changes so the pause banner shows/hides in sync
  // with the loops' own waitForVisible() gates.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setExtractionPaused(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number; label: string }>({
    current: 0,
    total: 0,
    label: "",
  });
  // Per-PDF extraction summary shown after Extract photos / highlights runs.
  type ExtractionFileSummary = {
    file: string;
    kind: "photos" | "highlights";
    vendor: string | null;
    strategy: string;
    matched: number;
    total: number;
    note?: string;
  };
  const [extractionSummary, setExtractionSummary] = useState<ExtractionFileSummary[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [collapsedVendors, setCollapsedVendors] = useState<Set<string>>(new Set());
  const [vendorCropProfiles, setVendorCropProfiles] = useState<Record<string, VendorCropProfile>>({});
  const [vendorFiles, setVendorFiles] = useState<Array<{ id: string; original_name: string | null; vendor: string | null; kind: string | null }>>([]);
  const detectedVendorCropsRef = useRef<Record<string, { photo: CropBox; map: CropBox | null }>>({});

  const groupedUnits = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const u of units) {
      const key = (u.vendor && u.vendor.trim()) || "Unspecified Vendor";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return Array.from(map.entries()).map(([vendor, list]) => ({ vendor, units: list }));
  }, [units]);

  // Markets that have units but lack any PDF (headsheet) covering them.
  // Heuristic: try to detect a market token in the PDF's original filename.
  // If no PDF filename mentions the market (case-insensitive), warn.
  const uncoveredMarkets = useMemo(() => {
    const pdfs = vendorFiles.filter((f) => f.original_name?.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return [];
    const marketUnitCounts = new Map<string, number>();
    // Track units under excel-only vendors so we don't flag their markets as
    // "uncovered" — those vendors deliver Excel only and get photos via
    // manual upload or Excel-embedded imagery.
    for (const u of units) {
      const m = (u.market ?? "").trim();
      if (!m) continue;
      if (u.billboard_photo_url) continue;
      const vp = resolveVendorProfile(u.vendor);
      if (vp?.excelOnly) continue;
      marketUnitCounts.set(m, (marketUnitCounts.get(m) ?? 0) + 1);
    }
    const out: Array<{ market: string; count: number }> = [];
    for (const [market, count] of marketUnitCounts) {
      const tokens = market
        .split(/[\s,]+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 3 && !/^[a-z]{2}$/.test(t));
      const covered = pdfs.some((f) => {
        const name = (f.original_name ?? "").toLowerCase();
        return tokens.some((t) => name.includes(t));
      });
      if (!covered) out.push({ market, count });
    }
    return out;
  }, [vendorFiles, units]);

  const toggleVendorCollapse = (vendor: string) => {
    setCollapsedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vendor)) next.delete(vendor);
      else next.add(vendor);
      return next;
    });
  };

  const load = async () => {
    if (!id) return;
    const [c, u] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, client_name, campaign_name, proposal_name, client_logo_url, status, markets, show_tier_a, show_tier_b, show_tier_c, option_a_start, option_a_end, option_b_start, option_b_end, option_c_start, option_c_end, margin_pct, show_coverage_map, vendor_overview_map_url")
        .eq("id", id)
        .single(),
      supabase
        .from("units")
        .select(
          "id, unit_number, market, vendor, format, size, location_description, address, insight_bullets, highlights, four_week_impressions, total_cost, negotiated_rate_4wk, four_week_periods, cpm, recommended, included, billboard_photo_url, inset_map_url, low_res_flag, latitude, longitude, tier_a, tier_b, tier_c",
        )
        .eq("campaign_id", id)
        .order("recommended", { ascending: false })
        .order("market", { ascending: true })
        .order("unit_number", { ascending: true }),
    ]);
    if (c.error) toast({ title: "Couldn't load campaign", description: c.error.message, variant: "destructive" });
    else setCampaign(c.data as Campaign);
    if (u.error) toast({ title: "Couldn't load units", description: u.error.message, variant: "destructive" });
    else setUnits((u.data ?? []) as Unit[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load saved vendor crop profiles so we can skip detection on known vendors
  // and surface a "Save crop as default" action in the admin UI.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('vendor_crop_profiles').select('*');
      if (error) return;
      const map: Record<string, VendorCropProfile> = {};
      for (const p of (data ?? []) as VendorCropProfile[]) {
        const key = normalizeVendor(p.vendor);
        if (key) map[key] = p;
      }
      setVendorCropProfiles(map);
    })();
  }, []);

  // Load vendor files so we can warn about markets with no PDF coverage.
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from('vendor_files')
        .select('id, original_name, vendor, kind')
        .eq('campaign_id', id);
      setVendorFiles((data ?? []) as any);
    })();
  }, [id, extracting]);


  // Poll while parsing
  useEffect(() => {
    if (!campaign) return;
    if (campaign.status !== "parsing") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status]);

  // Auto-run photo extraction once parsing finishes (covers initial campaign
  // creation flow, where NewCampaign navigates here while status === "parsing").
  // Resumable auto-extract: a "currently running" guard plus a pass-count cap
  // so partial failures get a second/third pass instead of being latched out forever.
  // Additional gate: only re-pass when there are REACHABLE units still needing
  // work (i.e. covered by an uploaded PDF for a matching vendor). Units in a
  // market with no covering PDF can never match — the uncovered-markets banner
  // handles them; re-sweeping the whole PDF set for them is pure waste.
  const autoRunningRef = useRef(false);
  const autoPassCountRef = useRef(0);
  const lastReachableSignatureRef = useRef<string>("");
  const MAX_AUTO_PASSES = 3;
  useEffect(() => {
    if (!campaign) return;
    if (campaign.status === "parsing") return;
    if (units.length === 0) return;
    if (autoRunningRef.current) return;
    if (autoPassCountRef.current >= MAX_AUTO_PASSES) return;
    // Reachable = has a PDF file whose (possibly-normalized) vendor matches
    // the unit's vendor. Any PDF present is treated as coverage in a
    // single-vendor campaign (GENERIC_PROFILE fallback path).
    const pdfVendorKeys = new Set(
      vendorFiles
        .filter((f) => f.original_name?.toLowerCase().endsWith('.pdf'))
        .map((f) => normalizeVendor(f.vendor))
        .filter(Boolean) as string[],
    );
    const anyPdf = pdfVendorKeys.size > 0 || vendorFiles.some((f) => f.original_name?.toLowerCase().endsWith('.pdf'));
    const singleVendor = new Set(units.map((u) => normalizeVendor(u.vendor)).filter(Boolean)).size <= 1;
    const isReachable = (u: Unit) => {
      if (!anyPdf) return false;
      if (singleVendor) return true;
      const key = normalizeVendor(u.vendor);
      return !!key && pdfVendorKeys.has(key);
    };
    const reachablePendingPhotos = units.filter((u) => !u.billboard_photo_url && isReachable(u));
    const reachablePendingHighlights = units.filter((u) => !u.highlights && isReachable(u));
    const needsPhotos = reachablePendingPhotos.length > 0;
    const needsHighlights = reachablePendingHighlights.length > 0;
    if (!needsPhotos && !needsHighlights) return;
    // Stop repeating passes that don't make progress: signature of the pending
    // reachable id-set. If it hasn't changed since the last pass, don't burn
    // another sweep — the remaining pages already failed transiently or aren't
    // matchable in this PDF set.
    const signature = [
      ...reachablePendingPhotos.map((u) => `p:${u.id}`),
      ...reachablePendingHighlights.map((u) => `h:${u.id}`),
    ].sort().join("|");
    if (autoPassCountRef.current > 0 && signature === lastReachableSignatureRef.current) return;
    lastReachableSignatureRef.current = signature;
    autoRunningRef.current = true;
    autoPassCountRef.current += 1;
    (async () => {
      try {
        if (needsPhotos) await extractPhotos({ silent: true });
        if (needsHighlights) await extractHighlights({ silent: true });
      } finally {
        autoRunningRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status, units, vendorFiles]);


  // Persist the most recently detected crop for a vendor as the saved default,
  // so future campaigns from the same vendor skip detection entirely.
  const saveVendorCropDefault = async (vendor: string | null | undefined) => {
    if (!vendor) return;
    const key = normalizeVendor(vendor);
    const detected = detectedVendorCropsRef.current[key];
    if (!detected) {
      toast({
        title: 'No crop to save',
        description: 'Re-run "Extract photos" first so the layout is detected from the PDF.',
        variant: 'destructive',
      });
      return;
    }
    const row = {
      vendor,
      has_inset_map: !!detected.map,
      photo_x: detected.photo.x, photo_y: detected.photo.y, photo_w: detected.photo.w, photo_h: detected.photo.h,
      map_x: detected.map?.x ?? null, map_y: detected.map?.y ?? null, map_w: detected.map?.w ?? null, map_h: detected.map?.h ?? null,
    };
    const { error } = await supabase
      .from('vendor_crop_profiles')
      .upsert(row, { onConflict: 'vendor' });
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    setVendorCropProfiles((prev) => ({ ...prev, [key]: row as VendorCropProfile }));
    toast({ title: 'Crop default saved', description: `Future ${vendor} PDFs will use this layout automatically.` });
  };


  const reparse = async () => {
    if (!id) return;
    setReparsing(true);
    const { error } = await supabase.functions.invoke("parse-excel", { body: { campaign_id: id } });
    setReparsing(false);
    if (error) toast({ title: "Parse failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Parsing started" });
      await load();
      // Auto-run PDF extraction after re-parse (silent if no PDF exists)
      await extractPhotos({ silent: true });
      await extractHighlights({ silent: true });
    }
  };

  const extractPhotos = async (opts?: { silent?: boolean }) => {
    if (!id) return;
    const silent = !!opts?.silent;
    setExtracting(true);
    setExtractProgress({ current: 0, total: 0, label: "Preparing…" });
    const photosSummary: ExtractionFileSummary[] = [];
    const overviewMapUrls: string[] = [];
    const overviewSavedVendors = new Set<string>();
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

      const { data: units, error: uErr } = await supabase
        .from('units')
        .select('id, unit_number, vendor, market, location_description, billboard_photo_url, inset_map_url, row_index, latitude, longitude')
        .eq('campaign_id', id);
      if (uErr) throw uErr;
      if (!units || units.length === 0) throw new Error('No units found. Parse the Excel file first.');
      // A unit "needs" extraction if it lacks a billboard photo. Map is optional
      // (some vendors don't include one); we still try to extract it when present.
      const unitsNeedingPhotos = units.filter((u) => !u.billboard_photo_url);
      if (!unitsNeedingPhotos.length) {
        if (!silent) toast({ title: 'Photos already extracted', description: `${units.length} units already have photos.` });
        return;
      }

      const { data: vendorFiles, error: fErr } = await supabase
        .from('vendor_files')
        .select('id, storage_path, original_name, vendor')
        .eq('campaign_id', id);
      if (fErr) throw fErr;

      const pdfFiles = (vendorFiles ?? []).filter((f) =>
        f.original_name?.toLowerCase().endsWith('.pdf')
      );
      if (!pdfFiles.length) {
        if (silent) return;
        throw new Error('No PDF file found for this campaign. Upload the Photo Sheets PDF first.');
      }

      // Load existing vendor crop profiles
      const { data: profileRows } = await supabase.from('vendor_crop_profiles').select('*');
      const profileByVendor = new Map<string, VendorCropProfile>();
      for (const p of (profileRows ?? []) as VendorCropProfile[]) {
        const key = normalizeVendor(p.vendor);
        if (key) profileByVendor.set(key, p);
      }

      // Fallback (Stone Climbing / Clear Channel layout)
      const billboardCropFallback: CropBox = { x: 0.042, y: 0.329, w: 0.506, h: 0.441 };
      const mapCropFallback: CropBox       = { x: 0.579, y: 0.169, w: 0.379, h: 0.352 };

      // Detect image regions on a PDF page via the operator list. Coordinates
      // are returned in 0..1 page-relative space with y measured from the top.
      // Post-processing (Rule A): clip to page rect, dedup by IoU>0.8, drop
      // decorative strips (aspect>4:1), drop tiny (<3%).
      const rectIoU = (a: CropBox, b: CropBox): number => {
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        const x2 = Math.min(a.x + a.w, b.x + b.w);
        const y2 = Math.min(a.y + a.h, b.y + b.h);
        const iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1);
        const inter = iw * ih;
        const ua = a.w * a.h + b.w * b.h - inter;
        return ua > 0 ? inter / ua : 0;
      };
      const rectUnion = (a: CropBox, b: CropBox): CropBox => {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        const x2 = Math.max(a.x + a.w, b.x + b.w);
        const y2 = Math.max(a.y + a.h, b.y + b.h);
        return { x, y, w: x2 - x, h: y2 - y };
      };
      const detectImageRegions = async (page: any): Promise<Array<CropBox & { area: number }>> => {
        try {
          const view: number[] = page.view ?? [0, 0, 612, 792];
          const pdfW = Math.max(1, view[2] - view[0]);
          const pdfH = Math.max(1, view[3] - view[1]);
          const ops = await page.getOperatorList();
          const OPS: any = (pdfjs as any).OPS;
          const stack: number[][] = [];
          let ctm: number[] = [1, 0, 0, 1, 0, 0];
          const mul = (a: number[], b: number[]) => [
            a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
          ];
          const raw: CropBox[] = [];
          for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];
            if (fn === OPS.save) stack.push(ctm.slice());
            else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
            else if (fn === OPS.transform) ctm = mul(ctm, args);
            else if (
              fn === OPS.paintImageXObject ||
              fn === OPS.paintJpegXObject ||
              fn === OPS.paintInlineImageXObject ||
              fn === OPS.paintImageXObjectRepeat
            ) {
              const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => [
                ctm[0] * x + ctm[2] * y + ctm[4],
                ctm[1] * x + ctm[3] * y + ctm[5],
              ]);
              const xs = corners.map((c) => c[0]);
              const ys = corners.map((c) => c[1]);
              // Clip to page rect BEFORE clamping — some vendor images extend
              // 1.3–1.4× beyond the page and would otherwise dominate area.
              const minX = Math.max(0, Math.min(pdfW, Math.min(...xs)));
              const maxX = Math.max(0, Math.min(pdfW, Math.max(...xs)));
              const minY = Math.max(0, Math.min(pdfH, Math.min(...ys)));
              const maxY = Math.max(0, Math.min(pdfH, Math.max(...ys)));
              const x = minX / pdfW;
              const w = (maxX - minX) / pdfW;
              const yTop = 1 - maxY / pdfH;
              const h = (maxY - minY) / pdfH;
              if (w > 0.005 && h > 0.005) raw.push({ x, y: yTop, w, h });
            }
          }
          // Dedup by IoU>0.8 (merge into union).
          const merged: CropBox[] = [];
          for (const r of raw) {
            let placed = false;
            for (let i = 0; i < merged.length; i++) {
              if (rectIoU(merged[i], r) > 0.8) { merged[i] = rectUnion(merged[i], r); placed = true; break; }
            }
            if (!placed) merged.push(r);
          }
          // Exclude decorative strips (aspect > 4:1) and tiny regions (< 3%).
          const out: Array<CropBox & { area: number }> = [];
          for (const r of merged) {
            const area = r.w * r.h;
            if (area < 0.03) continue;
            const ar = r.h > 0 ? r.w / r.h : 999;
            if (ar > 4 || ar < 0.25) continue;
            out.push({ ...r, area });
          }
          return out;
        } catch (e) {
          console.warn('[extractPhotos] detectImageRegions failed:', e);
          return [];
        }
      };

      // Legacy pick for older fallback paths. image_regions crop uses its own
      // in-place logic below with the map gating rules.
      const pickContentCrops = (regions: Array<CropBox & { area: number }>): { photo: CropBox | null; map: CropBox | null } => {
        const content = regions
          .filter((r) => {
            const fullWidth = r.w > 0.8;
            if (fullWidth && r.y < 0.25) return false; // header strip
            if (fullWidth && r.y + r.h > 0.80) return false; // footer strip
            return true;
          })
          .sort((a, b) => b.area - a.area);
        if (content.length === 0) return { photo: null, map: null };
        if (content.length === 1) return { photo: content[0], map: null };
        const photo = content[0];
        const map = content.slice(1).find((r) => {
          const dx = Math.abs((r.x + r.w / 2) - (photo.x + photo.w / 2));
          const dy = Math.abs((r.y + r.h / 2) - (photo.y + photo.h / 2));
          return dx > 0.15 || dy > 0.15;
        }) ?? null;
        return { photo, map };
      };

      // Rule A5/A6/A7: pick photo + map with strict gating.
      //   - Skip page if >10 raw regions (mosaic/index).
      //   - Skip page if no region >= 5% (not a photo page).
      //   - Map only when hasMap, area 3-45%, aspect 0.4-2.6, IoU with photo < 0.2.
      const pickImageRegions = (
        regions: Array<CropBox & { area: number }>,
        hasMap: boolean,
      ): { photo: CropBox | null; map: CropBox | null; skipPage: boolean } => {
        if (regions.length > 10) return { photo: null, map: null, skipPage: true };
        const bigEnough = regions.filter((r) => r.area >= 0.05);
        if (!bigEnough.length) return { photo: null, map: null, skipPage: true };
        const sorted = [...regions].sort((a, b) => b.area - a.area);
        const photo = sorted[0];
        let map: CropBox | null = null;
        if (hasMap) {
          for (const r of sorted.slice(1)) {
            const ar = r.h > 0 ? r.w / r.h : 999;
            if (r.area < 0.03 || r.area > 0.45) continue;
            if (ar < 0.4 || ar > 2.6) continue;
            if (rectIoU(r, photo) >= 0.2) continue;
            map = { x: r.x, y: r.y, w: r.w, h: r.h };
            break;
          }
        }
        return { photo: { x: photo.x, y: photo.y, w: photo.w, h: photo.h }, map, skipPage: false };
      };

      let totalPhotos = 0;
      let totalMaps = 0;
      let pagesChecked = 0;

      // Crop modes from the vendor profile registry, resolved to crop boxes.
      const cropBoxForMode = (mode: VendorCropMode | undefined): CropBox => {
        switch (mode) {
          case "single_left":         return { x: 0.04, y: 0.18, w: 0.55, h: 0.55 };
          case "image_regions_left":  return { x: 0.00, y: 0.05, w: 0.55, h: 0.75 };
          case "full_bleed":          return { x: 0.0,  y: 0.15, w: 1.0,  h: 0.73 };
          case "single_midband":      return { x: 0.0,  y: 0.18, w: 1.0,  h: 0.55 };
          case "photo_plus_map":      return { x: 0.04, y: 0.18, w: 0.55, h: 0.55 };
          default:                    return billboardCropFallback;
        }
      };

      // Render a page + run uploadCrop helper closure. Returns counts.
      const processUnitPage = async (
        page: any,
        pageNum: number,
        unit: any,
        photoCrop: CropBox,
        mapCrop: CropBox | null,
      ): Promise<{ photoSaved: boolean; mapSaved: boolean }> => {
        if (!unit?.unit_number) return { photoSaved: false, mapSaved: false };
        if (unit.billboard_photo_url && (!mapCrop || unit.inset_map_url)) {
          return { photoSaved: false, mapSaved: false };
        }
        const unitNumber = String(unit.unit_number);
        await waitForVisible();
        const viewport = page.getViewport({ scale: 1.5 });
        const W = Math.round(viewport.width);
        const H = Math.round(viewport.height);

        // Prefer OffscreenCanvas (rendering keeps working while the tab is
        // background-throttled) and fall back to the DOM canvas when the
        // browser or pdfjs won't accept it.
        let renderCanvas: any;
        let renderCtx: any;
        const canUseOffscreen = typeof (globalThis as any).OffscreenCanvas === "function";
        if (canUseOffscreen) {
          try {
            renderCanvas = new (globalThis as any).OffscreenCanvas(W, H);
            renderCtx = renderCanvas.getContext('2d');
          } catch { renderCanvas = null; }
        }
        if (!renderCanvas) {
          renderCanvas = document.createElement('canvas');
          renderCanvas.width = W;
          renderCanvas.height = H;
          renderCtx = renderCanvas.getContext('2d');
        }
        await withTimeout(page.render({ canvasContext: renderCtx, viewport }).promise, `Rendering page ${pageNum}`);

        const uploadCrop = async (
          crop: CropBox,
          storageBucket: string,
          storagePath: string,
          dbField: string,
        ): Promise<boolean> => {
          const cw = Math.max(1, Math.round(W * crop.w));
          const ch = Math.max(1, Math.round(H * crop.h));
          let cropCanvas: any;
          let cropCtx: any;
          if (canUseOffscreen) {
            try { cropCanvas = new (globalThis as any).OffscreenCanvas(cw, ch); cropCtx = cropCanvas.getContext('2d'); } catch { cropCanvas = null; }
          }
          if (!cropCanvas) {
            cropCanvas = document.createElement('canvas');
            cropCanvas.width = cw;
            cropCanvas.height = ch;
            cropCtx = cropCanvas.getContext('2d');
          }
          cropCtx.drawImage(
            renderCanvas,
            Math.round(W * crop.x),
            Math.round(H * crop.y),
            Math.round(W * crop.w),
            Math.round(H * crop.h),
            0, 0, cw, ch,
          );
          const imageBlob: Blob = typeof cropCanvas.convertToBlob === 'function'
            ? await withTimeout(cropCanvas.convertToBlob({ type: 'image/png' }), `Exporting ${unitNumber} ${dbField}`)
            : await withTimeout(new Promise<Blob>((resolve, reject) =>
                (cropCanvas as HTMLCanvasElement).toBlob((b) => b ? resolve(b) : reject(new Error('Image export failed')), 'image/png'),
              ), `Exporting ${unitNumber} ${dbField}`);
          const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
          const { error: upErr } = await supabase.storage
            .from(storageBucket).upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true });
          if (upErr) { console.warn(`Upload failed for ${unitNumber} (${dbField}):`, upErr.message); return false; }
          let url: string;
          if (storageBucket === 'photos') {
            const { data: signed, error: signErr } = await supabase.storage
              .from('photos').createSignedUrl(storagePath, 60 * 60 * 24 * 365);
            if (signErr || !signed) { console.warn(`Sign URL failed:`, signErr?.message); return false; }
            url = signed.signedUrl;
          } else {
            const { data: pubData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
            url = `${pubData.publicUrl}?v=${Date.now()}`;
          }
          const { error: updateErr } = await supabase
            .from('units').update({ [dbField]: url } as any).eq('id', unit.id);
          if (updateErr) { console.warn(`DB update failed:`, updateErr.message); return false; }
          (unit as any)[dbField] = url;
          return true;
        };

        // Upload photo + map in parallel — they're independent storage writes.
        const jobs: Array<Promise<{ kind: 'photo' | 'map'; saved: boolean }>> = [];
        if (!unit.billboard_photo_url) {
          jobs.push(uploadCrop(photoCrop, 'photos', `${id}/${unit.id}.png`, 'billboard_photo_url')
            .then((saved) => ({ kind: 'photo', saved })));
        }
        if (mapCrop && !unit.inset_map_url) {
          jobs.push(uploadCrop(mapCrop, 'minimaps', `${id}/${unit.id}-map.png`, 'inset_map_url')
            .then((saved) => ({ kind: 'map', saved })));
        }
        const results = await Promise.all(jobs);
        const photoSaved = results.find((r) => r.kind === 'photo')?.saved ?? false;
        const mapSaved = results.find((r) => r.kind === 'map')?.saved ?? false;
        return { photoSaved, mapSaved };
      };

      const singleVendorCampaign = isSingleVendorCampaign(units);

      for (const file of pdfFiles) {
       const fileLabel = file.original_name ?? 'PDF';
       let matchedCount = 0;
       try {
         const resolved = resolveEffectiveVendor(file.vendor, unitsNeedingPhotos);
         let effectiveVendor: string | null = resolved.vendor;
         let profile: VendorProfile | null = resolved.profile;
         const strategyLabel = profile?.matchStrategy ?? 'unresolved';

        if (profile?.matchStrategy === "manual") {
          console.info(`[extractPhotos] vendor "${effectiveVendor ?? file.vendor}" is manual-only — skipping auto extraction`);
          photosSummary.push({
            file: fileLabel, kind: 'photos', vendor: effectiveVendor ?? file.vendor ?? null,
            strategy: 'manual', matched: 0, total: 0,
            note: 'Manual placement needed — upload photos per unit.',
          });
          continue;
        }
         if (!profile) {

          if (singleVendorCampaign) {
            const distinctVendors = Array.from(new Set(unitsNeedingPhotos.map((u: any) => (u.vendor ?? '').trim()).filter(Boolean)));
            effectiveVendor = distinctVendors[0] ?? effectiveVendor ?? file.vendor ?? null;
            profile = GENERIC_PROFILE;
            console.info(`[extractPhotos] ${fileLabel}: no registered profile for "${file.vendor ?? ''}"; using generic fallback in single-vendor campaign (vendor="${effectiveVendor}")`);
          } else {
            console.warn(`[extractPhotos] cannot resolve vendor for ${fileLabel} (file.vendor="${file.vendor ?? ''}") — skipping`);
            photosSummary.push({
              file: fileLabel, kind: 'photos', vendor: file.vendor ?? null,
              strategy: 'unresolved', matched: 0, total: 0,
              note: 'Vendor could not be matched to a known profile — manual placement needed.',
            });
            continue;
          }
        }

        if (effectiveVendor && effectiveVendor !== file.vendor) {
          console.info(`[extractPhotos] file.vendor "${file.vendor}" did not resolve directly; using "${effectiveVendor}"`);
        }

        let vendorUnits = filterUnitsForVendor(unitsNeedingPhotos, effectiveVendor);
        if (!vendorUnits.length) {
          if (singleVendorCampaign) {
            console.info(`[extractPhotos] ${fileLabel}: vendor filter empty in single-vendor campaign — falling back to all unitsNeedingPhotos`);
            vendorUnits = unitsNeedingPhotos;
          } else {
            console.warn(`[extractPhotos] ${fileLabel}: vendor filter empty in multi-vendor campaign — skipping to avoid cross-vendor photo assignment`);
            photosSummary.push({
              file: fileLabel, kind: 'photos', vendor: effectiveVendor ?? file.vendor ?? null,
              strategy: strategyLabel, matched: 0, total: 0,
              note: 'No units match this vendor in a multi-vendor campaign — skipped.',
            });
            continue;
          }
        }
        if (!vendorUnits.length) continue;

        // Order-strategy vendors (CCO / Lamar / Be Seen) follow Excel sheet
        // order. Sort by row_index ascending, nulls last, so page N maps to
        // the Nth Excel row still needing a photo.
        if (profile.matchStrategy === 'order') {
          vendorUnits = [...vendorUnits].sort((a: any, b: any) => {
            const ai = a.row_index == null ? Number.POSITIVE_INFINITY : a.row_index;
            const bi = b.row_index == null ? Number.POSITIVE_INFINITY : b.row_index;
            return ai - bi;
          });
        }

        const vendorUnitCount = vendorUnits.length;

        const vendorKey = normalizeVendor(effectiveVendor);
        const existingProfile = vendorKey ? profileByVendor.get(vendorKey) : undefined;


        setExtractProgress((p) => ({ ...p, label: `Downloading ${fileLabel}…` }));
        const { data: blob, error: dlErr } = await supabase.storage.from('uploads').download(file.storage_path);
        if (dlErr || !blob) {
          console.warn('PDF download failed:', dlErr?.message);
          photosSummary.push({
            file: fileLabel, kind: 'photos', vendor: effectiveVendor ?? file.vendor ?? null,
            strategy: strategyLabel, matched: 0, total: vendorUnitCount,
            note: `Download failed: ${dlErr?.message ?? 'unknown error'}`,
          });
          continue;
        }
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await withTimeout(
          pdfjs.getDocument({ data: arrayBuffer, disableFontFace: true }).promise,
          `Opening ${fileLabel}`,
        );
        setExtractProgress((p) => ({ current: p.current, total: p.total + pdf.numPages, label: `Processing ${fileLabel}…` }));

        try {
          // ------- Order-strategy pass (sequential page→unit assignment) -------
          // pagesPerUnit=N: only pages where ((pageNum - skipCover - 1) % N) === 0
          // advance the unit index. Other pages (detail spreads, spec pages) are
          // still checked but never consume a slot. Skipped pages by Rule A7
          // (no content image) also do NOT consume a slot.
          const runOrderPass = async () => {
            const skipCover = profile.skipCoverPages ?? 0;
            const pagesPerUnit = Math.max(1, profile.pagesPerUnit ?? 1);
            const useImageRegions = profile.crop === "image_regions" || profile.crop === "image_regions_left";
            const staticPhotoCrop = cropBoxForMode(profile.crop);
            const staticMapCrop = profile.hasMap && profile.mapBox ? profile.mapBox : null;
            let assignIdx = 0;
            let seenFirstPhotoPage = false;
            let photoPageCounter = 0;
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              if (assignIdx >= vendorUnits.length) break;
              await waitForVisible();
              let page: any = null;
              try {
                page = await withTimeout(pdf.getPage(pageNum), `Loading page ${pageNum}`);
                pagesChecked++;
                setExtractProgress((p) => ({ ...p, label: `Photo page ${pageNum} of ${pdf.numPages} — ${fileLabel}` }));
                if (pageNum <= skipCover) continue;
                const regions = await detectImageRegions(page);
                if (profile.skipUntilFirstPhotoPage && !seenFirstPhotoPage) {
                  const hasContentImage = regions.some((r) => r.area >= 0.05);
                  if (!hasContentImage) continue;
                  seenFirstPhotoPage = true;
                }
                // Rule A6/A7: skip mosaic (>10 imgs) and non-photo pages.
                if (regions.length > 10) continue;
                const hasBigEnough = regions.some((r) => r.area >= 0.05);
                if (!hasBigEnough) continue;
                // pagesPerUnit: only 1st page of each unit's window advances.
                if (photoPageCounter % pagesPerUnit !== 0) { photoPageCounter++; continue; }
                photoPageCounter++;

                let peek = assignIdx;
                while (peek < vendorUnits.length && vendorUnits[peek].billboard_photo_url) peek++;
                if (peek >= vendorUnits.length) break;
                const unit = vendorUnits[peek];

                let photoCrop = staticPhotoCrop;
                let mapCrop: CropBox | null = staticMapCrop;
                if (useImageRegions) {
                  if (profile.crop === "image_regions_left") {
                    // Adkom: prefer largest image whose centre is in the left 60%.
                    const left = regions.filter((r) => (r.x + r.w / 2) < 0.6).sort((a, b) => b.area - a.area);
                    photoCrop = left[0] ?? staticPhotoCrop;
                    mapCrop = null;
                  } else {
                    const picked = pickImageRegions(regions, !!profile.hasMap);
                    if (picked.skipPage) continue;
                    photoCrop = picked.photo ?? staticPhotoCrop;
                    mapCrop = picked.map;
                  }
                }

                const { photoSaved, mapSaved } = await processUnitPage(page, pageNum, unit, photoCrop, mapCrop);
                if (photoSaved) { totalPhotos++; matchedCount++; }
                if (mapSaved) totalMaps++;
                assignIdx = peek + 1;
              } catch (pageErr: any) {
                console.warn(`[extractPhotos] page ${pageNum} of ${file.original_name} failed — skipping, retrying same unit next page:`, pageErr?.message ?? pageErr);
                continue;
              } finally {
                page?.cleanup?.();
                setExtractProgress((p) => ({ ...p, current: p.current + 1 }));
              }
            }
          };

          // ------- Text-match pass (unit_number / address / auto). Returns match count. -------
          const runTextMatchPass = async (): Promise<number> => {
            let matchesInPass = 0;
            const unitRegex = profile?.unitRegex ? new RegExp(profile.unitRegex, "gi") : null;
            const retryPages: number[] = [];
            // Simple 2-stage pipeline: prefetch page N+1 while processing N.
            let nextPagePromise: Promise<any> | null = null;
            const pageOrder: number[] = [];
            for (let n = 1; n <= pdf.numPages; n++) pageOrder.push(n);
            const runPage = async (pageNum: number, isRetry: boolean): Promise<'ok' | 'retry' | 'stop'> => {
              await waitForVisible();
              if (!vendorUnits.some((u) => !u.billboard_photo_url)) return 'stop';
              let page: any = null;
              try {
                page = nextPagePromise
                  ? await withTimeout(nextPagePromise, `Loading page ${pageNum}`)
                  : await withTimeout(pdf.getPage(pageNum), `Loading page ${pageNum}`);
                nextPagePromise = null;
                // Kick off next page fetch in parallel with current page's work.
                const nextNum = pageNum + 1;
                if (!isRetry && nextNum <= pdf.numPages) {
                  try { nextPagePromise = pdf.getPage(nextNum); } catch { nextPagePromise = null; }
                }
                pagesChecked++;
                setExtractProgress((p) => ({ ...p, label: `Photo page ${pageNum} of ${pdf.numPages} — ${file.original_name ?? 'PDF'}` }));
                const textContent: any = await withTimeout<any>(page.getTextContent(), `Reading page ${pageNum} text`);
                const items = textContent.items as Array<{ str: string; transform?: number[] }>;
                const text = items.map((item: any) => item.str).join(' ');

                let matchedUnit: any = null;

                if (profile?.matchStrategy === "unit_number" && unitRegex) {
                  unitRegex.lastIndex = 0;
                  const matches = Array.from(text.matchAll(unitRegex));
                  for (const m of matches) {
                    const tok = normalizeUnitToken(m[1] ?? m[0]);
                    if (!tok) continue;
                    const found = vendorUnits.find((u) => normalizeUnitToken(u.unit_number) === tok);
                    if (found) { matchedUnit = found; break; }
                  }
                } else if (profile?.matchStrategy === "unit_number_partial") {
                  // New Tradition: media kits print "#NNNN" or bare 3-4 digit
                  // codes on photo pages. Match ONLY when the token equals
                  // exactly one Excel unit number in the pool. Never order-match.
                  const tokens = Array.from(text.matchAll(/#?\b(\d{3,6})\b/g)).map((m) => normalizeUnitToken(m[1]));
                  const seen = new Set<string>();
                  for (const tok of tokens) {
                    if (!tok || seen.has(tok)) continue;
                    seen.add(tok);
                    const hits = vendorUnits.filter((u) => normalizeUnitToken(u.unit_number) === tok);
                    if (hits.length === 1) { matchedUnit = hits[0]; break; }
                  }
                } else if (profile?.matchStrategy === "district_text") {
                  // Tasty Media: pages carry "Where <District Name>". Match
                  // against unit.market or unit.location_description tokens.
                  const whereMatch = /(?:^|\W)where\s+([A-Za-z][A-Za-z\s\-']{2,40}?)(?:\s{2,}|$|\d|,)/i.exec(text);
                  const district = whereMatch?.[1]?.trim();
                  if (district) {
                    const dNorm = normalizeMatchText(district);
                    matchedUnit = vendorUnits.find((u) => {
                      const mkt = normalizeMatchText(u.market ?? "");
                      const loc = normalizeMatchText(u.location_description ?? "");
                      return (mkt && (mkt.includes(dNorm) || dNorm.includes(mkt))) ||
                             (loc && loc.includes(dNorm));
                    }) ?? null;
                  }
                } else if (profile?.matchStrategy === "address") {
                  const lines = items
                    .map((it) => (it.str ?? "").trim())
                    .filter(Boolean)
                    .sort((a, b) => b.length - a.length)
                    .slice(0, 6);
                  for (const line of lines) {
                    const found = vendorUnits.find((u) => fuzzyAddressMatch(line, u.location_description));
                    if (found) { matchedUnit = found; break; }
                  }
                } else if (profile?.matchStrategy === "geo") {
                  matchedUnit = matchUnitByGeo(text, vendorUnits);
                } else {
                  matchedUnit = findUnitForPage(text, vendorUnits, file.vendor);
                }

                if (!matchedUnit) {
                  console.info(`[extractPhotos] ${file.original_name} p${pageNum}: no match`);
                  // First unmatched page in this run + vendor profile expects a
                  // campaign overview map → render the whole page and save as
                  // vendor_overview_map_url. Never assigned to any unit.
                  const effVendor = (file.vendor || '').trim();
                  if (effVendor && !overviewSavedVendors.has(effVendor) && profile?.hasMap) {
                    try {
                      const viewport = page.getViewport({ scale: 1.5 });
                      const canvas = document.createElement('canvas');
                      canvas.width = Math.round(viewport.width);
                      canvas.height = Math.round(viewport.height);
                      const ctx = canvas.getContext('2d')!;
                      await withTimeout(page.render({ canvasContext: ctx, viewport }).promise, `Rendering overview p${pageNum}`);
                      const blob = await new Promise<Blob>((resolve, reject) =>
                        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('overview export failed')), 'image/png'),
                      );
                      const bytes = new Uint8Array(await blob.arrayBuffer());
                      const vendorSlug = effVendor.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
                      const path = `${id}/overview-map-${vendorSlug}.png`;
                      const { error: upErr } = await supabase.storage
                        .from('minimaps').upload(path, bytes, { contentType: 'image/png', upsert: true });
                      if (!upErr) {
                        const { data: pub } = supabase.storage.from('minimaps').getPublicUrl(path);
                        const url = `${pub.publicUrl}?v=${Date.now()}`;
                        overviewMapUrls.push(url);
                        overviewSavedVendors.add(effVendor);
                        await supabase.from('campaigns').update({
                          vendor_overview_map_urls: overviewMapUrls,
                          vendor_overview_map_url: overviewMapUrls[0] ?? null,
                        } as any).eq('id', id);
                        console.info(`[extractPhotos] saved page ${pageNum} as coverage map for vendor ${effVendor}`);
                      } else {
                        console.warn('[extractPhotos] overview upload failed:', upErr.message);
                      }
                    } catch (ovErr: any) {
                      console.warn('[extractPhotos] overview save failed:', ovErr?.message ?? ovErr);
                    }
                  }
                  return 'ok';
                }
                console.info(`[extractPhotos] ${file.original_name} p${pageNum}: matched unit ${matchedUnit.unit_number}`);

                let photoCrop: CropBox = billboardCropFallback;
                let mapCrop: CropBox | null = null;
                let detectedSource: 'profile' | 'detection' | 'fallback' = 'fallback';

                if (profile?.crop === "image_regions") {
                  // Rule A: strict picker (>10 skip, need ≥5% img, aspect/IoU gate on map).
                  const regions = await detectImageRegions(page);
                  const picked = pickImageRegions(regions, !!profile.hasMap);
                  if (picked.skipPage) {
                    console.info(`[extractPhotos] ${file.original_name} p${pageNum}: skipped by image_regions rules`);
                    return 'ok';
                  }
                  if (picked.photo) {
                    photoCrop = picked.photo;
                    detectedSource = 'detection';
                    mapCrop = picked.map;
                  }
                } else if (profile?.crop === "image_regions_left") {
                  const regions = await detectImageRegions(page);
                  const left = regions.filter((r) => (r.x + r.w / 2) < 0.6).sort((a, b) => b.area - a.area);
                  if (left.length) {
                    photoCrop = { x: left[0].x, y: left[0].y, w: left[0].w, h: left[0].h };
                    detectedSource = 'detection';
                  } else {
                    photoCrop = cropBoxForMode("image_regions_left");
                    detectedSource = 'profile';
                  }
                  mapCrop = null;
                } else if (profile?.crop) {
                  photoCrop = cropBoxForMode(profile.crop);
                  mapCrop = profile.hasMap && profile.mapBox ? profile.mapBox : null;
                  if (profile.crop === "single_left" || profile.crop === "single_midband") {
                    const regions = await detectImageRegions(page);
                    const picked = pickContentCrops(regions);
                    if (picked.photo) photoCrop = picked.photo;
                  }
                  detectedSource = 'profile';
                } else if (existingProfile && existingProfile.photo_x != null) {
                  photoCrop = { x: existingProfile.photo_x!, y: existingProfile.photo_y!, w: existingProfile.photo_w!, h: existingProfile.photo_h! };
                  mapCrop = existingProfile.has_inset_map && existingProfile.map_x != null
                    ? { x: existingProfile.map_x!, y: existingProfile.map_y!, w: existingProfile.map_w!, h: existingProfile.map_h! }
                    : null;
                  detectedSource = 'profile';
                } else {
                  const regions = await detectImageRegions(page);
                  const picked = pickContentCrops(regions);
                  if (picked.photo) {
                    photoCrop = picked.photo;
                    mapCrop = picked.map;
                    detectedSource = 'detection';
                  } else {
                    mapCrop = mapCropFallback;
                  }
                }

                if (profile && profile.hasMap === false) mapCrop = null;

                const { photoSaved, mapSaved } = await processUnitPage(page, pageNum, matchedUnit, photoCrop, mapCrop);
                if (photoSaved) { totalPhotos++; matchedCount++; matchesInPass++; }
                if (mapSaved) totalMaps++;

                if ((photoSaved || mapSaved) && vendorKey && detectedSource === 'detection') {
                  detectedVendorCropsRef.current[vendorKey] = { photo: photoCrop, map: mapCrop };
                }
                return 'ok';
              } catch (pageErr: any) {
                console.warn(`[extractPhotos] page ${pageNum} of ${file.original_name} failed:`, pageErr?.message ?? pageErr);
                return isTransientRenderError(pageErr) && !isRetry ? 'retry' : 'ok';
              } finally {
                page?.cleanup?.();
                setExtractProgress((p) => ({ ...p, current: p.current + 1 }));
              }
            };
            for (const pageNum of pageOrder) {
              const res = await runPage(pageNum, false);
              if (res === 'stop') break;
              if (res === 'retry') retryPages.push(pageNum);
            }
            if (nextPagePromise) { try { const p = await nextPagePromise; p?.cleanup?.(); } catch { /* ignore */ } nextPagePromise = null; }
            for (const pageNum of retryPages) {
              const res = await runPage(pageNum, true);
              if (res === 'stop') break;
            }
            return matchesInPass;
          };

          if (profile.matchStrategy === "order") {
            await runOrderPass();
          } else {
            const matched = await runTextMatchPass();
            // orderFallback: if the text-match pass found nothing (e.g. older
            // vendor deck without unit IDs on photo pages), retry the same file
            // using the order strategy. The map page will naturally match no
            // unit; overview-map logic elsewhere handles that separately.
            if (matched === 0 && profile.orderFallback) {
              console.info(`[extractPhotos] ${fileLabel}: 0 unit_number matches — falling back to order strategy`);
              await runOrderPass();
            }
          }
        } finally {
          pdf.destroy?.();
        }

        // Auto-persist detected vendor crop if none saved yet (auto-detect path only).
        if (vendorKey && !existingProfile && !profile && detectedVendorCropsRef.current[vendorKey]) {
          const det = detectedVendorCropsRef.current[vendorKey];
          const row = {
            vendor: file.vendor!,
            has_inset_map: !!det.map,
            photo_x: det.photo.x, photo_y: det.photo.y, photo_w: det.photo.w, photo_h: det.photo.h,
            map_x: det.map?.x ?? null, map_y: det.map?.y ?? null, map_w: det.map?.w ?? null, map_h: det.map?.h ?? null,
          };
          const { error: profErr } = await supabase
            .from('vendor_crop_profiles').upsert(row, { onConflict: 'vendor' });
          if (!profErr) {
            profileByVendor.set(vendorKey, row as VendorCropProfile);
            setVendorCropProfiles((prev) => ({ ...prev, [vendorKey]: row as VendorCropProfile }));
          } else {
            console.warn('[extractPhotos] save vendor profile failed:', profErr.message);
          }
        }
        photosSummary.push({
          file: fileLabel,
          kind: 'photos',
          vendor: effectiveVendor ?? file.vendor ?? null,
          strategy: strategyLabel,
          matched: matchedCount,
          total: vendorUnitCount,
        });
       } catch (pdfErr: any) {
         console.error(`[extractPhotos] PDF "${fileLabel}" failed — continuing with next vendor PDF:`, pdfErr?.message ?? pdfErr);
         photosSummary.push({
           file: fileLabel, kind: 'photos', vendor: file.vendor ?? null,
           strategy: 'error', matched: matchedCount, total: 0,
           note: `Failed: ${pdfErr?.message ?? 'unknown error'}`,
         });
         continue;
       }
      }




      if (!silent || totalPhotos > 0 || totalMaps > 0) {
        toast({
          title: totalPhotos || totalMaps ? 'Photos extracted' : 'Photo extraction complete',
          description: totalPhotos || totalMaps
            ? `${totalPhotos} billboard photos · ${totalMaps} maps matched`
            : `No new matches found after checking ${pagesChecked} pages.`,
        });
      }
      setExtractionSummary((prev) => [...prev.filter((s) => s.kind !== 'photos'), ...photosSummary]);
      await load();
    } catch (err: any) {
      console.error('[extractPhotos]', err);
      if (!silent) {
        toast({
          title: 'Photo extraction failed',
          description: err.message ?? 'Unknown error',
          variant: 'destructive',
        });
      }
    } finally {
      setExtracting(false);
      setExtractProgress({ current: 0, total: 0, label: "" });
    }
  };

  const extractHighlights = async (opts?: { silent?: boolean }) => {
    if (!id) return;
    const silent = !!opts?.silent;
    setExtractingHl(true);
    setExtractProgress({ current: 0, total: 0, label: "Preparing highlights…" });
    const hlSummary: ExtractionFileSummary[] = [];
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

      const { data: allUnits, error: uErr } = await supabase
        .from('units')
        .select('id, unit_number, vendor, market, location_description, highlights, row_index, latitude, longitude')
        .eq('campaign_id', id);
      if (uErr) throw uErr;
      if (!allUnits?.length) throw new Error('No units found. Parse the Excel file first.');
      // Don't overwrite existing highlights (e.g. Notes-derived from Excel).
      const units = allUnits.filter((u: any) => !u.highlights || String(u.highlights).trim() === '');
      if (!units.length) {
        if (!silent) toast({ title: "Highlights already present", description: "All units already have highlights." });
        return;
      }


      const { data: vendorFiles, error: fErr } = await supabase
        .from('vendor_files')
        .select('id, storage_path, original_name, kind, vendor')
        .eq('campaign_id', id);
      if (fErr) throw fErr;

      const pdfFiles = (vendorFiles ?? []).filter((file) =>
        file.kind === 'photosheets' || file.original_name?.toLowerCase().endsWith('.pdf'),
      );
      if (!pdfFiles.length) throw new Error('No PDF file found for this campaign. Upload the Photo Sheets PDF first.');

      const collected = new Map<string, string[]>();
      let pagesProcessed = 0;

      const singleVendorCampaignHl = isSingleVendorCampaign(allUnits);

      for (const file of pdfFiles) {
       const fileLabel = file.original_name ?? 'PDF';
       let matchedCount = 0;
       try {
        const resolvedHl = resolveEffectiveVendor(file.vendor, units);
        let effectiveVendor: string | null = resolvedHl.vendor;
        let profile: VendorProfile | null = resolvedHl.profile;
        const strategyLabel = profile?.matchStrategy ?? 'unresolved';
        if (profile?.matchStrategy === "manual") {
          console.info(`[extractHighlights] vendor "${effectiveVendor ?? file.vendor}" is manual-only — skipping`);
          hlSummary.push({
            file: fileLabel, kind: 'highlights', vendor: effectiveVendor ?? file.vendor ?? null,
            strategy: 'manual', matched: 0, total: 0,
            note: 'Manual placement needed — highlights not auto-extracted.',
          });
          continue;
        }
        if (!profile) {
          if (singleVendorCampaignHl) {
            const distinctVendors = Array.from(new Set(units.map((u: any) => (u.vendor ?? '').trim()).filter(Boolean)));
            effectiveVendor = distinctVendors[0] ?? effectiveVendor ?? file.vendor ?? null;
            profile = GENERIC_PROFILE;
            console.info(`[extractHighlights] ${fileLabel}: no registered profile for "${file.vendor ?? ''}"; using generic fallback (vendor="${effectiveVendor}")`);
          } else {
            console.warn(`[extractHighlights] cannot resolve vendor for ${fileLabel} (file.vendor="${file.vendor ?? ''}") — skipping`);
            hlSummary.push({
              file: fileLabel, kind: 'highlights', vendor: file.vendor ?? null,
              strategy: 'unresolved', matched: 0, total: 0,
              note: 'Vendor could not be matched to a known profile — manual placement needed.',
            });
            continue;
          }
        }

        if (effectiveVendor && effectiveVendor !== file.vendor) {
          console.info(`[extractHighlights] file.vendor "${file.vendor}" did not resolve directly; using "${effectiveVendor}"`);
        }

        let vendorUnits = filterUnitsForVendor(units, effectiveVendor);
        if (!vendorUnits.length) {
          if (singleVendorCampaignHl) {
            vendorUnits = units;
          } else {
            console.warn(`[extractHighlights] ${fileLabel}: vendor filter empty in multi-vendor campaign — skipping`);
            hlSummary.push({
              file: fileLabel, kind: 'highlights', vendor: effectiveVendor ?? file.vendor ?? null,
              strategy: strategyLabel, matched: 0, total: 0,
              note: 'No units match this vendor in a multi-vendor campaign — skipped.',
            });
            continue;
          }
        }
        if (!vendorUnits.length) continue;

        // Order-strategy vendors follow Excel sheet order.
        if (profile.matchStrategy === 'order') {
          vendorUnits = [...vendorUnits].sort((a: any, b: any) => {
            const ai = a.row_index == null ? Number.POSITIVE_INFINITY : a.row_index;
            const bi = b.row_index == null ? Number.POSITIVE_INFINITY : b.row_index;
            return ai - bi;
          });
        }
        const vendorUnitCount = vendorUnits.length;


        setExtractProgress((p) => ({ ...p, label: `Downloading ${file.original_name ?? 'PDF'}…` }));
        const { data: blob, error: dlErr } = await supabase.storage.from('uploads').download(file.storage_path);
        if (dlErr || !blob) { console.warn('PDF download failed:', dlErr?.message); continue; }

        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await withTimeout(
          pdfjs.getDocument({ data: arrayBuffer, disableFontFace: true }).promise,
          `Opening ${file.original_name ?? 'PDF'}`,
        );
        setExtractProgress((p) => ({ current: p.current, total: p.total + pdf.numPages, label: `Processing ${file.original_name ?? 'PDF'}…` }));

        try {
          const unitRegex = profile?.unitRegex ? new RegExp(profile.unitRegex, "gi") : null;
          let orderIdx = 0;
          let seenFirstPhotoPage = false;
          const skipCover = profile?.skipCoverPages ?? 0;

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            await waitForVisible();
            let page: any = null;
            let consumedOrderSlot = false;
            try {
              page = await withTimeout(pdf.getPage(pageNum), `Loading page ${pageNum}`);
              pagesProcessed++;
              setExtractProgress((p) => ({ ...p, label: `Highlights page ${pageNum} of ${pdf.numPages} — ${file.original_name ?? 'PDF'}` }));
              const textContent: any = await withTimeout<any>(page.getTextContent(), `Reading page ${pageNum} text`);
              const items = textContent.items as Array<{ str: string; transform?: number[] }>;
              const text = items.map((item) => item.str).join(' ');

              let unit: any = null;
              if (profile?.matchStrategy === "unit_number" && unitRegex) {
                unitRegex.lastIndex = 0;
                for (const m of text.matchAll(unitRegex)) {
                  const tok = normalizeUnitToken(m[1] ?? m[0]);
                  const found = vendorUnits.find((u) => normalizeUnitToken(u.unit_number) === tok);
                  if (found) { unit = found; break; }
                }
              } else if (profile?.matchStrategy === "unit_number_partial") {
                const tokens = Array.from(text.matchAll(/#?\b(\d{3,6})\b/g)).map((m) => normalizeUnitToken(m[1]));
                const seen = new Set<string>();
                for (const tok of tokens) {
                  if (!tok || seen.has(tok)) continue;
                  seen.add(tok);
                  const hits = vendorUnits.filter((u) => normalizeUnitToken(u.unit_number) === tok);
                  if (hits.length === 1) { unit = hits[0]; break; }
                }
              } else if (profile?.matchStrategy === "district_text") {
                const whereMatch = /(?:^|\W)where\s+([A-Za-z][A-Za-z\s\-']{2,40}?)(?:\s{2,}|$|\d|,)/i.exec(text);
                const district = whereMatch?.[1]?.trim();
                if (district) {
                  const dNorm = normalizeMatchText(district);
                  unit = vendorUnits.find((u: any) => {
                    const mkt = normalizeMatchText(u.market ?? "");
                    const loc = normalizeMatchText(u.location_description ?? "");
                    return (mkt && (mkt.includes(dNorm) || dNorm.includes(mkt))) ||
                           (loc && loc.includes(dNorm));
                  }) ?? null;
                }
              } else if (profile?.matchStrategy === "address") {
                const lines = items.map((it) => (it.str ?? "").trim()).filter(Boolean)
                  .sort((a, b) => b.length - a.length).slice(0, 6);
                for (const line of lines) {
                  const found = vendorUnits.find((u) => fuzzyAddressMatch(line, u.location_description));
                  if (found) { unit = found; break; }
                }
              } else if (profile?.matchStrategy === "geo") {
                unit = matchUnitByGeo(text, vendorUnits);
              } else if (profile?.matchStrategy === "order") {
                if (pageNum <= skipCover) { /* cover */ }
                else if (profile.skipUntilFirstPhotoPage && !seenFirstPhotoPage) {
                  if (items.length < 40) seenFirstPhotoPage = true;
                } else {
                  unit = vendorUnits[orderIdx] ?? null;
                  if (unit) { orderIdx++; consumedOrderSlot = true; }
                }
              } else {
                unit = findUnitForPage(text, vendorUnits, file.vendor);
              }

              const paragraph = unit ? extractHighlightText(items, text) : "";
              if (unit && paragraph) {
                const existing = collected.get(unit.id) ?? [];
                if (existing.length === 0) matchedCount++;
                existing.push(paragraph);
                collected.set(unit.id, existing);
              }
            } catch (pageErr: any) {
              console.warn(`[extractHighlights] page ${pageNum} of ${fileLabel} failed — skipping:`, pageErr?.message ?? pageErr);
              // For the order strategy, do NOT consume a unit slot on failure —
              // give the same unit another chance on the next page.
              if (consumedOrderSlot) orderIdx--;
              continue;
            } finally {
              page?.cleanup?.();
              setExtractProgress((p) => ({ ...p, current: p.current + 1 }));
            }
          }
        } finally {
          pdf.destroy?.();
        }
        hlSummary.push({
          file: fileLabel, kind: 'highlights', vendor: effectiveVendor ?? file.vendor ?? null,
          strategy: strategyLabel, matched: matchedCount, total: vendorUnitCount,
        });
       } catch (pdfErr: any) {
         console.error(`[extractHighlights] PDF "${fileLabel}" failed — continuing with next vendor PDF:`, pdfErr?.message ?? pdfErr);
         hlSummary.push({
           file: fileLabel, kind: 'highlights', vendor: file.vendor ?? null,
           strategy: 'error', matched: matchedCount, total: 0,
           note: `Failed: ${pdfErr?.message ?? 'unknown error'}`,
         });
         continue;
       }
      }


      let unitsWithHighlights = 0;
      for (const [unitId, paragraphs] of collected) {
        const rawHighlightText = paragraphs.join(' ').replace(/\s+/g, ' ').trim();
        const finalHighlight = cleanHighlight(rawHighlightText);
        if (!finalHighlight || finalHighlight.length <= 20) continue;
        const { error: updateErr } = await supabase
          .from('units')
          .update({ highlights: finalHighlight })
          .eq('id', unitId);
        if (updateErr) throw updateErr;
        unitsWithHighlights++;
      }

      if (!silent || unitsWithHighlights > 0) {
        toast({
          title: "Highlights extracted",
          description: `${unitsWithHighlights} units · ${pagesProcessed} pages`,
        });
      }
      setExtractionSummary((prev) => [...prev.filter((s) => s.kind !== 'highlights'), ...hlSummary]);
      await load();
    } catch (err: any) {
      console.error('[extractHighlights]', err);
      if (!silent) {
        toast({ title: "Highlights extraction failed", description: err.message ?? "Unknown error", variant: "destructive" });
      }
    } finally {
      setExtractingHl(false);
      setExtractProgress({ current: 0, total: 0, label: "" });
    }
  };

  const toggleField = async (
    unit: Unit,
    field: "recommended" | "included" | TierKey,
    value: boolean,
  ) => {
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, [field]: value } : u)));
    const patch: Record<string, boolean> = { [field]: value };
    const { error } = await supabase.from("units").update(patch as any).eq("id", unit.id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, [field]: !value } : u)));
    }
  };

  const updateCampaignDate = async (field: DateKey, value: string) => {
    if (!campaign) return;
    const next = value || null;
    const prev = campaign[field];
    setCampaign({ ...campaign, [field]: next });
    const { error } = await supabase.from("campaigns").update({ [field]: next } as any).eq("id", campaign.id);
    if (error) {
      toast({ title: "Couldn't save dates", description: error.message, variant: "destructive" });
      setCampaign({ ...campaign, [field]: prev });
    }
  };

  const toggleCampaignTier = async (field: ShowTierKey, value: boolean) => {
    if (!campaign) return;
    setCampaign({ ...campaign, [field]: value });
    const patch: Record<string, boolean> = { [field]: value };
    const { error } = await supabase.from("campaigns").update(patch as any).eq("id", campaign.id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      setCampaign({ ...campaign, [field]: !value });
    }
  };

  const stats = useMemo(() => {
    const marginMult = 1 + ((campaign?.margin_pct ?? 20) / 100);
    const flightTotal = (u: Unit) =>
      (u.negotiated_rate_4wk ?? 0) * marginMult * (u.four_week_periods && u.four_week_periods > 0 ? u.four_week_periods : 1);
    const included = units.filter((u) => u.included !== false);
    const recs = included.filter((u) => u.recommended).length;
    const imps = included.reduce((s, u) => s + (u.four_week_impressions ?? 0), 0);
    const cost = included.reduce((s, u) => s + flightTotal(u), 0);
    const photos = included.filter((u) => u.billboard_photo_url).length;
    const tierTotals: Record<TierKey, number> = { tier_a: 0, tier_b: 0, tier_c: 0 };
    const tierCounts: Record<TierKey, number> = { tier_a: 0, tier_b: 0, tier_c: 0 };
    for (const u of included) {
      for (const t of TIERS) {
        if (u[t.key]) {
          tierTotals[t.key] += flightTotal(u);
          tierCounts[t.key] += 1;
        }
      }
    }
    return { total: units.length, included: included.length, recs, imps, cost, photos, tierTotals, tierCounts };
  }, [units, campaign?.margin_pct]);


  if (loading) {
    return (
      <main className="container-app py-14 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="w-full max-w-none px-4 md:px-6 py-10 md:py-14">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <header className="surface-card mb-6 p-6">
        {/* Top row: logo + identity */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-5 min-w-0 flex-1">
            {id && campaign && (
              <LogoReplace
                campaignId={id}
                currentUrl={campaign.client_logo_url}
                clientName={campaign.client_name}
                onUploaded={(url) => setCampaign({ ...campaign, client_logo_url: url })}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {campaign?.client_name}
              </div>
              <h1 className="font-heading mt-1 text-xl md:text-2xl leading-tight break-words normal-case tracking-normal">
                {campaign?.campaign_name}
              </h1>
              {campaign?.proposal_name && (
                <p className="mt-1 text-sm italic text-[hsl(var(--ocean))] break-words">
                  {campaign.proposal_name}
                </p>
              )}
              {campaign?.markets?.length ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {campaign.markets.join(", ")}
                </p>
              ) : null}
            </div>
          </div>
          <StatusBadge status={campaign?.status ?? "draft"} />
        </div>

        {/* Toolbar — its own row so the title never collapses to a thin column */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={() => extractPhotos()} disabled={extracting || units.length === 0}>
            {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            Extract photos
          </Button>
          <Button variant="outline" size="sm" onClick={() => extractHighlights()} disabled={extractingHl || units.length === 0}>
            {extractingHl ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Extract highlights
          </Button>
          <Button variant="outline" size="sm" onClick={reparse} disabled={reparsing || campaign?.status === "parsing"}>
            {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-parse
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReuploadOpen(true)}>
            <Upload className="h-4 w-4" /> Re-upload files
          </Button>
          <Button variant="outline" size="sm" asChild disabled={units.length === 0}>
            <Link to={`/campaigns/${id}/preview`}>
              <Eye className="h-4 w-4" /> Preview presentation
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={units.length === 0}
            onClick={() => window.open(`/proposal-print/${id}`, '_blank')}
          >
            <FileText className="h-4 w-4" /> Download Full Proposal PDF
          </Button>
          <div className="ml-auto" />
          <Button
            size="sm"
            onClick={() => setShareOpen(true)}
            disabled={units.length === 0}
            className="bg-gradient-hero hover:opacity-95"
          >
            <Share2 className="h-4 w-4" /> Share with client
          </Button>
        </div>
      </header>

      {(extracting || extractingHl || extractProgress.total > 0) && (
        <div className="surface-card mb-4 flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {extracting ? "Extracting billboard photos & maps…" : "Extracting highlights…"}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {extractProgress.total > 0
                ? `${extractProgress.current} / ${extractProgress.total} pages`
                : "Preparing…"}
            </div>
          </div>
          <Progress
            value={
              extractProgress.total > 0
                ? Math.min(100, (extractProgress.current / extractProgress.total) * 100)
                : 5
            }
            className="h-2"
          />
          {extractProgress.label && (
            <p className="text-[11px] text-muted-foreground truncate">{extractProgress.label}</p>
          )}
          {extractionPaused && (
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              Extraction paused — keep this tab visible to continue.
            </p>
          )}
        </div>
      )}

      {extractionSummary.length > 0 && !extracting && !extractingHl && (
        <div className="surface-card mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Extraction summary</h4>
            <button
              type="button"
              onClick={() => setExtractionSummary([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          <ul className="space-y-1.5 text-xs">
            {extractionSummary.map((s, i) => {
              const ok = s.matched > 0 && !s.note;
              const warn = s.note && s.strategy !== 'manual';
              return (
                <li
                  key={`${s.kind}-${s.file}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      ok ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-muted-foreground/50'
                    }`}
                  />
                  <span className="font-medium">{s.file}</span>
                  <span className="text-muted-foreground">
                    · {s.kind} · vendor: {s.vendor ?? '—'} · strategy: {s.strategy}
                    {s.total > 0 || s.matched > 0 ? ` · ${s.matched}/${s.total} matched` : ''}
                  </span>
                  {s.note && (
                    <span className="w-full pl-4 text-amber-700 dark:text-amber-400">
                      {s.note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}




      {campaign?.status === "parsing" && units.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <h3 className="font-heading">Parsing vendor Excel…</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Mapping headers, detecting recommended rows, splitting location bullets.
          </p>
        </div>
      ) : campaign?.status === "error" ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <h3 className="font-heading">Parsing failed</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Something went wrong reading the vendor Excel. Try Re-parse, or check the file format.
          </p>
        </div>
      ) : units.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No units parsed yet.</p>
        </div>
      ) : (
        <>
          {uncoveredMarkets.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  Some markets have no PDF headsheet uploaded
                </p>
                <p className="text-muted-foreground">
                  Photos can't be extracted automatically for{" "}
                  {uncoveredMarkets
                    .map((m) => `${m.market} (${m.count} unit${m.count === 1 ? "" : "s"})`)
                    .join(", ")}
                  . Upload the matching headsheet PDF via Re-upload, or add photos manually.
                </p>
              </div>
            </div>
          )}
          <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

            <Stat label="Units in proposal" value={`${stats.included} / ${stats.total}`} />
            <Stat label="Recommended" value={String(stats.recs)} />
            <Stat label="Photos matched" value={`${stats.photos} / ${stats.included}`} />
            <Stat label="4-Week Impressions" value={fmtNum(stats.imps)} />
            <Stat label="Total Cost" value={fmtMoney(stats.cost)} />
          </section>

          <p className="mb-3 text-xs text-muted-foreground">
            Toggle <span className="font-medium text-foreground">Include</span> to add/remove a unit from the proposal.
            Toggle <span className="font-medium text-foreground">Recommend</span> to feature it as a hero card on the
            client page. Use <span className="font-medium text-foreground">A / B / C</span> to assign a unit to one or
            more pricing tiers shown in the proposal.
          </p>

          {/* Batch action buttons */}
          <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
            <Button variant="outline" size="sm" onClick={async () => {
              const { error, count } = await supabase.from("units").update({ included: true } as any).eq("campaign_id", id!);
              if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
              setUnits(prev => prev.map(u => ({ ...u, included: true })));
              toast({ title: `Included all ${units.length} units` });
            }}>Include All</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              const { error } = await supabase.from("units").update({ included: false } as any).eq("campaign_id", id!);
              if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
              setUnits(prev => prev.map(u => ({ ...u, included: false })));
              toast({ title: `Excluded all ${units.length} units` });
            }}>Exclude All</Button>

            <div className="mx-1 h-5 w-px bg-border shrink-0" />

            <Button variant="outline" size="sm" onClick={async () => {
              const { error } = await supabase.from("units").update({ recommended: false } as any).eq("campaign_id", id!);
              if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
              setUnits(prev => prev.map(u => ({ ...u, recommended: false })));
              toast({ title: `Cleared recommended on ${units.length} units` });
            }}>Clear Recommended</Button>

            <div className="mx-1 h-5 w-px bg-border shrink-0" />

            <Button variant="outline" size="sm" onClick={async () => {
              const { error } = await supabase.from("units").update({ tier_a: false } as any).eq("campaign_id", id!);
              if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
              setUnits(prev => prev.map(u => ({ ...u, tier_a: false })));
              toast({ title: `Reset Option A on ${units.length} units` });
            }}>Reset A</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              const { error } = await supabase.from("units").update({ tier_b: false } as any).eq("campaign_id", id!);
              if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
              setUnits(prev => prev.map(u => ({ ...u, tier_b: false })));
              toast({ title: `Reset Option B on ${units.length} units` });
            }}>Reset B</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              const { error } = await supabase.from("units").update({ tier_c: false } as any).eq("campaign_id", id!);
              if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
              setUnits(prev => prev.map(u => ({ ...u, tier_c: false })));
              toast({ title: `Reset Option C on ${units.length} units` });
            }}>Reset C</Button>
          </div>

          {/* Campaign-level tier master switches with running totals (Change 3C) */}
          {campaign && (
            <section className="surface-card mb-6 p-5">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Show in presentation
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {TIERS.map((t) => (
                  <div
                    key={t.key}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        <Switch
                          checked={!!campaign[t.show]}
                          onCheckedChange={(v) => toggleCampaignTier(t.show, v)}
                        />
                        <span className="text-sm font-medium">Include {t.label}</span>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {stats.tierCounts[t.key]} unit{stats.tierCounts[t.key] === 1 ? "" : "s"} ·{" "}
                        <span className="font-semibold text-foreground">{fmtMoney(stats.tierTotals[t.key])}</span>
                      </span>
                    </label>
                    {stats.tierCounts[t.key] > 0 && (
                      <div className="pl-[44px] flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Flight Dates
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={campaign[t.startField] ?? ""}
                            onChange={(e) => updateCampaignDate(t.startField, e.target.value)}
                            className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
                          />
                          <span className="text-xs text-muted-foreground">–</span>
                          <input
                            type="date"
                            value={campaign[t.endField] ?? ""}
                            onChange={(e) => updateCampaignDate(t.endField, e.target.value)}
                            className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Coverage map toggle */}
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Switch
                    checked={(campaign as any).show_coverage_map !== false}
                    onCheckedChange={async (v) => {
                      const prev = (campaign as any).show_coverage_map !== false;
                      setCampaign({ ...campaign, show_coverage_map: v } as any);
                      const { error } = await supabase.from("campaigns").update({ show_coverage_map: v } as any).eq("id", campaign.id);
                      if (error) {
                        toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
                        setCampaign({ ...campaign, show_coverage_map: prev } as any);
                      }
                    }}
                  />
                  <span className="text-sm font-medium">Show Campaign Coverage Map</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {(campaign as any).vendor_overview_map_url ? "Map uploaded" : "No map uploaded yet"}
                </span>
              </div>
            </section>
          )}

          <div className="items-start">
            <div className="overflow-x-auto -mx-4 md:-mx-6">
              <div className="min-w-[1200px] px-4 md:px-6">
                <div className="surface-card overflow-hidden min-w-0">
                  <div className="w-full">
                    <table className="w-full table-fixed text-[12px]">
                      <colgroup>
                        <col className="w-[120px]" />
                        <col className="w-[110px]" />
                        <col className="w-[90px]" />
                        <col className="w-[110px]" />
                        <col className="min-w-[120px]" />
                        <col className="min-w-[180px]" />
                        <col className="w-[64px]" />
                    <col className="w-[78px]" />
                    <col className="w-[52px]" />
                    <col className="w-[78px]" />
                    <col className="w-[56px]" />
                    <col className="w-[72px]" />
                    <col className="w-[88px]" />
                    <col className="w-[44px]" />
                    <col className="w-[44px]" />
                    <col className="w-[44px]" />
                  </colgroup>
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2.5 text-left">Photo · Map</th>
                      <th className="px-2 py-2.5 text-left">Unit</th>
                      <th className="px-2 py-2.5 text-left">Market</th>
                      <th className="px-2 py-2.5 text-left">Format</th>
                      <th className="px-2 py-2.5 text-left">Location</th>
                      <th className="px-2 py-2.5 text-left">Highlights</th>
                      <th className="px-2 py-2.5 text-right">4wk Imp</th>
                      <th className="px-2 py-2.5 text-right">4-Wk Rate</th>
                      <th className="px-2 py-2.5 text-right">Flight</th>
                      <th className="px-2 py-2.5 text-right">Total</th>
                      <th className="px-2 py-2.5 text-right">CPM</th>
                      <th className="px-2 py-2.5 text-center bg-muted/60">Include</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--accent-gold)/0.18)]">Recommend</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--ocean)/0.10)]">A</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--ocean)/0.10)]">B</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--ocean)/0.10)]">C</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groupedUnits.map(({ vendor, units: vendorUnits }) => {
                      const collapsed = collapsedVendors.has(vendor);
                      return (
                      <Fragment key={vendor}>
                        <tr className="bg-muted/60 sticky">
                          <td colSpan={16} className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleVendorCollapse(vendor)}
                              className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider text-foreground hover:text-primary"
                            >
                              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              <span>{vendor}</span>
                              <span className="ml-1 normal-case font-normal text-muted-foreground">
                                · {vendorUnits.length} {vendorUnits.length === 1 ? "unit" : "units"}
                              </span>
                            </button>
                          </td>
                        </tr>
                        {!collapsed && vendorUnits.map((u) => {
                      const excluded = u.included === false;
                      const isHighlighted = u.id === highlightedId;
                      return (
                        <tr
                          key={u.id}
                          onClick={() => setHighlightedId(u.id)}
                          className={`cursor-pointer transition-colors ${u.recommended && !excluded ? "bg-success/5" : ""} ${excluded ? "opacity-50" : ""} ${isHighlighted ? "ring-2 ring-inset ring-[hsl(var(--accent-gold))] bg-[hsl(var(--accent-gold)/0.06)]" : "hover:bg-muted/30"}`}
                        >
                          <td className="px-2 py-2 align-top">
                            <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-start gap-1">
                                {/* Billboard photo */}
                                <div className="flex flex-col items-center gap-0.5">
                                  {u.billboard_photo_url ? (
                                    <div className="relative h-10 w-14 overflow-hidden rounded bg-muted">
                                      <img
                                        src={u.billboard_photo_url}
                                        alt={`Unit ${u.unit_number}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                      {u.low_res_flag && (
                                        <span
                                          title="Low-resolution photo"
                                          className="absolute top-0 right-0 flex h-3 w-3 items-center justify-center rounded-bl bg-warning/90 text-warning-foreground"
                                        >
                                          <AlertCircle className="h-2 w-2" />
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div
                                      className="flex h-10 w-14 items-center justify-center rounded bg-muted text-muted-foreground"
                                      title="No photo"
                                    >
                                      <ImageOff className="h-3 w-3" />
                                    </div>
                                  )}
                                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Photo</span>
                                </div>
                                {/* Map photo — only shown when one exists */}
                                {u.inset_map_url && (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <div className="relative h-10 w-14 overflow-hidden rounded border border-border bg-muted">
                                      <img
                                        src={u.inset_map_url}
                                        alt={`Map for unit ${u.unit_number}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                    </div>
                                    <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Map</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {id && (
                                  <UnitPhotoUpload
                                    campaignId={id}
                                    unitId={u.id}
                                    unitNumber={u.unit_number}
                                    onUploaded={load}
                                  />
                                )}
                                {id && (
                                  <UnitMapUpload
                                    campaignId={id}
                                    unitId={u.id}
                                    unitNumber={u.unit_number}
                                    onUploaded={load}
                                  />
                                )}
                                {u.vendor && detectedVendorCropsRef.current[normalizeVendor(u.vendor)] && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={(e) => { e.stopPropagation(); saveVendorCropDefault(u.vendor); }}
                                    title={`Save the detected crop layout as the default for ${u.vendor}`}
                                  >
                                    Save crop as default for {u.vendor}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top font-medium">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="truncate">{u.unit_number}</span>
                              {u.recommended && (
                                <Badge className="bg-success/15 text-success border border-success/30 gap-0.5 px-1 py-0 text-[9px]">
                                  <Sparkles className="h-2.5 w-2.5" /> Rec
                                </Badge>
                              )}
                              {u.latitude != null && u.longitude != null && (
                                <MapPin className="h-2.5 w-2.5 text-[hsl(var(--accent-gold))]" />
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">{u.vendor}</div>
                          </td>
                          <td className="px-2 py-2 align-top text-muted-foreground">
                            <span className="block truncate">{u.market ?? "—"}</span>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="truncate">{u.format ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {u.size ?? ""}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="font-medium text-foreground break-words leading-snug">
                              {displayAddress(u) || "—"}
                            </div>
                            <div
                              className="mt-0.5 text-[10px] text-muted-foreground leading-snug break-words"
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {u.location_description ?? ""}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                            <HighlightsCell
                              unitId={u.id}
                              unitNumber={u.unit_number}
                              initial={u.highlights}
                              onSaved={(next) =>
                                setUnits((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, highlights: next } : x)),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px]">
                            {fmtNum(u.four_week_impressions)}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px]" title="4-week rate shown in the client Portal (negotiated × margin)">
                            {fmtMoney((u.negotiated_rate_4wk ?? 0) * (1 + ((campaign?.margin_pct ?? 20) / 100)))}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px] text-muted-foreground" title="Flight length in weeks (four_week_periods × 4)">
                            {`${Math.round((u.four_week_periods && u.four_week_periods > 0 ? u.four_week_periods : 1) * 4)} wks`}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px]" title="Margin-applied flight total (matches the client proposal)">
                            {fmtMoney((u.negotiated_rate_4wk ?? 0) * (1 + ((campaign?.margin_pct ?? 20) / 100)) * (u.four_week_periods && u.four_week_periods > 0 ? u.four_week_periods : 1))}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px]">
                            {u.cpm == null ? "—" : `$${u.cpm.toFixed(2)}`}
                          </td>
                          <td
                            className={`px-2 py-2 align-top text-center border-l border-border ${isHighlighted ? "bg-[hsl(var(--accent-gold)/0.10)]" : "bg-muted/30"}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              checked={u.included !== false}
                              onCheckedChange={(v) => toggleField(u, "included", v)}
                            />
                          </td>
                          <td
                            className={`px-2 py-2 align-top text-center border-l border-border ${isHighlighted ? "bg-[hsl(var(--accent-gold)/0.22)]" : "bg-[hsl(var(--accent-gold)/0.12)]"}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center">
                              <Switch
                                checked={!!u.recommended}
                                onCheckedChange={(v) => toggleField(u, "recommended", v)}
                                disabled={excluded}
                              />
                            </div>
                          </td>
                          {TIERS.map((t) => (
                            <td
                              key={t.key}
                              className={`px-2 py-2 align-top text-center border-l border-border ${isHighlighted ? "bg-[hsl(var(--ocean)/0.14)]" : "bg-[hsl(var(--ocean)/0.06)]"}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-center">
                                <Switch
                                  checked={!!u[t.key]}
                                  onCheckedChange={(v) => toggleField(u, t.key, v)}
                                  disabled={excluded}
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                      </Fragment>
                      );
                    })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {id && (
            <CampaignFilesHistory
              campaignId={id}
              units={units.map((u) => ({ id: u.id, unit_number: u.unit_number }))}
              onUnitChanged={load}
            />
          )}
        </>
      )}

      {campaign && (
        <SharePortalDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          campaignId={campaign.id}
          campaignName={campaign.campaign_name}
        />
      )}
      {campaign && (
        <ReuploadFilesDialog
          open={reuploadOpen}
          onOpenChange={setReuploadOpen}
          campaignId={campaign.id}
          onDone={async () => {
            await load();
            await extractPhotos({ silent: true });
            await extractHighlights({ silent: true });
          }}
        />
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-2xl">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    parsing: "bg-warning/15 text-warning-foreground border border-warning/40",
    ready: "bg-success/15 text-success border border-success/30",
    published: "bg-primary/15 text-primary border border-primary/30",
    error: "bg-destructive/10 text-destructive border border-destructive/30",
  };
  return <Badge className={styles[status] ?? styles.draft}>{status}</Badge>;
}
