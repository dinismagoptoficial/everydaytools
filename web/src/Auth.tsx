import { useState } from "react";
import { ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";
import { api, type Status } from "./api";
import Legal, { LegalDialog } from "./Legal";
import { useError, useText } from "./i18n";

export default function Auth({
  status,
  onDone,
}: {
  status: Status;
  onDone: () => void;
}) {
  const t = useText(),
    errorText = useError();
  const token = location.hash.startsWith("#reset/")
    ? location.hash.slice(7)
    : "";
  const [legalVersion, setLegalVersion] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [showLegal, setShowLegal] = useState(false);
  const [mode, setMode] = useState(
    status.setup ? "setup" : token ? "reset" : "login",
  );
  const [step, setStep] = useState(1),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [website, setWebsite] = useState("");
  const [name, setName] = useState("Everyday Tools"),
    [registration, setRegistration] = useState(true);
  const [maxUpload, setMaxUpload] = useState(256),
    [retention, setRetention] = useState(60);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    if (mode === "setup" && step === 1) {
      if (password.length < 10) return setError("password_length");
      setStep(2);
      return;
    }
    if (mode === "setup" && step === 2) {
      setStep(3);
      return;
    }
    if (
      mode === "setup" &&
      (!reviewed || legalVersion !== status.legal_version)
    )
      return;
    setBusy(true);
    try {
      await api(
        "/" + mode,
        "POST",
        mode === "setup"
          ? {
              email,
              password,
              installation_name: name,
              registration,
              max_upload_mb: maxUpload,
              retention_minutes: retention,
              legal_version: legalVersion,
            }
          : mode === "reset"
            ? { token, password }
            : mode === "register"
              ? { email, password, website }
              : mode === "recover"
                ? { email }
                : { email, password },
      );
      if (mode === "recover") setSent(true);
      else if (mode === "reset") {
        location.hash = "";
        setMode("login");
        setPassword("");
      } else onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-wrap">
      <div className="auth-intro">
        <div className="brand large">
          <img src="/logo.png" alt="" />
          <span>Everyday Tools</span>
        </div>
        <p>Your digital Swiss Army knife.</p>
        <div className="auth-illustration" aria-hidden="true">
          <span className="blade a" />
          <span className="blade b" />
          <span className="blade c" />
          <span className="knife-body">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="auth-promise">
          <ShieldCheck size={22} />
          <div>
            <strong>
              {t(
                "Os teus ficheiros ficam por perto.",
                "Your files stay close.",
              )}
            </strong>
            <p>
              {t(
                "Os documentos são processados neste servidor.",
                "Documents are processed on this server.",
              )}
            </p>
          </div>
        </div>
      </div>
      <div className="auth-form">
        {mode === "setup" && (
          <div className="eyebrow">
            {t(
              `CONFIGURAÇÃO INICIAL · ${step} / 3`,
              `INITIAL SETUP · ${step} / 3`,
            )}
          </div>
        )}
        <h1>
          {mode === "setup"
            ? t("Bem-vindo ao Everyday Tools", "Welcome to Everyday Tools")
            : mode === "register"
              ? t("Criar conta", "Create account")
              : mode === "recover"
                ? t("Recuperar palavra-passe", "Recover password")
                : mode === "reset"
                  ? t("Nova palavra-passe", "New password")
                  : t("Bom ter-te de volta.", "Welcome back.")}
        </h1>
        <p className="muted">
          {mode === "setup"
            ? t(
                "Vamos preparar o teu espaço de ferramentas.",
                "Let’s get your tools ready.",
              )
            : t(
                "Entra para aceder às tuas ferramentas e ficheiros.",
                "Sign in to access your tools and files.",
              )}
        </p>
        <form onSubmit={submit}>
          {!(mode === "setup" && step > 1) && (
            <>
              {mode === "register" && (
                <label className="trap-field" aria-hidden="true">
                  Website
                  <input
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              )}
              {mode !== "reset" && (
                <label>
                  E-mail
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {mode !== "recover" && (
                <label>
                  {t("Palavra-passe", "Password")}
                  <input
                    type="password"
                    required
                    minLength={mode === "login" ? 1 : 10}
                    maxLength={128}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode !== "login" && (
                    <small>
                      {t(
                        "Pelo menos 10 caracteres.",
                        "At least 10 characters.",
                      )}
                    </small>
                  )}
                </label>
              )}
            </>
          )}
          {mode === "setup" && step === 2 && (
            <>
              <label>
                {t("Nome da instalação", "Installation name")}
                <input
                  value={name}
                  required
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  {t("Limite de upload (MB)", "Upload limit (MB)")}
                  <input
                    type="number"
                    min={1}
                    max={10240}
                    value={maxUpload}
                    onChange={(e) => setMaxUpload(+e.target.value)}
                  />
                </label>
                <label>
                  {t("Retenção (minutos)", "Retention (minutes)")}
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={retention}
                    onChange={(e) => setRetention(+e.target.value)}
                  />
                </label>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={registration}
                  onChange={(e) => setRegistration(e.target.checked)}
                />
                {t(
                  "Permitir que outras pessoas criem conta",
                  "Allow others to create an account",
                )}
              </label>
              <p className="notice">
                {t(
                  "Esta conta será o administrador. Os ficheiros serão eliminados automaticamente após o período definido, contado desde o upload.",
                  "This account will be the administrator. Files will be deleted automatically after the retention period, starting at upload.",
                )}
              </p>
            </>
          )}
          {mode === "setup" && step === 3 && (
            <>
              <Legal onReady={setLegalVersion} />
              <label className="check">
                <input
                  type="checkbox"
                  required
                  checked={reviewed}
                  disabled={!legalVersion}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                {t(
                  "Li as condições de utilização, a política de privacidade e as responsabilidades do administrador.",
                  "I have read the terms of use, privacy policy and administrator responsibilities.",
                )}
              </label>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {errorText(error)}
            </p>
          )}
          {sent && (
            <p className="success" role="status">
              {t(
                "Se existir uma conta, receberás uma ligação por e-mail.",
                "If an account exists, you will receive an email link.",
              )}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy
              ? t("A aguardar…", "Please wait…")
              : mode === "setup"
                ? step < 3
                  ? t("Continuar", "Continue")
                  : t("Começar a utilizar", "Start using Everyday Tools")
                : mode === "register"
                  ? t("Criar conta", "Create account")
                  : mode === "recover"
                    ? t("Enviar ligação", "Send link")
                    : mode === "reset"
                      ? t("Guardar palavra-passe", "Save password")
                      : t("Entrar", "Sign in")}
            <ArrowRight size={17} />
          </button>
        </form>
        {mode === "setup" ? (
          step > 1 && (
            <div className="auth-links">
              <button className="link" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} />
                {t("Voltar", "Back")}
              </button>
            </div>
          )
        ) : (
          <div className="auth-links">
            <div className="auth-row">
              {mode === "login" ? (
                <>
                  {status.registration && (
                    <button
                      className="link"
                      onClick={() => {
                        setMode("register");
                        setError("");
                      }}
                    >
                      {t("Criar uma conta", "Create an account")}
                    </button>
                  )}
                  {status.smtp && (
                    <button className="link" onClick={() => setMode("recover")}>
                      {t(
                        "Esqueceste-te da palavra-passe?",
                        "Forgot your password?",
                      )}
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="link"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} />
                  {t("Voltar ao início de sessão", "Back to sign in")}
                </button>
              )}
            </div>
            <button className="link" onClick={() => setShowLegal(true)}>
              {t("Sobre, termos e privacidade", "About, terms and privacy")}
            </button>
          </div>
        )}
        {showLegal && <LegalDialog onClose={() => setShowLegal(false)} />}
      </div>
    </div>
  );
}
