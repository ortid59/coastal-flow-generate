// Extract billboard photos and inset maps from vendor Photo Sheets PDFs.
//
// Strategy (Clear Channel format, tuned per vendor going forward):
//  1. Open the PDF with mupdf-wasm (works in Deno without a DOM canvas).
//  2. Page 1 = full-campaign overview map. Render the whole page as PNG and
//     store on campaigns.vendor_overview_map_url. Do not match to any unit.
//  3. Pages 2..N = one billboard per page. Read the page text, extract the
//     6-digit unit number (pattern: "001115 – Jacksonville"), then render the
//     page TWICE with different CropBox values to get:
//       - billboard photo: x 0%,  y 35%, w 58%, h 60%  -> billboard_photo_url
//       - inset map:       x 58%, y 5%,  w 42%, h 52%  -> inset_map_url
//     Match unit_number to the units table (same campaign) and write — but
//     only if the field is currently null (do not overwrite manual uploads).
//  4. Unmatched / unrecognised pages are skipped with a warning, not fatal.
//
// Auth: caller JWT required. RLS ensures campaign ownership.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// mupdf-wasm runs in Deno and does not need a browser canvas.
import * as mupdf from "https://esm.sh/mupdf@1.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RENDER_DPI = 150;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

// Crop regions tuned for Clear Channel photo-sheet layout.
// Coordinates are fractions of the full page bounds.
const CROP_BILLBOARD = { x: 0.00, y: 0.35, w: 0.58, h: 0.60 };
const CROP_MAP       = { x: 0.58, y: 0.05, w: 0.42, h: 0.52 };

// "001115 – Jacksonville" — 6 digits, en-dash or hyphen, then a city word.
// Allow surrounding whitespace; allow either – (U+2013) or - .
const UNIT_HEADER_RE = /(\b\d{6})\s*[–-]\s*[A-Za-z]/;

// ---------- helpers ----------

function renderPagePng(
  doc: any,
  pageIndex: number,
  cropFraction?: { x: number; y: number; w: number; h: number },
): Uint8Array | null {
  const page = doc.loadPage(pageIndex);
  try {
    const bounds = page.getBounds(); // [x0, y0, x1, y1] in PDF points
    const pageW = bounds[2] - bounds[0];
    const pageH = bounds[3] - bounds[1];

    if (cropFraction) {
      const cx0 = bounds[0] + pageW * cropFraction.x;
      const cy0 = bounds[1] + pageH * cropFraction.y;
      const cx1 = cx0 + pageW * cropFraction.w;
      const cy1 = cy0 + pageH * cropFraction.h;
      try {
        // PDFPage.setPageBox lets us redefine the CropBox so the next render
        // only covers the region we want.
        page.setPageBox("CropBox", [cx0, cy0, cx1, cy1]);
      } catch (e) {
        console.warn("[extract-photos] setPageBox failed:", (e as Error).message);
      }
    }

    const zoom = RENDER_DPI / 72;
    const matrix = [zoom, 0, 0, zoom, 0, 0];
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      const png = pixmap.asPNG();
      return png instanceof Uint8Array ? png : new Uint8Array(png);
    } finally {
      try { pixmap.destroy?.(); } catch { /* ignore */ }
    }
  } finally {
    try { page.destroy?.(); } catch { /* ignore */ }
  }
}

function getPageText(doc: any, pageIndex: number): string {
  const page = doc.loadPage(pageIndex);
  try {
    // structuredText("preserve-whitespace") -> StructuredText; then asText()
    const st = page.toStructuredText("preserve-whitespace");
    try {
      const txt = st.asText?.() ?? "";
      return typeof txt === "string" ? txt : String(txt);
    } finally {
      try { st.destroy?.(); } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn("[extract-photos] text extract failed:", (e as Error).message);
    return "";
  } finally {
    try { page.destroy?.(); } catch { /* ignore */ }
  }
}

function extractUnitNumber(text: string): string | null {
  if (!text) return null;
  const m = text.match(UNIT_HEADER_RE);
  return m ? m[1] : null;
}

// ---------- main handler ----------

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
      kind: "extract-photos",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const jobId = jobRow?.id;

  const summary = {
    campaign_id: campaignId,
    pdfs_processed: 0,
    pages_processed: 0,
    overview_pages: 0,
    units_with_photo: 0,
    units_with_map: 0,
    units_skipped_existing: 0,
    pages_unmatched: 0,
    low_res_count: 0, // kept for response shape compat
  };

  try {
    // Load units & their current image state so we never overwrite a manual upload.
    const { data: units, error: uErr } = await supabase
      .from("units")
      .select("id, unit_number, billboard_photo_url, inset_map_url")
      .eq("campaign_id", campaignId);
    if (uErr) throw uErr;
    if (!units || units.length === 0) {
      throw new Error("No units to attach photos to. Parse the Excel first.");
    }

    type UnitRow = { id: string; unit_number: string; billboard_photo_url: string | null; inset_map_url: string | null };
    const unitByNumber = new Map<string, UnitRow>(
      (units as UnitRow[]).map((u) => [String(u.unit_number).trim(), u]),
    );

    // Vendor Photo Sheets PDFs only — image uploads are handled via the
    // dedicated UnitPhotoUpload UI button now.
    const { data: vendorFiles, error: fErr } = await supabase
      .from("vendor_files")
      .select("id, storage_path, original_name, kind")
      .eq("campaign_id", campaignId)
      .in("kind", ["pdf", "photosheets"]);
    if (fErr) throw fErr;
    if (!vendorFiles || vendorFiles.length === 0) {
      throw new Error("No PDF files uploaded for this campaign.");
    }

    for (const f of vendorFiles) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("uploads")
        .download(f.storage_path);
      if (dlErr || !blob) {
        console.warn(`[extract-photos] download failed ${f.storage_path}`, dlErr);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());

      let doc: any;
      try {
        doc = mupdf.Document.openDocument(bytes, "application/pdf");
      } catch (e) {
        console.warn(
          `[extract-photos] mupdf open failed for ${f.original_name}:`,
          (e as Error).message,
        );
        continue;
      }
      summary.pdfs_processed++;

      let pageCount = 0;
      try { pageCount = doc.countPages(); } catch { pageCount = 0; }

      for (let i = 0; i < pageCount; i++) {
        summary.pages_processed++;

        // Page 1 → campaign overview map. Render entire page, save at campaign level.
        if (i === 0) {
          try {
            const overviewPng = renderPagePng(doc, 0);
            if (overviewPng) {
              const path = `${campaignId}/overview-map.png`;
              const up = await supabase.storage
                .from("minimaps")
                .upload(path, overviewPng, { contentType: "image/png", upsert: true });
              if (up.error) {
                console.warn("[extract-photos] overview upload failed:", up.error.message);
              } else {
                const { data: pub } = supabase.storage.from("minimaps").getPublicUrl(path);
                // Cache-bust so re-uploads show fresh image immediately.
                const url = `${pub.publicUrl}?v=${Date.now()}`;
                const { error: cErr } = await supabase
                  .from("campaigns")
                  .update({ vendor_overview_map_url: url })
                  .eq("id", campaignId);
                if (cErr) {
                  console.warn("[extract-photos] campaign update failed:", cErr.message);
                } else {
                  summary.overview_pages++;
                }
              }
            }
          } catch (e) {
            console.warn("[extract-photos] overview render failed:", (e as Error).message);
          }
          continue;
        }

        // Pages 2..N → one billboard each.
        const pageText = getPageText(doc, i);
        const unitNumber = extractUnitNumber(pageText);
        if (!unitNumber) {
          console.warn(`[extract-photos] page ${i + 1} has no unit-header pattern, skipping`);
          summary.pages_unmatched++;
          continue;
        }
        const unit = unitByNumber.get(unitNumber);
        if (!unit) {
          console.warn(
            `[extract-photos] page ${i + 1} references unit ${unitNumber} which is not in this campaign, skipping`,
          );
          summary.pages_unmatched++;
          continue;
        }

        // Render the two crops. We re-load the page each time inside
        // renderPagePng because setPageBox mutates page state.
        const updates: Record<string, string> = {};

        if (!unit.billboard_photo_url) {
          try {
            const png = renderPagePng(doc, i, CROP_BILLBOARD);
            if (png) {
              const path = `${campaignId}/${unit.id}.png`;
              const up = await supabase.storage
                .from("photos")
                .upload(path, png, { contentType: "image/png", upsert: true });
              if (up.error) {
                console.warn(`[extract-photos] photo upload failed for ${unitNumber}:`, up.error.message);
              } else {
                const { data: signed, error: sErr } = await supabase.storage
                  .from("photos")
                  .createSignedUrl(path, SIGNED_URL_TTL);
                if (sErr) {
                  console.warn(`[extract-photos] sign failed for ${unitNumber}:`, sErr.message);
                } else {
                  updates.billboard_photo_url = signed.signedUrl;
                  summary.units_with_photo++;
                }
              }
            }
          } catch (e) {
            console.warn(`[extract-photos] billboard render failed for ${unitNumber}:`, (e as Error).message);
          }
        } else {
          summary.units_skipped_existing++;
        }

        if (!unit.inset_map_url) {
          try {
            const png = renderPagePng(doc, i, CROP_MAP);
            if (png) {
              const path = `${campaignId}/${unit.id}-map.png`;
              const up = await supabase.storage
                .from("minimaps")
                .upload(path, png, { contentType: "image/png", upsert: true });
              if (up.error) {
                console.warn(`[extract-photos] map upload failed for ${unitNumber}:`, up.error.message);
              } else {
                const { data: pub } = supabase.storage.from("minimaps").getPublicUrl(path);
                updates.inset_map_url = `${pub.publicUrl}?v=${Date.now()}`;
                summary.units_with_map++;
              }
            }
          } catch (e) {
            console.warn(`[extract-photos] map render failed for ${unitNumber}:`, (e as Error).message);
          }
        } else {
          summary.units_skipped_existing++;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updErr } = await supabase
            .from("units")
            .update(updates)
            .eq("id", unit.id);
          if (updErr) {
            console.warn(`[extract-photos] unit update failed for ${unitNumber}:`, updErr.message);
          } else {
            // Update local cache so subsequent pages referencing the same
            // unit (rare, but possible) don't re-process.
            if (updates.billboard_photo_url) unit.billboard_photo_url = updates.billboard_photo_url;
            if (updates.inset_map_url) unit.inset_map_url = updates.inset_map_url;
          }
        }
      }

      try { doc.destroy?.(); } catch { /* ignore */ }
    }

    if (jobId) {
      await supabase
        .from("jobs")
        .update({ status: "succeeded", finished_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[extract-photos] error", err);
    const message = err?.message ?? String(err);
    if (jobId) {
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error_message: message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
