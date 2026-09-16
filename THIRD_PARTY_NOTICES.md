# Third-party software

Everyday Tools source is MIT licensed. Dependencies and system executables retain their own licenses. The complete license texts shipped with installed packages remain in the image (`/usr/share/doc` and Python package metadata); frontend dependency notices are distributed with the web assets.

| Component | License | Use / upstream |
| --- | --- | --- |
| FastAPI, Starlette, Uvicorn | MIT / BSD-3-Clause | HTTP API; https://github.com/fastapi/fastapi |
| argon2-cffi | MIT | Argon2id; https://github.com/hynek/argon2-cffi |
| pypdf | BSD-3-Clause | PDF manipulation; https://github.com/py-pdf/pypdf |
| pypdfium2 / PDFium | Apache-2.0 or BSD-3-Clause / BSD-style plus bundled notices | Rendering; https://github.com/pypdfium2-team/pypdfium2 |
| ReportLab | BSD | PDF overlays; https://www.reportlab.com/ |
| Pillow / pillow-heif | HPND / BSD-3-Clause; libheif LGPL | Image processing; https://github.com/python-pillow/Pillow; https://github.com/bigcat88/pillow_heif |
| CairoSVG / Cairo | LGPL-3.0 / LGPL-2.1 or MPL-1.1 | SVG rendering; https://cairosvg.org/ |
| ONNX Runtime / NumPy | MIT / BSD-3-Clause | Local inference; https://github.com/microsoft/onnxruntime |
| U²-Net small | Apache-2.0 | Model by Xuebin Qin and contributors; https://github.com/xuebinqin/U-2-Net |
| rembg model distribution | MIT project; U²-Net model attribution above | ONNX artifact from https://github.com/danielgatis/rembg/releases/tag/v0.0.0. rembg is not a runtime dependency. |
| py7zr | LGPL-2.1 | Bounded archive IO; https://github.com/miurahr/py7zr |
| python-magic / libmagic | MIT / BSD | File identification; https://github.com/ahupp/python-magic |
| filelock | Unlicense | Cross-process coordination; https://github.com/tox-dev/filelock |
| React, Vite, diff, qrcode, @scure/bip39 | MIT | Local web application and utilities |
| TypeScript | Apache-2.0 | Build tooling |
| PDF.js | Apache-2.0 | Browser PDF preview; https://github.com/mozilla/pdf.js |
| Lucide | ISC | Icons; https://lucide.dev/ |
| JsBarcode | MIT | Barcode generation; https://github.com/lindell/JsBarcode |
| ZXing JS | Apache-2.0 | Code reader; https://github.com/zxing-js/browser |
| Inter | SIL Open Font License 1.1 | Locally served font; https://github.com/rsms/inter |
| LibreOffice | MPL-2.0, plus component licenses | Separate headless executable; https://www.libreoffice.org/about-us/licenses/ |
| FFmpeg | LGPL / GPL depending on Debian build and codecs | Separate executable; https://ffmpeg.org/legal.html |
| Ghostscript | AGPL-3.0 | Separate executable via file IO; https://www.ghostscript.com/licensing/ |
| OCRmyPDF | MPL-2.0 | Separate executable; https://github.com/ocrmypdf/OCRmyPDF |
| Tesseract | Apache-2.0 | Local OCR; https://github.com/tesseract-ocr/tesseract |
| qpdf | Apache-2.0 | PDF structural recovery; https://github.com/qpdf/qpdf |

No source from these projects is copied into the application. They are imported as libraries or invoked as separate programs. Redistributors of container images must preserve notices and meet the source-availability obligations of the bundled copyleft programs; Debian source packages and upstream source links are listed in `docs/dependencies.md`. This project's MIT license does not relicense those programs.
