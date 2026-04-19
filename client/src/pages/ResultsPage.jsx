import { AcademicSummaryStrip, EmptyTableRow, StatusText, TableSection } from "../components/PortalShared";
import { getListTypeClass, getRecordTone } from "../portalModel";

function RecordRow({ record, archived = false, onNavigate = null }) {
  return (
    <tr className={archived ? "portal-row portal-row--archived" : undefined}>
      <td>{record.course.semester}</td>
      <td>{record.course.code}</td>
      <td>{record.course.subclass}</td>
      <td>
        <span className={getListTypeClass(record.course.listType)}>{record.course.listType}</span>
      </td>
      <td>{record.course.credits}</td>
      <td>{record.course.title}</td>
      <td>
        <StatusText tone={getRecordTone(record.status)}>{record.statusLabel}</StatusText>
      </td>
      <td>
        <div className="cell-title">
          <strong>{record.course.faculty}</strong>
          <span>{record.course.policyLabel}</span>
        </div>
      </td>
      <td>{record.message}</td>
      <td>{record.nextStep}</td>
      {onNavigate ? (
        <td>
          <div className="cell-actions cell-actions--stacked">
            <button type="button" className="mini-button" onClick={() => onNavigate("cancel")}>
              Go to cancel
            </button>
            <button
              type="button"
              className="mini-button"
              onClick={() => onNavigate({ page: "add", courseId: record.course.id })}
            >
              Back to course
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

export function ResultsPage({
  student,
  semester,
  summary,
  systemMeta,
  approvedCourses,
  requestRecords,
  requestStatusView,
  onNavigate,
  onRefresh,
}) {
  const currentEnrolment = requestStatusView?.currentEnrolment ?? approvedCourses;
  const activeRecords =
    requestStatusView?.activeRequests ?? requestRecords.filter((record) => record.active);
  const historyRecords =
    requestStatusView?.archivedChanges ?? requestRecords.filter((record) => !record.active);
  const nextAction = requestStatusView?.nextAction;
  const academicYearLabel = semester?.academicYear ?? student?.admissionYear ?? "N/A";

  const nextActionButtons = activeRecords.length > 0
    ? [
        {
          label: "Go to cancel",
          onClick: () => onNavigate?.("cancel"),
        },
        {
          label: "Back to Course Center",
          onClick: () => onNavigate?.("add"),
        },
      ]
    : [
        {
          label: "Back to Course Center",
          onClick: () => onNavigate?.("add"),
        },
      ];

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

      {nextAction ? (
        <section className="page-panel page-panel--focus">
          <h3>What to do next</h3>
          <p>
            <strong>{nextAction.headline}</strong>
          </p>
          <p>{nextAction.detail}</p>
          <div className="action-list">
            {(nextAction.actions?.length
              ? nextAction.actions
              : ["Review the sections below to confirm what is final, what is still active, and what has already been archived."]).map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
          <div className="focus-action-row">
            {nextActionButtons.map((action) => (
              <button key={action.label} type="button" className="mini-button" onClick={action.onClick}>
                {action.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <TableSection
        title="Current Enrolment"
        panelClassName="page-panel--results-current"
        tableAriaLabel="Current enrolment table"
        headers={[
          "Academic Year",
          "Sem",
          "Course Code",
          "Subclass",
          "Course Type",
          "Credit",
          "Course Title",
          "Faculty / Policy",
          "Status",
        ]}
      >
        {currentEnrolment.length === 0 ? <EmptyTableRow colSpan={9} message="No course is currently enrolled." /> : null}
        {currentEnrolment.map((course) => (
          <tr key={course.id}>
            <td>{academicYearLabel}</td>
            <td>{course.semester}</td>
            <td>{course.code}</td>
            <td>{course.subclass}</td>
            <td>
              <span className={getListTypeClass(course.listType)}>{course.listType}</span>
            </td>
            <td>{course.credits}</td>
            <td>{course.title}</td>
            <td>
              <div className="cell-title">
                <strong>{course.faculty}</strong>
                <span>{course.policyLabel}</span>
              </div>
            </td>
            <td>
              <StatusText tone="success">{course.currentState.kind === "approved" ? "Approved" : "Pending"}</StatusText>
            </td>
          </tr>
        ))}
      </TableSection>

      <TableSection
        title="Active Requests"
        panelClassName="page-panel--results-pending"
        tableAriaLabel="Active request status table"
        headers={[
          "Sem",
          "Course Code",
          "Subclass",
          "Course Type",
          "Credit",
          "Course Title",
          "Enrolment Status",
          "Faculty / Policy",
          "Message",
          "Next Step",
          "Actions",
        ]}
      >
        {activeRecords.length === 0 ? (
          <EmptyTableRow colSpan={11} message="No active request is currently pending." />
        ) : null}
        {activeRecords.map((record) => (
          <RecordRow key={record.id} record={record} onNavigate={onNavigate} />
        ))}
      </TableSection>

      <TableSection
        title="Archived Changes"
        panelClassName="page-panel--results-history"
        tableAriaLabel="Archived enrolment changes table"
        headers={[
          "Sem",
          "Course Code",
          "Subclass",
          "Course Type",
          "Credit",
          "Course Title",
          "Status",
          "Faculty / Policy",
          "Message",
          "Next Step",
        ]}
      >
        {historyRecords.length === 0 ? (
          <EmptyTableRow colSpan={10} message="No archived cancellation or drop record." />
        ) : null}
        {historyRecords.map((record) => (
          <RecordRow key={record.id} record={record} archived />
        ))}
      </TableSection>
    </div>
  );
}
