// Parse vendor RFP Template xlsx files for a campaign.
// - Maps headers via column_map.json (canonical -> column index)
// - Detects "recommended" rows by green fill color (D9EAD3 family)
// - Splits Location Description into bullet points
// - Inserts rows into public.units, updates campaign.status
//
// Auth: requires the caller's JWT. RLS ensures they own the campaign.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COLUMN_MAP: Record<string, string> = {
  "Market": "market",
  "Vendor": "vendor",
  "Unit #": "unit_number",
  "Format": "format",
  "Size": "size",
  "# of Units": "unit_count",
  "Location Description": "location_description",
  "Latitude": "latitude",
  "Longitude": "longitude",
  "Facing": "facing",
  "LHR/RHR": "read_direction",
  "Weekly A18+ Impressions": "weekly_impressions",
  "Weekly/4-Week A18+ Impressions": "weekly_impressions",
  "Weekly / 4-Week A18+ Impressions": "weekly_impressions",
  "4 Week A18+ Impressions": "four_week_impressions",
  "4-Week A18+ Impressions": "four_week_impressions",
  "4 Week Impressions": "four_week_impressions",
  "4-Week Impressions": "four_week_impressions",
  "Four Week Impressions": "four_week_impressions",
  "Four-Week Impressions": "four_week_impressions",
  "A18+ 4 Week Impressions": "four_week_impressions",
  "A18+ Impressions (4 Week)": "four_week_impressions",
  "Spot Length": "spot_length",
  "Loop Length": "loop_length",
  "SOV%": "sov_pct",
  "Current # of Advertisers": "current_advertisers",
  "Start Date": "start_date",
  "End Date": "end_date",
  "# of Four week Periods": "four_week_periods",
  "Artwork Due Date": "artwork_due_date",
  "Notes": "notes",
  // Rate / cost columns
  "4 Week Negotiated Rate": "negotiated_rate_4wk",
  "4-Week Negotiated Rate": "negotiated_rate_4wk",
  "Negotiated Rate": "negotiated_rate_4wk",
  "Net Rate": "negotiated_rate_4wk",
  "4 Week Net Rate": "negotiated_rate_4wk",
  "INTERNAL 4-WEEK RATE": "rate_4week",
  "4 Week Rate Card": "rate_card_4wk",
  "Total Cost": "total_cost",
  "Total": "total_cost",
  "Total Investment": "total_cost",
  "Gross Cost": "total_cost",
  "4 Week Total": "total_cost",
  "Production": "production_cost",
  "Install": "install_cost",
  "CPM": "cpm",
};

// Type B — CCO "Client Grid"
const COLUMN_MAP_B: Record<string, string> = {
  "Panel ID": "unit_number",
  "Market": "market",
  "Media Type": "format",
  "Display Size (h x w)": "size",
  "Description": "location_description",
  "Facing": "facing",
  "Geopath ID": "geopath_id",
  "City": "city",
  "Notes": "notes",
  "Comments": "notes",
};
// CCO fallback: "Flight Name" holds city when "Market" is missing/blank.
const CCO_MARKET_FALLBACK_HEADER = "Flight Name";

// Type C — OFM "Location List"
const COLUMN_MAP_C: Record<string, string> = {
  "Inventory #": "unit_number",
  "Market": "market",
  "Media": "format",
  "Copy Size": "size",
  "Location Description": "location_description",
  "Facing": "facing",
  "IMP 18+ Weekly": "weekly_impressions",
  "IMP 18+ 4 Week": "four_week_impressions",
  "Start Date": "start_date",
  "End Date": "end_date",
  "Latitude": "latitude",
  "Longitude": "longitude",
  "Geopath Spot ID": "geopath_id",
  "Notes": "notes",
  "Comments": "notes",
  "Description": "notes",
};

// Notes-as-highlights heuristic: real sentence prose, not a short code.
function notesLooksLikeProse(s: any): boolean {
  if (s == null) return false;
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t.length <= 40) return false;
  if (!/\s/.test(t)) return false;
  if (!/[.!?]/.test(t)) return false;
  return true;
}

// Strips PDF artifact unit stamps and tidies highlight prose. Idempotent.
function cleanHighlight(text: any): string {
  if (!text) return "";
  let cleaned = String(text)
    .replace(/^SITE\s*#?\s*\d{3,6}\s*(PANEL\s*)?/i, "")
    .replace(/^[A-Z]{0,4}[-\u2010-\u2015\u2212]\d{4,6}[A-Z]?\s*(PANEL\s*)?/i, "")
    .replace(/^#?\d{4,6}\s*(PANEL\s*)?/i, "")
    .replace(/^PANEL\s+/i, "")
    .trim();
  // Mid-text unit stamps like "...Brazilian Day SITE # 18280 PANEL Spa..."
  cleaned = cleaned.replace(/\s*SITE\s*#\s*\d{3,6}.*$/i, "").trim();
  // " Panel <digits>..." / " Panel Dimension..." tails; lookbehind protects
  // real words like "DePaul".
  cleaned = cleaned.replace(/(?<![a-zA-Z])\s+Panel\s+\d.*$/i, "").trim();
  cleaned = cleaned.replace(/(?<![a-zA-Z])\s+Panel\s+Dimension.*$/i, "").trim();
  cleaned = cleaned.replace(/\s+Panel\.?\.?\.?$/i, "").trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  cleaned = cleaned.replace(/\s*\.\.\.\s*$/, "").trim();
  return cleaned;
}


const NUMERIC_FIELDS = new Set([
  "unit_count", "latitude", "longitude", "weekly_impressions",
  "four_week_impressions", "sov_pct", "current_advertisers",
  "four_week_periods", "negotiated_rate_4wk", "rate_card_4wk",
  "rate_4week", "total_cost", "production_cost", "install_cost", "cpm",
]);

const DATE_FIELDS = new Set(["start_date", "end_date", "artwork_due_date"]);
const TEXT_FIELDS_NULLABLE_NUMERIC = new Set(["spot_length", "loop_length"]);

// Recommended detection: green family (D9EAD3 is the spec; allow close variants)
const GREEN_HEXES = new Set(["D9EAD3", "C6EFCE", "B6D7A8", "93C47D"]);

// Normalize: strip surrounding whitespace, collapse internal whitespace
// (including embedded newlines), lowercase. Handles non-breaking spaces.
const norm = (s: string) =>
  s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim().toLowerCase();

function buildHeaderIndexFrom(row: any[], map: Record<string, string>): Record<string, number> {
  const lookup: Record<string, string> = {};
  for (const k of Object.keys(map)) lookup[norm(k)] = map[k];
  const out: Record<string, number> = {};
  row.forEach((cell, idx) => {
    if (cell == null) return;
    const field = lookup[norm(String(cell))];
    if (field && out[field] == null) out[field] = idx;
  });
  return out;
}

function buildHeaderIndex(row: any[]): Record<string, number> {
  return buildHeaderIndexFrom(row, COLUMN_MAP);
}

function rowHasHeaders(row: any[], required: string[]): boolean {
  if (!row) return false;
  const cells = new Set(row.filter((c) => c != null).map((c) => norm(String(c))));
  return required.every((h) => cells.has(norm(h)));
}


function toNumber(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[$,%\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Excel serial date -> ISO yyyy-mm-dd
function excelSerialToISO(n: number): string | null {
  // Excel epoch 1899-12-30 (handles 1900 leap bug)
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toISODate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return excelSerialToISO(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // m/d/yyyy or m-d-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    let yy = m[3];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function splitLocationBullets(desc: string | null): string[] {
  if (!desc) return [];
  return desc
    .split(/[\n;]+|\s-\s/g)
    .map((s) => s.trim().replace(/[-•·]+\s*/, "").trim())
    .filter((s) => s.length > 0);
}

// Parse styles.xml to map styleId -> fill RGB hex (uppercase, no alpha)
async function buildStyleFillMap(fileBuf: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(fileBuf);
  const stylesEntry = zip.file("xl/styles.xml");
  if (!stylesEntry) return [];
  const xml = await stylesEntry.async("string");

  // Collect <fgColor rgb="FFD9EAD3"/> per <fill> in order
  const fills: (string | null)[] = [];
  const fillRe = /<fill\b[^>]*>([\s\S]*?)<\/fill>/g;
  let fm: RegExpExecArray | null;
  while ((fm = fillRe.exec(xml)) !== null) {
    const inner = fm[1];
    const rgb = /<fgColor[^>]*\brgb="([0-9A-Fa-f]{6,8})"/.exec(inner);
    fills.push(rgb ? rgb[1].toUpperCase().slice(-6) : null);
  }

  // Map cellXfs -> fillId
  const xfsBlock = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const styleFill: string[] = [];
  if (xfsBlock) {
    const xfRe = /<xf\b[^>]*\bfillId="(\d+)"/g;
    let xm: RegExpExecArray | null;
    while ((xm = xfRe.exec(xfsBlock[1])) !== null) {
      const fillId = parseInt(xm[1], 10);
      styleFill.push(fills[fillId] ?? "");
    }
  }
  return styleFill;
}

function isRecommendedHex(hex: string | undefined): boolean {
  if (!hex) return false;
  return GREEN_HEXES.has(hex.toUpperCase());
}

// =====================================================================
// Embedded image extraction (Change 2)
// =====================================================================
// Vendors like Clear Channel embed a per-board location map directly in
// their Excel workbook. We crack open the .xlsx (which is a zip) and:
//   1. Read every sheet's drawing relationships.
//   2. Parse anchors from xl/drawings/drawingN.xml — each <xdr:twoCellAnchor>
//      or <xdr:oneCellAnchor> tells us which cell row/col the image sits at.
//   3. Map the image's anchor row to the matching unit_number on that row
//      (with a fallback to the nearest unit_number row above).
//   4. Sheet-level / floating images (no clear row anchor near a unit row)
//      are returned as a campaign overview map.
//
// Image bytes are returned to the caller for upload to the public
// `minimaps` storage bucket.

type ExtractedImage = {
  ext: "png" | "jpg" | "jpeg" | "gif";
  contentType: string;
  bytes: Uint8Array;
  // 0-based sheet row this image is anchored to (or null for sheet-level)
  anchorRow: number | null;
  sheetName: string;
};

const IMG_EXT_RE = /\.(png|jpe?g|gif)$/i;

function extOf(name: string): "png" | "jpg" | "jpeg" | "gif" | null {
  const m = IMG_EXT_RE.exec(name);
  if (!m) return null;
  const e = m[1].toLowerCase();
  return e === "jpeg" ? "jpeg" : (e as any);
}

function ctOf(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Pull every embedded image out of the workbook with its anchoring info.
 * Returns one ExtractedImage per image found (deduped by media path).
 */
async function extractWorkbookImages(
  fileBuf: ArrayBuffer,
  sheetNames: string[],
): Promise<ExtractedImage[]> {
  const zip = await JSZip.loadAsync(fileBuf);
  const out: ExtractedImage[] = [];
  const seenMediaPath = new Set<string>();

  // Build sheet index → file name. xlsx sheet files are xl/worksheets/sheet1.xml,
  // sheet2.xml, etc. — order matches workbook.xml's sheet list, which matches
  // SheetJS's wb.SheetNames order (1-based on disk).
  for (let i = 0; i < sheetNames.length; i++) {
    const sheetName = sheetNames[i];
    const sheetIdx = i + 1;
    const relsEntry = zip.file(`xl/worksheets/_rels/sheet${sheetIdx}.xml.rels`);
    if (!relsEntry) continue;
    const relsXml = await relsEntry.async("string");

    // Find the drawing relationship for this sheet.
    const drawingRelMatch = /<Relationship[^>]*Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/.exec(relsXml);
    if (!drawingRelMatch) continue;
    // Resolve relative path: typically "../drawings/drawing1.xml" from xl/worksheets/_rels/
    const drawingTarget = drawingRelMatch[1].replace(/^\.\.\//, "");
    const drawingPath = drawingTarget.startsWith("xl/") ? drawingTarget : `xl/${drawingTarget}`;

    const drawingEntry = zip.file(drawingPath);
    if (!drawingEntry) continue;
    const drawingXml = await drawingEntry.async("string");

    // Drawing has its own _rels file mapping rId → media path.
    const drawingFileName = drawingPath.split("/").pop()!;
    const drawingRelsPath = drawingPath.replace(drawingFileName, `_rels/${drawingFileName}.rels`);
    const drawingRelsEntry = zip.file(drawingRelsPath);
    if (!drawingRelsEntry) continue;
    const drawingRelsXml = await drawingRelsEntry.async("string");

    const ridToMedia = new Map<string, string>();
    const relRe = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let rm: RegExpExecArray | null;
    while ((rm = relRe.exec(drawingRelsXml)) !== null) {
      const target = rm[2].replace(/^\.\.\//, "");
      ridToMedia.set(rm[1], target.startsWith("xl/") ? target : `xl/${target}`);
    }

    // Walk every anchor in the drawing.
    // Two-cell anchor: <xdr:twoCellAnchor> ... <xdr:from><xdr:row>R</xdr:row>...
    // One-cell anchor: <xdr:oneCellAnchor> ... <xdr:from><xdr:row>R</xdr:row>...
    // Absolute anchor: <xdr:absoluteAnchor> — no cell row, treat as sheet-level.
    const anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g;
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(drawingXml)) !== null) {
      const anchorKind = am[1];
      const inner = am[2];

      let anchorRow: number | null = null;
      if (anchorKind !== "absoluteAnchor") {
        const fromRow = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(inner);
        if (fromRow) anchorRow = parseInt(fromRow[1], 10); // already 0-indexed
      }

      // Pick up the embedded image rId.
      const blip = /<a:blip[^>]*r:embed="([^"]+)"/.exec(inner);
      if (!blip) continue;
      const mediaPath = ridToMedia.get(blip[1]);
      if (!mediaPath || !IMG_EXT_RE.test(mediaPath)) continue;
      if (seenMediaPath.has(`${sheetName}|${mediaPath}|${anchorRow}`)) continue;
      seenMediaPath.add(`${sheetName}|${mediaPath}|${anchorRow}`);

      const mediaEntry = zip.file(mediaPath);
      if (!mediaEntry) continue;
      const ext = extOf(mediaPath);
      if (!ext) continue;
      const bytes = await mediaEntry.async("uint8array");

      out.push({
        ext: ext === "jpeg" ? "jpg" : ext,
        contentType: ctOf(ext),
        bytes,
        anchorRow,
        sheetName,
      });
    }
  }
  return out;
}

/**
 * Match an image's anchor row to a unit_number on that row, falling back
 * to the nearest unit_number row above. Returns null if the image sits
 * above the first data row (treat as sheet-level / overview map).
 */
function matchImageToUnit(
  anchorRow: number | null,
  rowToUnit: Map<number, string>,
  headerRow: number,
): string | null {
  if (anchorRow == null) return null;
  if (anchorRow <= headerRow) return null;
  // Exact match
  if (rowToUnit.has(anchorRow)) return rowToUnit.get(anchorRow)!;
  // Walk up to closest data row above
  for (let r = anchorRow - 1; r > headerRow; r--) {
    if (rowToUnit.has(r)) return rowToUnit.get(r)!;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { campaign_id?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const campaignId = payload.campaign_id;
  if (!campaignId || typeof campaignId !== "string") {
    return new Response(JSON.stringify({ error: "campaign_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mark campaign as parsing + open job
  await supabase.from("campaigns").update({ status: "parsing" }).eq("id", campaignId);
  const { data: jobRow } = await supabase
    .from("jobs")
    .insert({ campaign_id: campaignId, kind: "parse-excel", status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  const jobId = jobRow?.id;

  try {
    // Fetch vendor excel files for this campaign
    const { data: files, error: filesErr } = await supabase
      .from("vendor_files")
      .select("id, storage_path, original_name, vendor")
      .eq("campaign_id", campaignId)
      .eq("kind", "excel");
    if (filesErr) throw filesErr;
    if (!files || files.length === 0) throw new Error("No Excel files found for this campaign");

    // NOTE: previously this deleted all units for the campaign before re-inserting.
    // That wiped billboard_photo_url / inset_map_url whenever the user re-uploaded.
    // We now upsert by (campaign_id, unit_number) so existing units (and their
    // photos / map URLs / manual edits) are preserved across re-parses.

    // Fetch campaign margin_pct for total_cost fallback calculation
    const { data: campaignData } = await supabase
      .from("campaigns")
      .select("margin_pct")
      .eq("id", campaignId)
      .single();
    const marginPct = campaignData?.margin_pct ?? 0;

    const summary = {
      campaign_id: campaignId,
      files: [] as Array<{ name: string; rows: number; recommended: number; images_matched: number; overview_images: number }>,
      total_units: 0,
      total_recommended: 0,
      total_images_matched: 0,
      total_overview_images: 0,
    };

    for (const f of files) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("uploads")
        .download(f.storage_path);
      if (dlErr || !blob) throw dlErr ?? new Error(`Download failed: ${f.storage_path}`);

      const buf = await blob.arrayBuffer();
      const styleFillMap = await buildStyleFillMap(buf);
      const wb = XLSX.read(buf, { type: "array", cellStyles: true, cellDates: false });

      // Detect the workbook format:
      //   Type A — standard "RFP Template" (≥8 standard headers in rows 0-4)
      //   Type B — CCO: header row contains "Panel ID" + "Display Size (h x w)"
      //   Type C — OFM: sheet named "Location List" OR header row (rows 0-11)
      //                  with "Inventory #" + "Location Description"
      let chosen: XLSX.WorkSheet | null = null;
      let headerRow = 0;
      let headerIdx: Record<string, number> = {};
      let formatKind: "A" | "B" | "C" = "A";
      let flightNameCol: number | null = null; // CCO market fallback

      // Pass 1: Type A (existing behavior).
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
        for (let r = 0; r < Math.min(grid.length, 5); r++) {
          const idx = buildHeaderIndex(grid[r]);
          if (Object.keys(idx).length >= 8) {
            chosen = ws; headerRow = r; headerIdx = idx; formatKind = "A";
            break;
          }
        }
        if (chosen) break;
      }

      // Pass 2: Type B (CCO) — scan rows 0-11 for "Panel ID" + "Display Size (h x w)".
      if (!chosen) {
        for (const sn of wb.SheetNames) {
          const ws = wb.Sheets[sn];
          const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
          for (let r = 0; r < Math.min(grid.length, 12); r++) {
            if (rowHasHeaders(grid[r], ["Panel ID", "Display Size (h x w)"])) {
              chosen = ws; headerRow = r; formatKind = "B";
              headerIdx = buildHeaderIndexFrom(grid[r], COLUMN_MAP_B);
              // Find Flight Name column for market fallback.
              grid[r].forEach((cell, idx) => {
                if (cell != null && norm(String(cell)) === norm(CCO_MARKET_FALLBACK_HEADER)) {
                  flightNameCol = idx;
                }
              });
              break;
            }
          }
          if (chosen) break;
        }
      }

      // Pass 3: Type C (OFM) — sheet named "Location List", or header row 0-11
      // with "Inventory #" + "Location Description".
      if (!chosen) {
        const ofmSheet = wb.SheetNames.find((sn) => norm(sn) === "location list");
        const candidateSheets = ofmSheet ? [ofmSheet] : wb.SheetNames;
        for (const sn of candidateSheets) {
          const ws = wb.Sheets[sn];
          const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
          for (let r = 0; r < Math.min(grid.length, 12); r++) {
            if (rowHasHeaders(grid[r], ["Inventory #", "Location Description"])) {
              chosen = ws; headerRow = r; formatKind = "C";
              headerIdx = buildHeaderIndexFrom(grid[r], COLUMN_MAP_C);
              break;
            }
          }
          if (chosen) break;
        }
      }

      if (!chosen) {
        console.warn(`[parse-excel] No usable sheet in ${f.original_name}`);
        continue;
      }
      console.info(`[parse-excel] ${f.original_name}: detected format ${formatKind}, header row ${headerRow}, mapped fields:`, Object.keys(headerIdx));


      const grid = XLSX.utils.sheet_to_json<any[]>(chosen, { header: 1, raw: true, defval: null });
      const rows = grid.slice(headerRow + 1);
      const range = XLSX.utils.decode_range(chosen["!ref"]!);

      const inserts: any[] = [];
      let recommendedCount = 0;
      // Track which sheet row each unit_number lives on, for image anchoring.
      const rowToUnit = new Map<number, string>();
      const chosenSheetName = wb.SheetNames.find((sn) => wb.Sheets[sn] === chosen)!;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((c: any) => c == null || c === "")) continue;

        const unitNumberIdx = headerIdx["unit_number"];
        const unitNumber = unitNumberIdx != null ? r[unitNumberIdx] : null;
        if (!unitNumber) continue;

        // Determine recommended via fill color of the row's first non-null mapped cell
        const sheetRow = headerRow + 1 + i; // 0-indexed sheet row
        const trimmedUnit = String(unitNumber).trim();
        rowToUnit.set(sheetRow, trimmedUnit);
        let recommended = false;
        const probeCols = [
          headerIdx["market"], headerIdx["unit_number"], headerIdx["vendor"], headerIdx["format"],
        ].filter((x) => x != null) as number[];
        for (const colIdx of probeCols) {
          const addr = XLSX.utils.encode_cell({ r: sheetRow, c: colIdx });
          const cell = (chosen as any)[addr];
          if (!cell) continue;
          const styleId = cell.s;
          let hex: string | undefined;
          if (typeof styleId === "number" && styleFillMap[styleId]) {
            hex = styleFillMap[styleId];
          } else if (cell.s && typeof cell.s === "object") {
            const fg = cell.s.fgColor?.rgb || cell.s.bgColor?.rgb;
            if (fg) hex = String(fg).toUpperCase().slice(-6);
          }
          if (isRecommendedHex(hex)) { recommended = true; break; }
        }
        if (recommended) recommendedCount++;

        const row: Record<string, any> = {
          campaign_id: campaignId,
          unit_number: trimmedUnit,
          recommended,
          included: true,
          vendor: (headerIdx["vendor"] != null && r[headerIdx["vendor"]]) || f.vendor || null,
          // Position of this row within its sheet (0-based, in Excel order).
          // Used by photo extraction for order-strategy vendors (CCO / Lamar /
          // Be Seen) so page N of the deck maps to the Nth Excel row.
          row_index: i,
        };

        for (const [field, idx] of Object.entries(headerIdx)) {
          if (field === "unit_number" || field === "vendor") continue;
          const raw = r[idx];
          if (raw == null || raw === "") continue;
          if (DATE_FIELDS.has(field)) {
            row[field] = toISODate(raw);
          } else if (NUMERIC_FIELDS.has(field)) {
            row[field] = toNumber(raw);
          } else if (TEXT_FIELDS_NULLABLE_NUMERIC.has(field)) {
            row[field] = String(raw);
          } else {
            row[field] = typeof raw === "string" ? raw.trim() : raw;
          }
        }

        // Diagnostic: log raw values from the source columns so we can confirm
        // headers were matched correctly (impressions / rate mapping issues).
        if (i < 3 || row.four_week_impressions == null) {
          const fwIdx = headerIdx["four_week_impressions"];
          const negIdx = headerIdx["negotiated_rate_4wk"];
          console.info(
            `[parse-excel] ${f.original_name} row ${sheetRow} unit=${trimmedUnit}`,
            `four_week_impressions(col=${fwIdx})=`, fwIdx != null ? r[fwIdx] : "<no col>",
            `negotiated_rate_4wk(col=${negIdx})=`, negIdx != null ? r[negIdx] : "<no col>"
          );
        }

        // CCO fallback: when "Market" is missing/blank, use "Flight Name"
        // (which holds the city, e.g. Chicago / Los Angeles).
        if (formatKind === "B" && (!row.market || String(row.market).trim() === "") && flightNameCol != null) {
          const fn = r[flightNameCol];
          if (fn != null && String(fn).trim() !== "") row.market = String(fn).trim();
        }

        if (row.location_description) {
          row.insight_bullets = splitLocationBullets(row.location_description);
        }


        // Fallback total_cost calculation from negotiated rate or internal rate
        const tc = toNumber(row.total_cost);
        if (!tc || tc <= 0) {
          const negRate = toNumber(row.negotiated_rate_4wk);
          const intRate = toNumber(row.rate_4week);
          const sourceRate = (negRate && negRate > 0) ? negRate : ((intRate && intRate > 0) ? intRate : null);
          if (sourceRate) {
            row.total_cost = Math.round(sourceRate * (1 + marginPct / 100));
          }
        }

        // Notes → highlights (when prose). Real sentence text only — skip
        // short codes / blank cells. Don't overwrite an existing highlights
        // value (e.g. from a prior PDF extraction).
        if (!row.highlights && notesLooksLikeProse(row.notes)) {
          row.highlights = cleanHighlight(String(row.notes).replace(/\s+/g, " ").trim());
          if (!row.highlights) delete row.highlights;
        }

        inserts.push(row);
      }


      if (inserts.length > 0) {
        // Dedupe by unit_number within this file — Postgres ON CONFLICT cannot
        // affect the same row twice in a single statement. Last occurrence wins.
        const seen = new Map<string, any>();
        for (const row of inserts) seen.set(row.unit_number, row);
        const deduped = Array.from(seen.values());

        // Preserve existing highlights when the new row doesn't derive one
        // from Notes — otherwise PostgREST bulk upsert would null them out
        // for rows missing the key (column union across the batch).
        const unitNums = deduped.map((r) => r.unit_number);
        const { data: existingHl } = await supabase
          .from("units")
          .select("unit_number, highlights")
          .eq("campaign_id", campaignId)
          .in("unit_number", unitNums);
        const hlByUnit = new Map<string, string | null>();
        (existingHl ?? []).forEach((u: any) => hlByUnit.set(String(u.unit_number).trim(), u.highlights));
        for (const row of deduped) {
          if (!row.highlights) {
            const prev = hlByUnit.get(row.unit_number);
            if (prev) row.highlights = prev;
          }
        }

        // Upsert in batches of 200 — preserves photo URLs, map URLs, and any
        // admin edits because we match on (campaign_id, unit_number).
        for (let i = 0; i < deduped.length; i += 200) {
          const chunk = deduped.slice(i, i + 200);
          const { error: insErr } = await supabase
            .from("units")
            .upsert(chunk, {
              onConflict: "campaign_id,unit_number",
              ignoreDuplicates: false,
            });
          if (insErr) throw insErr;
        }
      }


      // ---- Change 2: extract embedded vendor images from this workbook ----
      // We do this after upsert so unit ids exist. Per-board images go to
      // units.inset_map_url (only if currently null — never overwrite manual
      // uploads). Sheet-level / floating images become the campaign overview
      // map (stored on campaigns.vendor_overview_map_url for later use).
      let imagesMatched = 0;
      let overviewImages = 0;
      try {
        const images = await extractWorkbookImages(buf, wb.SheetNames);
        // Restrict to images on the chosen data sheet — other sheets are noise.
        const sheetImages = images.filter((im) => im.sheetName === chosenSheetName);

        // Look up unit ids for this campaign so we can write inset_map_url.
        const { data: existingUnits } = await supabase
          .from("units")
          .select("id, unit_number, inset_map_url")
          .eq("campaign_id", campaignId);
        const unitByNumber = new Map<string, { id: string; inset_map_url: string | null }>();
        (existingUnits ?? []).forEach((u: any) =>
          unitByNumber.set(String(u.unit_number).trim(), { id: u.id, inset_map_url: u.inset_map_url }),
        );

        for (const img of sheetImages) {
          const matched = matchImageToUnit(img.anchorRow, rowToUnit, headerRow);
          if (matched) {
            const u = unitByNumber.get(matched);
            if (!u) continue;
            // Don't overwrite a manually-uploaded or previously-extracted map.
            if (u.inset_map_url) continue;
            const path = `${campaignId}/${u.id}-vendor-map.${img.ext}`;
            const up = await supabase.storage
              .from("minimaps")
              .upload(path, img.bytes, { contentType: img.contentType, upsert: true });
            if (up.error) {
              console.warn(`[parse-excel] image upload failed for ${matched}:`, up.error.message);
              continue;
            }
            const { data: pub } = supabase.storage.from("minimaps").getPublicUrl(path);
            const { error: updErr } = await supabase
              .from("units")
              .update({ inset_map_url: pub.publicUrl })
              .eq("id", u.id);
            if (updErr) {
              console.warn(`[parse-excel] inset_map_url write failed for ${matched}:`, updErr.message);
              continue;
            }
            // Cache so a second image for the same row doesn't overwrite.
            u.inset_map_url = pub.publicUrl;
            imagesMatched++;
          } else {
            // Sheet-level / overview map. Store the FIRST one we see per file.
            // (Heather said don't render yet, but extract & store.)
            if (overviewImages > 0) continue;
            const path = `${campaignId}/overview-${f.id}.${img.ext}`;
            const up = await supabase.storage
              .from("minimaps")
              .upload(path, img.bytes, { contentType: img.contentType, upsert: true });
            if (up.error) {
              console.warn(`[parse-excel] overview upload failed:`, up.error.message);
              continue;
            }
            const { data: pub } = supabase.storage.from("minimaps").getPublicUrl(path);
            await supabase
              .from("campaigns")
              .update({ vendor_overview_map_url: pub.publicUrl })
              .eq("id", campaignId);
            overviewImages++;
          }
        }
      } catch (imgErr: any) {
        // Image extraction must never fail the parse — log and continue.
        console.warn(`[parse-excel] image extraction failed for ${f.original_name}:`, imgErr?.message ?? imgErr);
      }

      summary.files.push({
        name: f.original_name ?? f.storage_path,
        rows: inserts.length,
        recommended: recommendedCount,
        images_matched: imagesMatched,
        overview_images: overviewImages,
      });
      summary.total_units += inserts.length;
      summary.total_recommended += recommendedCount;
      summary.total_images_matched += imagesMatched;
      summary.total_overview_images += overviewImages;
    }

    await supabase.from("campaigns").update({ status: "ready" }).eq("id", campaignId);
    if (jobId) {
      await supabase.from("jobs").update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[parse-excel] error", err);
    const message = err?.message ?? String(err);
    await supabase.from("campaigns").update({ status: "error" }).eq("id", campaignId);
    if (jobId) {
      await supabase.from("jobs").update({
        status: "failed",
        error_message: message,
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
