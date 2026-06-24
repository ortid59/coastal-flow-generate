// Extract billboard photos and inset maps from vendor Photo Sheets PDFs.
//
// Strategy (Clear Channel format, tuned per vendor going forward):
//  1. Open the PDF with pdfjs-dist (works in Deno edge functions).
//  2. Page 1 = full-campaign overview map. Render the whole page as PNG and
//     store on campaigns.vendor_overview_map_url. Do not match to any unit.
//  3. Pages 2..N = one billboard per page. Read the page text, extract the
//     6-digit unit number (pattern: "001115 – Jacksonville"), then crop the
//     rendered page into:
//       - billboard photo: x 0%,  y 35%, w 58%, h 60%  -> billboard_photo_url
//       - inset map:       x 58%, y 5%,  w 42%, h 52%  -> inset_map_url
//     Match unit_number to the units table (same campaign) and write — but
//     only if the field is currently null (do not overwrite manual uploads).
//  4. Unmatched / unrecognised pages are skipped with a warning, not fatal.
//
// Auth: caller JWT required. RLS ensures campaign ownership.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// pdfjs-dist 3.x pulls in node-canvas via esm.sh, which fails to bundle in
// edge functions. Use the npm: specifier with the legacy ESM build and
// supply our own OffscreenCanvas for rendering.
import * as pdfjs from "npm:pdfjs-dist@3.11.174/legacy/build/pdf.mjs";
// @ts-ignore — workerSrc must be a string in Deno
pdfjs.GlobalWorkerOptions.workerSrc = "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RENDER_SCALE = 2.0;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

// Fallback crop regions (Clear Channel layout). Used only when image-region
// detection fails for a given page.
const CROP_BILLBOARD = { x: 0.00, y: 0.35, w: 0.58, h: 0.60 };
const CROP_MAP       = { x: 0.58, y: 0.05, w: 0.42, h: 0.52 };

// Broad unit-number matcher. Accepts:
//   "#3001"      hash + digits
//   "001115"     6 digits
//   "25001"      5 digits
//   "TM-CH-003"  alphanumeric with dashes
//   "10A" "11A"  digits + letter
// We capture candidates and then resolve them against the campaign's
// real unit_number list (case-insensitive, # / whitespace stripped).
const UNIT_TOKEN_RE = /#?\b([A-Z]{0,4}-?[A-Z]{0,4}-?\d{2,6}[A-Z]?)\b/gi;

function normalizeUnitToken(s: string): string {
  return String(s ?? "").replace(/^#/, "").trim().toUpperCase();
}

// ---------- helpers ----------

async function renderPageToPng(page: any, scaleFactor = RENDER_SCALE): Promise<{ png: Uint8Array; width: number; height: number }> {
  const viewport = page.getViewport({ scale: scaleFactor });
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return {
    png: new Uint8Array(await blob.arrayBuffer()),
    width: viewport.width,
    height: viewport.height,
  };
}

async function getPageText(page: any): Promise<string> {
  try {
    const content = await page.getTextContent();
    return content.items.map((item: any) => item.str).join(" ");
  } catch (e) {
    console.warn("[extract-photos] text extract failed:", (e as Error).message);
    return "";
  }
}

/**
 * Detect image regions on a page using the operator list. Returns rects as
 * fractions of the page (x, y from top-left, w, h). Empty array if detection
 * fails or no images present.
 */
async function detectImageRegions(
  page: any,
  pageW: number,
  pageH: number,
): Promise<Array<{ x: number; y: number; w: number; h: number; area: number }>> {
  try {
    const ops = await page.getOperatorList();
    const OPS = (pdfjs as any).OPS ?? {};
    const SAVE = OPS.save, RESTORE = OPS.restore, TRANSFORM = OPS.transform;
    const PAINT_IMG = OPS.paintImageXObject;
    const PAINT_JPG = OPS.paintJpegXObject;
    const PAINT_INLINE = OPS.paintInlineImageXObject;
    const PAINT_IMG_REPEAT = OPS.paintImageXObjectRepeat;
    const isImageOp = (op: number) =>
      op === PAINT_IMG || op === PAINT_JPG || op === PAINT_INLINE || op === PAINT_IMG_REPEAT;

    // Track CTM with a stack. Matrices are [a,b,c,d,e,f] (pdfjs convention).
    const mul = (m1: number[], m2: number[]) => [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const regions: Array<{ x: number; y: number; w: number; h: number; area: number }> = [];

    const viewport = page.getViewport({ scale: RENDER_SCALE });

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === SAVE) {
        stack.push(ctm.slice());
      } else if (fn === RESTORE) {
        ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      } else if (fn === TRANSFORM) {
        ctm = mul(ctm, args as number[]);
      } else if (isImageOp(fn)) {
        // Image is drawn at unit square (0,0)-(1,1) under current CTM.
        // Project the four corners and take bbox in PDF user space.
        const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [
          ctm[0] * x + ctm[2] * y + ctm[4],
          ctm[1] * x + ctm[3] * y + ctm[5],
        ]);
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        // Convert to viewport pixel space, then to fractions of page render.
        const [vx1, vy1] = viewport.convertToViewportPoint(minX, minY);
        const [vx2, vy2] = viewport.convertToViewportPoint(maxX, maxY);
        const x1 = Math.min(vx1, vx2), x2 = Math.max(vx1, vx2);
        const y1 = Math.min(vy1, vy2), y2 = Math.max(vy1, vy2);
        const w = (x2 - x1) / pageW;
        const h = (y2 - y1) / pageH;
        const x = x1 / pageW;
        const y = y1 / pageH;
        // Sanity: must be on page and at least 8% of width/height.
        if (w >= 0.08 && h >= 0.08 && x >= -0.02 && y >= -0.02 && x + w <= 1.02 && y + h <= 1.02) {
          regions.push({
            x: Math.max(0, x),
            y: Math.max(0, y),
            w: Math.min(1, w),
            h: Math.min(1, h),
            area: w * h,
          });
        }
      }
    }
    return regions;
  } catch (e) {
    console.warn("[extract-photos] region detect failed:", (e as Error).message);
    return [];
  }
}

/**
 * Pick billboard and map crop rects from detected regions.
 * Billboard = largest region in top/left half. Map = a smaller region in
 * bottom/right region distinct from the billboard. Returns null if either
 * can't be confidently picked.
 */
function pickCrops(
  regions: Array<{ x: number; y: number; w: number; h: number; area: number }>,
): { billboard: { x: number; y: number; w: number; h: number } | null; map: { x: number; y: number; w: number; h: number } | null } {
  if (regions.length === 0) return { billboard: null, map: null };
  const sorted = [...regions].sort((a, b) => b.area - a.area);
  const billboard = sorted[0];
  // Map candidate: any other region distinct from billboard, prefer one in
  // right or bottom half, smaller than billboard.
  let map: typeof billboard | null = null;
  for (const r of sorted.slice(1)) {
    if (r === billboard) continue;
    if (r.area > billboard.area * 0.95) continue; // too similar in size
    const inRightOrBottom = r.x + r.w / 2 > 0.5 || r.y + r.h / 2 > 0.5;
    if (inRightOrBottom) { map = r; break; }
  }
  if (!map && sorted.length > 1) map = sorted[1];
  const strip = (r: { x: number; y: number; w: number; h: number } | null) =>
    r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
  return { billboard: strip(billboard), map: strip(map) };
}

async function cropPng(
  fullPng: Uint8Array,
  crop: { x: number; y: number; w: number; h: number },
  pageW: number,
  pageH: number,
): Promise<Uint8Array> {
  const img = await createImageBitmap(new Blob([fullPng], { type: "image/png" }));
  const sx = Math.max(0, Math.round(pageW * crop.x));
  const sy = Math.max(0, Math.round(pageH * crop.y));
  const sw = Math.max(1, Math.round(pageW * crop.w));
  const sh = Math.max(1, Math.round(pageH * crop.h));
  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

function extractUnitNumber(text: string, validUnits: string[]): string | null {
  if (!text) return null;
  // Build normalized lookup of valid unit numbers.
  const normToOriginal = new Map<string, string>();
  for (const u of validUnits) {
    normToOriginal.set(normalizeUnitToken(u), u);
  }
  // Collect all candidate tokens from the page text.
  const seen = new Set<string>();
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  UNIT_TOKEN_RE.lastIndex = 0;
  while ((m = UNIT_TOKEN_RE.exec(text)) !== null) {
    const norm = normalizeUnitToken(m[1]);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    candidates.push(norm);
  }
  // Prefer longer matches first so "TM-CH-003" beats "003".
  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    const hit = normToOriginal.get(c);
    if (hit) return hit;
  }
  return null;
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
    const validUnitNumbers = (units as UnitRow[]).map((u) => String(u.unit_number));


    // Look up all vendor files for the campaign and filter to PDFs by extension.
    const { data: vendorFiles, error: fErr } = await supabase
      .from("vendor_files")
      .select("id, storage_path, original_name, kind")
      .eq("campaign_id", campaignId);
    if (fErr) throw fErr;

    const pdfFiles = (vendorFiles ?? []).filter((f) =>
      f.original_name?.toLowerCase().endsWith(".pdf")
    );
    if (!pdfFiles || pdfFiles.length === 0) {
      throw new Error("No PDF files uploaded for this campaign. Please upload a Photo Sheets PDF first.");
    }

    let isFirstPdf = true;
    for (const f of pdfFiles) {

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
        doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false }).promise;
      } catch (e) {
        console.warn(
          `[extract-photos] pdfjs open failed for ${f.original_name}:`,
          (e as Error).message,
        );
        continue;
      }
      summary.pdfs_processed++;

      const pageCount = doc.numPages ?? 0;

      for (let i = 0; i < pageCount; i++) {
        summary.pages_processed++;

        const page = await doc.getPage(i + 1);

        // Page 1 → campaign overview map. Render entire page, save at campaign level.
        if (i === 0) {
          try {
            const { png: overviewPng } = await renderPageToPng(page);
            if (overviewPng) {
              const path = `${campaignId}/overview-map.png`;
              const up = await supabase.storage
                .from("minimaps")
                .upload(path, overviewPng, { contentType: "image/png", upsert: true });
              if (up.error) {
                console.warn("[extract-photos] overview upload failed:", up.error.message);
              } else {
                const { data: pub } = supabase.storage.from("minimaps").getPublicUrl(path);
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
          try { page.cleanup?.(); } catch { /* ignore */ }
          continue;
        }

        // Pages 2..N → one billboard each.
        const pageText = await getPageText(page);
        const unitNumber = extractUnitNumber(pageText);
        if (!unitNumber) {
          console.warn(`[extract-photos] page ${i + 1} has no unit-header pattern, skipping`);
          summary.pages_unmatched++;
          try { page.cleanup?.(); } catch { /* ignore */ }
          continue;
        }
        const unit = unitByNumber.get(unitNumber);
        if (!unit) {
          console.warn(
            `[extract-photos] page ${i + 1} references unit ${unitNumber} which is not in this campaign, skipping`,
          );
          summary.pages_unmatched++;
          try { page.cleanup?.(); } catch { /* ignore */ }
          continue;
        }

        // Render full page once, then crop into two regions.
        let fullPng: Uint8Array | null = null;
        let pageW = 0;
        let pageH = 0;
        try {
          const rendered = await renderPageToPng(page);
          fullPng = rendered.png;
          pageW = rendered.width;
          pageH = rendered.height;
        } catch (e) {
          console.warn(`[extract-photos] page render failed for ${unitNumber}:`, (e as Error).message);
        }

        const updates: Record<string, string> = {};

        if (fullPng && !unit.billboard_photo_url) {
          try {
            const png = await cropPng(fullPng, CROP_BILLBOARD, pageW, pageH);
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
          } catch (e) {
            console.warn(`[extract-photos] billboard crop failed for ${unitNumber}:`, (e as Error).message);
          }
        } else if (unit.billboard_photo_url) {
          summary.units_skipped_existing++;
        }

        if (fullPng && !unit.inset_map_url) {
          try {
            const png = await cropPng(fullPng, CROP_MAP, pageW, pageH);
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
          } catch (e) {
            console.warn(`[extract-photos] map crop failed for ${unitNumber}:`, (e as Error).message);
          }
        } else if (unit.inset_map_url) {
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
            if (updates.billboard_photo_url) unit.billboard_photo_url = updates.billboard_photo_url;
            if (updates.inset_map_url) unit.inset_map_url = updates.inset_map_url;
          }
        }

        try { page.cleanup?.(); } catch { /* ignore */ }
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
