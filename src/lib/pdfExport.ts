/**
 * PDF export helpers using html2canvas + jsPDF.
 *
 * We render specific DOM nodes (one per quote) to a canvas, then place each
 * canvas on its own Letter-sized page. This avoids the browser print pipeline
 * (which was producing blank/garbled output with framer-motion transforms)
 * and gives us deterministic, multi-page PDFs with selectable layout per page.
 */

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const LETTER_WIDTH_PT = 612; // 8.5 in
const LETTER_HEIGHT_PT = 792; // 11 in
const MARGIN_PT = 36; // 0.5 in

/** Wait for any <img> inside a node to finish loading (or fail). */
async function waitForImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };
        img.addEventListener("load", done);
        img.addEventListener("error", done);
      });
    }),
  );
}

async function nodeToCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  // Wait for fonts + images + two animation frames so layout settles.
  try {
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
  } catch {
    /* ignore */
  }
  await waitForImages(node);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  return html2canvas(node, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

/**
 * Add a canvas to a jsPDF document, splitting it across as many pages as
 * needed if the rendered content is taller than one Letter page.
 */
function addCanvasPaginated(pdf: jsPDF, canvas: HTMLCanvasElement, isFirst: boolean) {
  const pageW = LETTER_WIDTH_PT - MARGIN_PT * 2;
  const pageH = LETTER_HEIGHT_PT - MARGIN_PT * 2;
  const ratio = canvas.width / pageW;
  const sliceHeightPx = Math.max(1, Math.floor(pageH * ratio));
  let yOffsetPx = 0;
  let firstSlice = true;

  while (yOffsetPx < canvas.height) {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.max(1, Math.min(sliceHeightPx, canvas.height - yOffsetPx));
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      yOffsetPx,
      canvas.width,
      sliceCanvas.height,
      0,
      0,
      canvas.width,
      sliceCanvas.height,
    );
    const imgData = sliceCanvas.toDataURL("image/jpeg", 0.92);
    const renderedHeightPt = sliceCanvas.height / ratio;
    if (!isFirst || !firstSlice) pdf.addPage();
    pdf.addImage(imgData, "JPEG", MARGIN_PT, MARGIN_PT, pageW, renderedHeightPt);
    yOffsetPx += sliceHeightPx;
    firstSlice = false;
  }
}

/**
 * Trigger a browser download for a Blob via an anchor element. This is more
 * reliable than jsPDF's built-in `.save()` (which on some browsers / sandboxed
 * iframes truncates the stream before the EOF marker is written, producing a
 * corrupt file).
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  // Defer revoke generously. On Windows/Acrobat, revoking too soon can race
  // the browser's disk write and leave a PDF that looks "in use" or truncated.
  setTimeout(() => {
    if (a.parentNode) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 60_000);
}

function assertCompletePdf(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const head = String.fromCharCode(...bytes.slice(0, 5));
  const tailStart = Math.max(0, bytes.length - 1024);
  const tail = String.fromCharCode(...bytes.slice(tailStart));

  if (head !== "%PDF-" || !tail.includes("%%EOF")) {
    throw new Error("PDF export did not finish writing. Please try again.");
  }
}

/** Render multiple nodes — one per page (with internal pagination if too tall). */
export async function exportNodesToPdf(nodes: HTMLElement[], filename: string) {
  if (nodes.length === 0) return;
  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  let isFirst = true;
  for (const n of nodes) {
    const canvas = await nodeToCanvas(n);
    addCanvasPaginated(pdf, canvas, isFirst);
    isFirst = false;
  }
  // Build all bytes first, verify the EOF marker exists, then create the Blob.
  // This prevents downloading a partially-written PDF that Acrobat reports as
  // corrupt or "already open / in use".
  const buffer = pdf.output("arraybuffer");
  assertCompletePdf(buffer);
  const blob = new Blob([buffer], { type: "application/pdf" });
  downloadBlob(blob, filename);
}

/** Render a single node into a PDF (paginated if it overflows Letter). */
export async function exportNodeToPdf(node: HTMLElement, filename: string) {
  return exportNodesToPdf([node], filename);
}
