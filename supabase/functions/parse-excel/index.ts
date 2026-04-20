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
  "4 Week A18+ Impressions": "four_week_impressions",
  "Spot Length": "spot_length",
  "Loop Length": "loop_length",
  "SOV%": "sov_pct",
  "Current # of Advertisers": "current_advertisers",
  "Start Date": "start_date",
  "End Date": "end_date",
  "# of Four week Periods": "four_week_periods",
  "4 Week Rate Card": "rate_card_4wk",
  "4 Week Negotiated Rate": "negotiated_rate_4wk",
  "INTERNAL 4-WEEK RATE": "rate_4week",
  "Production": "production_cost",
  "Install": "install_cost",
  "Total Cost": "total_cost",
  "CPM": "cpm",
  "Artwork Due Date": "artwork_due_date",
  "Notes": "notes",
};

const NUMERIC_FIELDS = new Set([
  "unit_count", "latitude", "longitude", "weekly_impressions",
  "four_week_impressions", "sov_pct", "current_advertisers",
  "four_week_periods", "rate_card_4wk", "negotiated_rate_4wk",
  "rate_4week", "production_cost", "install_cost", "total_cost", "cpm",
]);

const DATE_FIELDS = new Set(["start_date", "end_date", "artwork_due_date"]);
const TEXT_FIELDS_NULLABLE_NUMERIC = new Set(["spot_length", "loop_length"]);

// Recommended detection: green family (D9EAD3 is the spec; allow close variants)
const GREEN_HEXES = new Set(["D9EAD3", "C6EFCE", "B6D7A8", "93C47D"]);

const norm = (s: string) =>
  s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim().toLowerCase();

function buildHeaderIndex(row: any[]): Record<string, number> {
  const lookup: Record<string, string> = {};
  for (const k of Object.keys(COLUMN_MAP)) lookup[norm(k)] = COLUMN_MAP[k];
  const out: Record<string, number> = {};
  row.forEach((cell, idx) => {
    if (cell == null) return;
    const field = lookup[norm(String(cell))];
    if (field) out[field] = idx;
  });
  return out;
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

    // Clear previous parse for this campaign (idempotent re-run)
    await supabase.from("units").delete().eq("campaign_id", campaignId);

    const summary = {
      campaign_id: campaignId,
      files: [] as Array<{ name: string; rows: number; recommended: number }>,
      total_units: 0,
      total_recommended: 0,
    };

    for (const f of files) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("uploads")
        .download(f.storage_path);
      if (dlErr || !blob) throw dlErr ?? new Error(`Download failed: ${f.storage_path}`);

      const buf = await blob.arrayBuffer();
      const styleFillMap = await buildStyleFillMap(buf);
      const wb = XLSX.read(buf, { type: "array", cellStyles: true, cellDates: false });

      // Pick the first sheet with a header row that maps to our schema
      let chosen: XLSX.WorkSheet | null = null;
      let headerRow = 0;
      let headerIdx: Record<string, number> = {};

      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
        for (let r = 0; r < Math.min(grid.length, 5); r++) {
          const idx = buildHeaderIndex(grid[r]);
          if (Object.keys(idx).length >= 8) {
            chosen = ws;
            headerRow = r;
            headerIdx = idx;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) {
        console.warn(`[parse-excel] No usable sheet in ${f.original_name}`);
        continue;
      }

      const grid = XLSX.utils.sheet_to_json<any[]>(chosen, { header: 1, raw: true, defval: null });
      const rows = grid.slice(headerRow + 1);
      const range = XLSX.utils.decode_range(chosen["!ref"]!);

      const inserts: any[] = [];
      let recommendedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((c: any) => c == null || c === "")) continue;

        const unitNumberIdx = headerIdx["unit_number"];
        const unitNumber = unitNumberIdx != null ? r[unitNumberIdx] : null;
        if (!unitNumber) continue;

        // Determine recommended via fill color of the row's first non-null mapped cell
        const sheetRow = headerRow + 1 + i; // 0-indexed sheet row
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
          unit_number: String(unitNumber).trim(),
          recommended,
          included: true,
          vendor: (headerIdx["vendor"] != null && r[headerIdx["vendor"]]) || f.vendor || null,
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

        if (row.location_description) {
          row.insight_bullets = splitLocationBullets(row.location_description);
        }

        inserts.push(row);
      }

      if (inserts.length > 0) {
        // Insert in batches of 200
        for (let i = 0; i < inserts.length; i += 200) {
          const chunk = inserts.slice(i, i + 200);
          const { error: insErr } = await supabase.from("units").insert(chunk);
          if (insErr) throw insErr;
        }
      }

      summary.files.push({
        name: f.original_name ?? f.storage_path,
        rows: inserts.length,
        recommended: recommendedCount,
      });
      summary.total_units += inserts.length;
      summary.total_recommended += recommendedCount;
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
