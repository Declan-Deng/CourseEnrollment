import { AcademicSummaryStrip, EmptyTableRow, StatusText, TableSection } from "../components/PortalShared";
import { getListTypeClass, getListTypeLabel, getPolicyTagMeta, getRecordTone } from "../portalModel";

function RecordRow({ record, archived = false, onNavigate = null }) {
  const policyMeta = getPolicyTagMeta(record.course);

  return (
    <tr className={archived ? "portal-row portal-row--archived" : undefined}>
      <td data-mobile-label="Sem">{record.course.semester}</td>
      <td data-mobile-label="Course">
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
      </td>
      <td data-mobile-label={archived ? "Status" : "Enrolment status"}>
        <StatusText tone={getRecordTone(record.status)}>{record.statusLabel}</StatusText>
      </td>
      <td data-mobile-label="Message / next step">
        <div className="cell-title">
          <strong>{record.message}</strong>
          <span>{record.nextStep}</span>
        </div>
      </td>
      {onNavigate ? (
        <td data-mobile-label="Actions">
          <div className="cell-actions">
            {record.withdrawable ? (
              <button type="button" className="mini-button" onClick={() => onNavigate("cancel")}>
                Go to withdrawal page
              </button>
            ) : null}
            <button
              type="button"
              className="mini-button"
              onClick={() => onNavigate({ page: "add", courseId: record.course.id })}
            >
              Open course page
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
  const withdrawableRecords =
    requestStatusView?.withdrawableRequests ?? activeRecords.filter((record) => record.withdrawable);
  const historyRecords =
    requestStatusView?.archivedChanges ?? requestRecords.filter((record) => !record.active);
  const nextAction = requestStatusView?.nextAction;
  const academicYearLabel = semester?.academicYear ?? student?.admissionYear ?? "N/A";

  const nextActionButtons = withdrawableRecords.length > 0
    ? [
        {
          label: "Manage active requests",
          onClick: () => onNavigate?.("cancel"),
        },
        {
          label: "Course Center",
          onClick: () => onNavigate?.("add"),
        },
      ]
    : [
        {
          label: "Course Center",
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
        onRefresh={onRefresh}
      />

      {nextAction ? (
        <section className="page-panel page-panel--focus">
          <h3>What to do next</h3>
          <p>
            <strong>{nextAction.headline}</strong>
          </p>
          <p>{nextAction.detail}</p>
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
          "Course",
          "Credit",
          "Status",
        ]}
      >
        {currentEnrolment.length === 0 ? <EmptyTableRow colSpan={5} message="No course is currently enrolled." /> : null}
        {currentEnrolment.map((course) => (
          <tr key={course.id}>
            <td>{academicYearLabel}</td>
            <td>{course.semester}</td>
            <td>
              <div className="cell-title">
                <strong>{course.code}</strong>
                <span>{course.title}</span>
                <div className="tag-row">
                  <span className={getListTypeClass(course.listType)} title={getListTypeLabel(course.listType)}>
                    {course.listType}
                  </span>
                  <span className="soft-tag soft-tag--subclass">Subclass {course.subclass}</span>
                  <span className="soft-tag soft-tag--policy-compact">{getPolicyTagMeta(course).label}</span>
                </div>
              </div>
            </td>
            <td>{course.credits} credits</td>
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
          "Course",
          "Enrolment status",
          "Message / next step",
          "Actions",
        ]}
      >
        {activeRecords.length === 0 ? (
          <EmptyTableRow colSpan={5} message="No active request is currently pending." />
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
          "Course",
          "Status",
          "Message / next step",
        ]}
      >
        {historyRecords.length === 0 ? (
          <EmptyTableRow colSpan={4} message="No archived withdrawals or closed requests yet." />
        ) : null}
        {historyRecords.map((record) => (
          <RecordRow key={record.id} record={record} archived />
        ))}
      </TableSection>
    </div>
  );
}
