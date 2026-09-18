import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  Type,
  PenLine,
  Highlighter,
  Underline,
  Square,
  ImagePlus,
  Undo2,
  RotateCw,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  EyeOff,
  TextCursorInput,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Replace,
  Move,
} from "lucide-react";
import { loadPdf, pageImages, type PageImage } from "./pdf";
import { useText } from "./i18n";

type Run = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
};
type Mark = {
  page: number;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  color: string;
  data?: string;
  points?: number[][];
  background?: string;
};
export default function PdfEditor({
  jobId,
  onSave,
  busy,
}: {
  jobId: string;
  onSave: (data: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const t = useText();
  const canvas = useRef<HTMLCanvasElement>(null),
    area = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy>(),
    [page, setPage] = useState(1),
    [order, setOrder] = useState<number[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]),
    [current, setCurrent] = useState<Mark>(),
    [rotations, setRotations] = useState<Record<string, number>>({});
  const [mode, setMode] = useState("text"),
    [text, setText] = useState(""),
    [size, setSize] = useState(16),
    [color, setColor] = useState("#982b3b");
  const [password, setPassword] = useState(""),
    [attempt, setAttempt] = useState(0),
    [error, setError] = useState(""),
    [dimensions, setDimensions] = useState({ w: 600, h: 800 }),
    [image, setImage] = useState("");
  const [rendering, setRendering] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [editing, setEditing] = useState<{ run: Run; draft: string }>();
  const [selected, setSelected] = useState(-1);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const [wide, setWide] = useState(true);
  const [pictures, setPictures] = useState<PageImage[]>([]);
  const [picked, setPicked] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [pageScale, setPageScale] = useState(1);
  const grab = useRef<{ index: number; x: number; y: number } | null>(null);
  const resize = useRef<{
    index: number;
    corner: string;
    start: Mark;
    px: number;
    py: number;
  } | null>(null);
  const swapPicture = useRef(-1);
  useEffect(() => {
    let disposed = false;
    let loaded: PDFDocumentProxy | undefined;
    loadPdf(`/api/jobs/${jobId}/original/0`, password)
      .then((pdf) => {
        loaded = pdf;
        if (disposed) {
          void pdf.loadingTask.destroy();
          return;
        }
        if (pdf.numPages > 500) {
          setError(
            t(
              "O documento ultrapassa o limite de 500 páginas.",
              "This document exceeds the 500-page limit.",
            ),
          );
          void pdf.loadingTask.destroy();
          return;
        }
        setDoc(pdf);
        setOrder(Array.from({ length: pdf.numPages }, (_, i) => i + 1));
        setError("");
      })
      .catch(() => {
        if (!disposed)
          setError(
            t(
              "Não foi possível abrir o PDF. Se estiver protegido, introduz a palavra-passe.",
              "Could not open this PDF. If protected, enter its password.",
            ),
          );
      });
    return () => {
      disposed = true;
      if (loaded) void loaded.loadingTask.destroy();
    };
  }, [jobId, attempt]);
  useEffect(() => {
    if (!doc) return;
    let disposed = false;
    let task: { cancel: () => void } | undefined;
    setRendering(true);
    setPictures([]);
    setPicked(-1);
    setSelected(-1);
    doc
      .getPage(page)
      .then(async (p) => {
        if (disposed || !canvas.current) return;
        const original = p.getViewport({ scale: 1 });
        const scale = Math.min(
          1.5,
          1200 / original.width,
          1600 / original.height,
        );
        const viewport = p.getViewport({ scale });
        const target = canvas.current;
        target.width = viewport.width;
        target.height = viewport.height;
        setDimensions({ w: original.width, h: original.height });
        const render = p.render({ canvas: target, viewport });
        task = render;
        try {
          await render.promise;
          if (disposed) return;
          setRendering(false);
          const content = await p.getTextContent();
          if (disposed) return;
          const found: Run[] = [];
          for (const item of content.items) {
            const run = item as {
              str: string;
              transform: number[];
              width: number;
              height: number;
            };
            if (!run.str || !run.str.trim()) continue;
            const size = Math.abs(run.transform[3]) || run.height || 10;
            found.push({
              text: run.str,
              x: run.transform[4],
              y: original.height - run.transform[5] - size,
              w: run.width || run.str.length * size * 0.5,
              h: size * 1.25,
              size,
            });
          }
          setRuns(found);
          const bitmaps = await pageImages(p, original.height);
          if (disposed) return;
          // A bitmap covering the whole sheet is a scan: lifting it would only
          // get in the way of the text and marks drawn on top of it.
          setPictures(
            bitmaps.filter(
              (b) => b.w * b.h < original.width * original.height * 0.92,
            ),
          );
        } catch {
          /* Cancelled when changing pages. */
        }
      })
      .catch(() =>
        setError(
          t(
            "Não foi possível mostrar esta página.",
            "Could not display this page.",
          ),
        ),
      );
    return () => {
      disposed = true;
      task?.cancel();
    };
  }, [doc, page]);
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const measure = () => setPageScale(node.clientWidth / dimensions.w || 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [doc, dimensions.w, zoom]);
  const coarse =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  // Grips are drawn in page units, so undo the on screen scale to keep them
  // the same size whatever the zoom, and big enough for a fingertip.
  const grip = (coarse ? 22 : 11) / Math.max(pageScale, 0.05);
  const modes = [
    ["edit", TextCursorInput, t("Editar conteúdo", "Edit content")],
    ["text", Type, t("Texto", "Text")],
    ["signature", PenLine, t("Assinatura", "Signature")],
    ["draw", PenLine, t("Desenhar", "Draw")],
    ["highlight", Highlighter, t("Realçar", "Highlight")],
    ["underline", Underline, t("Sublinhar", "Underline")],
    ["rect", Square, t("Retângulo", "Rectangle")],
    ["redact", EyeOff, t("Ocultar", "Redact")],
    ["image", ImagePlus, t("Imagem", "Image")],
  ] as const;
  function behind(run: { x: number; y: number; w: number; h: number }) {
    const target = canvas.current;
    if (!target) return "#ffffff";
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return "#ffffff";
    const sx = target.width / dimensions.w;
    const sy = target.height / dimensions.h;
    const samples: number[][] = [];
    for (const [ox, oy] of [
      [run.x - 3, run.y + run.h / 2],
      [run.x + run.w + 3, run.y + run.h / 2],
      [run.x + run.w / 2, run.y - 3],
      [run.x + run.w / 2, run.y + run.h + 3],
    ]) {
      const px = Math.round(Math.min(Math.max(ox, 0), dimensions.w - 1) * sx);
      const py = Math.round(Math.min(Math.max(oy, 0), dimensions.h - 1) * sy);
      const data = context.getImageData(px, py, 1, 1).data;
      samples.push([data[0], data[1], data[2]]);
    }
    // The lightest neighbour is the page, not a glyph edge or a neighbouring word.
    const best = samples.reduce((a, b) =>
      a[0] + a[1] + a[2] >= b[0] + b[1] + b[2] ? a : b,
    );
    return "#" + best.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function replaceRun(run: Run, value: string) {
    setMarks((previous) => [
      ...previous,
      {
        page,
        type: "replace",
        x: run.x / dimensions.w,
        y: run.y / dimensions.h,
        w: run.w / dimensions.w,
        h: run.h / dimensions.h,
        text: value,
        size: run.size,
        color: "#111114",
        background: behind(run),
      },
    ]);
    setEditing(undefined);
  }

  /** The bitmap as it was rendered, so a lifted picture looks unchanged. */
  function crop(pic: PageImage) {
    const target = canvas.current;
    if (!target) return "";
    const sx = target.width / dimensions.w;
    const sy = target.height / dimensions.h;
    const cut = document.createElement("canvas");
    cut.width = Math.max(1, Math.round(pic.w * sx));
    cut.height = Math.max(1, Math.round(pic.h * sy));
    const context = cut.getContext("2d");
    if (!context) return "";
    context.drawImage(
      target,
      Math.round(pic.x * sx),
      Math.round(pic.y * sy),
      cut.width,
      cut.height,
      0,
      0,
      cut.width,
      cut.height,
    );
    return cut.toDataURL("image/png");
  }

  /**
   * A bitmap already inside the page cannot be moved where it lies, so its spot
   * is covered with the colour around it and the picture is drawn again as an
   * ordinary object. Passing no data simply removes it.
   */
  function liftPicture(at: number, data: string | null) {
    const pic = pictures[at];
    if (!pic) return;
    const box = {
      x: pic.x / dimensions.w,
      y: pic.y / dimensions.h,
      w: pic.w / dimensions.w,
      h: pic.h / dimensions.h,
    };
    const added: Mark[] = [
      {
        page,
        ...box,
        type: "replace",
        text: "",
        size: 10,
        color: "#111114",
        background: behind(pic),
      },
    ];
    if (data)
      added.push({
        page,
        ...box,
        type: "image",
        text: "",
        size: 12,
        color,
        data,
      });
    setMarks((previous) => {
      setSelected(data ? previous.length + 1 : -1);
      return [...previous, ...added];
    });
    setPictures((previous) => previous.filter((_, index) => index !== at));
    setPicked(-1);
  }

  /** Keeps the drag alive outside the shape, and never breaks it if it cannot. */
  function capture(e: React.PointerEvent) {
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* Some pointers are gone by the time we ask; dragging still works. */
    }
  }

  function startResize(e: React.PointerEvent, index: number, corner: string) {
    e.stopPropagation();
    const box = area.current!.getBoundingClientRect();
    resize.current = {
      index,
      corner,
      start: marks[index],
      px: (e.clientX - box.left) / box.width,
      py: (e.clientY - box.top) / box.height,
    };
    setSelected(index);
    capture(e);
  }

  function dragResize(e: React.PointerEvent) {
    const held = resize.current;
    if (!held) return;
    const box = area.current!.getBoundingClientRect();
    const dx = (e.clientX - box.left) / box.width - held.px;
    const dy = (e.clientY - box.top) / box.height - held.py;
    const start = held.corner;
    const from = held.start;
    let { x, y, w, h } = from;
    if (start.includes("w")) {
      x = from.x + dx;
      w = from.w - dx;
    }
    if (start.includes("e")) w = from.w + dx;
    if (start.includes("n")) {
      y = from.y + dy;
      h = from.h - dy;
    }
    if (start.includes("s")) h = from.h + dy;
    const least = 0.01;
    if (w < least) {
      if (start.includes("w")) x = from.x + from.w - least;
      w = least;
    }
    if (h < least) {
      if (start.includes("n")) y = from.y + from.h - least;
      h = least;
    }
    // Words keep their proportions: a taller box means bigger letters.
    const grown = from.h > 0 ? h / from.h : 1;
    setMarks((list) =>
      list.map((item, at) =>
        at === held.index
          ? {
              ...item,
              x: Math.min(Math.max(x, 0), 1),
              y: Math.min(Math.max(y, 0), 1),
              w,
              h,
              size: ["text", "signature", "replace"].includes(item.type)
                ? Math.min(200, Math.max(4, Math.round(from.size * grown)))
                : item.size,
            }
          : item,
      ),
    );
  }

  function point(e: React.PointerEvent) {
    const r = area.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  }
  function down(e: React.PointerEvent) {
    if (rendering || e.button !== 0) return;
    if ((mode === "text" || mode === "signature") && !text.trim()) {
      setError(
        t(
          "Escreve primeiro o texto ou o nome da assinatura.",
          "Enter the text or signature name first.",
        ),
      );
      return;
    }
    if (mode === "image" && !image) {
      fileInput.current?.click();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    setError("");
    const mark: Mark = {
      page,
      type: mode,
      x,
      y,
      w: 0.25,
      h: Math.min(0.1, (size / dimensions.h) * 1.4),
      text,
      size,
      color,
      data: image,
    };
    if (mode === "draw") mark.points = [[x, y]];
    if (mode === "image") mark.h = 0.2;
    setCurrent(mark);
  }
  function move(e: React.PointerEvent) {
    if (!current) return;
    const [x, y] = point(e);
    if (current.type === "draw") {
      setCurrent({
        ...current,
        points: [...current.points!, [x, y]].slice(0, 5000),
      });
      return;
    }
    if (["text", "signature", "image"].includes(current.type)) return;
    setCurrent({
      ...current,
      w: Math.max(0.002, x - current.x),
      h: Math.max(0.002, y - current.y),
    });
  }
  function up() {
    if (current) {
      setMarks((prev) => [...prev, current]);
      setCurrent(undefined);
    }
  }
  function movePage(direction: number) {
    const idx = order.indexOf(page),
      target = idx + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  }
  const all = [
    ...marks.filter((m) => m.page === page),
    ...(current ? [current] : []),
  ];
  if (!doc)
    return (
      <div className="editor-loading">
        <p>{error || t("A abrir o documento…", "Opening document…")}</p>
        {error && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAttempt((a) => a + 1);
            }}
          >
            <label>
              {t("Palavra-passe do PDF", "PDF password")}
              <input
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="secondary">{t("Abrir PDF", "Open PDF")}</button>
          </form>
        )}
      </div>
    );
  return (
    <div className={"pdf-editor " + (wide ? "wide" : "")}>
      {editing && (
        <div
          className="run-editor"
          role="dialog"
          aria-label={t("Editar texto", "Edit text")}
        >
          <label>
            {t("Substituir este texto", "Replace this text")}
            <input
              autoFocus
              value={editing.draft}
              maxLength={1000}
              onChange={(event) =>
                setEditing({ ...editing, draft: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  replaceRun(editing.run, editing.draft);
                if (event.key === "Escape") setEditing(undefined);
              }}
            />
          </label>
          <div className="actions">
            <button
              className="secondary compact"
              onClick={() => setEditing(undefined)}
            >
              {t("Cancelar", "Cancel")}
            </button>
            <button
              className="primary compact"
              onClick={() => replaceRun(editing.run, editing.draft)}
            >
              {t("Substituir", "Replace")}
            </button>
          </div>
          <small>
            {t(
              "O texto original é tapado com a cor da página e o novo é desenhado por cima. O tipo de letra pode não ser exatamente igual.",
              "The original run is covered with the page colour and the new words are drawn on top. The typeface may not match exactly.",
            )}
          </small>
        </div>
      )}
      {picked >= 0 && pictures[picked] && (
        <div className="run-editor picture-editor">
          <strong>{t("Imagem do documento", "Document image")}</strong>
          <small>
            {t(
              "A imagem é levantada da página: o sítio original fica tapado com a cor à volta e ficas com um objeto que podes arrastar, esticar ou trocar.",
              "The picture is lifted off the page: its original spot is covered with the colour around it and you get an object you can drag, stretch or swap.",
            )}
          </small>
          <div className="actions">
            <button
              className="primary"
              onClick={() => liftPicture(picked, crop(pictures[picked]))}
            >
              <Move size={15} />
              {t("Mover ou esticar", "Move or stretch")}
            </button>
            <button
              className="secondary"
              onClick={() => {
                swapPicture.current = picked;
                fileInput.current?.click();
              }}
            >
              <Replace size={15} />
              {t("Trocar imagem", "Swap image")}
            </button>
            <button
              className="secondary"
              onClick={() => liftPicture(picked, null)}
            >
              <Trash2 size={15} />
              {t("Remover", "Remove")}
            </button>
            <button className="link" onClick={() => setPicked(-1)}>
              {t("Cancelar", "Cancel")}
            </button>
          </div>
        </div>
      )}
      <div
        className="editor-tools"
        role="toolbar"
        aria-label={t("Ferramentas de edição", "Editing tools")}
      >
        {modes.map(([id, Icon, label]) => (
          <button
            key={id}
            className={"editor-tool " + (mode === id ? "selected" : "")}
            onClick={() => {
              setMode(id);
              if (id === "image") fileInput.current?.click();
            }}
            aria-pressed={mode === id}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className="editor-tool"
          onClick={() => setWide((value) => !value)}
          aria-pressed={wide}
        >
          {wide ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          {wide ? t("Reduzir", "Shrink") : t("Ecrã inteiro", "Fullscreen")}
        </button>
        <button
          className="editor-tool"
          disabled={!marks.length}
          onClick={() => setMarks((m) => m.slice(0, -1))}
        >
          <Undo2 size={17} />
          {t("Desfazer", "Undo")}
        </button>
      </div>
      <div className="editor-properties">
        {["text", "signature"].includes(mode) && (
          <>
            <label>
              {mode === "signature"
                ? t("Nome da assinatura visual", "Visual signature name")
                : t("Texto a adicionar", "Text to add")}
              <input
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <label>
              {t("Tamanho", "Size")}
              <input
                type="number"
                min={6}
                max={100}
                value={size}
                onChange={(e) => setSize(+e.target.value)}
              />
            </label>
          </>
        )}
        {mode !== "edit" && (
          <label>
            {t("Cor", "Color")}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        )}
        <p>
          {mode === "edit"
            ? t(
                "Toca numa palavra para a reescrever ou numa imagem para a mover, esticar ou trocar.",
                "Tap a word to rewrite it, or a picture to move, stretch or swap it.",
              )
            : mode === "redact"
              ? t(
                  "Arrasta uma área para remover permanentemente o conteúdo.",
                  "Drag an area to permanently remove its content.",
                )
              : mode === "signature"
                ? t(
                    "Assinatura visual, sem certificado digital. Clica na página para posicionar.",
                    "Visual signature, without a digital certificate. Click to place it.",
                  )
                : t(
                    "Clica ou arrasta na página para adicionar.",
                    "Click or drag on the page to add.",
                  )}
        </p>
      </div>
      <input
        type="file"
        ref={fileInput}
        accept="image/png,image/jpeg,image/webp"
        className="visually-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 800000) {
            setError(
              t(
                "Escolhe uma imagem com menos de 800 KB.",
                "Choose an image smaller than 800 KB.",
              ),
            );
            return;
          }
          const reader = new FileReader();
          const target = swapPicture.current;
          swapPicture.current = -1;
          reader.onload = () => {
            const data = reader.result as string;
            if (target >= 0) liftPicture(target, data);
            else setImage(data);
          };
          reader.readAsDataURL(f);
          e.target.value = "";
        }}
      />
      <div className="editor-workspace">
        <aside className="page-list">
          <strong>{t("Páginas", "Pages")}</strong>
          <small className="page-hint">
            {t("Arrasta para reordenar", "Drag to reorder")}
          </small>
          {order.map((n, i) => (
            <button
              key={n}
              className={
                (page === n ? "selected " : "") +
                (dragPage === n ? "dragging" : "")
              }
              draggable
              onDragStart={() => setDragPage(n)}
              onDragEnd={() => setDragPage(null)}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragPage === null || dragPage === n) return;
                setOrder((current) => {
                  const next = current.filter((value) => value !== dragPage);
                  next.splice(next.indexOf(n), 0, dragPage);
                  return next;
                });
              }}
              onDrop={(event) => event.preventDefault()}
              onClick={() => setPage(n)}
            >
              <FilePage n={n} />
              <small>
                {i + 1}
                {rotations[String(n)] ? ` · ${rotations[String(n)]}°` : ""}
              </small>
            </button>
          ))}
        </aside>
        <div className="paper-scroller">
          <div
            className="paper"
            ref={area}
            style={{
              aspectRatio: `${dimensions.w} / ${dimensions.h}`,
              width: `calc(min(100%, 650px) * ${zoom})`,
            }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => setCurrent(undefined)}
          >
            <canvas ref={canvas} />
            {mode === "edit" && !rendering && pictures.length > 0 && (
              <div className="picture-layer">
                {pictures.map((pic, index) => (
                  <button
                    key={index}
                    className={
                      "pdf-picture " + (picked === index ? "picked" : "")
                    }
                    title={t("Imagem do documento", "Document image")}
                    aria-label={t("Editar esta imagem", "Edit this image")}
                    style={{
                      left: (pic.x / dimensions.w) * 100 + "%",
                      top: (pic.y / dimensions.h) * 100 + "%",
                      width: (pic.w / dimensions.w) * 100 + "%",
                      height: (pic.h / dimensions.h) * 100 + "%",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPicked(index);
                    }}
                  />
                ))}
              </div>
            )}
            {mode === "edit" && !rendering && (
              <div className="text-layer">
                {runs.map((run, index) => (
                  <button
                    key={index}
                    className="text-run"
                    title={run.text}
                    style={{
                      left: (run.x / dimensions.w) * 100 + "%",
                      top: (run.y / dimensions.h) * 100 + "%",
                      width: (run.w / dimensions.w) * 100 + "%",
                      height: (run.h / dimensions.h) * 100 + "%",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing({ run, draft: run.text });
                    }}
                  />
                ))}
              </div>
            )}
            <svg
              className="annotation-layer"
              viewBox={`0 0 ${dimensions.w} ${dimensions.h}`}
            >
              {all.map((m, i) => {
                const x = m.x * dimensions.w,
                  y = m.y * dimensions.h,
                  w = m.w * dimensions.w,
                  h = m.h * dimensions.h;
                if (m.type === "replace")
                  return (
                    <g key={i}>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={m.background}
                      />
                      <text
                        x={x}
                        y={y + h - m.size * 0.25}
                        fill={m.color}
                        fontFamily="Helvetica, Arial, sans-serif"
                        fontSize={m.size}
                      >
                        {m.text}
                      </text>
                    </g>
                  );
                if (m.type === "text" || m.type === "signature")
                  return (
                    <text
                      key={i}
                      x={x}
                      y={y + h}
                      fill={m.color}
                      fontFamily="Helvetica, Arial, sans-serif"
                      fontSize={m.size}
                      fontStyle={m.type === "signature" ? "italic" : "normal"}
                    >
                      {m.text}
                    </text>
                  );
                if (m.type === "draw")
                  return (
                    <polyline
                      key={i}
                      points={m
                        .points!.map(
                          (p) =>
                            `${p[0] * dimensions.w},${p[1] * dimensions.h}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke={m.color}
                    />
                  );
                if (m.type === "image")
                  return (
                    <image
                      key={i}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      href={m.data}
                      preserveAspectRatio="none"
                    />
                  );
                if (m.type === "underline")
                  return (
                    <line
                      key={i}
                      x1={x}
                      y1={y + h}
                      x2={x + w}
                      y2={y + h}
                      stroke={m.color}
                    />
                  );
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={
                      m.type === "redact"
                        ? "black"
                        : m.type === "highlight"
                          ? "#ffdb00"
                          : "none"
                    }
                    fillOpacity={m.type === "highlight" ? 0.3 : 1}
                    stroke={m.type === "rect" ? m.color : "none"}
                  />
                );
              })}
              {marks.map((m, index) => {
                if (m.page !== page) return null;
                const x = m.x * dimensions.w,
                  y = m.y * dimensions.h;
                const w = Math.max(m.w * dimensions.w, m.size || 12);
                const h = Math.max(m.h * dimensions.h, (m.size || 12) * 1.2);
                return (
                  <rect
                    key={"hit" + index}
                    className={
                      "mark-hit " + (selected === index ? "selected" : "")
                    }
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelected(index);
                      const box = area.current!.getBoundingClientRect();
                      grab.current = {
                        index,
                        x: (event.clientX - box.left) / box.width - m.x,
                        y: (event.clientY - box.top) / box.height - m.y,
                      };
                      capture(event);
                    }}
                    onPointerMove={(event) => {
                      const held = grab.current;
                      if (!held) return;
                      const box = area.current!.getBoundingClientRect();
                      const nx =
                        (event.clientX - box.left) / box.width - held.x;
                      const ny =
                        (event.clientY - box.top) / box.height - held.y;
                      setMarks((list) =>
                        list.map((item, at) =>
                          at === held.index
                            ? {
                                ...item,
                                x: Math.min(Math.max(nx, 0), 1),
                                y: Math.min(Math.max(ny, 0), 1),
                              }
                            : item,
                        ),
                      );
                    }}
                    onPointerUp={() => {
                      grab.current = null;
                    }}
                  />
                );
              })}
              {selected >= 0 &&
                marks[selected] &&
                marks[selected].page === page &&
                marks[selected].type !== "draw" &&
                (() => {
                  const m = marks[selected];
                  const x = m.x * dimensions.w;
                  const y = m.y * dimensions.h;
                  const w = Math.max(m.w * dimensions.w, m.size || 12);
                  const h = Math.max(m.h * dimensions.h, (m.size || 12) * 1.2);
                  const corners: [string, number, number][] = [
                    ["nw", x, y],
                    ["ne", x + w, y],
                    ["sw", x, y + h],
                    ["se", x + w, y + h],
                  ];
                  return (
                    <g>
                      {corners.map(([corner, hx, hy]) => (
                        <rect
                          key={corner}
                          className={"mark-grip " + corner}
                          x={hx - grip / 2}
                          y={hy - grip / 2}
                          width={grip}
                          height={grip}
                          rx={grip * 0.25}
                          onPointerDown={(event) =>
                            startResize(event, selected, corner)
                          }
                          onPointerMove={dragResize}
                          onPointerUp={() => {
                            resize.current = null;
                          }}
                          onPointerCancel={() => {
                            resize.current = null;
                          }}
                        />
                      ))}
                    </g>
                  );
                })()}
            </svg>
            {rendering && (
              <div className="rendering">
                {t("A mostrar página…", "Rendering page…")}
              </div>
            )}
          </div>
        </div>
      </div>
      {selected >= 0 && marks[selected] && (
        <div className="selection-bar">
          <span>{t("Objeto selecionado", "Object selected")}</span>
          <button
            className="link"
            onClick={() => {
              setMarks((list) => list.filter((_, at) => at !== selected));
              setSelected(-1);
            }}
          >
            <Trash2 size={15} />
            {t("Remover", "Remove")}
          </button>
          <button className="link" onClick={() => setSelected(-1)}>
            {t("Desmarcar", "Deselect")}
          </button>
        </div>
      )}
      <div className="editor-page-actions">
        <button
          className="icon-btn"
          disabled={zoom <= 0.5}
          onClick={() =>
            setZoom((v) => Math.max(0.5, Math.round((v - 0.25) * 100) / 100))
          }
          aria-label={t("Reduzir zoom", "Zoom out")}
        >
          <ZoomOut size={18} />
        </button>
        <button
          className="link zoom-reset"
          onClick={() => setZoom(1)}
          aria-label={t("Repor o zoom", "Reset zoom")}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="icon-btn"
          disabled={zoom >= 3}
          onClick={() =>
            setZoom((v) => Math.min(3, Math.round((v + 0.25) * 100) / 100))
          }
          aria-label={t("Aumentar zoom", "Zoom in")}
        >
          <ZoomIn size={18} />
        </button>
        <button
          className="icon-btn"
          disabled={order.indexOf(page) === 0}
          onClick={() => setPage(order[order.indexOf(page) - 1])}
          aria-label={t("Página anterior", "Previous page")}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {t("Página", "Page")} {order.indexOf(page) + 1} / {order.length}
        </span>
        <button
          className="icon-btn"
          disabled={order.indexOf(page) === order.length - 1}
          onClick={() => setPage(order[order.indexOf(page) + 1])}
          aria-label={t("Página seguinte", "Next page")}
        >
          <ChevronRight size={18} />
        </button>
        <button
          className="secondary compact"
          onClick={() =>
            setRotations((r) => ({ ...r, [page]: ((r[page] || 0) + 90) % 360 }))
          }
        >
          <RotateCw size={15} />
          {t("Rodar ao guardar", "Rotate on save")} {rotations[page] || 0}°
        </button>
        <button
          className="icon-btn"
          disabled={order.indexOf(page) === 0}
          onClick={() => movePage(-1)}
          aria-label={t("Mover página para cima", "Move page up")}
        >
          <ArrowUp size={18} />
        </button>
        <button
          className="icon-btn"
          disabled={order.indexOf(page) === order.length - 1}
          onClick={() => movePage(1)}
          aria-label={t("Mover página para baixo", "Move page down")}
        >
          <ArrowDown size={18} />
        </button>
        <button
          className="icon-btn delete"
          disabled={order.length === 1}
          onClick={() => {
            const next = order.filter((n) => n !== page);
            setOrder(next);
            setPage(next[0]);
          }}
          aria-label={t("Eliminar página", "Delete page")}
        >
          <Trash2 size={17} />
        </button>
      </div>
      {marks.some((m) => m.type === "redact") && (
        <p className="notice">
          {t(
            "As páginas com ocultações serão convertidas em imagem no PDF final. Nessas páginas, o texto deixa de ser selecionável e o conteúdo ocultado é removido. Revê o resultado antes de o partilhares.",
            "Redacted pages are converted to images in the saved PDF. Text on those pages will no longer be selectable, and redacted content is removed. Review the result before sharing.",
          )}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-save">
        <small>
          {t(
            "Em “Editar conteúdo” reescreves palavras e mexes nas imagens que já estão no PDF; as outras ferramentas acrescentam coisas novas.",
            "Under “Edit content” you rewrite words and move the pictures already in the PDF; the other tools add new things.",
          )}
        </small>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            onSave({
              annotations: marks,
              pages: order.join(","),
              rotations,
              password,
            })
          }
        >
          <Save size={17} />
          {t("Guardar PDF", "Save PDF")}
        </button>
      </div>
    </div>
  );
}
function FilePage({ n }: { n: number }) {
  return (
    <span className="page-miniature">
      <span>{n}</span>
      <i />
      <i />
      <i />
    </span>
  );
}
