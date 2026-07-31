import { Children, cloneElement, isValidElement } from "react";

function resolveWindowSummary(summary, semester) {
  const windowSummary = summary?.windowSummary ?? {};

  return {
    requestClose: windowSummary.requestClose ?? semester?.keyDates?.requestClose ?? null,
    addDropClose: windowSummary.addDropClose ?? semester?.keyDates?.addDropClose ?? null,
    resultCheckWindow: windowSummary.resultCheckWindow ?? semester?.keyDates?.resultCheckWindow ?? null,
    supportContact: windowSummary.supportContact ?? semester?.keyDates?.supportContact ?? null,
    supportEmail: windowSummary.supportEmail ?? semester?.keyDates?.supportEmail ?? null,
  };
}

function formatCreditFigure(value, creditLimit) {
  return `${value ?? 0} / ${creditLimit ?? "—"} credits`;
}

const SUMMARY_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatSyncTimestamp(value) {
  if (!value) {
    return "Not synced yet";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not synced yet";
  }

  return `Updated ${SUMMARY_TIME_FORMATTER.format(parsed)}`;
}

export function AcademicSummaryStrip({
  student,
  semester,
  summary,
  title = "Academic Summary",
  showUrgentActions = false,
  systemMeta = null,
  onRefresh = null,
}) {
  const creditLimit = summary?.creditLimit ?? student?.semesterStudyLoadLimit ?? null;
  const confirmedCredits = summary?.confirmedCredits ?? 0;
  const plannedCredits = summary?.plannedCredits ?? confirmedCredits;
  const remainingStudyLoad = Number.isFinite(creditLimit)
    ? Math.max(creditLimit - plannedCredits, 0)
    : null;
  const actionSummary = summary?.studentActionSummary ?? {};
  const summaryItems = [
    { label: "Student", value: `${student.id}` },
    { label: "Programme", value: student.programme },
    {
      label: "Confirmed",
      value: formatCreditFigure(confirmedCredits, creditLimit),
      accent: true,
    },
    {
      label: "Planned incl. active requests",
      value: formatCreditFigure(plannedCredits, creditLimit),
      accent: plannedCredits !== confirmedCredits,
    },
  ].filter(Boolean);
  const urgentActions = Array.isArray(actionSummary.urgentActions)
    ? actionSummary.urgentActions.filter(Boolean).slice(0, 2)
    : [];

  return (
    <section className="page-panel page-panel--summary-strip">
      <div className="summary-strip">
        <div className="summary-strip__header">
          <div className="summary-strip__header-copy">
            <span className="summary-strip__eyebrow">Student overview</span>
            <strong>{title}</strong>
            <span>{student.mode}</span>
          </div>
          <div className="summary-strip__header-meta">
            <span
              className={
                systemMeta?.isSyncing
                  ? "summary-strip__status summary-strip__status--syncing"
                  : "summary-strip__status"
              }
            >
              {systemMeta?.isSyncing ? systemMeta.syncLabel || "Syncing…" : formatSyncTimestamp(systemMeta?.lastUpdatedAt)}
            </span>
            {onRefresh ? (
              <button
                type="button"
                className="summary-strip__refresh"
                onClick={onRefresh}
                disabled={systemMeta?.isSyncing}
              >
                {systemMeta?.isSyncing ? "Syncing…" : "Refresh"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="summary-strip__metrics" aria-label="Academic summary details">
          {summaryItems.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className={item.accent ? "summary-strip__metric summary-strip__metric--accent" : "summary-strip__metric"}
            >
              <span className="summary-strip__metric-label">{item.label}</span>
              <strong className="summary-strip__metric-value">{item.value}</strong>
            </div>
          ))}
          {remainingStudyLoad !== null ? (
            <div className="summary-strip__metric summary-strip__metric--accent">
              <span className="summary-strip__metric-label">Capacity left</span>
              <strong className="summary-strip__metric-value">{remainingStudyLoad} credits</strong>
            </div>
          ) : null}
        </div>
        {showUrgentActions && urgentActions.length ? (
          <div className="summary-strip__actions" aria-label="Immediate actions">
            {urgentActions.map((item) => (
              <span key={item} className="summary-strip__action">
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function WindowStatusStrip({ summary, semester, title = "Current window", tone = "info" }) {
  const windowSummary = resolveWindowSummary(summary, semester);
  const toneByLabel = {
    Request: "request",
    "Add / Drop": "adddrop",
    "Record Check": "record",
    Support: "support",
  };
  const rows = [
    { label: "Request", value: windowSummary.requestClose },
    { label: "Add / Drop", value: windowSummary.addDropClose },
    { label: "Record Check", value: windowSummary.resultCheckWindow },
    { label: "Support", value: windowSummary.supportContact, detail: windowSummary.supportEmail },
  ].filter((item) => Boolean(item.value));

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className={`notice-panel notice-panel--${tone} notice-panel--window`} role="status" aria-live="polite" aria-atomic="true">
      <div className="window-status-strip">
        <div className="window-status-strip__intro">
          <span className="window-status-strip__eyebrow">Planning desk</span>
          <strong className="window-status-strip__title">{title}</strong>
          <span className="window-status-strip__caption">
            Keep the current request, Add / Drop, and record-check milestones in view while planning changes.
          </span>
        </div>
        <div className="window-status-grid">
          {rows.map(({ label, value, detail }) => (
            <article key={label} className={`window-status-item window-status-item--${toneByLabel[label] ?? "default"}`}>
              <span className="window-status-item__label">{label}</span>
              <strong className="window-status-item__value">{value}</strong>
              {detail ? <span className="window-status-item__detail">{detail}</span> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EmptyTableRow({ colSpan, message }) {
  return (
    <tr>
      <td colSpan={colSpan}>{message}</td>
    </tr>
  );
}

export function StatusText({ tone, children }) {
  return <span className={`status-text status-text--${tone}`}>{children}</span>;
}

function addMobileCellLabels(children, headers) {
  return Children.map(children, (row) => {
    if (!isValidElement(row) || row.type !== "tr") {
      return row;
    }

    let headerIndex = 0;
    const labelledCells = Children.map(row.props.children, (cell) => {
      if (!isValidElement(cell) || cell.type !== "td") {
        return cell;
      }

      const colSpan = Number(cell.props.colSpan ?? 1);
      const mobileLabel = colSpan === 1 ? headers[headerIndex] : undefined;
      headerIndex += colSpan;

      if (!mobileLabel || cell.props["data-mobile-label"]) {
        return cell;
      }

      return cloneElement(cell, {
        "data-mobile-label": mobileLabel,
      });
    });

    return cloneElement(row, row.props, labelledCells);
  });
}

function TableFrame({ headers, children, caption, ariaLabel }) {
  return (
    <div className="table-wrap">
      <table className="portal-table portal-table--responsive-cards" aria-label={ariaLabel ?? caption ?? undefined}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{addMobileCellLabels(children, headers)}</tbody>
      </table>
    </div>
  );
}

export function TableSection({ title, panelClassName = "", headers, children, tableAriaLabel }) {
  const className = panelClassName ? `page-panel ${panelClassName}` : "page-panel";

  return (
    <section className={className}>
      {title ? <h3>{title}</h3> : null}
      <TableFrame headers={headers} caption={title} ariaLabel={tableAriaLabel}>
        {children}
      </TableFrame>
    </section>
  );
}

export function SimpleTable({ headers, rows, caption }) {
  return (
    <TableFrame headers={headers} caption={caption}>
      {rows.map((row, rowIndex) => (
        <tr key={`${row.join("-")}-${rowIndex}`}>
          {row.map((cell, cellIndex) => (
            <td key={`${cell}-${cellIndex}`}>{cell}</td>
          ))}
        </tr>
      ))}
    </TableFrame>
  );
}
