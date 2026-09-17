import { useContext, useEffect, useState } from "react";
import { api } from "./api";
import { LanguageContext, useError, useText } from "./i18n";

type Provider = {
  label: string;
  host: string;
  port: number;
  security: string;
  hint: Record<string, string>;
};
type Saved = {
  smtp_provider: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  smtp_user: string;
  smtp_from: string;
  smtp_public_url: string;
  password_set: boolean;
};

export default function MailSettings() {
  const t = useText(),
    errorText = useError(),
    lang = useContext(LanguageContext);
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [form, setForm] = useState({
    provider: "custom",
    host: "",
    port: 587,
    security: "starttls",
    user: "",
    password: "",
    sender: "",
    public_url: "",
  });
  const [stored, setStored] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [note, setNote] = useState("");

  useEffect(() => {
    api<{ providers: Record<string, Provider>; settings: Saved }>("/admin/smtp")
      .then(({ providers, settings }) => {
        setProviders(providers);
        setStored(settings.password_set);
        setForm({
          provider: settings.smtp_provider || "custom",
          host: settings.smtp_host,
          port: settings.smtp_port,
          security: settings.smtp_security || "starttls",
          user: settings.smtp_user,
          password: "",
          sender: settings.smtp_from,
          public_url: settings.smtp_public_url,
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  function choose(id: string) {
    const preset = providers[id];
    setForm((f) => ({
      ...f,
      provider: id,
      host: preset && id !== "custom" ? preset.host : f.host,
      port: preset && id !== "custom" ? preset.port : f.port,
      security: preset && id !== "custom" ? preset.security : f.security,
    }));
  }

  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy("save");
    setError("");
    setNote("");
    try {
      await api("/admin/smtp", "PUT", form);
      if (form.password) setStored(true);
      setForm((f) => ({ ...f, password: "" }));
      setNote(t("Configuração guardada.", "Configuration saved."));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setError("");
    setNote("");
    try {
      await api("/admin/smtp/test", "POST", form);
      setNote(
        t(
          "Mensagem de teste enviada para o teu e-mail.",
          "Test message sent to your email address.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const hint = providers[form.provider]?.hint?.[lang];
  return (
    <form onSubmit={submit} className="mail-settings">
      <p className="muted">
        {t(
          "Sem servidor de e-mail configurado, quem perder a palavra-passe precisa que um administrador a reponha.",
          "Without an email server, anyone who forgets their password needs an administrator to reset it.",
        )}
      </p>
      <div className="form-grid">
        <label>
          {t("Serviço", "Service")}
          <select
            value={form.provider}
            onChange={(e) => choose(e.target.value)}
          >
            {Object.entries(providers).map(([id, p]) => (
              <option key={id} value={id}>
                {id === "custom"
                  ? t("Outro servidor", "Other server")
                  : p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Endereço do remetente", "Sender address")}
          <input
            type="email"
            value={form.sender}
            placeholder="nome@exemplo.pt"
            onChange={(e) => setForm({ ...form, sender: e.target.value })}
          />
        </label>
        <label>
          {t("Servidor", "Server")}
          <input
            value={form.host}
            placeholder="smtp.exemplo.pt"
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </label>
        <label>
          {t("Porta", "Port")}
          <input
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => setForm({ ...form, port: +e.target.value })}
          />
        </label>
        <label>
          {t("Ligação", "Connection")}
          <select
            value={form.security}
            onChange={(e) => setForm({ ...form, security: e.target.value })}
          >
            <option value="starttls">STARTTLS</option>
            <option value="ssl">SSL/TLS</option>
            <option value="none">{t("Sem cifra", "No encryption")}</option>
          </select>
        </label>
        <label>
          {t("Utilizador", "Username")}
          <input
            value={form.user}
            autoComplete="off"
            onChange={(e) => setForm({ ...form, user: e.target.value })}
          />
        </label>
        <label>
          {t("Palavra-passe", "Password")}
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            placeholder={
              stored
                ? t(
                    "Guardada. Escreve para substituir.",
                    "Saved. Type to replace.",
                  )
                : ""
            }
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          {t("Endereço da instalação", "Installation address")}
          <input
            value={form.public_url}
            placeholder="http://everyday-tools.local"
            onChange={(e) => setForm({ ...form, public_url: e.target.value })}
          />
          <small>
            {t(
              "Usado na ligação de recuperação enviada por e-mail.",
              "Used in the recovery link sent by email.",
            )}
          </small>
        </label>
      </div>
      {hint && <p className="notice">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {errorText(error)}
        </p>
      )}
      {note && (
        <p className="success" role="status">
          {note}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy !== ""}>
          {t("Guardar", "Save")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy !== "" || !form.host || !form.sender}
          onClick={test}
        >
          {busy === "test"
            ? t("A enviar…", "Sending…")
            : t("Enviar teste", "Send a test")}
        </button>
      </div>
    </form>
  );
}
