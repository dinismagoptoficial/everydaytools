import { useState, lazy, Suspense } from 'react';
import { ArrowRight, ChevronLeft, File, X } from 'lucide-react';
import { api, fileSize, type Job, type Tool } from './api';
import { useError, useText, useToolCopy } from './i18n';
const PdfEditor = lazy(() => import('./PdfEditor'));

export default function Options({ job, tools, initial, onClose, onRun }: { job: Job; tools: Tool[]; initial?: string; onClose: () => void; onRun: () => void }) {
  const t = useText(), copy = useToolCopy(), errorText = useError();
  const compatible = tools.filter(tool => tool.available && job.files.every(f => tool.extensions.includes(f.ext)) && (tool.batch || job.files.length === 1));
  const [selected, setSelected] = useState(initial && compatible.some(tool => tool.id === initial) ? initial : '');
  const [options, setOptions] = useState<Record<string, any>>({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  function update(key: string, value: unknown) { setOptions(prev => ({ ...prev, [key]: value })); }
  async function run(extra?: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await api(`/jobs/${job.id}/run`, 'POST', { operation: selected, options: { ...options, ...extra } }); onRun(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const isImage = selected.startsWith('image_'), isVideo = selected.startsWith('video_'), isAudio = selected.startsWith('audio_');
  const keepsFormat = selected === 'image_compress' || selected === 'image_metadata';
  const selectField = (key: string, label: string, values: string[], fallback: string, labels?: string[]) => <label>{label}<select value={options[key] ?? fallback} onChange={e => update(key, e.target.value)}>{values.map((v, i) => <option key={v} value={v}>{labels?.[i] || v.toUpperCase()}</option>)}</select></label>;
  return <div className="modal-backdrop"><section className={'modal ' + (selected === 'pdf_edit' ? 'editor-modal' : '')} role="dialog" aria-modal="true" aria-labelledby="operation-title"><header className="modal-head"><div>{selected && <button className="link" onClick={() => { setSelected(''); setOptions({}); setError(''); }}><ChevronLeft size={16}/>{t('Ferramentas', 'Tools')}</button>}<h2 id="operation-title">{selected ? copy(selected) : t('O que queres fazer com este ficheiro?', 'What would you like to do with this file?')}</h2></div><button className="icon-btn" aria-label={t('Fechar', 'Close')} onClick={onClose}><X size={20}/></button></header>
    <div className="file-summary"><File size={22}/><div><strong>{job.files.length === 1 ? job.files[0].name : t(`${job.files.length} ficheiros selecionados`, `${job.files.length} files selected`)}</strong><small>{fileSize(job.files.reduce((n, f) => n + f.size, 0))} · {t('Eliminação automática em', 'Automatic deletion in')} {Math.max(0, Math.ceil((job.expires * 1000 - Date.now()) / 60000))} min</small></div></div>
    {!selected ? <div className="compatible-list">{compatible.map(tool => <button key={tool.id} onClick={() => { setSelected(tool.id); setOptions({}); }}><div><strong>{copy(tool.id)}</strong><small>{copy(tool.id, true)}</small></div><ArrowRight size={18}/></button>)}{!compatible.length && <div className="no-tool"><strong>{t('A ferramenta certa não está aqui.', 'Wrong tool for the job.')}</strong><p>{t('Não há operações compatíveis com todos estes ficheiros ao mesmo tempo. Experimenta enviá-los separadamente.', 'No operation supports all these files together. Try uploading them separately.')}</p></div>}</div> : selected === 'pdf_edit' ? <Suspense fallback={<p className="loading">{t('A abrir o documento…', 'Opening document…')}</p>}><PdfEditor jobId={job.id} onSave={run} busy={busy}/></Suspense> : <form onSubmit={e => { e.preventDefault(); void run(); }} className="options-form">
      <p className="muted">{copy(selected, true)}</p>
      {isImage && selected !== 'image_background' && (keepsFormat
        ? selectField('format', t('Formato de saída', 'Output format'), ['original', 'jpg', 'png', 'webp', 'avif'], 'original', [t('Manter o formato original', 'Keep the original format'), 'JPG', 'PNG', 'WEBP', 'AVIF'])
        : selectField('format', t('Formato de saída', 'Output format'), ['jpg', 'png', 'webp', 'avif'], 'webp'))}
      {isImage && !['image_background', 'image_metadata'].includes(selected) && <label>{t('Qualidade', 'Quality')} <span className="muted">{options.quality ?? 80}%</span><input type="range" min={1} max={100} value={options.quality ?? 80} onChange={e => update('quality', +e.target.value)}/></label>}
      {selected === 'image_metadata' && <p className="notice">{t('A imagem é gravada de novo sem EXIF, GPS nem outros metadados. Formatos com perdas, como JPG, são recomprimidos com alta qualidade.', 'The image is written again without EXIF, GPS or other metadata. Lossy formats such as JPG are re-encoded at high quality.')}</p>}
      {selected === 'image_resize' && <div className="form-grid">{['width', 'height'].map((key, i) => <label key={key}>{i ? t('Altura máxima (px)', 'Maximum height (px)') : t('Largura máxima (px)', 'Maximum width (px)')}<input type="number" min={1} max={12000} value={options[key] ?? (i ? 1080 : 1920)} onChange={e => update(key, +e.target.value)}/></label>)}</div>}
      {['pdf_pages', 'pdf_split', 'pdf_images', 'pdf_rotate'].includes(selected) && <label>{t('Páginas', 'Pages')}<input placeholder={t('Todas — ou, por exemplo, 1, 3-5, 2', 'All — or, for example, 1, 3-5, 2')} value={options.pages ?? ''} onChange={e => update('pages', e.target.value)}/><small>{t('Os números indicam também a ordem do resultado.', 'Numbers also determine the output order.')}</small></label>}
      {selected === 'pdf_pages' && <label className="check"><input type="checkbox" checked={options.exclude ?? false} onChange={e => update('exclude', e.target.checked)}/>{t('Eliminar as páginas indicadas', 'Delete the specified pages')}</label>}
      {selected === 'pdf_rotate' && <label>{t('Rotação', 'Rotation')}<select value={options.angle ?? 90} onChange={e => update('angle', +e.target.value)}>{[90, 180, 270].map(a => <option key={a} value={a}>{a}°</option>)}</select></label>}
      {selected === 'pdf_watermark' && <label>{t('Texto da marca de água', 'Watermark text')}<input required maxLength={150} value={options.text ?? ''} onChange={e => update('text', e.target.value)}/></label>}
      {selected === 'pdf_protect' && <label>{t('Nova palavra-passe do PDF', 'New PDF password')}<input type="password" autoComplete="new-password" required minLength={6} maxLength={128} onChange={e => update('new_password', e.target.value)}/></label>}
      {selected.startsWith('pdf_') && <details open={selected === 'pdf_unlock'}><summary>{t('O PDF tem palavra-passe?', 'Does the PDF have a password?')}</summary><label>{t('Palavra-passe atual do PDF', 'Current PDF password')}<input type="password" autoComplete="off" maxLength={128} onChange={e => update('password', e.target.value)}/></label></details>}
      {selected === 'pdf_forms' && <FormFields jobId={job.id} password={options.password ?? ''} onChange={fields => update('fields', fields)}/>}
      {(isVideo && selected !== 'video_gif' || selected === 'pdf_compress') && selectField('preset', t('Qualidade', 'Quality'), ['quality', 'balanced', 'small'], 'balanced', [t('Alta qualidade', 'High quality'), t('Equilibrado', 'Balanced'), t('Menor tamanho', 'Smaller size')])}
      {isVideo && selected !== 'video_gif' && <>{selectField('format', t('Formato de saída', 'Output format'), ['mp4', 'mkv', 'webm'], 'mp4')}<details><summary>{t('Opções avançadas', 'Advanced options')}</summary>{selectField('resolution', t('Resolução', 'Resolution'), ['original', '480', '720', '1080', '2160'], 'original', [t('Manter original', 'Keep original'), '480p', '720p', '1080p', '2160p'])}{selectField('codec', t('Codec', 'Codec'), ['auto', 'h264', 'h265', 'vp9'], 'auto', [t('Automático', 'Automatic'), 'H.264', 'H.265', 'VP9'])}<div className="form-grid"><label>FPS<input type="number" min={1} max={60} placeholder={t('Original', 'Original')} onChange={e => update('fps', e.target.value ? +e.target.value : undefined)}/></label><label>Bitrate (kbps)<input type="number" min={100} max={50000} placeholder={t('Automático', 'Automatic')} onChange={e => update('video_bitrate', e.target.value ? +e.target.value : undefined)}/></label></div></details></>}
      {selected === 'video_gif' && <label>{t('Duração desde o início (segundos)', 'Duration from the start (seconds)')}<input type="number" min={1} max={60} value={options.duration ?? 10} onChange={e => update('duration', +e.target.value)}/></label>}
      {isAudio && <>{selectField('format', t('Formato de saída', 'Output format'), ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'], 'mp3')}<label>Bitrate (kbps)<input type="number" min={32} max={320} value={options.bitrate ?? 192} onChange={e => update('bitrate', +e.target.value)}/></label></>}
      {selected === 'sheet_convert' && selectField('format', t('Formato de saída', 'Output format'), ['xlsx', 'csv', 'ods'], 'xlsx')}
      {selected === 'archive_create' && selectField('format', t('Formato', 'Format'), ['zip', 'tar', 'gz', '7z'], 'zip')}
      {selected === 'office_pdf' && <p className="notice">{t('A disposição, as fontes e alguns elementos podem variar no resultado. Revê o documento convertido.', 'Layout, fonts and some elements may change. Review the converted document.')}</p>}
      {selected === 'image_background' && <p className="notice">{t('O resultado será PNG com transparência. Contornos finos podem precisar de revisão.', 'The result is a transparent PNG. Fine edges may need review.')}</p>}
      <button className="primary wide" disabled={busy}>{busy ? t('A preparar…', 'Preparing…') : t('Processar ficheiro', 'Process file')}<ArrowRight size={17}/></button>
    </form>}{error && <p className="error" role="alert">{errorText(error)}</p>}
  </section></div>;
}

function FormFields({ jobId, password, onChange }: { jobId: string; password: string; onChange: (v: Record<string, string>) => void }) {
  const t = useText();
  const [names, setNames] = useState<string[]>([]), [values, setValues] = useState<Record<string, string>>({}), [message, setMessage] = useState('');
  async function load() {
    try {
      const { loadPdf } = await import('./pdf');
      const doc = await loadPdf(`/api/jobs/${jobId}/original/0`, password);
      const fields = await doc.getFieldObjects();
      const supported = Object.entries(fields ?? {}).filter(([, entries]) => entries.some(e => ['text', 'combobox'].includes((e as { type: string }).type))).map(([name]) => name);
      setNames(supported); setMessage(supported.length ? '' : t('Não foram encontrados campos de texto editáveis.', 'No editable text fields were found.'));
      await doc.loadingTask.destroy();
    } catch { setMessage(t('Não foi possível abrir o PDF. Verifica a palavra-passe.', 'Could not open the PDF. Check its password.')); }
  }
  return <div><button type="button" className="secondary" onClick={load}>{t('Ler campos do formulário', 'Read form fields')}</button>{message && <p className="notice">{message}</p>}{names.map(name => <label key={name}>{name}<input value={values[name] ?? ''} onChange={e => { const v = { ...values, [name]: e.target.value }; setValues(v); onChange(v); }}/></label>)}</div>;
}
