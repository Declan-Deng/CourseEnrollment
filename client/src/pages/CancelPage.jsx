import { AcademicSummaryStrip, StatusText } from "../components/PortalShared";
import { getListTypeClass, getListTypeLabel, getPolicyTagMeta, getRecordTone } from "../portalModel";

function WithdrawCard({ record, busyCourseId, onAction, onInspectRecord }) {
  const policyMeta = getPolicyTagMeta(record.course);

  return (
    <article className="withdraw-card">
      <div className="withdraw-card__header">
        <div className="cell-title">
          <strong>{record.course.code}</strong>
          <span>{record.course.title}</span>
          <div className="tag-row">
            <span className={getListTypeClass(record.course.listType)} title={getListTypeLabel(record.course.listType)}>
              {record.course.listType}
            </span>
            <span className="soft-tag soft-tag--subclass">Subclass {record.course.subclass}</span>
            <span className="soft-tag soft-tag--policy-compact">{policyMeta.label}</span>
          </div>
        </div>
        <StatusText tone={getRecordTone(record.status)}>{record.statusLabel}</StatusText>
      </div>

      <div className="withdraw-card__meta">
        <span>{`Sem ${record.course.semester} · ${record.course.credits} credits`}</span>
      </div>

      <div className="withdraw-card__copy">
        <p>
          <strong>{record.message}</strong>
        </p>
        <p>{record.nextStep}</p>
      </div>

      <div className="withdraw-card__actions">
        <button
          type="button"
          className="mini-button mini-button--danger"
          onClick={() => onAction(record.course)}
          disabled={busyCourseId === record.course.id}
        >
          {busyCourseId === record.course.id ? "…" : "Withdraw request"}
        </button>
        <button type="button" className="mini-button" onClick={() => onInspectRecord(record)}>
          View request details
        </button>
      </div>
    </article>
  );
}

export function CancelPage({
  student,
  semester,
  summary,
  systemMeta,
  records,
  busyCourseId,
  onInspectRecord,
  onAction,
  onNavigate,
  onRefresh,
}) {
  const requestDeadline = summary?.windowSummary?.requestClose ?? semester?.keyDates?.requestClose ?? "the request deadline";
  const requestCountLabel = records.length === 1 ? "1 request remains withdrawable." : `${records.length} requests remain withdrawable.`;

  return (
    <div className="page-stack page-stack--withdraw">
      <AcademicSummaryStrip
        student={student}
        semester={semester}
        summary={summary}
        systemMeta={systemMeta}
        title="Academic Summary"
        onRefresh={onRefresh}
      />

      <section className="page-panel page-panel--focus">
        <h3>Withdraw in-progress requests</h3>
        <p>
          Only requests that are still within the online withdrawal window appear here. Use this page to withdraw a
          request before {requestDeadline}. All other request history stays in View Enrolment Results.
        </p>
        <div className="focus-action-row">
          <button type="button" className="mini-button" onClick={() => onNavigate?.("results")}>
            View enrolment results
          </button>
          <button type="button" className="mini-button" onClick={() => onNavigate?.("add")}>
            Course Center
          </button>
        </div>
      </section>

      <section className="page-panel page-panel--results-pending page-panel--withdraw-list">
        <h3>Requests you can still withdraw</h3>
        {records.length > 0 ? <p className="withdraw-list-summary">{requestCountLabel}</p> : null}
        <div className="withdraw-card-stack">
          {records.length === 0 ? (
            <div className="course-group__empty">
              No request can be withdrawn online right now. Use View Enrolment Results to monitor requests that are still
              being processed.
            </div>
          ) : null}
          {records.map((record) => (
            <WithdrawCard
              key={record.id}
              record={record}
              busyCourseId={busyCourseId}
              onAction={onAction}
              onInspectRecord={onInspectRecord}
            />
          ))}
        </div>
        {records.length > 0 ? (
          <div className="withdraw-card-note">
            End of withdrawable requests. Other request history remains in View Enrolment Results.
          </div>
        ) : null}
      </section>
    </div>
  );
}
