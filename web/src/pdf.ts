import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
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
