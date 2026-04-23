import { formatSemesterLabel, resolveAnnouncementContent } from "../portalContent";
import { SimpleTable } from "../components/PortalShared";

function parseDisplayDate(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  const monthMap = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const singleMatch = text.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (singleMatch) {
    return new Date(`${singleMatch[3]}-${monthMap[singleMatch[2]]}-${singleMatch[1].padStart(2, "0")}T23:59:59`);
  }

  const rangeMatch = text.match(/^(\d{1,2})[–-](\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (rangeMatch) {
    return new Date(`${rangeMatch[4]}-${monthMap[rangeMatch[3]]}-${rangeMatch[2].padStart(2, "0")}T23:59:59`);
  }

  return null;
}

function buildCycleSummary(content, referenceDate) {
  const now = referenceDate ?? new Date();
  const requestClose = parseDisplayDate(content.keyDates?.requestClose);
  const addDropClose = parseDisplayDate(content.keyDates?.addDropClose);
  const resultCheck = parseDisplayDate(content.keyDates?.resultCheckWindow);

  if (resultCheck && now > resultCheck) {
    return {
      headline: "This enrolment cycle has finished.",
      detail: "Online requests and add/drop changes are closed for this cycle. Use this page as a reference archive for the published schedule.",
      items: [
        ["Request deadline", content.keyDates?.requestClose],
        ["Add / Drop deadline", content.keyDates?.addDropClose],
        ["Record check window", content.keyDates?.resultCheckWindow],
        ["Support", content.keyDates?.supportContact],
      ],
    };
  }

  if (addDropClose && now <= addDropClose) {
    return {
      headline: "Add / Drop is still open.",
      detail: "Use Course Center for any final online changes before the Add / Drop deadline.",
      items: [
        ["Request deadline", content.keyDates?.requestClose],
        ["Add / Drop deadline", content.keyDates?.addDropClose],
        ["Record check window", content.keyDates?.resultCheckWindow],
        ["Support", content.keyDates?.supportContact],
      ],
    };
  }

  if (requestClose && now <= requestClose) {
    return {
      headline: "The request period is still open.",
      detail: "Review the published schedule below, then return to Course Center to finalise requests before the deadline.",
      items: [
        ["Request deadline", content.keyDates?.requestClose],
        ["Add / Drop deadline", content.keyDates?.addDropClose],
        ["Record check window", content.keyDates?.resultCheckWindow],
        ["Support", content.keyDates?.supportContact],
      ],
    };
  }

  return {
    headline: "Key dates for this cycle",
    detail: "Use the schedule below to review the published timeline and support route.",
    items: [
      ["Request deadline", content.keyDates?.requestClose],
      ["Add / Drop deadline", content.keyDates?.addDropClose],
      ["Record check window", content.keyDates?.resultCheckWindow],
      ["Support", content.keyDates?.supportContact],
    ],
  };
}

export function AnnouncementPage({ semester, announcementContent }) {
  const content = resolveAnnouncementContent(announcementContent);
  const semesterTitle = formatSemesterLabel(semester, {
    fallback: "Semester 2, 2025-26",
  });
  const referenceDate = semester?.currentDate ? new Date(`${semester.currentDate}T12:00:00`) : new Date();
  const cycleSummary = buildCycleSummary(content, referenceDate);

  return (
    <div className="page-stack">
      <section className="page-panel page-panel--focus">
        <h3>Current cycle</h3>
        <div className="announcement-highlights">
          {cycleSummary.items.map(([label, value]) => (
            <div key={`${label}-${value}`} className="announcement-highlight">
              <strong>{label}</strong>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <p className="announcement-summary-copy">
          <strong>{cycleSummary.headline}</strong>
          <span>{cycleSummary.detail}</span>
        </p>
        <nav className="announcement-jumps" aria-label="Announcement page sections">
          <span className="announcement-jumps__label">Jump to</span>
          <a href="#announcement-schedule">Schedule</a>
          <a href="#announcement-add-drop">Add / Drop</a>
          <a href="#announcement-guidelines">Guidance</a>
          <a href="#announcement-important-notes">Important notes</a>
        </nav>
      </section>

      <section className="page-panel announcement-anchor-target" id="announcement-schedule" tabIndex={-1}>
        <h3>Course selection schedule ({semesterTitle})</h3>
        <SimpleTable
          headers={["Date", "Event"]}
          rows={content.selectionSchedule}
          caption={`Course selection schedule for ${semesterTitle}`}
        />
      </section>

      <section className="page-panel announcement-anchor-target" id="announcement-add-drop" tabIndex={-1}>
        <h3>Add / Drop schedule ({semesterTitle})</h3>
        <SimpleTable
          headers={["Date", "Event"]}
          rows={content.addDropSchedule}
          caption={`Add / Drop schedule for ${semesterTitle}`}
        />
      </section>

      <section className="page-panel page-panel--compact page-panel--note announcement-anchor-target" id="announcement-visa" tabIndex={-1}>
        <h3>Student visa reminder (if applicable)</h3>
        <p>{content.visaReminder}</p>
      </section>

      <section className="page-panel page-panel--compact announcement-anchor-target" id="announcement-guidelines" tabIndex={-1}>
        <h3>Published guidance</h3>
        <div className="announcement-guidance">
          <p>
            <strong>Published by:</strong> {content.publishedBy}
          </p>
          <p>
            <strong>Published:</strong> {content.publishedAt}
          </p>
        </div>
      </section>

      {content.maintenanceNotice ? (
        <section className="page-panel page-panel--compact announcement-anchor-target" id="announcement-important-notes" tabIndex={-1}>
          <h3>Important notes</h3>
          <p>{content.maintenanceNotice}</p>
        </section>
      ) : null}
    </div>
  );
}
