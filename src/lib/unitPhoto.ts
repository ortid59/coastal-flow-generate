import { supabase } from "@/integrations/supabase/client";
import { pdfFirstPageToPng } from "./pdfFirstPage";
import { isSupportedPhoto, type DraggedPhoto } from "./unitPhotoDnd";

// Re-exported so callers need only one import for the whole feature.
export {
  PHOTO_ACCEPT,
  PHOTO_DND_TYPE,
  dragHasFiles,
  dragHasPhoto,
  isSupportedPhoto,
  readDraggedPhoto,
  type DraggedPhoto,
} from "./unitPhotoDnd";

const MAX_BYTES = 20 * 1024 * 1024;

async function pixelWidth(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth || 0);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    img.src = url;
  });
}

/** Upload one file and attach it to a unit as its billboard photo. */
export async function uploadUnitPhoto(
  campaignId: string,
  unitId: string,
  file: File,
): Promise<{ lowRes: boolean }> {
  if (!isSupportedPhoto(file)) throw new Error("JPG, PNG, WEBP, or PDF only.");
  if (file.size > MAX_BYTES) throw new Error("Max 20 MB per photo.");

  // A photo supplied as a one-page PDF is rendered to PNG first so it stores,
  // signs and prints exactly like a JPG would.
  const isPdf = /\.pdf$/i.test(file.name);
  const body: Blob = isPdf ? await pdfFirstPageToPng(file) : file;

  const safe = file.name.replace(/\.pdf$/i, ".png").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${campaignId}/manual/${unitId}/${Date.now()}-${safe}`;

  const up = await supabase.storage.from("photos").upload(path, body, { upsert: true });
  if (up.error) throw up.error;

  const signed = await supabase.storage.from("photos").createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Couldn't sign URL");

  const width = await pixelWidth(body);
  const lowRes = width > 0 && width < 800;

  const { error } = await supabase
    .from("units")
    .update({ billboard_photo_url: signed.data.signedUrl, low_res_flag: lowRes })
    .eq("id", unitId);
  if (error) throw error;

  return { lowRes };
}

/**
 * Re-assign a photo from one unit to another.
 *
 * If the target already has its own photo the two are swapped rather than
 * overwritten — the common case is two photos landing on each other's unit,
 * and silently discarding one of them would lose work.
 */
export async function moveUnitPhoto(
  from: DraggedPhoto,
  to: { unitId: string; url: string | null; lowRes: boolean },
): Promise<"moved" | "swapped"> {
  if (from.unitId === to.unitId) return "moved";

  const { error: toErr } = await supabase
    .from("units")
    .update({ billboard_photo_url: from.url, low_res_flag: from.lowRes })
    .eq("id", to.unitId);
  if (toErr) throw toErr;

  const { error: fromErr } = await supabase
    .from("units")
    .update({ billboard_photo_url: to.url, low_res_flag: to.url ? to.lowRes : false })
    .eq("id", from.unitId);
  if (fromErr) throw fromErr;

  return to.url ? "swapped" : "moved";
}
