import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Brush,
  Eraser,
  ImagePlus,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { type Job } from "./api";
import { useText } from "./i18n";

const EDIT_SIDE = 2048;
const MAX_BACKGROUND_BYTES = 25 * 1024 ** 2;
const MAX_BACKGROUND_PIXELS = 40_000_000;

type Fill =
  | { kind: "none" }
  | { kind: "colour"; value: string }
  | { kind: "image"; image: HTMLImageElement; name: string };

function load(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = source;
  });
}

async function imageFromResponse(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("not_found");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    return await load(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function MatteEditor({
  job,
  index,
  onClose,
}: {
  job: Job;
  index: number;
  onClose: () => void;
}) {
  const t = useText();
  const view = useRef<HTMLCanvasElement>(null);
  const mask = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const backup = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const initial = useRef<HTMLImageElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const frame = useRef(0);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [fill, setFill] = useState<Fill>({ kind: "none" });
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [tool, setTool] = useState<"erase" | "restore">("erase");
  const [size, setSize] = useState(45),
    [canUndo, setCanUndo] = useState(false),
    [saving, setSaving] = useState(false);

  const output = job.outputs[index];
  const sourceIndex = Math.max(
    0,
    Number(output?.name.match(/^image-(\d+)\./)?.[1] ?? 1) - 1,
  );

  function setInitialMask(
    image: HTMLImageElement,
    width: number,
    height: number,
  ) {
    const context = mask.current.getContext("2d", {
      willReadFrequently: true,
    })!;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      pixels.data[offset + 3] = pixels.data[offset];
      pixels.data[offset] = 0;
      pixels.data[offset + 1] = 0;
      pixels.data[offset + 2] = 0;
    }
    context.putImageData(pixels, 0, 0);
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setReady(false);
    setError("");
    Promise.all([
      imageFromResponse(
        `/api/jobs/${job.id}/matte/${sourceIndex}/mask`,
        controller.signal,
      ),
      imageFromResponse(
        `/api/jobs/${job.id}/matte/${sourceIndex}/source`,
        controller.signal,
      ),
    ])
      .then(([matte, source]) => {
        if (cancelled) return;
        const scale = Math.min(
          1,
          EDIT_SIDE / Math.max(source.naturalWidth, source.naturalHeight),
        );
        const width = Math.max(1, Math.round(source.naturalWidth * scale));
        const height = Math.max(1, Math.round(source.naturalHeight * scale));
        for (const canvas of [mask.current, backup.current]) {
          canvas.width = width;
          canvas.height = height;
        }
        initial.current = matte;
        photo.current = source;
        setInitialMask(matte, width, height);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            t(
              "Não foi possível abrir o resultado para edição.",
              "The result could not be opened for editing.",
            ),
          );
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [job.id, sourceIndex]);

  function paint(
    target: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    mode: GlobalCompositeOperation,
  ) {
    const gradient = target.createRadialGradient(
      x,
      y,
      radius * 0.55,
      x,
      y,
      radius,
    );
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    target.globalCompositeOperation = mode;
    target.fillStyle = gradient;
    target.beginPath();
    target.arc(x, y, radius, 0, Math.PI * 2);
    target.fill();
  }

  function drawBackground(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    if (fill.kind === "colour") {
      context.fillStyle = fill.value;
      context.fillRect(0, 0, width, height);
      return;
    }
    if (fill.kind !== "image") return;
    const image = fill.image;
    const ratio =
      fit === "cover"
        ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
        : Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const targetWidth = image.naturalWidth * ratio;
    const targetHeight = image.naturalHeight * ratio;
    context.drawImage(
      image,
      (width - targetWidth) / 2,
      (height - targetHeight) / 2,
      targetWidth,
      targetHeight,
    );
  }

  function compose(canvas: HTMLCanvasElement, width: number, height: number) {
    const context = canvas.getContext("2d")!;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);
    context.drawImage(photo.current!, 0, 0, width, height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask.current, 0, 0, width, height);
    context.globalCompositeOperation = "destination-over";
    drawBackground(context, width, height);
    context.globalCompositeOperation = "source-over";
  }

  function render() {
    const canvas = view.current;
    if (!canvas || !ready) return;
    compose(canvas, canvas.width, canvas.height);
  }

  function schedule() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      render();
    });
  }

  function fitCanvas() {
    const canvas = view.current;
    const box = stage.current;
    if (!canvas || !box) return;
    canvas.width = mask.current.width;
    canvas.height = mask.current.height;
    // The element box is sized to match the bitmap exactly, so a pointer position
    // maps to one mask pixel with no letterboxing to account for.
    const available = box.clientWidth - 28;
    const scale = Math.min(
      available / mask.current.width,
      (window.innerHeight * 0.52) / mask.current.height,
      1,
    );
    canvas.style.width =
      Math.max(1, Math.round(mask.current.width * scale)) + "px";
    canvas.style.height =
      Math.max(1, Math.round(mask.current.height * scale)) + "px";
    render();
  }

  useEffect(() => {
    if (!ready) return;
    fitCanvas();
    const observer = new ResizeObserver(() => fitCanvas());
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, [ready, fill, fit]);

  function undo() {
    if (!canUndo) return;
    const context = mask.current.getContext("2d")!;
    context.globalCompositeOperation = "copy";
    context.drawImage(backup.current, 0, 0);
    context.globalCompositeOperation = "source-over";
    setCanUndo(false);
    render();
  }

  useEffect(() => {
    function keys(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    }
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [canUndo]);

  function point(event: React.PointerEvent) {
    const canvas = view.current!;
    const box = canvas.getBoundingClientRect();
    return [
      ((event.clientX - box.left) / box.width) * mask.current.width,
      ((event.clientY - box.top) / box.height) * mask.current.height,
    ] as [number, number];
  }

  function brushRadius() {
    return (
      (size / 100) * (Math.max(mask.current.width, mask.current.height) / 16)
    );
  }

  function updateCursor(event: React.PointerEvent, visible = true) {
    const ring = cursorRef.current;
    if (!ring || !view.current || !stage.current) return;
    const canvasBox = view.current.getBoundingClientRect();
    const stageBox = stage.current.getBoundingClientRect();
    const diameter = brushRadius() * 2 * (canvasBox.width / mask.current.width);
    ring.style.width = diameter + "px";
    ring.style.height = diameter + "px";
    ring.style.left = event.clientX - stageBox.left + "px";
    ring.style.top = event.clientY - stageBox.top + "px";
    ring.style.opacity = visible ? "1" : "0";
  }

  function stroke(from: [number, number] | null, to: [number, number]) {
    const context = mask.current.getContext("2d")!;
    const radius = brushRadius();
    const start = from ?? to;
    const span = Math.hypot(to[0] - start[0], to[1] - start[1]);
    const steps = Math.max(1, Math.ceil(span / Math.max(1, radius / 3)));
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      paint(
        context,
        start[0] + (to[0] - start[0]) * progress,
        start[1] + (to[1] - start[1]) * progress,
        radius,
        tool === "erase" ? "destination-out" : "source-over",
      );
    }
    context.globalCompositeOperation = "source-over";
    schedule();
  }

  function down(event: React.PointerEvent) {
    if (!ready || event.button !== 0) return;
    const context = backup.current.getContext("2d")!;
    context.globalCompositeOperation = "copy";
    context.drawImage(mask.current, 0, 0);
    context.globalCompositeOperation = "source-over";
    setCanUndo(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const current = point(event);
    last.current = current;
    updateCursor(event);
    stroke(null, current);
  }

  function move(event: React.PointerEvent) {
    updateCursor(event);
    if (!drawing.current) return;
    const current = point(event);
    stroke(last.current, current);
    last.current = current;
  }

  function up(event?: React.PointerEvent) {
    drawing.current = false;
    last.current = null;
    if (event) updateCursor(event);
  }

  function reset() {
    if (!initial.current) return;
    const context = backup.current.getContext("2d")!;
    context.globalCompositeOperation = "copy";
    context.drawImage(mask.current, 0, 0);
    context.globalCompositeOperation = "source-over";
    setCanUndo(true);
    setInitialMask(initial.current, mask.current.width, mask.current.height);
    render();
  }

  async function chooseBackground(file: File) {
    setError("");
    if (
      !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(
        file.type,
      )
    ) {
      setError(
        t(
          "Escolhe uma imagem PNG, JPEG, WebP ou AVIF.",
          "Choose a PNG, JPEG, WebP or AVIF image.",
        ),
      );
      return;
    }
    if (file.size > MAX_BACKGROUND_BYTES) {
      setError(
        t(
          "A imagem de fundo pode ter até 25 MB.",
          "The background image can be up to 25 MB.",
        ),
      );
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await load(url);
      if (image.naturalWidth * image.naturalHeight > MAX_BACKGROUND_PIXELS)
        throw new Error("pixels");
      setFill({ kind: "image", image, name: file.name });
    } catch {
      setError(
        t(
          "Não foi possível abrir essa imagem ou é demasiado grande.",
          "That image could not be opened or is too large.",
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function save() {
    if (!photo.current) return;
    setSaving(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = photo.current.naturalWidth;
      canvas.height = photo.current.naturalHeight;
      compose(canvas, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        setSaving(false);
        if (!blob) {
          setError(
            t(
              "Não foi possível preparar o ficheiro.",
              "The file could not be prepared.",
            ),
          );
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download =
          (output?.name || "imagem").replace(/\.[^.]+$/, "") + "-editado.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, "image/png");
    } catch {
      setSaving(false);
      setError(
        t(
          "Não foi possível preparar o ficheiro.",
          "The file could not be prepared.",
        ),
      );
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal matte-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="matte-title"
      >
        <header className="modal-head">
          <div>
            <h2 id="matte-title">
              {t("Ajustar máscara e fundo", "Adjust mask and background")}
            </h2>
            <small>{output?.name}</small>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={t("Fechar", "Close")}
          >
            <X size={18} />
          </button>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div
          className="matte-bar"
          role="toolbar"
          aria-label={t("Ferramentas da máscara", "Mask tools")}
        >
          <div className="matte-group">
            <button
              className={"matte-tool " + (tool === "erase" ? "selected" : "")}
              onClick={() => setTool("erase")}
              aria-pressed={tool === "erase"}
            >
              <Eraser size={16} />
              {t("Remover", "Remove")}
            </button>
            <button
              className={"matte-tool " + (tool === "restore" ? "selected" : "")}
              onClick={() => setTool("restore")}
              aria-pressed={tool === "restore"}
            >
              <Brush size={16} />
              {t("Recuperar", "Restore")}
            </button>
          </div>
          <label className="matte-size">
            {t("Tamanho", "Size")}
            <input
              type="range"
              min={5}
              max={100}
              value={size}
              onChange={(event) => setSize(+event.target.value)}
              aria-label={t("Tamanho do pincel", "Brush size")}
            />
            <output>{size}</output>
          </label>
          <div className="matte-group matte-history">
            <button className="matte-tool" onClick={undo} disabled={!canUndo}>
              <Undo2 size={16} />
              {t("Anular", "Undo")}
            </button>
            <button className="matte-tool" onClick={reset} disabled={!ready}>
              <RotateCcw size={16} />
              {t("Original", "Original")}
            </button>
          </div>
        </div>
        <div className="matte-stage" ref={stage}>
          {!ready && !error && (
            <p className="loading">{t("A abrir…", "Opening…")}</p>
          )}
          <canvas
            ref={view}
            className="matte-canvas"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerEnter={(event) => updateCursor(event)}
            onPointerLeave={(event) =>
              !drawing.current && updateCursor(event, false)
            }
            hidden={!ready}
          />
          <span
            ref={cursorRef}
            className={"brush-cursor " + tool}
            style={{ opacity: 0 }}
            aria-hidden="true"
          />
        </div>
        <div className="matte-backgrounds">
          <span>{t("Fundo", "Background")}</span>
          <button
            className={"swatch " + (fill.kind === "none" ? "selected" : "")}
            onClick={() => setFill({ kind: "none" })}
          >
            <span className="checker" />
            {t("Transparente", "Transparent")}
          </button>
          {["#ffffff", "#000000", "#962a3b", "#1f3a5f", "#e7e3dc"].map(
            (value) => (
              <button
                key={value}
                className={
                  "swatch " +
                  (fill.kind === "colour" && fill.value === value
                    ? "selected"
                    : "")
                }
                onClick={() => setFill({ kind: "colour", value })}
                aria-label={value}
              >
                <span style={{ background: value }} />
              </button>
            ),
          )}
          <label className="swatch custom">
            <input
              type="color"
              value={fill.kind === "colour" ? fill.value : "#8aa5c4"}
              onChange={(event) =>
                setFill({ kind: "colour", value: event.target.value })
              }
              aria-label={t("Outra cor", "Another colour")}
            />
          </label>
          <button
            className={
              "swatch image-swatch " + (fill.kind === "image" ? "selected" : "")
            }
            onClick={() => backgroundInput.current?.click()}
            title={fill.kind === "image" ? fill.name : undefined}
          >
            <ImagePlus size={15} />
            {fill.kind === "image"
              ? t("Trocar imagem", "Replace image")
              : t("Carregar imagem", "Upload image")}
          </button>
          <input
            ref={backgroundInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="visually-hidden"
            aria-label={t("Imagem de fundo", "Background image")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void chooseBackground(file);
              event.target.value = "";
            }}
          />
          {fill.kind === "image" && (
            <div
              className="matte-fit"
              role="group"
              aria-label={t("Ajuste da imagem", "Image fit")}
            >
              <button
                className={fit === "cover" ? "selected" : ""}
                onClick={() => setFit("cover")}
              >
                {t("Preencher", "Fill")}
              </button>
              <button
                className={fit === "contain" ? "selected" : ""}
                onClick={() => setFit("contain")}
              >
                {t("Ajustar", "Fit")}
              </button>
            </div>
          )}
        </div>
        <div className="matte-actions">
          <small>
            {t(
              "Pinta sobre a imagem para remover ou recuperar áreas. O resultado final é preparado no teu dispositivo.",
              "Paint over the image to remove or restore areas. The final result is prepared on your device.",
            )}
          </small>
          <button
            className="primary"
            onClick={save}
            disabled={!ready || saving}
          >
            <ArrowDownToLine size={16} />
            {saving
              ? t("A preparar…", "Preparing…")
              : t("Descarregar PNG", "Download PNG")}
          </button>
        </div>
      </section>
    </div>
  );
}
