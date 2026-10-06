// Render page 1 of a PDF to a PNG blob.
//
// Media owners often send a unit map or a location photo as a one-page PDF.
// Rather than make the user export it to an image first, convert it here so a
// PDF goes through exactly the same upload path as a JPG. Uses the same pdfjs
// version and CDN worker as the review page's photosheet extraction.
export async function pdfFirstPageToPng(file: File | Blob, scale = 2): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable in this browser");

  // Maps are often drawn on a transparent background; flatten onto white so
  // the PNG doesn't render black in the proposal.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PDF page could not be rendered"))),
      "image/png",
    ),
  );
}
