import { useContext, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  api,
  type Feedback,
  type FeedbackStatus,
  type FeedbackType,
} from "./api";
import { LanguageContext, useError, useFeedbackText } from "./i18n";

type FeedbackPage = {
  items: Feedback[];
  total: number;
  page: number;
  limit: number;
};

export default function FeedbackAdmin({ initialId = "" }: { initialId?: string }) {
  const ft = useFeedbackText(),
    errorText = useError(),
    language = useContext(LanguageContext);
  const [items, setItems] = useState<Feedback[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState(""),
    [selected, setSelected] = useState<Feedback>(),
    [confirmDelete, setConfirmDelete] = useState(false),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const openedInitial = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  const limit = 50;

  function timestamp(value: string, end = false) {
    if (!value) return "";
    const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
    return String(date.getTime() / 1000);
  }

  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (dateFrom) params.set("created_from", timestamp(dateFrom));
    if (dateTo) params.set("created_to", timestamp(dateTo, true));
    setLoading(true);
    setError("");
    api<FeedbackPage>(`/admin/feedback?${params}`)
      .then((result) => {
        if (!current) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((exception) => current && setError((exception as Error).message))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [status, type, dateFrom, dateTo, page]);

  useEffect(() => {
    if (!initialId || openedInitial.current) return;
    openedInitial.current = true;
    void open(initialId);
  }, [initialId]);

  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]',
        ) || [],
      );
    setTimeout(() => focusable()[0]?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmDelete) setConfirmDelete(false);
        else setSelected(undefined);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [selected?.id, confirmDelete]);

  async function reload() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (dateFrom) params.set("created_from", timestamp(dateFrom));
    if (dateTo) params.set("created_to", timestamp(dateTo, true));
    const result = await api<FeedbackPage>(`/admin/feedback?${params}`);
    setItems(result.items);
    setTotal(result.total);
  }

  async function open(id: string) {
    setDetailLoading(true);
    setError("");
    try {
      setSelected(await api<Feedback>(`/admin/feedback/${id}`));
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(next: FeedbackStatus) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      setSelected(
        await api<Feedback>(`/admin/feedback/${selected.id}`, "PUT", {
          status: next,
        }),
      );
      await reload();
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/feedback/${selected.id}`, "DELETE");
      setSelected(undefined);
      setConfirmDelete(false);
      await reload();
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function typeLabel(value: FeedbackType) {
    return ft(value === "BUG" ? "bug" : value === "FEATURE" ? "feature" : "other");
  }

  function statusLabel(value: FeedbackStatus) {
    return ft(
      value === "NEW"
        ? "newStatus"
        : value === "IN_PROGRESS"
          ? "progressStatus"
          : "completedStatus",
    );
  }

  function formatDate(value: number) {
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "pt-PT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value * 1000);
  }

  return (
    <section className="feedback-admin">
      <p className="muted">{ft("adminIntro")}</p>
      <div className="feedback-filters">
        <label>
          {ft("status")}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{ft("statusAll")}</option>
            <option value="NEW">{ft("newStatus")}</option>
            <option value="IN_PROGRESS">{ft("progressStatus")}</option>
            <option value="COMPLETED">{ft("completedStatus")}</option>
          </select>
        </label>
        <label>
          {ft("type")}
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{ft("typeAll")}</option>
            <option value="BUG">{ft("bug")}</option>
            <option value="FEATURE">{ft("feature")}</option>
            <option value="OTHER">{ft("other")}</option>
          </select>
        </label>
        <label>
          {ft("dateFrom")}
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {ft("dateTo")}
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        {(status || type || dateFrom || dateTo) && (
          <button
            className="link feedback-clear"
            onClick={() => {
              setStatus("");
              setType("");
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            {ft("clearFilters")}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {errorText(error)}
        </p>
      )}
      {loading ? (
        <p className="loading">{ft("loading")}</p>
      ) : items.length ? (
        <>
          <div className="table-scroll">
            <table className="feedback-table">
              <thead>
                <tr>
                  <th>{ft("type")}</th>
                  <th>{ft("title")}</th>
                  <th>{ft("user")}</th>
                  <th>{ft("date")}</th>
                  <th>{ft("status")}</th>
                  <th>{ft("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{typeLabel(item.type)}</td>
                    <td className="feedback-title-cell">{item.title}</td>
                    <td>{item.user.name || item.user.email}</td>
                    <td>{formatDate(item.created)}</td>
                    <td>
                      <span className={`status-badge status-${item.status.toLowerCase()}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <button className="link" onClick={() => void open(item.id)}>
                        {ft("open")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="feedback-pagination">
            <span>
              {total} {ft("results")}
            </span>
            <div className="actions">
              <button
                className="secondary compact"
                disabled={page === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={15} /> {ft("previous")}
              </button>
              <button
                className="secondary compact"
                disabled={page * limit >= total}
                onClick={() => setPage((value) => value + 1)}
              >
                {ft("next")} <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="feedback-empty">
          <CalendarDays size={24} />
          <p>{ft("empty")}</p>
        </div>
      )}
      {detailLoading && <p className="loading">{ft("loading")}</p>}
      {selected && (
        <div className="modal-backdrop">
          <section
            ref={dialog}
            className="modal feedback-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-detail-title"
          >
            {confirmDelete ? (
              <>
                <h2 id="feedback-detail-title">{ft("deleteTitle")}</h2>
                <p className="muted">{ft("deleteText")}</p>
                <div className="actions feedback-form-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    {ft("goBack")}
                  </button>
                  <button className="primary" disabled={busy} onClick={() => void remove()}>
                    {ft("confirmDelete")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <header className="modal-head">
                  <div>
                    <span className={`status-badge status-${selected.status.toLowerCase()}`}>
                      {statusLabel(selected.status)}
                    </span>
                    <h2 id="feedback-detail-title">{selected.title}</h2>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => setSelected(undefined)}
                    aria-label={ft("close")}
                  >
                    <X size={19} />
                  </button>
                </header>
                <dl className="feedback-meta">
                  <div>
                    <dt>{ft("type")}</dt>
                    <dd>{typeLabel(selected.type)}</dd>
                  </div>
                  <div>
                    <dt>{ft("user")}</dt>
                    <dd>{selected.user.name || selected.user.email}</dd>
                  </div>
                  <div>
                    <dt>{ft("submittedAt")}</dt>
                    <dd>{formatDate(selected.created)}</dd>
                  </div>
                  <div>
                    <dt>{ft("updatedAt")}</dt>
                    <dd>{formatDate(selected.updated)}</dd>
                  </div>
                  <div>
                    <dt>{ft("related")}</dt>
                    <dd>{selected.related || ft("noRelated")}</dd>
                  </div>
                  <div>
                    <dt>{ft("route")}</dt>
                    <dd>{selected.route || ft("noRelated")}</dd>
                  </div>
                  <div>
                    <dt>{ft("language")}</dt>
                    <dd>{selected.language}</dd>
                  </div>
                  <div>
                    <dt>{ft("version")}</dt>
                    <dd>{selected.app_version}</dd>
                  </div>
                </dl>
                <div className="feedback-description">
                  <strong>{ft("description")}</strong>
                  <p>{selected.description}</p>
                </div>
                <div className="actions wrap feedback-detail-actions">
                  {selected.status !== "NEW" && (
                    <button className="secondary" disabled={busy} onClick={() => void changeStatus("NEW")}>
                      {ft("setNew")}
                    </button>
                  )}
                  {selected.status !== "IN_PROGRESS" && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void changeStatus("IN_PROGRESS")}
                    >
                      {ft("setProgress")}
                    </button>
                  )}
                  {selected.status !== "COMPLETED" && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void changeStatus("COMPLETED")}
                    >
                      {ft("setCompleted")}
                    </button>
                  )}
                  <button className="link danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    {ft("delete")}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
