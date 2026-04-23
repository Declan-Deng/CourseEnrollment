import { formatSemesterLabel, resolveAnnouncementContent } from "../portalContent";

function ScheduleTable({ title, rows }) {
  return (
    <section className="legacy-enrolment__block">
      <h3>{title}</h3>
      <table className="legacy-enrolment__table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Event</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([date, event]) => (
            <tr key={date}>
              <td>{date}</td>
              <td>{event}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function OnlineEnrolmentPage({ semester, announcementContent }) {
  const content = resolveAnnouncementContent(announcementContent);
  const semesterTitle = formatSemesterLabel(semester);
  const highlights = content.highlights ?? [];

  return (
    <div className="legacy-enrolment">
      {highlights.length ? (
        <section className="page-panel page-panel--focus">
          <h3>Current cycle snapshot</h3>
          <div className="announcement-highlights">
            {highlights.map((item) => (
              <div key={`${item.label}-${item.value}`} className="announcement-highlight">
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
          <nav className="announcement-jumps" aria-label="Online enrolment page sections">
            <span className="announcement-jumps__label">Jump to</span>
            <a href="#online-schedule">Schedule</a>
            <a href="#online-guidelines">Guidelines</a>
            <a href="#online-study-load">Study Load</a>
            <a href="#online-important-notes">Important Notes</a>
          </nav>
        </section>
      ) : null}

      <section className="legacy-enrolment__visa announcement-anchor-target" id="online-visa" tabIndex={-1}>
        <h3>Reminder - Student Visa</h3>
        <p>
          {content.visaReminder} For more details, please visit{" "}
          <a href="https://www.studentvisa.hku.hk" target="_blank" rel="noreferrer">
            https://www.studentvisa.hku.hk
          </a>
          .
        </p>
      </section>

      <section className="legacy-enrolment__sheet announcement-anchor-target" id="online-schedule" tabIndex={-1}>
        <div className="legacy-enrolment__center-title">
          <p>THE UNIVERSITY OF HONG KONG</p>
          <p>FACULTY OF ENGINEERING</p>
          <h2>Online Course Enrolment Schedule for MSc(Eng) Students</h2>
          <span>-</span>
        </div>

        <ScheduleTable
          title={`Course Selection Schedule (${semesterTitle})`}
          rows={content.selectionSchedule}
        />
        <ScheduleTable title={`Add / Drop schedule (${semesterTitle})`} rows={content.addDropSchedule} />

        <p className="legacy-enrolment__signature">
          {content.publishedBy}
          <br />
          {content.publishedAt}
        </p>
      </section>

      <section
        className="legacy-enrolment__sheet legacy-enrolment__sheet--guidelines announcement-anchor-target"
        id="online-guidelines"
        tabIndex={-1}
      >
        <div className="legacy-enrolment__center-title">
          <p>THE UNIVERSITY OF HONG KONG</p>
          <p>FACULTY OF ENGINEERING</p>
          <h2>Course Enrolment Guidelines for MSc(Eng) Students (2025-26)</h2>
        </div>

        {content.guidelineBlocks.map((block) => (
          <section key={block.title} className="legacy-enrolment__guideline">
            <h3>{block.title}</h3>
            {block.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {block.bullets ? (
              <ul>
                {block.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {block.link ? (
              <p>
                <a href={block.link.href} target="_blank" rel="noreferrer">
                  {block.link.label}
                </a>
              </p>
            ) : null}
            {block.boxedLinks ? (
              <div className="legacy-enrolment__link-box">
                {block.boxedLinks.map(([label, href]) => (
                  <p key={label}>
                    <strong>{label}:</strong>{" "}
                    <a href={href} target="_blank" rel="noreferrer">
                      {href}
                    </a>
                  </p>
                ))}
              </div>
            ) : null}
            {block.title === "1.3 Nominal Study Load Per Semester" ? (
              <table
                className="legacy-enrolment__table legacy-enrolment__table--studyload announcement-anchor-target"
                id="online-study-load"
                tabIndex={-1}
              >
                <thead>
                  <tr>
                    <th>Dept</th>
                    <th>Programme</th>
                    <th>Full-time students</th>
                    <th>Part-time students</th>
                  </tr>
                </thead>
                <tbody>
                  {content.nominalStudyLoad.map(([dept, programme, fullTime, partTime], index) => (
                    <tr key={`${dept}-${programme}-${index}`}>
                      <td>{dept}</td>
                      <td>{programme}</td>
                      <td>{fullTime}</td>
                      <td>{partTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {block.emphasis ? (
              <p className="legacy-enrolment__emphasis announcement-anchor-target" id="online-important-notes" tabIndex={-1}>
                {block.emphasis}
              </p>
            ) : null}
          </section>
        ))}

        <p className="legacy-enrolment__signature">{content.publishedAt}</p>
      </section>
    </div>
  );
}
