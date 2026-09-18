import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  FolderArchive,
  Home,
  Image,
  LogOut,
  Menu,
  Music2,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  X,
  Wrench,
  Trash2,
  Plus,
  LoaderCircle,
  CircleAlert,
  ArrowLeftRight,
  Eye,
} from "lucide-react";
import {
  api,
  setCsrf,
  uploadFile,
  type Job,
  type Status,
  type Tool,
  type User,
} from "./api";
import {
  LanguageContext,
  useError,
  useText,
  useToolCopy,
  type Language,
} from "./i18n";
import Auth from "./Auth";
import Options from "./Options";
import "./style.css";
const Everyday = lazy(() => import("./Everyday"));
const Account = lazy(() => import("./Account"));
const Admin = lazy(() => import("./Admin"));
const Preview = lazy(() => import("./Preview"));
const MatteEditor = lazy(() => import("./MatteEditor"));

function App() {
  const [lang, setLang] = useState<Language>(() =>
    localStorage.getItem("language") === "en" ? "en" : "pt-PT",
  );
  useEffect(() => {
    localStorage.setItem("language", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <LanguageContext value={lang}>
      <Application lang={lang} setLang={setLang} />
    </LanguageContext>
  );
}

function Application({
  lang,
  setLang,
}: {
  lang: Language;
  setLang: (v: Language) => void;
}) {
  const t = useText(),
    copy = useToolCopy(),
    errorText = useError();
  const [status, setStatus] = useState<Status>(),
    [user, setUser] = useState<User | null>(null),
    [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("home"),
    [tools, setTools] = useState<Tool[]>([]),
    [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [menu, setMenu] = useState(false),
    [mobile, setMobile] = useState(false);
  const [error, setError] = useState(""),
    [worker, setWorker] = useState(true),
    [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null),
    [active, setActive] = useState<Job>(),
    [desired, setDesired] = useState("");
  const [profile, setProfile] = useState(false),
    [confirmDelete, setConfirmDelete] = useState<Job>(),
    [preview, setPreview] = useState<{
      job: Job;
      index: number;
      original?: boolean;
    }>(),
    [matte, setMatte] = useState<{ job: Job; index: number }>();
  const input = useRef<HTMLInputElement>(null),
    dialogRef = useRef<HTMLDivElement>(null),
    pulse = useRef<() => void>(() => {});

  async function refreshJobs() {
    pulse.current();
  }
  async function bootstrap() {
    setError("");
    try {
      setStatus(await api("/status"));
      try {
        const me = await api<User>("/me");
        setCsrf(me.csrf);
        if (me.language) setLang(me.language);
        const [list, recent] = await Promise.all([
          api<Tool[]>("/tools"),
          api<Job[]>("/jobs"),
        ]);
        setTools(list);
        setJobs(recent);
        setUser(me);
      } catch (e) {
        if ((e as Error).message === "unauthorized") setUser(null);
        else throw e;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    void bootstrap();
    const expired = () => {
      setUser(null);
      setCsrf("");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = document.hidden ? 30000 : 15000;
      try {
        const [list, health] = await Promise.all([
          api<Job[]>("/jobs"),
          api<{ worker: boolean }>("/health"),
        ]);
        if (!cancelled) {
          setJobs(list);
          setWorker(health.worker);
        }
        if (
          !document.hidden &&
          list.some(
            (j) => j.ready && ["PENDING", "PROCESSING"].includes(j.state),
          )
        )
          delay = 2500;
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) timer = setTimeout(poll, delay);
    }
    // Anything that changes a job asks for an immediate look instead of waiting
    // for the next tick, so the list reacts the moment work starts or finishes.
    pulse.current = () => {
      clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      cancelled = true;
      pulse.current = () => {};
      clearTimeout(timer);
    };
  }, [user]);
  useEffect(() => {
    if (active && active.expires * 1000 < Date.now()) {
      setActive(undefined);
      setError("not_found");
    }
    if (preview && !jobs.some((j) => j.id === preview.job.id))
      setPreview(undefined);
    if (matte && !jobs.some((j) => j.id === matte.job.id)) setMatte(undefined);
  }, [jobs, active, preview, matte]);
  useEffect(() => {
    if (!active && !profile && !confirmDelete && !preview && !matte) return;
    const previous = document.activeElement as HTMLElement;
    const root = dialogRef.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select,textarea,summary,[tabindex="0"]',
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    setTimeout(() => focusable()[0]?.focus(), 0);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActive(undefined);
        setProfile(false);
        setConfirmDelete(undefined);
        setPreview(undefined);
        setMatte(undefined);
      }
      if (e.key === "Tab") {
        const els = focusable();
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [active?.id, profile, confirmDelete?.id, preview?.job.id, matte?.job.id]);

  function navigate(target: string) {
    setPage(target);
    setCategory("all");
    setSearch("");
    setMobile(false);
    setMenu(false);
  }
  function pick(tool = "") {
    setDesired(tool);
    input.current?.click();
  }
  async function upload(files: File[]) {
    if (!files.length || !status || uploading !== null) return;
    if (
      files.length > 50 ||
      files.reduce((s, f) => s + f.size, 0) > status.max_upload_mb * 1024 ** 2
    ) {
      setError("too_large");
      return;
    }
    setUploading(0);
    setError("");
    let id = "";
    try {
      const result = await api("/jobs", "POST", {
        files: files.map((f) => ({ name: f.name, size: f.size })),
      });
      id = result.id;
      const total = files.reduce((n, f) => n + f.size, 0);
      let done = 0;
      for (let i = 0; i < files.length; i++) {
        await uploadFile(id, i, files[i], (p) =>
          setUploading(Math.round(((done + files[i].size * p) / total) * 100)),
        );
        done += files[i].size;
      }
      setActive(await api(`/jobs/${id}`));
      await refreshJobs();
    } catch (e) {
      setError((e as Error).message);
      if (id) await api(`/jobs/${id}`, "DELETE").catch(() => {});
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
    }
  }
  async function remove(job: Job) {
    try {
      await api(`/jobs/${job.id}`, "DELETE");
      setConfirmDelete(undefined);
      await refreshJobs();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function logout() {
    try {
      await api("/logout", "POST");
      setCsrf("");
      setUser(null);
      setJobs([]);
      setMenu(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const nav = [
    { id: "home", label: t("Início", "Home"), icon: Home },
    { id: "pdf", label: "PDF", icon: FileText },
    { id: "convert", label: t("Converter", "Convert"), icon: ArrowLeftRight },
    { id: "everyday", label: t("Dia a dia", "Everyday tools"), icon: Wrench },
    {
      id: "recent",
      label: t("Ficheiros recentes", "Recent files"),
      icon: Clock3,
    },
  ];
  const groups = [
    { id: "pdf", label: "PDF", icon: FileText },
    { id: "image", label: t("Imagens", "Images"), icon: Image },
    { id: "office", label: t("Documentos", "Documents"), icon: FileText },
    { id: "video", label: t("Vídeo", "Video"), icon: Video },
    { id: "audio", label: t("Áudio", "Audio"), icon: Music2 },
    { id: "archive", label: t("Arquivos", "Archives"), icon: FolderArchive },
  ];
  function group(tool: Tool) {
    return tool.id === "images_pdf"
      ? "pdf"
      : tool.id === "sheet_convert"
        ? "office"
        : tool.id.split("_")[0];
  }
  const visible = tools.filter(
    (tool) =>
      (page === "pdf"
        ? group(tool) === "pdf"
        : page === "convert"
          ? group(tool) !== "pdf"
          : true) &&
      (category === "all" || group(tool) === category) &&
      (copy(tool.id) + " " + copy(tool.id, true))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const favourites = [
    "pdf_merge",
    "pdf_compress",
    "office_pdf",
    "image_convert",
    "image_background",
    "pdf_edit",
  ];
  const displayed =
    page === "home" && category === "all" && !search
      ? visible
          .filter((tool) => favourites.includes(tool.id))
          .sort((a, b) => favourites.indexOf(a.id) - favourites.indexOf(b.id))
      : visible;
  const languageSelector = (
    <select
      className="language"
      aria-label={t("Idioma", "Language")}
      value={lang}
      onChange={(e) => setLang(e.target.value as Language)}
    >
      <option value="pt-PT">PT</option>
      <option value="en">EN</option>
    </select>
  );
  if (!loaded)
    return (
      <div className="initial-loading">
        <img src="/logo.png" alt="Everyday Tools" className="brand-mark" draggable={false} />
        <LoaderCircle className="spin" />
      </div>
    );
  if (!status)
    return (
      <div className="initial-loading">
        <p role="alert">{errorText(error)}</p>
        <button className="primary" onClick={bootstrap}>
          {t("Tentar novamente", "Try again")}
        </button>
      </div>
    );
  if (!user)
    return (
      <>
        <div className="auth-language">{languageSelector}</div>
        <Auth status={status} onDone={bootstrap} />
        {error && (
          <div className="toast" role="alert">
            {errorText(error)}
          </div>
        )}
      </>
    );
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        {t("Saltar para o conteúdo", "Skip to content")}
      </a>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside
        inert={Boolean(active || profile || confirmDelete || preview || matte)}
        className={"sidebar " + (mobile ? "open" : "")}
      >
        <button className="brand" onClick={() => navigate("home")}>
          <img src="/logo.png" alt="" className="brand-mark" draggable={false} />
          <span>
            Everyday<span className="brand-second">Tools</span>
          </span>
        </button>
        <div className="sidebar-label">
          {t("AS TUAS FERRAMENTAS", "YOUR TOOLS")}
        </div>
        <nav aria-label={t("Navegação principal", "Main navigation")}>
          {nav.map((n) => (
            <button
              key={n.id}
              className={"nav-item " + (page === n.id ? "active" : "")}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "recent" && jobs.length > 0 && (
                <span className="count" aria-hidden="true">
                  {jobs.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {user.role === "ADMIN" && (
            <button
              className={"nav-item " + (page === "admin" ? "active" : "")}
              onClick={() => navigate("admin")}
            >
              <SlidersHorizontal size={18} />
              {t("Administração", "Administration")}
            </button>
          )}
          <div className="account-area">
            {menu && (
              <div className="account-menu">
                <strong>{user.email}</strong>
                <button
                  onClick={() => {
                    setProfile(true);
                    setMenu(false);
                  }}
                >
                  <Settings size={16} />
                  {t("A minha conta", "My account")}
                </button>
                <button onClick={logout}>
                  <LogOut size={16} />
                  {t("Terminar sessão", "Sign out")}
                </button>
              </div>
            )}
            <button
              className="account"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
            >
              <span className="avatar">
                {user.email.slice(0, 1).toUpperCase()}
              </span>
              <span>
                {user.name || user.email.split("@")[0]}
                <small>
                  {user.role === "ADMIN"
                    ? t("Administrador", "Administrator")
                    : t("Conta pessoal", "Personal account")}
                </small>
              </span>
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div
        className="workspace"
        inert={Boolean(active || profile || confirmDelete || preview || matte)}
      >
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-toggle"
              aria-label={t("Abrir menu", "Open menu")}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span className="installation-name">{status.name}</span>
            <ChevronRight size={14} />
            <strong>
              {nav.find((n) => n.id === page)?.label ||
                t("Administração", "Administration")}
            </strong>
          </div>
          <div className="topbar-right">{languageSelector}</div>
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <div className="banner error" role="alert">
              <CircleAlert size={18} />
              <span>{errorText(error)}</span>
              <button
                className="icon-btn"
                onClick={() => setError("")}
                aria-label={t("Fechar aviso", "Dismiss notice")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {!worker && (
            <div className="banner notice">
              <CircleAlert size={18} />
              {t(
                "O processamento está temporariamente indisponível. Os ficheiros na fila aguardam o regresso do serviço.",
                "Processing is temporarily unavailable. Queued files will wait for the service to return.",
              )}
            </div>
          )}
          {["home", "pdf", "convert"].includes(page) && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === "home"
                      ? t("FERRAMENTAS", "TOOLS")
                      : t("FERRAMENTAS", "TOOLS")}
                  </div>
                  <h1>
                    {page === "home"
                      ? t("O que queres fazer?", "What would you like to do?")
                      : page === "pdf"
                        ? t("Trabalhar com PDFs", "Work with PDFs")
                        : t(
                            "O formato certo para cada ficheiro.",
                            "The right format for your file.",
                          )}
                  </h1>
                  <p>
                    {page === "home"
                      ? t(
                          "Escolhe um ficheiro. Nós encontramos a ferramenta certa.",
                          "Choose a file. We’ll find the right tool.",
                        )
                      : page === "pdf"
                        ? t(
                            "Junta, organiza, edita e prepara os teus documentos.",
                            "Merge, organize, edit and prepare your documents.",
                          )
                        : t(
                            "Converte imagens, documentos, vídeo e áudio, aqui mesmo.",
                            "Convert images, documents, video and audio, right here.",
                          )}
                  </p>
                </div>
              </div>
              <div
                className={"dropzone " + (drag ? "dragging" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setDrag(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  setDesired("");
                  void upload(Array.from(e.dataTransfer.files));
                }}
              >
                <div className="drop-symbol">
                  <Upload size={28} strokeWidth={1.5} />
                </div>
                <h2>
                  {uploading !== null
                    ? t("A enviar ficheiros…", "Uploading files…")
                    : t("Arrasta um ficheiro para aqui", "Drop a file here")}
                </h2>
                <p>
                  {uploading !== null
                    ? `${uploading}%`
                    : t(
                        "PDFs, documentos, imagens, vídeo ou áudio",
                        "PDFs, documents, images, video or audio",
                      )}
                </p>
                {uploading !== null ? (
                  <progress
                    value={uploading}
                    max={100}
                    aria-label={t("Progresso do upload", "Upload progress")}
                  />
                ) : (
                  <button className="primary" onClick={() => pick()}>
                    <Plus size={17} />
                    {t("Escolher ficheiro", "Choose file")}
                  </button>
                )}
                <span className="upload-limit">
                  {t("Até", "Up to")} {status.max_upload_mb} MB ·{" "}
                  {t("Vários ficheiros permitidos", "Multiple files welcome")}
                </span>
              </div>
              <div className="retention-note">
                <ShieldCheck size={15} />
                <span>
                  <span>
                    {t(
                      `Os ficheiros são eliminados automaticamente após ${status.retention_minutes} minutos.`,
                      `Files are automatically deleted after ${status.retention_minutes} minutes.`,
                    )}
                  </span>
                </span>
              </div>
              <section className="tools-section">
                <div className="section-heading">
                  <h2>
                    {page === "home" && !search && category === "all"
                      ? t("Ferramentas frequentes", "Frequently used tools")
                      : t("Escolhe uma ferramenta", "Choose a tool")}
                  </h2>
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      type="search"
                      placeholder={t("Procurar ferramenta…", "Find a tool…")}
                      aria-label={t("Procurar ferramenta", "Find a tool")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                {page !== "pdf" && (
                  <div
                    className="filter-tabs"
                    aria-label={t("Categorias", "Categories")}
                  >
                    <button
                      className={category === "all" ? "selected" : ""}
                      onClick={() => setCategory("all")}
                    >
                      {t("Todas", "All")}
                    </button>
                    {groups
                      .filter((g) => page !== "convert" || g.id !== "pdf")
                      .map((g) => (
                        <button
                          key={g.id}
                          className={category === g.id ? "selected" : ""}
                          onClick={() => setCategory(g.id)}
                        >
                          {g.label}
                        </button>
                      ))}
                  </div>
                )}
                <div className="tool-grid">
                  {displayed.map((tool) => {
                    const Icon =
                      tool.id === "image_background"
                        ? Sparkles
                        : groups.find((g) => g.id === group(tool))?.icon ||
                          FileText;
                    return (
                      <button
                        className="tool-card"
                        key={tool.id}
                        onClick={() => pick(tool.id)}
                        disabled={!tool.available || uploading !== null}
                      >
                        <div className={"tool-icon " + group(tool)}>
                          <Icon size={22} strokeWidth={1.6} />
                        </div>
                        <div className="tool-copy">
                          <h3>{copy(tool.id)}</h3>
                          <p>
                            {tool.available
                              ? copy(tool.id, true)
                              : t(
                                  "Não instalada neste servidor",
                                  "Not installed on this server",
                                )}
                          </p>
                        </div>
                        <ChevronRight className="tool-arrow" size={17} />
                      </button>
                    );
                  })}
                </div>
                {displayed.length === 0 && tools.length > 0 && (
                  <p className="empty-search">
                    {t(
                      "Não encontrámos essa ferramenta. Experimenta outra palavra.",
                      "No matching tools. Try another word.",
                    )}
                  </p>
                )}
              </section>
              {page === "home" && (
                <section className="recent-section">
                  <div className="section-heading">
                    <h2>{t("Ficheiros recentes", "Recent files")}</h2>
                    <button className="link" onClick={() => navigate("recent")}>
                      {t("Ver todos", "View all")}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {jobs.length ? (
                    <JobList
                      jobs={jobs.slice(0, 3)}
                      onPreview={(j, i) => setPreview({ job: j, index: i })}
                      onPreviewOriginal={(j, i) =>
                        setPreview({ job: j, index: i, original: true })
                      }
                      onDelete={setConfirmDelete}
                      onOpen={(j) => {
                        setDesired("");
                        setActive(j);
                      }}
                      onCancel={async (j) => {
                        try {
                          await api(`/jobs/${j.id}/cancel`, "POST");
                          await refreshJobs();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    />
                  ) : (
                    <div className="empty-recent">
                      <Clock3 size={23} />
                      <div>
                        <strong>
                          {t(
                            "Os teus próximos ficheiros aparecem aqui.",
                            "Your next files will appear here.",
                          )}
                        </strong>
                        <p>
                          {t(
                            "Disponíveis apenas enquanto precisares deles, dentro do prazo de retenção.",
                            "Available when you need them, within the retention period.",
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
          {page === "recent" && (
            <>
              <div className="page-heading">
                <div className="eyebrow">
                  {t("TEMPORÁRIOS, POR DEFINIÇÃO", "TEMPORARY, BY DESIGN")}
                </div>
                <h1>{t("Ficheiros recentes", "Recent files")}</h1>
                <p>
                  {t(
                    "Descarrega o resultado ou elimina os ficheiros agora.",
                    "Download the result or delete files now.",
                  )}
                </p>
              </div>
              {jobs.length ? (
                <JobList
                  jobs={jobs}
                  onPreview={(j, i) => setPreview({ job: j, index: i })}
                  onPreviewOriginal={(j, i) =>
                    setPreview({ job: j, index: i, original: true })
                  }
                  onDelete={setConfirmDelete}
                  onOpen={(j) => {
                    setDesired("");
                    setActive(j);
                  }}
                  onCancel={async (j) => {
                    try {
                      await api(`/jobs/${j.id}/cancel`, "POST");
                      await refreshJobs();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              ) : (
                <div className="empty-state">
                  <FolderArchive size={40} strokeWidth={1.2} />
                  <h2>
                    {t("Nenhum ficheiro por aqui.", "No files here yet.")}
                  </h2>
                  <p>
                    {t(
                      "Os ficheiros expirados são eliminados, sem histórico permanente.",
                      "Expired files are deleted, with no permanent history.",
                    )}
                  </p>
                  <button className="primary" onClick={() => pick()}>
                    {t("Escolher ficheiro", "Choose file")}
                  </button>
                </div>
              )}
            </>
          )}
          {page === "everyday" && (
            <Suspense
              fallback={
                <p className="loading">
                  {t("A abrir ferramentas…", "Opening tools…")}
                </p>
              }
            >
              <Everyday />
            </Suspense>
          )}
          {page === "admin" && user.role === "ADMIN" && (
            <Suspense
              fallback={
                <p className="loading">{t("A carregar…", "Loading…")}</p>
              }
            >
              <Admin onSettings={async () => setStatus(await api("/status"))} />
            </Suspense>
          )}
          <footer>
            <span>
              Everyday Tools <span className="footer-dot">·</span> Your digital
              Swiss Army knife.
            </span>
            <a
              href="https://github.com/dinismagoptoficial"
              target="_blank"
              rel="noreferrer"
            >
              © 2026 Dinis Mago
            </a>
          </footer>
        </main>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => void upload(Array.from(e.target.files || []))}
      />
      {uploading !== null && !["home", "pdf", "convert"].includes(page) && (
        <div className="toast" role="status">
          {t("A enviar ficheiros…", "Uploading files…")} {uploading}%
        </div>
      )}
      <div ref={dialogRef}>
        {matte && (
          <Suspense fallback={null}>
            <MatteEditor
              job={matte.job}
              index={matte.index}
              onClose={() => setMatte(undefined)}
            />
          </Suspense>
        )}
        {preview && (
          <Suspense fallback={null}>
            <Preview
              job={jobs.find((j) => j.id === preview.job.id) ?? preview.job}
              index={preview.index}
              original={preview.original}
              onClose={() => setPreview(undefined)}
              onEdit={(index) => {
                setPreview(undefined);
                setMatte({ job: preview.job, index });
              }}
            />
          </Suspense>
        )}
        {active && (
          <Options
            key={active.id}
            job={active}
            tools={tools}
            initial={desired}
            onClose={() => setActive(undefined)}
            onRun={() => {
              setActive(undefined);
              navigate("recent");
              void refreshJobs();
            }}
          />
        )}{" "}
        {profile && (
          <Suspense
            fallback={
              <div className="modal-backdrop">
                <p className="modal loading">{t("A carregar…", "Loading…")}</p>
              </div>
            }
          >
            <Account
              user={user}
              lang={lang}
              setLang={setLang}
              onClose={() => setProfile(false)}
              onDone={bootstrap}
            />
          </Suspense>
        )}{" "}
        {confirmDelete && (
          <div className="modal-backdrop">
            <section
              className="modal small-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-title"
            >
              <h2 id="delete-title">{t("Eliminar agora?", "Delete now?")}</h2>
              <p>
                {t(
                  "O original, os resultados e todos os ficheiros temporários desta tarefa serão eliminados.",
                  "The original, results and all temporary files for this task will be deleted.",
                )}
              </p>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => setConfirmDelete(undefined)}
                >
                  {t("Voltar", "Go back")}
                </button>
                <button
                  className="primary"
                  onClick={() => void remove(confirmDelete)}
                >
                  {t("Eliminar agora", "Delete now")}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function JobList({
  jobs,
  onDelete,
  onOpen,
  onCancel,
  onPreview,
  onPreviewOriginal,
}: {
  jobs: Job[];
  onDelete: (j: Job) => void;
  onOpen: (j: Job) => void;
  onCancel: (j: Job) => void;
  onPreview: (j: Job, index: number) => void;
  onPreviewOriginal: (j: Job, index: number) => void;
}) {
  const t = useText(),
    copy = useToolCopy(),
    errorText = useError();
  const labels: Record<string, string> = {
    PENDING: t("Na fila", "Queued"),
    PROCESSING: t("A processar…", "Processing…"),
    COMPLETED: t("Concluído", "Completed"),
    FAILED: t("Erro", "Failed"),
    CANCELLED: t("Cancelado", "Cancelled"),
  };
  return (
    <div className="job-list">
      {jobs.map((job) => (
        <article className="job-row" key={job.id}>
          <div className="file-type">
            {job.files[0].ext.slice(0, 4).toUpperCase()}
          </div>
          <div className="job-info">
            <strong>
              {job.files[0].name}
              {job.files.length > 1 && ` +${job.files.length - 1}`}
            </strong>
            <p>
              {job.operation
                ? copy(job.operation)
                : t("Escolher ferramenta", "Choose a tool")}
              <span>·</span>
              {t("Há", "")}{" "}
              {Math.max(
                0,
                Math.floor((Date.now() - job.created * 1000) / 60000),
              )}{" "}
              min {t("", "ago")}
            </p>
            <small className="expiry">
              <Clock3 size={12} />
              {t(
                "Será eliminado automaticamente em",
                "Automatically deleted in",
              )}{" "}
              {Math.max(
                0,
                Math.ceil((job.expires * 1000 - Date.now()) / 60000),
              )}{" "}
              min
            </small>
            {job.error && <p className="job-error">{errorText(job.error)}</p>}
          </div>
          <div className="job-status">
            <span className={"state " + job.state.toLowerCase()}>
              {job.state === "COMPLETED" ? (
                <Check size={13} />
              ) : job.state === "PROCESSING" ? (
                <LoaderCircle size={13} className="spin" />
              ) : null}
              {!job.ready && job.state === "PENDING"
                ? t("Pronto a começar", "Ready to start")
                : labels[job.state]}
            </span>
            {job.queue_ahead !== undefined && (
              <small>
                {t("À frente, aproximadamente:", "Approximately ahead:")}{" "}
                {job.queue_ahead}
              </small>
            )}
          </div>
          <div className="job-actions">
            {job.state === "COMPLETED" && (
              <>
                <button
                  className="secondary compact"
                  onClick={() => onPreview(job, 0)}
                >
                  <Eye size={15} />
                  {t("Pré-visualizar", "Preview")}
                </button>
                <a
                  className="secondary compact"
                  href={`/api/jobs/${job.id}/download/${Math.max(
                    0,
                    job.outputs.findIndex((o) => o.path === "all-files.zip"),
                  )}`}
                  download
                >
                  <ArrowDownToLine size={15} />
                  {job.outputs.length > 1
                    ? t("Descarregar tudo", "Download all")
                    : t("Descarregar", "Download")}
                </a>
                {job.outputs.length > 1 && (
                  <details className="individual-downloads">
                    <summary>
                      {t("Ficheiros individuais", "Individual files")}
                    </summary>
                    {job.outputs
                      .filter((o) => o.path !== "all-files.zip")
                      .map((o) => (
                        <a
                          key={o.path}
                          href={`/api/jobs/${job.id}/download/${job.outputs.indexOf(o)}`}
                          download
                        >
                          {o.name}
                        </a>
                      ))}
                  </details>
                )}
              </>
            )}
            {!job.ready && job.state === "PENDING" && (
              <button className="secondary compact" onClick={() => onOpen(job)}>
                {t("Continuar", "Continue")}
                <ArrowRight size={14} />
              </button>
            )}
            {["PROCESSING", "PENDING"].includes(job.state) &&
              job.ready === 1 && (
                <button className="link" onClick={() => onCancel(job)}>
                  {t("Cancelar", "Cancel")}
                </button>
              )}
            {["FAILED", "CANCELLED"].includes(job.state) && (
              <button className="secondary compact" onClick={() => onOpen(job)}>
                {t("Tentar novamente", "Try again")}
              </button>
            )}
            {["FAILED", "CANCELLED"].includes(job.state) && (
              <button className="link" onClick={() => onPreviewOriginal(job, 0)}>
                {t("Ver original", "View original")}
              </button>
            )}
            <button
              className="icon-btn delete"
              aria-label={
                t("Eliminar agora", "Delete now") + ": " + job.files[0].name
              }
              onClick={() => onDelete(job)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
