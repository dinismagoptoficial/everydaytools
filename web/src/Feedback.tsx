import { useState } from "react";
import { MessageSquareText, Send, X } from "lucide-react";
import { api, type FeedbackType } from "./api";
import { useError, useFeedbackText, type Language } from "./i18n";

export default function FeedbackForm({
  language,
  route,
  related,
  onClose,
  onSubmitted,
}: {
  language: Language;
  route: string;
  related: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const ft = useFeedbackText(),
    errorText = useError();
  const [type, setType] = useState<FeedbackType>("BUG"),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [context, setContext] = useState(related),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/feedback", "POST", {
        type,
        title,
        description,
        related: context,
        route,
        language,
      });
      onSubmitted();
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        className="modal feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-form-title"
      >
        <header className="modal-head">
          <div>
            <span className="feedback-heading-icon" aria-hidden="true">
              <MessageSquareText size={18} />
            </span>
            <h2 id="feedback-form-title">{ft("formTitle")}</h2>
            <p>{ft("formIntro")}</p>
          </div>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label={ft("close")}
          >
            <X size={19} />
          </button>
        </header>
        <form className="feedback-form" onSubmit={submit}>
          <label>
            {ft("type")}
            <select
              value={type}
              onChange={(event) => setType(event.target.value as FeedbackType)}
            >
              <option value="BUG">{ft("bug")}</option>
              <option value="FEATURE">{ft("feature")}</option>
              <option value="OTHER">{ft("other")}</option>
            </select>
          </label>
          <label>
            <span className="field-label">
              {ft("title")}
              <small>{title.length}/140</small>
            </span>
            <input
              required
              minLength={3}
              maxLength={140}
              value={title}
              placeholder={ft("titlePlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">
              {ft("description")}
              <small>{description.length}/5000</small>
            </span>
            <textarea
              required
              minLength={10}
              maxLength={5000}
              rows={7}
              value={description}
              placeholder={ft("descriptionPlaceholder")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            <span>
              {ft("related")} <small>{ft("optional")}</small>
            </span>
            <input
              maxLength={120}
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {errorText(error)}
            </p>
          )}
          <div className="actions feedback-form-actions">
            <button className="secondary" type="button" onClick={onClose}>
              {ft("cancel")}
            </button>
            <button className="primary" disabled={busy} type="submit">
              <Send size={16} />
              {busy ? ft("submitting") : ft("submit")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
