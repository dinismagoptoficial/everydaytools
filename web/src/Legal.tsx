import {
  Boxes,
  ChevronDown,
  Cookie,
  ExternalLink,
  FileCheck2,
  Scale,
  ServerCog,
  ShieldCheck,
  X,
} from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { LanguageContext, useError, useText } from "./i18n";

type Section = { id: string; title: string; paragraphs: string[] };
type Information = {
  version: string;
  author: string;
  author_url: string;
  documents: Record<string, Section[]>;
  license: string;
  third_party: string;
};

let cached: Information | undefined;
let request: Promise<Information> | undefined;

function information() {
  if (cached) return Promise.resolve(cached);
  if (!request) {
    request = api<Information>("/legal")
      .then((value) => {
        cached = value;
        return value;
      })
      .catch((error) => {
        request = undefined;
        throw error;
      });
  }
  return request;
}

const icons = {
  copyright: Scale,
  terms: FileCheck2,
  privacy: ShieldCheck,
  cookies: Cookie,
  administration: ServerCog,
  license: Scale,
  third_party: Boxes,
};

function Entry({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: keyof typeof icons;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const Icon = icons[id];
  return (
    <section className={"legal-entry " + (open ? "open" : "")}>
      <button
        className="legal-summary"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`legal-${id}`}
      >
        <span className="legal-entry-icon" aria-hidden="true">
          <Icon size={17} />
        </span>
        <span>{title}</span>
        <ChevronDown size={17} className="legal-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="legal-panel" id={`legal-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
}

export default function Legal({
  onReady,
  variant = "embedded",
}: {
  onReady?: (version: string) => void;
  variant?: "embedded" | "dialog";
}) {
  const lang = useContext(LanguageContext),
    t = useText(),
    errorText = useError();
  const [data, setData] = useState<Information | undefined>(cached),
    [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(
    variant === "dialog" ? "privacy" : null,
  );

  useEffect(() => {
    let active = true;
    information()
      .then((value) => {
        if (!active) return;
        setData(value);
        onReady?.(value.version);
      })
      .catch((reason) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [onReady]);

  if (error)
    return (
      <p role="alert" className="error">
        {errorText(error)}
      </p>
    );
  if (!data)
    return (
      <div className="legal-loading" role="status">
        <span />
        <span />
        <span />
        <span className="visually-hidden">{t("A carregar…", "Loading…")}</span>
      </div>
    );

  const toggle = (id: string) =>
    setOpen((current) => (current === id ? null : id));
  return (
    <div className={`legal-content ${variant}`}>
      <div className="legal-overview">
        <img src="/logo.png" alt="" className="brand-mark" draggable={false} />
        <div>
          <strong>Everyday Tools</strong>
          <p>
            © 2026{" "}
            <a href={data.author_url} target="_blank" rel="noreferrer">
              {data.author}
            </a>
          </p>
        </div>
        <span className="legal-version">
          {t("Documentos", "Documents")} {data.version}
        </span>
      </div>

      <div className="legal-list">
        {data.documents[lang].map((section) => (
          <Entry
            key={section.id}
            id={section.id as keyof typeof icons}
            title={section.title}
            open={open === section.id}
            onToggle={() => toggle(section.id)}
          >
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </Entry>
        ))}
        <Entry
          id="license"
          title={t("Licença MIT", "MIT license")}
          open={open === "license"}
          onToggle={() => toggle("license")}
        >
          <pre>{data.license}</pre>
        </Entry>
        <Entry
          id="third_party"
          title={t("Software de terceiros", "Third-party software")}
          open={open === "third_party"}
          onToggle={() => toggle("third_party")}
        >
          <pre>{data.third_party}</pre>
          <a
            className="legal-external"
            href="/third-party-licenses.txt"
            target="_blank"
            rel="noreferrer"
          >
            {t("Licenças da interface", "Frontend licenses")}
            <ExternalLink size={14} />
          </a>
        </Entry>
      </div>
    </div>
  );
}

export function LegalDialog({ onClose }: { onClose: () => void }) {
  const t = useText();
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)",
        ) ?? [],
      );
      if (!elements.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", close);
    requestAnimationFrame(() =>
      dialog.current?.querySelector<HTMLElement>("button")?.focus(),
    );
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop legal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialog}
        className="modal legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
      >
        <header className="legal-dialog-head">
          <div>
            <span>Everyday Tools</span>
            <h2 id="legal-title">
              {t("Sobre, termos e privacidade", "About, terms and privacy")}
            </h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={t("Fechar", "Close")}
          >
            <X size={19} />
          </button>
        </header>
        <div className="legal-dialog-body">
          <Legal variant="dialog" />
        </div>
      </section>
    </div>,
    document.body,
  );
}
