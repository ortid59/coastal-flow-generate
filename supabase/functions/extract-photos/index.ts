// Extract billboard photos from vendor PDFs and attach them to units.
//
// Strategy (hybrid):
//  1. For each PDF in vendor_files (kind='pdf') for the campaign:
//     a. Walk PDF objects and pull every embedded JPEG (DCTDecode) and
//        FlateDecode/PNG image. Capture raw bytes + width/height.
//     b. For each page, run unpdf.extractText to find unit numbers that
//        appear on that page.
//  2. Match images to units:
//     - Filename convention first: if "<unit_number>" appears in the PDF
//       filename, attach largest image from that PDF to that unit.
//     - Otherwise: for each page, attach the largest image on that page
//       to every unit number whose token appears in that page's text.
//  3. Upload chosen image to private "photos" bucket; sign a long URL and
//     store it on units.billboard_photo_url. Set low_res_flag if width<800.
//
// Auth: caller JWT required. RLS ensures campaign ownership.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOW_RES_WIDTH = 800;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

type PdfImage = {
  bytes: Uint8Array;
  ext: "jpg" | "png";
  width: number;
  height: number;
  page: number; // best-effort page association (may be 0 if unknown)
};

// ---------- low-level PDF image extraction ----------

// Locate every "stream ... endstream" object that is an /XObject Image.
// We only support /DCTDecode (JPEG) reliably. PNG-from-FlateDecode requires
// reconstruction; we skip it (rare in vendor billboard decks — they're JPEG).
// Read width/height from a standalone JPEG file by scanning SOF markers.
function readJpegDimensions(buf: Uint8Array): { width: number; height: number } {
  // Must start with SOI (FFD8)
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return { width: 0, height: 0 };
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    // Skip fill bytes
    while (i < buf.length && buf[i] === 0xff) i++;
    const marker = buf[i]; i++;
    // Standalone markers (no length): D0-D9, 01
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;
    if (i + 1 >= buf.length) break;
    const segLen = (buf[i] << 8) | buf[i + 1];
    // SOF markers: C0–C3, C5–C7, C9–CB, CD–CF (skip C4, C8, CC)
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSOF && i + 7 < buf.length) {
      const height = (buf[i + 3] << 8) | buf[i + 4];
      const width = (buf[i + 5] << 8) | buf[i + 6];
      return { width, height };
    }
    i += segLen;
  }
  return { width: 0, height: 0 };
}

function extractJpegImages(buf: Uint8Array): PdfImage[] {
  const images: PdfImage[] = [];
  // Convert to latin1 string for header scanning; preserve byte indices 1:1.
  let text = "";
  for (let i = 0; i < buf.length; i++) text += String.fromCharCode(buf[i]);

  // Match each indirect object header: "N G obj ... endobj"
  const objRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const body = m[3];
    if (!/\/Subtype\s*\/Image/.test(body)) continue;
    if (!/\/Filter\s*(?:\[[^\]]*\/DCTDecode[^\]]*\]|\/DCTDecode)/.test(body)) continue;

    const widthM = /\/Width\s+(\d+)/.exec(body);
    const heightM = /\/Height\s+(\d+)/.exec(body);
    const w = widthM ? parseInt(widthM[1], 10) : 0;
    const h = heightM ? parseInt(heightM[1], 10) : 0;

    // Find "stream\n...endstream" inside this object's byte range.
    const objStart = m.index;
    const objEnd = objStart + m[0].length;
    // Locate "stream" then skip its trailing EOL (CR/LF or LF).
    const streamMarker = body.indexOf("stream");
    if (streamMarker < 0) continue;
    let dataStart = objStart + (m[0].length - body.length) + streamMarker + "stream".length;
    if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buf[dataStart] === 0x0a) dataStart += 1;

    // Find "endstream" within this object's byte range.
    const endRel = body.indexOf("endstream", streamMarker);
    if (endRel < 0) continue;
    let dataEnd = objStart + (m[0].length - body.length) + endRel;
    // Strip trailing whitespace before endstream
    while (dataEnd > dataStart && (buf[dataEnd - 1] === 0x0a || buf[dataEnd - 1] === 0x0d || buf[dataEnd - 1] === 0x20)) {
      dataEnd--;
    }
    if (dataEnd <= dataStart || dataEnd > buf.length) continue;

    const bytes = buf.slice(dataStart, dataEnd);
    // Sanity: a JPEG starts with FF D8 FF
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;

    images.push({ bytes, ext: "jpg", width: w, height: h, page: 0 });
    if (objEnd > 0) {
      // continue scanning
    }
  }
  return images;
}

// Also try extracting via unpdf to get a per-page image inventory (for page→image association).
// Returns [pageNumber] -> count of images on that page.
async function getPerPageImageCount(pdf: any): Promise<number[]> {
  const counts: number[] = [];
  const total = pdf.numPages as number;
  for (let p = 1; p <= total; p++) {
    try {
      const page = await pdf.getPage(p);
      const ops = await page.getOperatorList();
      // PDFJS op for paintImageXObject is 85 in modern builds — but the constant
      // can vary. Count xobject paint ops by scanning for ops referencing image names.
      let n = 0;
      for (let i = 0; i < ops.fnArray.length; i++) {
        const args = ops.argsArray[i];
        if (Array.isArray(args) && typeof args[0] === "string" && /^img_?p?\d+/i.test(args[0])) {
          n++;
        }
      }
      counts.push(n);
    } catch {
      counts.push(0);
    }
  }
  return counts;
}

async function getPerPageText(pdf: any): Promise<string[]> {
  const out: string[] = [];
  const total = pdf.numPages as number;
  for (let p = 1; p <= total; p++) {
    try {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const t = tc.items.map((it: any) => it.str).join(" ");
      out.push(t);
    } catch {
      out.push("");
    }
  }
  return out;
}

// Best-effort: distribute extracted images across pages using per-page image counts.
function assignImagesToPages(images: PdfImage[], perPageCounts: number[]): PdfImage[] {
  if (perPageCounts.length === 0) return images;
  const total = perPageCounts.reduce((s, n) => s + n, 0);
  if (total === 0 || total !== images.length) {
    // Fall back: leave page=0 (unknown)
    return images;
  }
  const out: PdfImage[] = [];
  let idx = 0;
  for (let p = 0; p < perPageCounts.length; p++) {
    for (let k = 0; k < perPageCounts[p]; k++) {
      out.push({ ...images[idx], page: p + 1 });
      idx++;
    }
  }
  return out;
}

// ---------- matching ----------

function normalizeUnit(u: string): string {
  return u.replace(/\s+/g, "").toLowerCase();
}

function findUnitsInText(text: string, unitNumbers: string[]): Set<string> {
  const found = new Set<string>();
  const norm = text.replace(/\s+/g, " ").toLowerCase();
  for (const u of unitNumbers) {
    const tok = u.toLowerCase();
    // word-boundary-ish match, allow surrounding punctuation
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(tok)}([^a-z0-9]|$)`);
    if (re.test(norm)) found.add(u);
  }
  return found;
}

function findUnitInFilename(name: string, unitNumbers: string[]): string | null {
  const lower = name.toLowerCase();
  // Prefer the longest unit-number match to avoid "12" matching "121".
  const sorted = [...unitNumbers].sort((a, b) => b.length - a.length);
  for (const u of sorted) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(u.toLowerCase())}([^a-z0-9]|$)`);
    if (re.test(lower)) return u;
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- main ----------

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
    .insert({ campaign_id: campaignId, kind: "extract-photos", status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  const jobId = jobRow?.id;

  try {
    const { data: units, error: uErr } = await supabase
      .from("units")
      .select("id, unit_number")
      .eq("campaign_id", campaignId);
    if (uErr) throw uErr;
    if (!units || units.length === 0) throw new Error("No units to attach photos to. Parse the Excel first.");

    const { data: vendorFiles, error: fErr } = await supabase
      .from("vendor_files")
      .select("id, storage_path, original_name, kind")
      .eq("campaign_id", campaignId)
      .in("kind", ["pdf", "image"]);
    if (fErr) throw fErr;
    if (!vendorFiles || vendorFiles.length === 0) {
      throw new Error("No PDF or image files uploaded for this campaign.");
    }

    const unitNumbers = units.map((u) => u.unit_number);
    const unitIdByNumber = new Map(units.map((u) => [u.unit_number, u.id]));
    // Track best image (by area) per unit — billboard = largest, map = secondary
    const bestForUnit = new Map<string, PdfImage>();
    const mapForUnit = new Map<string, PdfImage>();

    const summary = {
      campaign_id: campaignId,
      pdfs: [] as Array<{ name: string; pages: number; images: number; matched_units: number }>,
      units_with_photo: 0,
      low_res_count: 0,
    };

    for (const f of vendorFiles) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("uploads")
        .download(f.storage_path);
      if (dlErr || !blob) {
        console.warn(`[extract-photos] Could not download ${f.storage_path}`, dlErr);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());

      // Direct image upload — match purely by filename → unit number
      if (f.kind === "image") {
        const fileUnit = findUnitInFilename(f.original_name ?? "", unitNumbers);
        if (!fileUnit) {
          summary.pdfs.push({
            name: f.original_name ?? f.storage_path,
            pages: 0,
            images: 1,
            matched_units: 0,
          });
          continue;
        }
        const ext: "jpg" | "png" =
          /\.png$/i.test(f.original_name ?? "") ? "png" : "jpg";
        const dims = ext === "jpg" ? readJpegDimensions(bytes) : { width: 0, height: 0 };
        considerImage(bestForUnit, fileUnit, {
          bytes, ext, width: dims.width, height: dims.height, page: 0,
        });
        summary.pdfs.push({
          name: f.original_name ?? f.storage_path,
          pages: 0,
          images: 1,
          matched_units: 1,
        });
        continue;
      }

      // PDF path
      const rawImages = extractJpegImages(bytes);

      let perPageText: string[] = [];
      let perPageCounts: number[] = [];
      let pageCount = 0;
      try {
        const pdf = await getDocumentProxy(bytes);
        pageCount = pdf.numPages;
        perPageText = await getPerPageText(pdf);
        perPageCounts = await getPerPageImageCount(pdf);
      } catch (e) {
        console.warn(`[extract-photos] unpdf failed on ${f.original_name}:`, (e as Error).message);
      }

      const images = assignImagesToPages(rawImages, perPageCounts);

      // (1) Filename convention
      const fileUnit = findUnitInFilename(f.original_name ?? "", unitNumbers);
      let matchedUnits = 0;

      if (fileUnit && images.length > 0) {
        const best = [...images].sort((a, b) => b.width * b.height - a.width * a.height)[0];
        considerImage(bestForUnit, fileUnit, best);
        matchedUnits = 1;
      } else {
        // (2) Page-text matching
        for (let p = 0; p < perPageText.length; p++) {
          const pageImages = images.filter((im) => im.page === p + 1);
          if (pageImages.length === 0) continue;
          const best = [...pageImages].sort((a, b) => b.width * b.height - a.width * a.height)[0];
          const matches = findUnitsInText(perPageText[p], unitNumbers);
          for (const u of matches) {
            considerImage(bestForUnit, u, best);
            matchedUnits++;
          }
        }
      }

      summary.pdfs.push({
        name: f.original_name ?? f.storage_path,
        pages: pageCount,
        images: images.length,
        matched_units: matchedUnits,
      });
    }

    // Upload + update units
    for (const [unitNumber, img] of bestForUnit) {
      const unitId = unitIdByNumber.get(unitNumber);
      if (!unitId) continue;
      const path = `${campaignId}/${unitId}.${img.ext}`;
      const up = await supabase.storage
        .from("photos")
        .upload(path, img.bytes, {
          contentType: img.ext === "jpg" ? "image/jpeg" : "image/png",
          upsert: true,
        });
      if (up.error) {
        console.warn(`[extract-photos] upload failed for ${unitNumber}:`, up.error.message);
        continue;
      }
      const { data: signed, error: sErr } = await supabase.storage
        .from("photos")
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (sErr) {
        console.warn(`[extract-photos] sign failed for ${unitNumber}:`, sErr.message);
        continue;
      }
      const lowRes = img.width > 0 && img.width < LOW_RES_WIDTH;
      if (lowRes) summary.low_res_count++;

      const { error: updErr } = await supabase
        .from("units")
        .update({
          billboard_photo_url: signed.signedUrl,
          low_res_flag: lowRes,
        })
        .eq("id", unitId);
      if (updErr) {
        console.warn(`[extract-photos] update failed for ${unitNumber}:`, updErr.message);
        continue;
      }
      summary.units_with_photo++;
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
    console.error("[extract-photos] error", err);
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

function considerImage(map: Map<string, PdfImage>, unit: string, img: PdfImage) {
  const existing = map.get(unit);
  const newArea = img.width * img.height;
  const oldArea = existing ? existing.width * existing.height : -1;
  if (newArea > oldArea) map.set(unit, img);
}
