import {
  AcademicSummaryStrip,
  EmptyTableRow,
  StatusText,
  TableSection,
} from "../components/PortalShared";
import { getRecordTone } from "../portalModel";
import { getActivatableRowProps } from "../rowActivation";

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

  return (
    <div className="page-stack">
      <AcademicSummaryStrip
        student={student}
        semester={semester}
        summary={summary}
        systemMeta={systemMeta}
        title="Academic Summary"
        showUrgentActions
        onRefresh={onRefresh}
      />

      <section className="page-panel page-panel--focus">
        <h3>Withdrawal guidance</h3>
        <p>
          Only requests that are still in progress appear here. Review all course outcomes in View Enrolment Results,
          and use this page only if you want to withdraw a request before {requestDeadline}.
        </p>
        <div className="focus-action-row">
          <button type="button" className="mini-button" onClick={() => onNavigate?.("results")}>
            Back to results
          </button>
          <button type="button" className="mini-button" onClick={() => onNavigate?.("add")}>
            Return to Course Center
          </button>
        </div>
      </section>

      <TableSection
        title="Enrolment Form (Cancel Enrolment Request)"
        tableAriaLabel="Cancellable active request table"
        headers={[
          "Action",
          "Course Code",
          "Semester",
          "Subclass",
          "Credit",
          "Course Title",
          "Policy",
          "Current Enrolment Status",
          "Message",
          "Next Step",
        ]}
      >
        {records.length === 0 ? <EmptyTableRow colSpan={10} message="No cancellable request at the moment." /> : null}
        {records.map((record) => (
          <tr key={record.id} className="portal-row">
            <td onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="mini-button mini-button--primary"
                onClick={() => onAction(record.course)}
                disabled={busyCourseId === record.course.id}
              >
                {busyCourseId === record.course.id ? "…" : "Cancel"}
              </button>
            </td>
            <td>{record.course.code}</td>
            <td>{record.course.semester}</td>
            <td>{record.course.subclass}</td>
            <td>{record.course.credits}</td>
            <td>
              <div className="cell-title cell-title--inspectable" {...getActivatableRowProps(() => onInspectRecord(record))}>
                <strong>{record.course.title}</strong>
                <span>{record.course.code}</span>
              </div>
            </td>
            <td>{record.course.policyLabel}</td>
            <td>
              <StatusText tone={getRecordTone(record.status)}>{record.statusLabel}</StatusText>
            </td>
            <td>{record.message}</td>
            <td>{record.nextStep}</td>
          </tr>
        ))}
      </TableSection>
    </div>
  );
}
