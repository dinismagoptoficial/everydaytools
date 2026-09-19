import { useState } from "react";
import { ArrowRight, ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api, type Status } from "./api";
import Legal, { LegalDialog } from "./Legal";
import { useError, useText, type Language } from "./i18n";

export default function Auth({
  status,
  language,
  onLanguage,
  onDone,
}: {
  status: Status;
  language: Language;
  onLanguage: (language: Language) => void;
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
    [showPassword, setShowPassword] = useState(false),
    [website, setWebsite] = useState("");
  const [name, setName] = useState("Everyday Tools"),
    [registration, setRegistration] = useState(true);
  const [maxUpload, setMaxUpload] = useState(256),
    [retention, setRetention] = useState(60);
  const firstProvider = status.mail_providers.gmail ||
    Object.values(status.mail_providers)[0] || {
      host: "",
      port: 587,
      security: "starttls",
      hint: {},
    };
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtp, setSmtp] = useState({
    provider: status.mail_providers.gmail ? "gmail" : "custom",
    host: firstProvider.host,
    port: firstProvider.port,
    security: firstProvider.security,
    user: "",
    password: "",
    sender: "",
    public_url: location.origin,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    if (mode === "setup" && step === 1) {
      if (password.length < 8) return setError("password_length");
      setStep(2);
      return;
    }
    if (mode === "setup" && step === 2) {
      setSmtp((current) => ({
        ...current,
        user: current.user || email,
        sender: current.sender || email,
      }));
      setStep(3);
      return;
    }
    if (mode === "setup" && step === 3) {
      setStep(4);
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
              language,
              smtp: smtpEnabled ? smtp : null,
            }
          : mode === "reset"
            ? { token, password }
            : mode === "register"
              ? { email, password, website, language }
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
          <img
            src="/logo.png"
            alt=""
            className="brand-mark"
            draggable={false}
          />
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
              `CONFIGURAÇÃO INICIAL · ${step} / 4`,
              `INITIAL SETUP · ${step} / 4`,
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
            : mode === "recover"
              ? t(
                  "Recebe uma ligação segura para definires uma nova palavra-passe.",
                  "Receive a secure link to set a new password.",
                )
              : mode === "reset"
                ? t(
                    "Escolhe uma nova palavra-passe para a tua conta.",
                    "Choose a new password for your account.",
                  )
                : mode === "register"
                  ? t(
                      "Cria a tua conta para começares a utilizar as ferramentas.",
                      "Create your account to start using the tools.",
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
                <div className="password-group">
                  <label htmlFor="auth-password">
                    {t("Palavra-passe", "Password")}
                  </label>
                  <div className="password-field">
                    <input
                      id="auth-password"
                      type={
                        showPassword &&
                        (mode === "setup" || mode === "register")
                          ? "text"
                          : "password"
                      }
                      required
                      minLength={mode === "login" ? 1 : 8}
                      maxLength={128}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    {(mode === "setup" || mode === "register") && (
                      <button
                        type="button"
                        className="password-toggle"
                        aria-label={
                          showPassword
                            ? t("Ocultar palavra-passe", "Hide password")
                            : t("Mostrar palavra-passe", "Show password")
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((visible) => !visible)}
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    )}
                  </div>
                  {mode !== "login" && (
                    <small>
                      {t("Pelo menos 8 caracteres.", "At least 8 characters.")}
                    </small>
                  )}
                </div>
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
              <label>
                {t("Idioma principal", "Main language")}
                <select
                  value={language}
                  onChange={(event) =>
                    onLanguage(event.target.value as Language)
                  }
                >
                  <option value="pt-PT">Português</option>
                  <option value="en">English</option>
                </select>
                <small>
                  {t(
                    "Cada pessoa pode escolher outro idioma na sua conta.",
                    "Each person can choose another language in their account.",
                  )}
                </small>
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
              <label className="check">
                <input
                  type="checkbox"
                  checked={smtpEnabled}
                  onChange={(event) => setSmtpEnabled(event.target.checked)}
                />
                {t(
                  "Configurar recuperação por e-mail agora",
                  "Configure email recovery now",
                )}
              </label>
              {smtpEnabled && (
                <>
                  <div className="form-grid">
                    <label>
                      {t("Serviço", "Service")}
                      <select
                        value={smtp.provider}
                        onChange={(event) => {
                          const provider =
                            status.mail_providers[event.target.value];
                          setSmtp({
                            ...smtp,
                            provider: event.target.value,
                            host:
                              event.target.value === "custom"
                                ? smtp.host
                                : provider.host,
                            port:
                              event.target.value === "custom"
                                ? smtp.port
                                : provider.port,
                            security:
                              event.target.value === "custom"
                                ? smtp.security
                                : provider.security,
                          });
                        }}
                      >
                        {Object.entries(status.mail_providers).map(
                          ([id, provider]) => (
                            <option key={id} value={id}>
                              {id === "custom"
                                ? t("Outro servidor", "Other server")
                                : provider.label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      {t("Endereço do remetente", "Sender address")}
                      <input
                        type="email"
                        required
                        value={smtp.sender}
                        onChange={(event) =>
                          setSmtp({ ...smtp, sender: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Servidor", "Server")}
                      <input
                        required
                        value={smtp.host}
                        onChange={(event) =>
                          setSmtp({ ...smtp, host: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Porta", "Port")}
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        required
                        value={smtp.port}
                        onChange={(event) =>
                          setSmtp({ ...smtp, port: +event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Ligação", "Connection")}
                      <select
                        value={smtp.security}
                        onChange={(event) =>
                          setSmtp({ ...smtp, security: event.target.value })
                        }
                      >
                        <option value="starttls">STARTTLS</option>
                        <option value="ssl">SSL/TLS</option>
                        <option value="none">
                          {t("Sem cifra", "No encryption")}
                        </option>
                      </select>
                    </label>
                    <label>
                      {t("Utilizador", "Username")}
                      <input
                        value={smtp.user}
                        autoComplete="off"
                        onChange={(event) =>
                          setSmtp({ ...smtp, user: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Palavra-passe de aplicação", "App password")}
                      <input
                        type="password"
                        value={smtp.password}
                        autoComplete="new-password"
                        onChange={(event) =>
                          setSmtp({ ...smtp, password: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Endereço da instalação", "Installation address")}
                      <input
                        type="url"
                        required
                        value={smtp.public_url}
                        onChange={(event) =>
                          setSmtp({ ...smtp, public_url: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  {status.mail_providers[smtp.provider]?.hint?.[language] && (
                    <p className="notice">
                      {status.mail_providers[smtp.provider].hint[language]}
                    </p>
                  )}
                </>
              )}
              {!smtpEnabled && (
                <p className="notice">
                  {t(
                    "Podes configurar o e-mail mais tarde no painel de administração.",
                    "You can configure email later in the administration panel.",
                  )}
                </p>
              )}
            </>
          )}
          {mode === "setup" && step === 4 && (
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
          <button
            className="primary wide"
            disabled={busy || (mode === "recover" && sent)}
          >
            {busy
              ? t("A aguardar…", "Please wait…")
              : mode === "setup"
                ? step < 4
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
                  <button
                    className="link"
                    onClick={() => {
                      setMode("recover");
                      setSent(false);
                      setError("");
                    }}
                  >
                    {t(
                      "Esqueceste-te da palavra-passe?",
                      "Forgot your password?",
                    )}
                  </button>
                </>
              ) : (
                <button
                  className="link"
                  onClick={() => {
                    setMode("login");
                    setSent(false);
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
