import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Brush,
  ChevronLeft,
  ChevronRight,
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
  pdf: "application/pdf",
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
  txt: "text/plain",
  csv: "text/plain",
  md: "text/plain",
};
const LIMITS = {
  image: 48 * 1024 ** 2,
  pdf: 48 * 1024 ** 2,
  video: 120 * 1024 ** 2,
  audio: 120 * 1024 ** 2,
  text: 2 * 1024 ** 2,
  other: 0,
};

function kind(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGES.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (VIDEOS.includes(ext)) return "video";
  if (AUDIO.includes(ext)) return "audio";
  if (TEXT.includes(ext)) return "text";
  return "other";
}

export default function Preview({
  job,
  index,
  onClose,
  onEdit,
}: {
  job: Job;
  index: number;
  onClose: () => void;
  onEdit: (index: number) => void;
}) {
  const t = useText();
  const shown = job.outputs.filter((o) => o.path !== "all-files.zip");
  const [at, setAt] = useState(() =>
    Math.max(
      0,
      shown.findIndex((o) => o.path === job.outputs[index]?.path),
    ),
  );
  const output = shown[at];
  const [source, setSource] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [imageWidth, setImageWidth] = useState<number>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const type = output ? kind(output.name) : "other";
  const position = job.outputs.findIndex((o) => o.path === output?.path);
  const tooLarge = Boolean(output && output.size > LIMITS[type]);

  function displayError() {
    setError(
      t(
        "Não foi possível mostrar este ficheiro.",
        "This file could not be displayed.",
      ),
    );
  }

  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight")
        setAt((n) => Math.min(shown.length - 1, n + 1));
      if (e.key === "ArrowLeft") setAt((n) => Math.max(0, n - 1));
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose, shown.length]);

  useEffect(() => {
    if (!output) return;
    let url = "";
    let cancelled = false;
    const controller = new AbortController();
    setSource("");
    setText("");
    setError("");
    setImageWidth(undefined);
    setLoading(true);
    if (type === "other" || tooLarge) {
      setLoading(false);
      return;
    }
    fetch(`/api/jobs/${job.id}/download/${position}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("not_found"))))
      .then(async (blob) => {
        if (cancelled) return;
        const mediaType = TYPES[output.name.split(".").pop()!.toLowerCase()];
        const typed = new Blob([blob], {
          type: mediaType || blob.type || "application/octet-stream",
        });
        if (type === "text") {
          setText((await typed.text()).slice(0, 200000));
          setLoading(false);
          return;
        }
        if (type === "pdf") {
          const { loadPdf } = await import("./pdf");
          if (cancelled) return;
          url = URL.createObjectURL(typed);
          const document = await loadPdf(url);
          const page = await document.getPage(1);
          if (cancelled) {
            void document.loadingTask.destroy();
            return;
          }
          const target = canvas.current;
          if (target) {
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({
              scale: Math.min(2, 1100 / base.width),
            });
            target.width = viewport.width;
            target.height = viewport.height;
            await page.render({ canvas: target, viewport }).promise;
          }
          page.cleanup();
          void document.loadingTask.destroy();
          setLoading(false);
          return;
        }
        url = URL.createObjectURL(typed);
        setSource(url);
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
      if (url) URL.revokeObjectURL(url);
    };
  }, [job.id, position, type, output?.size, tooLarge]);

  if (!output) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
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
            <canvas
              ref={canvas}
              className="preview-page"
              hidden={type !== "pdf" || loading || Boolean(error)}
            />
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
                  "Este ficheiro não tem pré-visualização. Descarrega para o abrires.",
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
          {job.operation === "image_background" && type === "image" && (
            <button className="secondary" onClick={() => onEdit(position)}>
              <Brush size={16} />
              {t("Ajustar máscara e fundo", "Adjust mask and background")}
            </button>
          )}
          <a
            className="primary"
            href={`/api/jobs/${job.id}/download/${position}`}
            download
          >
            <ArrowDownToLine size={16} />
            {t("Descarregar", "Download")}
          </a>
        </div>
      </section>
    </div>
  );
}
