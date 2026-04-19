import { useState } from "react";
import { timetableAnnouncements, timetableSemesterGroups } from "../portalContent";

export function TimetablePage() {
  const [selectedLink, setSelectedLink] = useState({
    semester: "Second Semester",
    programme: "MSc(Eng)",
  });

  return (
    <div className="legacy-page legacy-page--timetable">
      <p className="legacy-alert">
        Please note that timetable of each programme is subject to minor amendment(s). Please check the change(s) of
        timetable in the "Announcement" section on the right.
      </p>

      <div className="legacy-timetable">
        <aside className="legacy-timetable__menu">
          <div className="legacy-timetable__year">2025-2026</div>
          {timetableSemesterGroups.map((group) => (
            <section key={group.title} className="legacy-timetable__group">
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={`${group.title}-${item}`}>
                    <button
                      type="button"
                      className={
                        selectedLink.semester === group.title && selectedLink.programme === item
                          ? "legacy-timetable__link legacy-timetable__link--active"
                          : "legacy-timetable__link"
                      }
                      onClick={() => setSelectedLink({ semester: group.title, programme: item })}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <section className="legacy-timetable__board">
          <div className="legacy-timetable__board-head">Announcement</div>
          <div className="legacy-timetable__selection">
            <strong>{selectedLink.semester}</strong>
            <span>{selectedLink.programme}</span>
            <p>
              Select a programme link to keep the current announcement context in view while reviewing the timetable
              release notices on the right.
            </p>
          </div>
          <div className="legacy-timetable__rows">
            {timetableAnnouncements.map(([term, date, message]) => (
              <div key={term} className="legacy-timetable__row">
                <strong>{term}</strong>
                <div className="legacy-timetable__row-grid">
                  <span>{date}</span>
                  <span>{message}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
