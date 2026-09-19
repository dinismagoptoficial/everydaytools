import { useEffect, useState } from "react";
import MailSettings from "./MailSettings";
import FeedbackAdmin from "./FeedbackAdmin";
import { MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { api, fileSize } from "./api";
import { useError, useFeedbackText, useText } from "./i18n";

export default function Admin({
  onSettings,
  onFeedback,
  initialFeedbackId = "",
}: {
  onSettings: () => void;
  onFeedback: () => void;
  initialFeedbackId?: string;
}) {
  const t = useText(),
    ft = useFeedbackText(),
    errorText = useError();
  const [data, setData] = useState<any>(),
    [prefs, setPrefs] = useState<Record<string, any>>({}),
    [tab, setTab] = useState(initialFeedbackId ? "feedback" : "users"),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState("");
  async function load() {
    try {
      const d = await api("/admin");
      setData(d);
      setPrefs(d.settings);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(path: string, method: string, body?: unknown) {
    setError("");
    setBusy(true);
    try {
      await api(path, method, body);
      setDeleting("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    installation_name: t("Nome da instalação", "Installation name"),
    retention_minutes: t(
      "Retenção de novos ficheiros (minutos)",
      "Retention for new files (minutes)",
    ),
    max_upload_mb: t(
      "Upload máximo por tarefa (MB)",
      "Maximum upload per task (MB)",
    ),
    max_storage_mb: t("Limite de armazenamento (MB)", "Storage limit (MB)"),
    min_free_mb: t("Espaço livre mínimo (MB)", "Minimum free space (MB)"),
    light_concurrency: t(
      "Tarefas leves em simultâneo",
      "Concurrent light tasks",
    ),
    medium_concurrency: t(
      "Tarefas médias em simultâneo",
      "Concurrent medium tasks",
    ),
    heavy_concurrency: t(
      "Tarefas pesadas em simultâneo",
      "Concurrent heavy tasks",
    ),
    max_pending: t("Tarefas pendentes por pessoa", "Pending tasks per person"),
    login_limit: t("Tentativas de login / minuto", "Login attempts / minute"),
    upload_limit: t("Uploads / 10 minutos", "Uploads / 10 minutes"),
    register_limit: t("Registos / 10 minutos", "Registrations / 10 minutes"),
    admin_limit: t("Ações administrativas / minuto", "Admin actions / minute"),
    job_limit: t("Novas tarefas / 10 minutos", "New tasks / 10 minutes"),
  };
  return (
    <>
      <div className="page-heading admin-page-heading">
        <div>
          <div className="eyebrow">
            {t("A TUA INSTALAÇÃO", "YOUR INSTALLATION")}
          </div>
          <h1>{t("Administração", "Administration")}</h1>
          <p>
            {t(
              "Pessoas, limites e estado do serviço.",
              "People, limits and service status.",
            )}
          </p>
        </div>
        <button className="secondary compact" type="button" onClick={onFeedback}>
          <MessageSquareText size={16} />
          {ft("menu")}
        </button>
      </div>
      <div className="section-heading">
        <div className="filter-tabs">
          {["users", "jobs", "feedback", "storage", "settings", "email", "system"].map(
            (k, i) => (
              <button
                key={k}
                className={tab === k ? "selected" : ""}
                onClick={() => {
                  setTab(k);
                  setSuccess(false);
                }}
              >
                {
                  [
                    t("Utilizadores", "Users"),
                    t("Tarefas", "Jobs"),
                    ft("adminTab"),
                    t("Armazenamento", "Storage"),
                    t("Definições", "Settings"),
                    t("E-mail", "Email"),
                    t("Sistema", "System"),
                  ][i]
                }
              </button>
            ),
          )}
        </div>
        <button
          className="icon-btn"
          aria-label={t("Atualizar", "Refresh")}
          onClick={load}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {errorText(error)}
        </p>
      )}
      {data && (
        <div className="admin-content">
          {tab === "users" && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>{t("Conta", "Account")}</th>
                    <th>{t("Estado", "Status")}</th>
                    <th>{t("Ações", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u: any) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>
                        {u.role === "ADMIN"
                          ? t("Administrador", "Administrator")
                          : t("Utilizador", "User")}
                      </td>
                      <td>
                        {u.disabled
                          ? t("Desativada", "Disabled")
                          : t("Ativa", "Active")}
                      </td>
                      <td>
                        {u.role !== "ADMIN" && (
                          <div className="actions">
                            <button
                              className="link"
                              disabled={busy}
                              onClick={() =>
                                action(`/admin/users/${u.id}`, "PUT", {
                                  disabled: !u.disabled,
                                })
                              }
                            >
                              {u.disabled
                                ? t("Ativar", "Enable")
                                : t("Desativar", "Disable")}
                            </button>
                            {deleting === u.id ? (
                              <>
                                <span>
                                  {t(
                                    "Eliminar conta e ficheiros?",
                                    "Delete account and files?",
                                  )}
                                </span>
                                <button
                                  className="link danger"
                                  disabled={busy}
                                  onClick={() =>
                                    action(`/admin/users/${u.id}`, "DELETE")
                                  }
                                >
                                  {t("Confirmar", "Confirm")}
                                </button>
                                <button
                                  className="link"
                                  onClick={() => setDeleting("")}
                                >
                                  {t("Voltar", "Back")}
                                </button>
                              </>
                            ) : (
                              <button
                                className="link danger"
                                onClick={() => setDeleting(u.id)}
                              >
                                {t("Eliminar", "Delete")}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === "jobs" && (
            <>
              <p className="muted">
                {t(
                  "Vista geral sem nomes de documentos nem conteúdos.",
                  "Overview without document names or content.",
                )}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{t("Classe", "Class")}</th>
                      <th>{t("Estado", "Status")}</th>
                      <th>{t("Ações", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j: any) => (
                      <tr key={j.id}>
                        <td>
                          <code>{j.id.slice(0, 8)}</code>
                        </td>
                        <td>{j.class}</td>
                        <td>{j.state}</td>
                        <td>
                          {["PENDING", "PROCESSING"].includes(j.state) && (
                            <button
                              className="link"
                              disabled={busy}
                              onClick={() =>
                                action(`/admin/jobs/${j.id}/cancel`, "POST")
                              }
                            >
                              {t("Cancelar", "Cancel")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.jobs.length && (
                <p>{t("Não há tarefas ativas.", "No active jobs.")}</p>
              )}
            </>
          )}
          {tab === "feedback" && <FeedbackAdmin initialId={initialFeedbackId} />}
          {tab === "storage" && (
            <>
              {data.storage.free < prefs.min_free_mb * 1024 ** 2 && (
                <p className="error" role="alert">
                  {t(
                    "O disco está abaixo do espaço livre mínimo. Novos uploads estão a ser recusados até que tarefas expirem ou sejam eliminadas.",
                    "The disk is below the minimum free space. New uploads are being refused until jobs expire or are deleted.",
                  )}
                </p>
              )}
              {data.storage.reserved >
                prefs.max_storage_mb * 1024 ** 2 * 0.9 && (
                <p className="notice">
                  {t(
                    "O limite de armazenamento está quase atingido. Aumenta o limite ou reduz a retenção.",
                    "The storage limit is nearly reached. Raise the limit or shorten the retention period.",
                  )}
                </p>
              )}
              <dl className="system-list">
                <div>
                  <dt>
                    {t(
                      "Ficheiros temporários no disco",
                      "Temporary files on disk",
                    )}
                  </dt>
                  <dd>{fileSize(data.storage.used)}</dd>
                </div>
                <div>
                  <dt>
                    {t(
                      "Espaço reservado para tarefas",
                      "Space reserved for jobs",
                    )}
                  </dt>
                  <dd>
                    {fileSize(data.storage.reserved)} {t("de", "of")}{" "}
                    {fileSize(prefs.max_storage_mb * 1024 ** 2)}
                  </dd>
                </div>
                <div>
                  <dt>{t("Espaço livre no disco", "Free disk space")}</dt>
                  <dd>{fileSize(data.storage.free)}</dd>
                </div>
                <div>
                  <dt>{t("Tarefas existentes", "Existing jobs")}</dt>
                  <dd>{data.jobs.length}</dd>
                </div>
                <div>
                  <dt>{t("Retenção predefinida", "Default retention")}</dt>
                  <dd>{prefs.retention_minutes} min</dd>
                </div>
              </dl>
            </>
          )}
          {tab === "email" && <MailSettings />}
          {tab === "system" && (
            <>
              <dl className="system-list">
                <div>
                  <dt>{t("Versão", "Version")}</dt>
                  <dd>{data.system.version}</dd>
                </div>
                <div>
                  <dt>{t("Aplicação", "Application")}</dt>
                  <dd>
                    {data.system.status === "ok"
                      ? t("Operacional", "Healthy")
                      : ":"}
                  </dd>
                </div>
                <div>
                  <dt>{t("Serviço de processamento", "Processing service")}</dt>
                  <dd>
                    {data.system.worker
                      ? t("Operacional", "Healthy")
                      : t("Sem resposta", "Not responding")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Base de dados", "Database")}</dt>
                  <dd>SQLite</dd>
                </div>
              </dl>
              <p className="notice">
                <ShieldCheck size={18} />
                {t(
                  "Os ficheiros são processados nesta instalação. Não são enviados para serviços externos.",
                  "Files are processed on this installation. They are not sent to external services.",
                )}
              </p>
            </>
          )}
          {tab === "settings" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api("/admin/settings", "PUT", prefs);
                  setSuccess(true);
                  onSettings();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="form-grid">
                {Object.entries(labels).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      type={key === "installation_name" ? "text" : "number"}
                      value={prefs[key] ?? ""}
                      min={
                        key === "retention_minutes"
                          ? 5
                          : ["max_storage_mb", "min_free_mb"].includes(key)
                            ? 64
                            : 1
                      }
                      max={
                        key === "retention_minutes"
                          ? 1440
                          : key === "heavy_concurrency"
                            ? 2
                            : key === "medium_concurrency"
                              ? 4
                              : key === "light_concurrency"
                                ? 8
                                : key === "max_pending"
                                  ? 20
                                  : key.endsWith("_limit")
                                    ? 100
                                    : undefined
                      }
                      onChange={(e) =>
                        setPrefs((p) => ({
                          ...p,
                          [key]:
                            key === "installation_name"
                              ? e.target.value
                              : +e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={prefs.registration}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, registration: e.target.checked }))
                  }
                />
                {t("Permitir novas contas", "Allow new accounts")}
              </label>
              <p className="notice">
                {t(
                  "Alterar a retenção aplica-se apenas a novos ficheiros. As tarefas em curso mantêm os respetivos prazos.",
                  "Retention changes apply to new files only. Existing jobs keep their original deadlines.",
                )}
              </p>
              {success && (
                <p className="success" role="status">
                  {t("Definições guardadas.", "Settings saved.")}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {t("Guardar definições", "Save settings")}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
