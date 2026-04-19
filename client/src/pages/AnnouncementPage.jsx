import { formatSemesterLabel, resolveAnnouncementContent } from "../portalContent";
import { SimpleTable } from "../components/PortalShared";

export function AnnouncementPage({ semester, announcementContent }) {
  const content = resolveAnnouncementContent(announcementContent);
  const semesterTitle = formatSemesterLabel(semester, {
    fallback: "Second Semester of 2025-26",
    stripSemesterPrefix: true,
  });
  const highlights = content.highlights ?? [];
  const keyDateRows = [
    ["Request close", content.keyDates?.requestClose],
    ["Add/drop close", content.keyDates?.addDropClose],
    ["Result check window", content.keyDates?.resultCheckWindow],
    ["Lottery publication", content.keyDates?.lotteryPublish],
    ["Support contact", content.keyDates?.supportContact],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="page-stack">
      {highlights.length ? (
        <section className="page-panel page-panel--focus">
          <h3>What matters now</h3>
          <div className="announcement-highlights">
            {highlights.map((item) => (
              <div key={`${item.label}-${item.value}`} className="announcement-highlight">
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
          <nav className="announcement-jumps" aria-label="Announcement page sections">
            <a href="#announcement-schedule">Schedule</a>
            <a href="#announcement-guidelines">Guidelines</a>
            <a href="#announcement-key-dates">Key dates</a>
            <a href="#announcement-important-notes">Important notes</a>
          </nav>
        </section>
      ) : null}

      <section className="page-panel announcement-anchor-target" id="announcement-visa" tabIndex={-1}>
        <h3>Reminder - Student Visa</h3>
        <p>{content.visaReminder}</p>
      </section>

      <section className="page-panel announcement-anchor-target" id="announcement-schedule" tabIndex={-1}>
        <h3>Course Selection Schedule ({semesterTitle})</h3>
        <SimpleTable
          headers={["Date", "Event"]}
          rows={content.selectionSchedule}
          caption={`Course selection schedule for ${semesterTitle}`}
        />
      </section>

      <section className="page-panel announcement-anchor-target" id="announcement-add-drop" tabIndex={-1}>
        <h3>Add/Drop Schedule ({semesterTitle})</h3>
        <SimpleTable
          headers={["Date", "Event"]}
          rows={content.addDropSchedule}
          caption={`Add or drop schedule for ${semesterTitle}`}
        />
      </section>

      <section className="page-panel announcement-anchor-target" id="announcement-key-dates" tabIndex={-1}>
        <h3>Current Key Dates</h3>
        <SimpleTable headers={["Item", "Timeline"]} rows={keyDateRows} caption="Current key dates" />
      </section>

      {content.maintenanceNotice ? (
        <section className="page-panel announcement-anchor-target" id="announcement-important-notes" tabIndex={-1}>
          <h3>System Maintenance</h3>
          <p>{content.maintenanceNotice}</p>
        </section>
      ) : null}

      <section className="page-panel announcement-anchor-target" id="announcement-guidelines" tabIndex={-1}>
        <h3>Published By</h3>
        <p>
          {content.publishedBy}
          <br />
          {content.publishedAt}
        </p>
      </section>
    </div>
  );
}
