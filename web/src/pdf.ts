import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export type { PDFPageProxy } from "pdfjs-dist";
export async function loadPdf(source: string | Uint8Array, password = "") {
  return pdfjs.getDocument({
    ...(typeof source === "string" ? { url: source } : { data: source }),
    password,
    useSystemFonts: true,
    cMapUrl: "/pdf/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdf/standard_fonts/",
    wasmUrl: "/pdf/wasm/",
  }).promise;
}

export type PageImage = { x: number; y: number; w: number; h: number };

/**
 * Where each bitmap sits on a page, in PDF units measured from the top left so
 * the caller can place it next to the text runs. PDF.js paints every image by
 * mapping the unit square through the current matrix, so following the matrix
 * through the operator list is enough to recover the rectangle.
 */
export async function pageImages(
  page: pdfjs.PDFPageProxy,
  pageHeight: number,
): Promise<PageImage[]> {
  const { OPS, Util } = pdfjs;
  const list = await page.getOperatorList();
  const stack: number[][] = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const found: PageImage[] = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const op = list.fnArray[i];
    const args = list.argsArray[i] as number[][] & number[];
    if (op === OPS.save) stack.push(matrix);
    else if (op === OPS.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (op === OPS.transform)
      matrix = Util.transform(matrix, args as unknown as number[]);
    else if (op === OPS.paintFormXObjectBegin) {
      stack.push(matrix);
      if (args[0]) matrix = Util.transform(matrix, args[0]);
    } else if (op === OPS.paintFormXObjectEnd)
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (
      op === OPS.paintImageXObject ||
      op === OPS.paintImageMaskXObject ||
      op === OPS.paintInlineImageXObject
    ) {
      // applyTransform rewrites the point in place, so hand it a fresh pair.
      const corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      for (const corner of corners) Util.applyTransform(corner, matrix);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x = Math.min(...xs);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - Math.min(...ys);
      // Hairline images are separators and shading strips, not something to edit.
      if (w > 6 && h > 6)
        found.push({ x, y: pageHeight - Math.max(...ys), w, h });
    }
  }
  return found;
}
