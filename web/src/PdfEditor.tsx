import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Type, PenLine, Highlighter, Underline, Square, ImagePlus, Undo2, RotateCw, ArrowUp, ArrowDown, Trash2, Save, EyeOff } from 'lucide-react';
import { loadPdf } from './pdf';
import { useText } from './i18n';

type Mark = { page: number; type: string; x: number; y: number; w: number; h: number; text: string; size: number; color: string; data?: string; points?: number[][] };
export default function PdfEditor({ jobId, onSave, busy }: { jobId: string; onSave: (data: Record<string, unknown>) => void; busy: boolean }) {
  const t = useText(); const canvas = useRef<HTMLCanvasElement>(null), area = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy>(), [page, setPage] = useState(1), [order, setOrder] = useState<number[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]), [current, setCurrent] = useState<Mark>(), [rotations, setRotations] = useState<Record<string, number>>({});
  const [mode, setMode] = useState('text'), [text, setText] = useState(''), [size, setSize] = useState(16), [color, setColor] = useState('#982b3b');
  const [password, setPassword] = useState(''), [attempt, setAttempt] = useState(0), [error, setError] = useState(''), [dimensions, setDimensions] = useState({ w: 600, h: 800 }), [image, setImage] = useState('');
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    let disposed = false; let loaded: PDFDocumentProxy | undefined;
    loadPdf(`/api/jobs/${jobId}/original/0`, password).then(pdf => {
      loaded = pdf; if (disposed) { void pdf.loadingTask.destroy(); return; }
      if (pdf.numPages > 500) { setError(t('O documento ultrapassa o limite de 500 páginas.', 'This document exceeds the 500-page limit.')); void pdf.loadingTask.destroy(); return; }
      setDoc(pdf); setOrder(Array.from({ length: pdf.numPages }, (_, i) => i + 1)); setError('');
    }).catch(() => { if (!disposed) setError(t('Não foi possível abrir o PDF. Se estiver protegido, introduz a palavra-passe.', 'Could not open this PDF. If protected, enter its password.')); });
    return () => { disposed = true; if (loaded) void loaded.loadingTask.destroy(); };
  }, [jobId, attempt]);
  useEffect(() => {
    if (!doc) return;
    let disposed = false; let task: { cancel: () => void } | undefined;
    setRendering(true);
    doc.getPage(page).then(async p => {
      if (disposed || !canvas.current) return;
      const original = p.getViewport({ scale: 1 });
      const scale = Math.min(1.5, 1200 / original.width, 1600 / original.height);
      const viewport = p.getViewport({ scale });
      const target = canvas.current;
      target.width = viewport.width; target.height = viewport.height;
      setDimensions({ w: original.width, h: original.height });
      const render = p.render({ canvas: target, viewport }); task = render;
      try { await render.promise; if (!disposed) setRendering(false); } catch { /* Cancelled when changing pages. */ }
    }).catch(() => setError(t('Não foi possível mostrar esta página.', 'Could not display this page.')));
    return () => { disposed = true; task?.cancel(); };
  }, [doc, page]);
  const modes = [ ['text', Type, t('Texto', 'Text')], ['signature', PenLine, t('Assinatura', 'Signature')], ['draw', PenLine, t('Desenhar', 'Draw')], ['highlight', Highlighter, t('Realçar', 'Highlight')], ['underline', Underline, t('Sublinhar', 'Underline')], ['rect', Square, t('Retângulo', 'Rectangle')], ['redact', EyeOff, t('Ocultar', 'Redact')], ['image', ImagePlus, t('Imagem', 'Image')] ] as const;
  function point(e: React.PointerEvent) { const r = area.current!.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
  function down(e: React.PointerEvent) {
    if (rendering || e.button !== 0) return;
    if ((mode === 'text' || mode === 'signature') && !text.trim()) { setError(t('Escreve primeiro o texto ou o nome da assinatura.', 'Enter the text or signature name first.')); return; }
    if (mode === 'image' && !image) { fileInput.current?.click(); return; }
    e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = point(e);
    setError(''); const mark: Mark = { page, type: mode, x, y, w: .25, h: Math.min(.1, size / dimensions.h * 1.4), text, size, color, data: image };
    if (mode === 'draw') mark.points = [[x, y]];
    if (mode === 'image') mark.h = .2;
    setCurrent(mark);
  }
  function move(e: React.PointerEvent) {
    if (!current) return; const [x, y] = point(e);
    if (current.type === 'draw') { setCurrent({ ...current, points: [...current.points!, [x, y]].slice(0, 5000) }); return; }
    if (['text', 'signature', 'image'].includes(current.type)) return;
    setCurrent({ ...current, w: Math.max(.002, x - current.x), h: Math.max(.002, y - current.y) });
  }
  function up() { if (current) { setMarks(prev => [...prev, current]); setCurrent(undefined); } }
  function movePage(direction: number) { const idx = order.indexOf(page), target = idx + direction; if (target < 0 || target >= order.length) return; const next = [...order]; [next[idx], next[target]] = [next[target], next[idx]]; setOrder(next); }
  const all = [...marks.filter(m => m.page === page), ...(current ? [current] : [])];
  if (!doc) return <div className="editor-loading"><p>{error || t('A abrir o documento…', 'Opening document…')}</p>{error && <form onSubmit={e => { e.preventDefault(); setAttempt(a => a + 1); }}><label>{t('Palavra-passe do PDF', 'PDF password')}<input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}/></label><button className="secondary">{t('Abrir PDF', 'Open PDF')}</button></form>}</div>;
  return <div className="pdf-editor"><div className="editor-tools" role="toolbar" aria-label={t('Ferramentas de edição', 'Editing tools')}>{modes.map(([id, Icon, label]) => <button key={id} className={'editor-tool ' + (mode === id ? 'selected' : '')} onClick={() => { setMode(id); if (id === 'image') fileInput.current?.click(); }} aria-pressed={mode === id}><Icon size={17}/><span>{label}</span></button>)}<button className="editor-tool" disabled={!marks.length} onClick={() => setMarks(m => m.slice(0, -1))}><Undo2 size={17}/>{t('Desfazer', 'Undo')}</button></div>
    <div className="editor-properties">{['text', 'signature'].includes(mode) && <><label>{mode === 'signature' ? t('Nome da assinatura visual', 'Visual signature name') : t('Texto a adicionar', 'Text to add')}<input value={text} maxLength={1000} onChange={e => setText(e.target.value)}/></label><label>{t('Tamanho', 'Size')}<input type="number" min={6} max={100} value={size} onChange={e => setSize(+e.target.value)}/></label></>}<label>{t('Cor', 'Color')}<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label><p>{mode === 'redact' ? t('Arrasta uma área para remover permanentemente o conteúdo.', 'Drag an area to permanently remove its content.') : mode === 'signature' ? t('Assinatura visual, sem certificado digital. Clica na página para posicionar.', 'Visual signature, without a digital certificate. Click to place it.') : t('Clica ou arrasta na página para adicionar.', 'Click or drag on the page to add.')}</p></div>
    <input type="file" ref={fileInput} accept="image/png,image/jpeg,image/webp" className="visually-hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 800000) { setError(t('Escolhe uma imagem com menos de 800 KB.', 'Choose an image smaller than 800 KB.')); return; } const reader = new FileReader(); reader.onload = () => setImage(reader.result as string); reader.readAsDataURL(f); }}/>
    <div className="editor-workspace"><aside className="page-list"><strong>{t('Páginas', 'Pages')}</strong>{order.map((n, i) => <button key={n} className={page === n ? 'selected' : ''} onClick={() => setPage(n)}><FilePage n={n}/><small>{i + 1}{rotations[String(n)] ? ` · ${rotations[String(n)]}°` : ''}</small></button>)}</aside><div className="paper-scroller"><div className="paper" ref={area} style={{ aspectRatio: `${dimensions.w} / ${dimensions.h}` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setCurrent(undefined)}><canvas ref={canvas}/><svg className="annotation-layer" viewBox={`0 0 ${dimensions.w} ${dimensions.h}`}>{all.map((m, i) => { const x = m.x * dimensions.w, y = m.y * dimensions.h, w = m.w * dimensions.w, h = m.h * dimensions.h; if (m.type === 'text' || m.type === 'signature') return <text key={i} x={x} y={y + h} fill={m.color} fontFamily="Helvetica, Arial, sans-serif" fontSize={m.size} fontStyle={m.type === 'signature' ? 'italic' : 'normal'}>{m.text}</text>; if (m.type === 'draw') return <polyline key={i} points={m.points!.map(p => `${p[0] * dimensions.w},${p[1] * dimensions.h}`).join(' ')} fill="none" stroke={m.color}/>; if (m.type === 'image') return <image key={i} x={x} y={y} width={w} height={h} href={m.data} preserveAspectRatio="none"/>; if (m.type === 'underline') return <line key={i} x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={m.color}/>; return <rect key={i} x={x} y={y} width={w} height={h} fill={m.type === 'redact' ? 'black' : m.type === 'highlight' ? '#ffdb00' : 'none'} fillOpacity={m.type === 'highlight' ? .3 : 1} stroke={m.type === 'rect' ? m.color : 'none'}/>; })}</svg>{rendering && <div className="rendering">{t('A mostrar página…', 'Rendering page…')}</div>}</div></div></div>
    <div className="editor-page-actions"><button className="icon-btn" disabled={order.indexOf(page) === 0} onClick={() => setPage(order[order.indexOf(page) - 1])} aria-label={t('Página anterior', 'Previous page')}><ChevronLeft size={18}/></button><span>{t('Página', 'Page')} {order.indexOf(page) + 1} / {order.length}</span><button className="icon-btn" disabled={order.indexOf(page) === order.length - 1} onClick={() => setPage(order[order.indexOf(page) + 1])} aria-label={t('Página seguinte', 'Next page')}><ChevronRight size={18}/></button><button className="secondary compact" onClick={() => setRotations(r => ({ ...r, [page]: ((r[page] || 0) + 90) % 360 }))}><RotateCw size={15}/>{t('Rodar ao guardar', 'Rotate on save')} {rotations[page] || 0}°</button><button className="icon-btn" disabled={order.indexOf(page) === 0} onClick={() => movePage(-1)} aria-label={t('Mover página para cima', 'Move page up')}><ArrowUp size={18}/></button><button className="icon-btn" disabled={order.indexOf(page) === order.length - 1} onClick={() => movePage(1)} aria-label={t('Mover página para baixo', 'Move page down')}><ArrowDown size={18}/></button><button className="icon-btn delete" disabled={order.length === 1} onClick={() => { const next = order.filter(n => n !== page); setOrder(next); setPage(next[0]); }} aria-label={t('Eliminar página', 'Delete page')}><Trash2 size={17}/></button></div>
    {marks.some(m => m.type === 'redact') && <p className="notice">{t('As páginas com ocultações serão convertidas em imagem no PDF final. Nessas páginas, o texto deixa de ser selecionável e o conteúdo ocultado é removido. Revê o resultado antes de o partilhares.', 'Redacted pages are converted to images in the saved PDF. Text on those pages will no longer be selectable, and redacted content is removed. Review the result before sharing.')}</p>}
    {error && <p className="error" role="alert">{error}</p>}<div className="editor-save"><small>{t('Adiciona conteúdo e anotações. O texto original não é editável.', 'Add content and annotations. Original text is not editable.')}</small><button className="primary" disabled={busy} onClick={() => onSave({ annotations: marks, pages: order.join(','), rotations, password })}><Save size={17}/>{t('Guardar PDF', 'Save PDF')}</button></div>
  </div>;
}
function FilePage({ n }: { n: number }) { return <span className="page-miniature"><span>{n}</span><i/><i/><i/></span>; }
