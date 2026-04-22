// Extract billboard photos AND map images from vendor PDFs and attach
// them to units. Uses pdf.js page resources directly so we can enumerate
// every image on every page (JPEG + PNG/Flate) with accurate page numbers.
//
// Strategy:
//  1. For each PDF in vendor_files (kind='pdf' or 'photosheets'):
//     a. Open with pdf.js (unpdf wraps the same lib).
//     b. For each page: read text + commonObjs/objs imagery.
//        - Re-encode raw pixel data as PNG so we can store it.
//        - JPEGs already in /DCTDecode form are kept as-is.
//     c. Find unit numbers in the page text.
//  2. Per page: largest image = billboard, smallest distinct = map.
//     Assign to every unit number found in that page's text.
//  3. Direct image uploads (kind='image') match by filename → unit_number.
//  4. Upload billboard → private 'photos' bucket, sign URL.
//     Upload map → public 'minimaps' bucket.
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

const LOW_RES_WIDTH = 800;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year
const MAP_RATIO_MAX = 0.4; // map must be < 40% area of biggest image on page

type PdfImage = {
  bytes: Uint8Array;
  ext: "jpg" | "png";
  width: number;
  height: number;
  page: number;
};

// ---------- PDF image extraction via pdf.js page resources ----------

async function extractImagesFromPdf(bytes: Uint8Array): Promise<{
  images: PdfImage[];
  perPageText: string[];
  pageCount: number;
}> {
  const pdf = await getDocumentProxy(bytes);
  const pageCount = pdf.numPages as number;
  const images: PdfImage[] = [];
  const perPageText: string[] = [];

  for (let p = 1; p <= pageCount; p++) {
    let page: any;
    try {
      page = await pdf.getPage(p);
    } catch (e) {
      console.warn(`[extract-photos] getPage(${p}) failed:`, (e as Error).message);
      perPageText.push("");
      continue;
    }

    // Text
    try {
      const tc = await page.getTextContent();
      perPageText.push(tc.items.map((it: any) => it.str ?? "").join(" "));
    } catch {
      perPageText.push("");
    }

    // Walk the operator list to find image XObject names referenced on
    // this page, then resolve them via page.objs / commonObjs.
    let ops: any;
    try {
      ops = await page.getOperatorList();
    } catch (e) {
      console.warn(`[extract-photos] op list p${p} failed:`, (e as Error).message);
      continue;
    }

    const imageNames = new Set<string>();
    for (let i = 0; i < ops.fnArray.length; i++) {
      const args = ops.argsArray[i];
      if (Array.isArray(args) && typeof args[0] === "string") {
        // paintImageXObject / paintJpegXObject / paintInlineImageXObject all
        // pass the image cache name as args[0].
        if (/^(img_?p?\d+|g_[a-z0-9]+_img_?p?\d+|.*_img_?\d+)/i.test(args[0])) {
          imageNames.add(args[0]);
        }
      }
    }

    for (const name of imageNames) {
      const img = await resolvePdfImage(page, name);
      if (img && img.bytes.length > 0) {
        images.push({ ...img, page: p });
      }
    }
  }

  return { images, perPageText, pageCount };
}

// Resolve an image from page.objs (preferred) or page.commonObjs.
// Returns either the original JPEG bytes or a PNG re-encoding of pixel data.
async function resolvePdfImage(
  page: any,
  name: string,
): Promise<{ bytes: Uint8Array; ext: "jpg" | "png"; width: number; height: number } | null> {
  const tryGet = async (store: any): Promise<any | null> => {
    if (!store || typeof store.get !== "function") return null;
    try {
      // Some pdf.js versions need a callback; promise form works in modern builds.
      return await new Promise((resolve) => {
        try {
          const v = store.get(name, (data: any) => resolve(data));
          if (v !== undefined) resolve(v);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  };

  let imgObj: any = await tryGet(page.objs);
  if (!imgObj) imgObj = await tryGet(page.commonObjs);
  if (!imgObj) return null;

  // pdf.js exposes images as { width, height, kind, data } where data may
  // already be the JPEG byte stream (kind=1) or raw pixel data (kind=2/3).
  // Some builds wrap it under .bitmap (an ImageBitmap) — we ignore those.
  const width = Number(imgObj.width || imgObj.bitmap?.width || 0);
  const height = Number(imgObj.height || imgObj.bitmap?.height || 0);
  const data = imgObj.data;

  if (!data || width === 0 || height === 0) return null;

  // Heuristic: if data starts with FF D8 FF it's a JPEG byte stream.
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    return { bytes: u8, ext: "jpg", width, height };
  }

  // Otherwise re-encode raw pixel bytes as a PNG.
  // imgObj.kind: 1 = grayscale, 2 = RGB, 3 = RGBA (pdf.js ImageKind enum)
  const kind = Number(imgObj.kind || 0);
  let channels = 4;
  if (kind === 1) channels = 1;
  else if (kind === 2) channels = 3;
  else if (kind === 3) channels = 4;
  else {
    // Guess from data length
    const px = width * height;
    if (u8.length === px) channels = 1;
    else if (u8.length === px * 3) channels = 3;
    else if (u8.length === px * 4) channels = 4;
    else return null; // unknown — skip
  }

  try {
    const png = encodePng(u8, width, height, channels);
    return { bytes: png, ext: "png", width, height };
  } catch (e) {
    console.warn(`[extract-photos] PNG encode failed for ${name}:`, (e as Error).message);
    return null;
  }
}

// ---------- Minimal PNG encoder (no external deps) ----------

function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  // Convert to RGBA for simplicity — small encode overhead, simpler decoder support.
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++) {
    if (channels === 1) {
      const g = pixels[i];
      rgba[j++] = g; rgba[j++] = g; rgba[j++] = g; rgba[j++] = 255;
    } else if (channels === 3) {
      rgba[j++] = pixels[i * 3];
      rgba[j++] = pixels[i * 3 + 1];
      rgba[j++] = pixels[i * 3 + 2];
      rgba[j++] = 255;
    } else {
      rgba[j++] = pixels[i * 4];
      rgba[j++] = pixels[i * 4 + 1];
      rgba[j++] = pixels[i * 4 + 2];
      rgba[j++] = pixels[i * 4 + 3];
    }
  }

  // Filter byte (0 = none) prepended to each scanline
  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  // Deflate using CompressionStream (available in Deno).
  // We need a sync return — collect chunks via a Response.
  // Note: top-level await isn't allowed here; use a sync zlib-style approach.
  // Since CompressionStream is async, we wrap encodePng's caller appropriately.
  // ... but we need sync — fall back to a tiny zlib "stored" block writer.
  const compressed = deflateStored(filtered);

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk("IHDR", buildIhdr(width, height));
  const idat = chunk("IDAT", compressed);
  const iend = chunk("IEND", new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let o = 0;
  out.set(sig, o); o += sig.length;
  out.set(ihdr, o); o += ihdr.length;
  out.set(idat, o); o += idat.length;
  out.set(iend, o);
  return out;
}

function buildIhdr(width: number, height: number): Uint8Array {
  const b = new Uint8Array(13);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  b[8] = 8;  // bit depth
  b[9] = 6;  // color type RGBA
  b[10] = 0; // compression
  b[11] = 0; // filter
  b[12] = 0; // interlace
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc);
  return out;
}

// CRC32 (PNG / zlib)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Adler-32 for zlib trailer
function adler32(buf: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Build a zlib stream of "stored" (uncompressed) deflate blocks.
// Each block holds up to 65535 bytes; widely-supported by every PNG decoder.
function deflateStored(data: Uint8Array): Uint8Array {
  const MAX = 0xffff;
  const blockCount = Math.max(1, Math.ceil(data.length / MAX));
  const out = new Uint8Array(2 + blockCount * 5 + data.length + 4);
  let o = 0;
  // zlib header: deflate, 32K window, no preset dict, fastest
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let i = 0; i < data.length; i += MAX) {
    const len = Math.min(MAX, data.length - i);
    const last = (i + len >= data.length) ? 1 : 0;
    out[o++] = last; // BFINAL flag, BTYPE=00 (stored)
    out[o++] = len & 0xff;
    out[o++] = (len >>> 8) & 0xff;
    out[o++] = (~len) & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(data.subarray(i, i + len), o);
    o += len;
  }
  const adler = adler32(data);
  out[o++] = (adler >>> 24) & 0xff;
  out[o++] = (adler >>> 16) & 0xff;
  out[o++] = (adler >>> 8) & 0xff;
  out[o++] = adler & 0xff;
  return out.subarray(0, o);
}

// Read width/height from a JPEG buffer (used for kind='image' uploads).
function readJpegDimensions(buf: Uint8Array): { width: number; height: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return { width: 0, height: 0 };
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    while (i < buf.length && buf[i] === 0xff) i++;
    const marker = buf[i]; i++;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;
    if (i + 1 >= buf.length) break;
    const segLen = (buf[i] << 8) | buf[i + 1];
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

// ---------- matching helpers ----------

function findUnitsInText(text: string, unitNumbers: string[]): Set<string> {
  const found = new Set<string>();
  const norm = text.replace(/\s+/g, " ").toLowerCase();
  // Match longest first to prefer "ABC-1234" over "1234".
  const sorted = [...unitNumbers].sort((a, b) => b.length - a.length);
  for (const u of sorted) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(u.toLowerCase())}([^a-z0-9]|$)`);
    if (re.test(norm)) found.add(u);
  }
  return found;
}

function findUnitInFilename(name: string, unitNumbers: string[]): string | null {
  const lower = name.toLowerCase();
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

function considerImage(map: Map<string, PdfImage>, unit: string, img: PdfImage) {
  const existing = map.get(unit);
  const newArea = img.width * img.height;
  const oldArea = existing ? existing.width * existing.height : -1;
  if (newArea > oldArea) map.set(unit, img);
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
      .in("kind", ["pdf", "image", "photosheets"]);
    if (fErr) throw fErr;
    if (!vendorFiles || vendorFiles.length === 0) {
      throw new Error("No PDF or image files uploaded for this campaign.");
    }

    const unitNumbers = units.map((u) => u.unit_number);
    const unitIdByNumber = new Map(units.map((u) => [u.unit_number, u.id]));
    const bestForUnit = new Map<string, PdfImage>(); // billboard
    const mapForUnit = new Map<string, PdfImage>(); // map

    const summary = {
      campaign_id: campaignId,
      pdfs: [] as Array<{ name: string; pages: number; images: number; matched_units: number }>,
      units_with_photo: 0,
      units_with_map: 0,
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

      // PDF path (covers both 'pdf' and 'photosheets')
      let extracted: { images: PdfImage[]; perPageText: string[]; pageCount: number };
      try {
        extracted = await extractImagesFromPdf(bytes);
      } catch (e) {
        console.warn(`[extract-photos] pdf parse failed for ${f.original_name}:`, (e as Error).message);
        summary.pdfs.push({
          name: f.original_name ?? f.storage_path,
          pages: 0,
          images: 0,
          matched_units: 0,
        });
        continue;
      }

      const { images, perPageText, pageCount } = extracted;

      // Filename convention
      const fileUnit = findUnitInFilename(f.original_name ?? "", unitNumbers);
      let matchedUnits = 0;

      if (fileUnit && images.length > 0) {
        const sorted = [...images].sort((a, b) => b.width * b.height - a.width * a.height);
        considerImage(bestForUnit, fileUnit, sorted[0]);
        if (sorted.length > 1) {
          const map = sorted[sorted.length - 1];
          if (map.width * map.height < sorted[0].width * sorted[0].height * MAP_RATIO_MAX) {
            considerImage(mapForUnit, fileUnit, map);
          }
        }
        matchedUnits = 1;
      } else {
        // Page-text matching — biggest image = billboard, smallest distinct = map
        for (let p = 0; p < perPageText.length; p++) {
          const pageImages = images.filter((im) => im.page === p + 1);
          if (pageImages.length === 0) continue;
          const sorted = [...pageImages].sort((a, b) => b.width * b.height - a.width * a.height);
          const best = sorted[0];
          // Map = smallest image that's notably smaller than the billboard
          let mapImg: PdfImage | null = null;
          if (sorted.length > 1) {
            const candidate = sorted[sorted.length - 1];
            if (candidate.width * candidate.height < best.width * best.height * MAP_RATIO_MAX) {
              mapImg = candidate;
            }
          }
          const matches = findUnitsInText(perPageText[p], unitNumbers);
          for (const u of matches) {
            considerImage(bestForUnit, u, best);
            if (mapImg) considerImage(mapForUnit, u, mapImg);
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

    // Upload billboard photos + update units
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

    // Upload map images (public 'minimaps' bucket so portal renders directly)
    for (const [unitNumber, img] of mapForUnit) {
      const unitId = unitIdByNumber.get(unitNumber);
      if (!unitId) continue;
      const billboard = bestForUnit.get(unitNumber);
      if (billboard && img.bytes === billboard.bytes) continue;
      const path = `${campaignId}/${unitId}-map.${img.ext}`;
      const up = await supabase.storage
        .from("minimaps")
        .upload(path, img.bytes, {
          contentType: img.ext === "jpg" ? "image/jpeg" : "image/png",
          upsert: true,
        });
      if (up.error) {
        console.warn(`[extract-photos] map upload failed for ${unitNumber}:`, up.error.message);
        continue;
      }
      const { data: pub } = supabase.storage.from("minimaps").getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("units")
        .update({ inset_map_url: pub.publicUrl })
        .eq("id", unitId);
      if (updErr) {
        console.warn(`[extract-photos] map update failed for ${unitNumber}:`, updErr.message);
        continue;
      }
      summary.units_with_map++;
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
