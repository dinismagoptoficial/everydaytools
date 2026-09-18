import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import {
  ArrowDownToLine,
  Brush,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  X,
} from "lucide-react";
import { fileSize, type Job } from "./api";
import { useText } from "./i18n";

const IMAGES = ["png", "jpg", "jpeg", "webp", "avif", "gif", "bmp"];
const VIDEOS = ["mp4", "webm", "mkv", "mov"];
const AUDIO = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const TEXT = ["txt", "csv", "md"];
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};
const LIMITS = {
  image: 48 * 1024 ** 2,
  pdf: 64 * 1024 ** 2,
  document: 20 * 1024 ** 2,
  video: 120 * 1024 ** 2,
  audio: 120 * 1024 ** 2,
  text: 2 * 1024 ** 2,
  other: 0,
};

function kind(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGES.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "document";
  if (VIDEOS.includes(ext)) return "video";
  if (AUDIO.includes(ext)) return "audio";
  if (TEXT.includes(ext)) return "text";
  return "other";
}

type PreviewItem = { name: string; size: number; index: number; path?: string };

export default function Preview({
  job,
  index,
  original = false,
  onClose,
  onEdit,
}: {
  job: Job;
  index: number;
  original?: boolean;
  onClose: () => void;
  onEdit: (index: number) => void;
}) {
  const t = useText();
  const shown: PreviewItem[] = original
    ? job.files.map((file, position) => ({ ...file, index: position }))
    : job.outputs
        .map((output, position) => ({ ...output, index: position }))
        .filter((output) => output.path !== "all-files.zip");
  const [at, setAt] = useState(() =>
    Math.max(
      0,
      shown.findIndex((item) => item.index === index),
    ),
  );
  const output = shown[at];
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [documentHtml, setDocumentHtml] = useState("");
  const [pdf, setPdf] = useState<Uint8Array>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [imageWidth, setImageWidth] = useState<number>();
  const type = output ? kind(output.name) : "other";
  const tooLarge = Boolean(output && output.size > LIMITS[type]);
  const path = output
    ? `/api/jobs/${job.id}/${original ? `original/${output.index}` : `download/${output.index}`}`
    : "";

  useEffect(() => {
    setAt(
      Math.max(
        0,
        shown.findIndex((item) => item.index === index),
      ),
    );
  }, [job.id, index, original]);

  function displayError() {
    setError(
      t(
        "Não foi possível mostrar este ficheiro.",
        "This file could not be displayed.",
      ),
    );
  }

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === "ArrowRight")
        setAt((value) => Math.min(shown.length - 1, value + 1));
      if (event.key === "ArrowLeft") setAt((value) => Math.max(0, value - 1));
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose, shown.length]);

  useEffect(() => {
    if (!output) return;
    let objectUrl = "";
    let cancelled = false;
    const controller = new AbortController();
    setSource("");
    setText("");
    setDocumentHtml("");
    setPdf(undefined);
    setError("");
    setImageWidth(undefined);
    setLoading(true);
    if (type === "other" || tooLarge) {
      setLoading(false);
      return;
    }
    fetch(path, { signal: controller.signal, credentials: "same-origin" })
      .then((response) =>
        response.ok
          ? response.arrayBuffer()
          : Promise.reject(new Error("not_found")),
      )
      .then(async (buffer) => {
        if (cancelled) return;
        if (type === "text") {
          setText(new TextDecoder().decode(buffer).slice(0, 200000));
        } else if (type === "pdf") {
          setPdf(new Uint8Array(buffer));
        } else if (type === "document") {
          const [{ convertToHtml }, { default: DOMPurify }] = await Promise.all(
            [import("mammoth"), import("dompurify")],
          );
          if (cancelled) return;
          const result = await convertToHtml({ arrayBuffer: buffer });
          setDocumentHtml(
            DOMPurify.sanitize(result.value, {
              USE_PROFILES: { html: true },
              FORBID_TAGS: ["form", "input", "button", "iframe", "object"],
            }),
          );
        } else {
          const extension = output.name.split(".").pop()!.toLowerCase();
          const blob = new Blob([buffer], {
            type: TYPES[extension] || "application/octet-stream",
          });
          objectUrl = URL.createObjectURL(blob);
          setSource(objectUrl);
        }
        setLoading(false);
      })
      .catch((reason) => {
        if (!cancelled && reason?.name !== "AbortError") {
          displayError();
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [job.id, output?.index, output?.size, original, path, tooLarge, type]);

  if (!output) return null;
  return (
    <div
      className="modal-backdrop preview-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
      >
        <header className="modal-head">
          <div>
            <h2 id="preview-title">{output.name}</h2>
            <small>
              {original && t("Original", "Original") + " · "}
              {fileSize(output.size)}
              {shown.length > 1 && ` · ${at + 1} / ${shown.length}`}
            </small>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={t("Fechar", "Close")}
            autoFocus
          >
            <X size={18} />
          </button>
        </header>
        <div className="preview-stage">
          {shown.length > 1 && (
            <button
              className="preview-step"
              onClick={() => setAt(Math.max(0, at - 1))}
              disabled={at === 0}
              aria-label={t("Anterior", "Previous")}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="preview-body">
            {loading && <p className="loading">{t("A abrir…", "Opening…")}</p>}
            {error && <p className="error">{error}</p>}
            {!loading && !error && type === "image" && (
              <img
                className="preview-image"
                src={source}
                alt={output.name}
                style={{ width: imageWidth }}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  const scale = Math.max(
                    1,
                    Math.min(
                      3,
                      480 / Math.max(image.naturalWidth, image.naturalHeight),
                    ),
                  );
                  setImageWidth(image.naturalWidth * scale);
                }}
                onError={displayError}
              />
            )}
            {!loading && !error && pdf && (
              <PdfPreview data={pdf} name={output.name} />
            )}
            {!loading && !error && type === "document" && (
              <article
                className="preview-document"
                dangerouslySetInnerHTML={{ __html: documentHtml }}
              />
            )}
            {!loading && type === "video" && (
              <video
                src={source}
                controls
                className="preview-media"
                onError={displayError}
              />
            )}
            {!loading && type === "audio" && (
              <audio
                src={source}
                controls
                className="preview-audio"
                onError={displayError}
              />
            )}
            {!loading && type === "text" && (
              <pre className="preview-text">{text}</pre>
            )}
            {!loading && !error && (type === "other" || tooLarge) && (
              <p className="muted preview-none">
                {t(
                  "Este ficheiro não tem pré visualização. Descarrega para o abrires.",
                  "There is no preview for this file. Download it to open it.",
                )}
              </p>
            )}
          </div>
          {shown.length > 1 && (
            <button
              className="preview-step"
              onClick={() => setAt(Math.min(shown.length - 1, at + 1))}
              disabled={at === shown.length - 1}
              aria-label={t("Seguinte", "Next")}
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
        <div className="preview-actions">
          {!original &&
            job.operation === "image_background" &&
            type === "image" && (
              <button
                className="secondary"
                onClick={() => onEdit(output.index)}
              >
                <Brush size={16} />
                {t("Ajustar máscara e fundo", "Adjust mask and background")}
              </button>
            )}
          <a className="primary" href={path} download>
            <ArrowDownToLine size={16} />
            {original
              ? t("Descarregar original", "Download original")
              : t("Descarregar", "Download")}
          </a>
        </div>
      </section>
    </div>
  );
}

function PdfPreview({ data, name }: { data: Uint8Array; name: string }) {
  const t = useText();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [password, setPassword] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let disposed = false;
    let loaded: PDFDocumentProxy | undefined;
    setBusy(true);
    setError("");
    import("./pdf")
      .then(({ loadPdf }) => loadPdf(data.slice(), password))
      .then((value) => {
        loaded = value;
        if (disposed) return void value.loadingTask.destroy();
        setDocument(value);
        setPage(1);
      })
      .catch(() => {
        if (!disposed)
          setError(
            t(
              "Introduz a palavra-passe para abrir este PDF.",
              "Enter the password to open this PDF.",
            ),
          );
      })
      .finally(() => !disposed && setBusy(false));
    return () => {
      disposed = true;
      if (loaded) void loaded.loadingTask.destroy();
    };
  }, [data, attempt]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let disposed = false;
    let render: ReturnType<PDFPageProxy["render"]> | undefined;
    setBusy(true);
    document
      .getPage(page)
      .then((pdfPage) => {
        if (disposed || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale: Math.min(2, 1200 / base.width),
        });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        render = pdfPage.render({ canvas: canvas.current, viewport });
        return render.promise;
      })
      .then(() => !disposed && setBusy(false))
      .catch((reason) => {
        if (!disposed && reason?.name !== "RenderingCancelledException") {
          setError(
            t(
              "Não foi possível mostrar esta página.",
              "Could not display this page.",
            ),
          );
          setBusy(false);
        }
      });
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [document, page]);

  if (!document)
    return (
      <div className="preview-password">
        <LockKeyhole size={24} />
        <p>{busy ? t("A abrir PDF…", "Opening PDF…") : error}</p>
        {!busy && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setAttempt((value) => value + 1);
            }}
          >
            <label>
              {t("Palavra-passe do PDF", "PDF password")}
              <input
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="secondary">{t("Abrir", "Open")}</button>
          </form>
        )}
      </div>
    );

  return (
    <div className="pdf-preview" aria-label={name}>
      <canvas ref={canvas} className="preview-page" />
      {busy && (
        <span className="rendering">
          {t("A mostrar página…", "Rendering page…")}
        </span>
      )}
      {document.numPages > 1 && (
        <div className="pdf-preview-controls">
          <button
            className="icon-btn"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
            aria-label={t("Página anterior", "Previous page")}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {page} / {document.numPages}
          </span>
          <button
            className="icon-btn"
            disabled={page === document.numPages}
            onClick={() => setPage((value) => value + 1)}
            aria-label={t("Página seguinte", "Next page")}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
