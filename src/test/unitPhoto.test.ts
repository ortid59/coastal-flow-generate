import { describe, expect, it } from "vitest";
import { PHOTO_DND_TYPE, dragHasFiles, dragHasPhoto, isSupportedPhoto, readDraggedPhoto } from "@/lib/unitPhotoDnd";

// Minimal stand-in for the bits of DataTransfer the drop handler touches.
function dt(data: Record<string, string>, types?: string[]): DataTransfer {
  return {
    types: types ?? Object.keys(data),
    getData: (k: string) => data[k] ?? "",
  } as unknown as DataTransfer;
}

const file = (name: string) => ({ name }) as File;

describe("readDraggedPhoto", () => {
  it("reads a photo dragged from another unit row", () => {
    const payload = { unitId: "u1", url: "https://example.test/a.jpg", lowRes: true };
    expect(readDraggedPhoto(dt({ [PHOTO_DND_TYPE]: JSON.stringify(payload) }))).toEqual(payload);
  });

  it("defaults lowRes to false when absent", () => {
    const d = dt({ [PHOTO_DND_TYPE]: JSON.stringify({ unitId: "u1", url: "x" }) });
    expect(readDraggedPhoto(d)).toEqual({ unitId: "u1", url: "x", lowRes: false });
  });

  // A drop handler that throws on junk would break the whole grid, and text
  // dragged in from anywhere can land here.
  it("returns null for anything that is not ours", () => {
    expect(readDraggedPhoto(dt({}))).toBeNull();
    expect(readDraggedPhoto(dt({ [PHOTO_DND_TYPE]: "not json" }))).toBeNull();
    expect(readDraggedPhoto(dt({ [PHOTO_DND_TYPE]: JSON.stringify({ unitId: 1, url: 2 }) }))).toBeNull();
    expect(readDraggedPhoto(dt({ [PHOTO_DND_TYPE]: JSON.stringify(null) }))).toBeNull();
    expect(readDraggedPhoto(dt({ "text/plain": "hello" }))).toBeNull();
  });
});

describe("drag type detection", () => {
  it("tells files apart from a dragged photo chip", () => {
    expect(dragHasFiles(dt({}, ["Files"]))).toBe(true);
    expect(dragHasPhoto(dt({}, ["Files"]))).toBe(false);
    expect(dragHasPhoto(dt({}, [PHOTO_DND_TYPE]))).toBe(true);
    expect(dragHasFiles(dt({}, [PHOTO_DND_TYPE]))).toBe(false);
    expect(dragHasFiles(null)).toBe(false);
    expect(dragHasPhoto(null)).toBe(false);
  });
});

describe("isSupportedPhoto", () => {
  it("accepts the image types and a single-page PDF", () => {
    for (const n of ["a.jpg", "a.JPEG", "b.png", "c.webp", "d.pdf"]) {
      expect(isSupportedPhoto(file(n))).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const n of ["sheet.xlsx", "notes.txt", "a.jpg.exe", "noextension"]) {
      expect(isSupportedPhoto(file(n))).toBe(false);
    }
  });
});
