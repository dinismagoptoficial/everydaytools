import { useContext, useEffect, useState } from "react";
import { api } from "./api";
import { LanguageContext, useError, useText } from "./i18n";

type Information = {
  version: string;
  author: string;
  author_url: string;
  documents: Record<string, { title: string; paragraphs: string[] }[]>;
  license: string;
  third_party: string;
};

export default function Legal({
  onReady,
}: {
  onReady?: (version: string) => void;
}) {
  const lang = useContext(LanguageContext),
    t = useText(),
    errorText = useError();
  const [data, setData] = useState<Information>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Information>("/legal")
      .then((value) => {
        if (active) {
          setData(value);
          onReady?.(value.version);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <p role="alert" className="error">
        {errorText(error)}
      </p>
    );
  if (!data) return <p role="status">{t("A carregar…", "Loading…")}</p>;
  return (
    <div className="legal-content">
      <p>
        © 2026{" "}
        <a href={data.author_url} target="_blank" rel="noreferrer">
          {data.author}
        </a>{" "}
        · Everyday Tools
      </p>
      {data.documents[lang].map((section) => (
        <details key={section.title}>
          <summary>{section.title}</summary>
          {section.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </details>
      ))}
      <details>
        <summary>{t("Licença MIT", "MIT license")}</summary>
        <pre>{data.license}</pre>
      </details>
      <details>
        <summary>{t("Software de terceiros", "Third-party software")}</summary>
        <pre>{data.third_party}</pre>
        <a href="/third-party-licenses.txt" target="_blank" rel="noreferrer">
          {t('Licenças da interface', 'Frontend licenses')}
        </a>
      </details>
      <small>
        {t("Versão dos documentos:", "Document version:")} {data.version}
      </small>
    </div>
  );
}
