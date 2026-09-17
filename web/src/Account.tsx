import { useState } from "react";
import { X } from "lucide-react";
import { api, type User } from "./api";
import { useError, useText, type Language } from "./i18n";
import Legal from "./Legal";

export default function Account({
  user,
  lang,
  setLang,
  onClose,
  onDone,
}: {
  user: User;
  lang: Language;
  setLang: (v: Language) => void;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useText(),
    errorText = useError();
  const [tab, setTab] = useState("account"),
    [name, setName] = useState(user.name),
    [email, setEmail] = useState(user.email),
    [language, setLanguage] = useState(lang);
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (tab === "security" && password !== confirm) {
      setError("password_mismatch");
      return;
    }
    setBusy(true);
    try {
      if (tab === "account") {
        await api("/me", "PUT", {
          name,
          email,
          language,
          current_password: current,
        });
        setLang(language);
      } else await api("/password", "POST", { current, password });
      await onDone();
      setCurrent("");
      setPassword("");
      setConfirm("");
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <header className="modal-head">
          <h2 id="account-title">{t("A minha conta", "My account")}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={t("Fechar", "Close")}
          >
            <X size={18} />
          </button>
        </header>
        <div className="filter-tabs">
          {[
            ["account", t("Perfil", "Profile")],
            ["security", t("Segurança", "Security")],
            ["legal", t("Sobre e informação legal", "About and legal")],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => {
                setTab(id);
                setError("");
                setSaved(false);
                setCurrent("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "legal" ? (
          <Legal />
        ) : (
          <form onSubmit={save}>
            {tab === "account" ? (
              <>
                <p className="muted">
                  {user.role === "ADMIN"
                    ? t("Administrador", "Administrator")
                    : t("Conta pessoal", "Personal account")}{" "}
                  · {t("Conta criada em", "Account created on")}{" "}
                  {new Date(user.created * 1000).toLocaleDateString(lang)}
                </p>
                <label>
                  {t("Nome", "Name")}
                  <input
                    autoComplete="name"
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  {t("Idioma", "Language")}
                  <select
                    aria-label={t("Idioma", "Language")}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                  >
                    <option value="pt-PT">Português (Portugal)</option>
                    <option value="en">English</option>
                  </select>
                </label>
                {email.trim().toLowerCase() !== user.email && (
                  <label>
                    {t(
                      "Palavra-passe atual para confirmar o e-mail",
                      "Current password to confirm your email",
                    )}
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <label>
                  {t("Palavra-passe atual", "Current password")}
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </label>
                <label>
                  {t("Nova palavra-passe", "New password")}
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  {t("Confirmar palavra-passe", "Confirm password")}
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
                <p className="notice">
                  {t(
                    "Esta alteração termina as outras sessões da tua conta.",
                    "This change signs out other sessions on your account.",
                  )}
                </p>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {errorText(error)}
              </p>
            )}
            {saved && (
              <p className="success" role="status">
                {t("Alterações guardadas.", "Changes saved.")}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? t("A guardar…", "Saving…") : t("Guardar", "Save")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
