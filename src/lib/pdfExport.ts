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

async function nodeToCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  // Wait two animation frames so any in-flight layout / lazy images settle.
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
  const sliceHeightPx = pageH * ratio;
  let yOffsetPx = 0;
  let firstSlice = true;

  while (yOffsetPx < canvas.height) {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.min(sliceHeightPx, canvas.height - yOffsetPx);
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
  pdf.save(filename);
}

/** Render a single node into a PDF (paginated if it overflows Letter). */
export async function exportNodeToPdf(node: HTMLElement, filename: string) {
  return exportNodesToPdf([node], filename);
}
