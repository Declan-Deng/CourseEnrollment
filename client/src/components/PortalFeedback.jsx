import { useEffect, useId } from "react";

function useEscapeToClose(onClose) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

export function CourseInfoDialog({ dialog, onClose }) {
  const titleId = useId();
  const descriptionId = useId();
  useEscapeToClose(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId}>{dialog.title}</h3>
        <p id={descriptionId} className="sr-only">
          {dialog.headline}
        </p>
        <div className="detail-dialog__meta">
          {dialog.meta.map((item, index) => (
            <span key={`${item}-${index}`} className="soft-tag">
              {item}
            </span>
          ))}
        </div>
        <p className="detail-dialog__headline">{dialog.headline}</p>
        {dialog.reasons.length ? (
          <ul className="focus-list">
            {dialog.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {dialog.suggestedAction ? (
          <div className="focus-note">
            <strong>Suggested next step:</strong> {dialog.suggestedAction}
          </div>
        ) : null}
        <div className="focus-note">
          <strong>Window guidance:</strong> {dialog.windowNote}
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button mini-button--primary" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function Banner({ tone, title, detail, onClose }) {
  return (
    <div className={`banner banner--${tone}`} role="alert" aria-live="assertive" aria-atomic="true">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" className="banner__close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export function ToastNotice({ tone, title, detail, onClose }) {
  return (
    <div className="toast-notice-wrap" aria-live="polite" aria-atomic="true">
      <div className={`toast-notice toast-notice--${tone}`}>
        <div>
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
        <button type="button" className="toast-notice__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, detail, onCancel, onConfirm }) {
  const titleId = useId();
  const descriptionId = useId();
  useEscapeToClose(onCancel);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h3 id={titleId}>{title}</h3>
        <p id={descriptionId}>{detail}</p>
        <div className="modal-actions">
          <button type="button" className="mini-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="mini-button mini-button--primary" onClick={onConfirm} autoFocus>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
