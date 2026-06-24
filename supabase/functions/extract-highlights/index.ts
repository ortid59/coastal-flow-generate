// Extract a "highlights" descriptive paragraph from each page of the
// vendor Photo Sheets PDF, match the page to a unit by its 6-digit
// unit number, and store on units.highlights.
//
// Auth: caller JWT required. RLS ensures campaign ownership.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strip leading '#' and surrounding whitespace, uppercase for comparison.
function normalizeUnitToken(s: string): string {
  return String(s ?? "").replace(/^#/, "").trim().toUpperCase();
}

// Broad unit-number token pattern, see extract-photos for the format list.
const UNIT_TOKEN_RE = /#?\b([A-Z]{0,4}-?[A-Z]{0,4}-?\d{2,6}[A-Z]?)\b/gi;


/**
 * Extract structured fields like Geopath ID, Media Type, Facing, City, Zip
 * from a page's flat text. Returns only fields that were confidently found.
 */
function extractStructuredFields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const norm = text.replace(/\s+/g, " ");

  const geopath = /Geopath\s*ID\s*[:#]?\s*(\d{4,})/i.exec(norm);
  if (geopath) out.geopath_id = geopath[1];

  const media = /Media\s*Type\s*[:#]?\s*([A-Za-z][A-Za-z\s/&-]{2,30}?)(?=\s+(?:Facing|Size|City|Zip|Latitude|Longitude|Geopath|$))/i.exec(norm);
  if (media) out.media_type = media[1].trim();

  const facing = /\bFacing\s*[:#]?\s*([NSEW]{1,3})\b/i.exec(norm);
  if (facing) out.facing = facing[1].toUpperCase();

  const city = /\bCity\s*[:#]?\s*([A-Z][A-Z\s.'-]{1,40}?)(?=\s+(?:Zip|State|Facing|Size|Latitude|Longitude|Geopath|$))/i.exec(norm);
  if (city) out.city = city[1].trim();

  const zip = /\bZip\s*(?:Code)?\s*[:#]?\s*(\d{5}(?:-\d{4})?)/i.exec(norm);
  if (zip) out.zip = zip[1];

  return out;
}

/** Patterns that identify vendor boilerplate / legal disclaimers we never want
 *  in the client-facing highlights. If any match, the paragraph is dropped. */
const BOILERPLATE_PATTERNS: RegExp[] = [
  /geopath/i,
  /geopath\s+impressions?/i,
  /audience\s+location\s+measurement/i,
  /bentley\s+system/i,
  /©\s*copyright/i,
  /all\s+rights\s+reserved/i,
  /intellectual\s+property/i,
  /proprietary/i,
  /source\s*:\s*\d{6,}/i,
  /spot\s+in\s+rotation/i,
  /this\s+proposal\s*\/\s*photosheet/i,
];

/** Strip any leading/trailing boilerplate sentences from a paragraph the
 *  scorer kept (e.g., disclaimer text bleeding into the prose block). */
function stripBoilerplateSentences(text: string): string {
  // Split into sentences while keeping terminators.
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text];
  const cleaned = sentences.filter(
    (s) => !BOILERPLATE_PATTERNS.some((re) => re.test(s)),
  );
  return cleaned.join(" ").replace(/\s+/g, " ").trim();
}

/** Group PDF text items into lines based on Y position, then join lines into
 *  paragraph blocks separated by larger vertical gaps. Return the longest
 *  prose-like block (one with the most word characters and at least one period).
 */
function extractLongestParagraph(items: Array<{ str: string; transform?: number[] }>): string {
  if (!items?.length) return "";

  // Group items by approximate Y position (line)
  const lines: { y: number; text: string }[] = [];
  for (const it of items) {
    const txt = (it.str ?? "").trim();
    if (!txt) continue;
    const y = it.transform?.[5] ?? 0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) < 2) {
      last.text += " " + txt;
    } else {
      lines.push({ y, text: txt });
    }
  }
  if (!lines.length) return "";

  // Sort top-to-bottom (PDF y is bottom-up, so descending)
  lines.sort((a, b) => b.y - a.y);

  // Group into paragraph blocks based on Y gap
  const gaps = lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y));
  const medianGap = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 14;
  const paragraphs: string[] = [];
  let current = lines[0]?.text ?? "";
  for (let i = 1; i < lines.length; i++) {
    const gap = Math.abs(lines[i - 1].y - lines[i].y);
    if (gap > medianGap * 1.8) {
      if (current.trim()) paragraphs.push(current.trim());
      current = lines[i].text;
    } else {
      current += " " + lines[i].text;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());

  // Score each paragraph: prefer many words + presence of sentence punctuation,
  // and exclude things that look like data fields (mostly numbers, $, "Unit #")
  // and any vendor boilerplate / legal disclaimers.
  const scored = paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 60)
    .filter((p) => !/^[\s\d$%.,:/\-]+$/.test(p))
    .filter((p) => !BOILERPLATE_PATTERNS.some((re) => re.test(p)))
    .map((p) => {
      const words = p.split(/\s+/).length;
      const sentences = (p.match(/[.!?]/g) ?? []).length;
      const numericRatio = (p.match(/\d/g)?.length ?? 0) / p.length;
      const score = words + sentences * 5 - numericRatio * 50;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.p ?? "";
  // Final pass: strip any boilerplate sentence that may have merged in.
  return stripBoilerplateSentences(best);
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

  const { data: jobRow } = await supabase
    .from("jobs")
    .insert({
      campaign_id: campaignId,
      kind: "extract-highlights",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const jobId = jobRow?.id;

  try {
    const { data: units, error: uErr } = await supabase
      .from("units")
      .select("id, unit_number")
      .eq("campaign_id", campaignId);
    if (uErr) throw uErr;
    if (!units || units.length === 0) {
      throw new Error("No units. Parse the Excel first.");
    }
    const unitNumbers = units.map((u) => u.unit_number);
    const unitIdByNumber = new Map(units.map((u) => [u.unit_number, u.id]));

    // Find the photosheets PDF for this campaign (kind='photosheets' OR
    // a single PDF whose name contains 'photosheet' or 'maps').
    const { data: vendorFiles, error: fErr } = await supabase
      .from("vendor_files")
      .select("id, storage_path, original_name, kind")
      .eq("campaign_id", campaignId);
    if (fErr) throw fErr;

    const candidates = (vendorFiles ?? []).filter(
      (f) =>
        f.kind === "photosheets" ||
        (f.kind === "pdf" && /photosheet|photo[\s_-]?sheet|maps/i.test(f.original_name ?? "")),
    );

    if (candidates.length === 0) {
      // Fallback: process any PDFs available.
      const fallback = (vendorFiles ?? []).filter((f) => f.kind === "pdf");
      if (fallback.length === 0) throw new Error("No photosheets PDF uploaded.");
      candidates.push(...fallback);
    }

    const summary = {
      campaign_id: campaignId,
      pdfs_processed: 0,
      pages_processed: 0,
      units_with_highlights: 0,
    };

    // unit_number -> highlights paragraphs to merge
    const collected = new Map<string, string[]>();

    for (const f of candidates) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("uploads")
        .download(f.storage_path);
      if (dlErr || !blob) {
        console.warn(`[extract-highlights] download failed: ${f.storage_path}`);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let pdf: any;
      try {
        pdf = await getDocumentProxy(bytes);
      } catch (e) {
        console.warn(`[extract-highlights] unpdf failed: ${(e as Error).message}`);
        continue;
      }
      summary.pdfs_processed++;

      const total = pdf.numPages as number;
      for (let p = 1; p <= total; p++) {
        summary.pages_processed++;
        try {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent();
          const items = tc.items as Array<{ str: string; transform?: number[] }>;
          const flatText = items.map((it) => it.str).join(" ");

          // Match a unit number on this page (prefer longest)
          const sorted = [...unitNumbers].sort((a, b) => b.length - a.length);
          let match: string | null = null;
          for (const u of sorted) {
            const re = new RegExp(`(^|[^a-z0-9])${escapeRe(u)}([^a-z0-9]|$)`, "i");
            if (re.test(flatText)) {
              match = u;
              break;
            }
          }
          if (!match) continue;

          const para = extractLongestParagraph(items);
          if (para) {
            const arr = collected.get(match) ?? [];
            arr.push(para);
            collected.set(match, arr);
          }

          // Extract structured fields from this page's flat text
          const structured = extractStructuredFields(flatText);
          if (Object.keys(structured).length > 0) {
            const unitId = unitIdByNumber.get(match);
            if (unitId) {
              await supabase.from("units").update(structured).eq("id", unitId);
            }
          }
        } catch (e) {
          console.warn(`[extract-highlights] page ${p} error: ${(e as Error).message}`);
        }
      }
    }

    // Persist
    for (const [unitNumber, paras] of collected) {
      const unitId = unitIdByNumber.get(unitNumber);
      if (!unitId) continue;
      const merged = paras.join(" ").replace(/\s+/g, " ").trim();
      if (!merged) continue;
      const { error: updErr } = await supabase
        .from("units")
        .update({ highlights: merged })
        .eq("id", unitId);
      if (!updErr) summary.units_with_highlights++;
    }

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
    console.error("[extract-highlights] error", err);
    const message = err?.message ?? String(err);
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
