// Pure drag-and-drop helpers for assigning unit photos.
//
// Deliberately free of any Supabase import: the storage/network side lives in
// unitPhoto.ts, which keeps this file unit-testable without booting an auth
// client in jsdom.

// A custom drag type (rather than text/plain) keeps the grid from reacting to
// arbitrary text dragged in from elsewhere.
export const PHOTO_DND_TYPE = "application/x-coastal-unit-photo";

export type DraggedPhoto = {
  unitId: string;
  url: string;
  lowRes: boolean;
};

export const PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";
const NAME_RE = /\.(jpe?g|png|webp|pdf)$/i;

export function isSupportedPhoto(file: File) {
  return NAME_RE.test(file.name);
}

/** Pull our drag payload off a drop event, if this drag carries one. */
export function readDraggedPhoto(dt: DataTransfer): DraggedPhoto | null {
  const raw = dt.getData(PHOTO_DND_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.unitId === "string" && typeof parsed.url === "string") {
      return { unitId: parsed.unitId, url: parsed.url, lowRes: !!parsed.lowRes };
    }
  } catch {
    /* not ours — fall through */
  }
  return null;
}

/** True when a drag is carrying files we could accept. */
export function dragHasFiles(dt: DataTransfer | null) {
  return !!dt && Array.from(dt.types).includes("Files");
}

/** True when a drag is carrying one of our photo chips. */
export function dragHasPhoto(dt: DataTransfer | null) {
  return !!dt && Array.from(dt.types).includes(PHOTO_DND_TYPE);
}
