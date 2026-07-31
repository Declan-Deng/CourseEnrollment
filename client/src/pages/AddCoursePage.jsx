import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AcademicSummaryStrip, WindowStatusStrip } from "../components/PortalShared";
import {
  applyGroupViewControls,
  createDefaultGroupViewControls,
  createGroupedCourses,
  formatOfferingCount,
  formatSchedule,
  getCourseGroup,
  getCourseGroups,
  getCourseRowClass,
  getListTypeClass,
  getListTypeLabel,
  getPolicyCompactMeta,
  getPrimaryAction,
  getRuleSummary,
  getSubclassClass,
  matchesGroupViewFilters,
  toMinutes,
} from "../portalModel";

const COURSE_GROUPS = getCourseGroups();
const TIMETABLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const COLLAPSE_ANIMATION_MS = 180;
const GROUP_SCHEDULE_FILTER_OPTIONS = [
  { value: "all", label: "All schedules" },
  { value: "scheduled", label: "Fixed schedule only" },
  { value: "unscheduled", label: "No fixed slot" },
  { value: "day:Mon", label: "Monday" },
  { value: "day:Tue", label: "Tuesday" },
  { value: "day:Wed", label: "Wednesday" },
  { value: "day:Thu", label: "Thursday" },
  { value: "day:Fri", label: "Friday" },
];

const GROUP_CAPACITY_FILTER_OPTIONS = [
  { value: "all", label: "All capacity states" },
  { value: "seats-open", label: "Seats open" },
  { value: "limited", label: "Limited / almost full" },
  { value: "high-demand", label: "High demand" },
  { value: "waiting", label: "Waiting list visible" },
];

const GROUP_RULE_FILTER_OPTIONS = [
  { value: "all", label: "All guidance" },
  { value: "can-request", label: "Can request" },
  { value: "in-progress", label: "Request in progress" },
  { value: "enrolled", label: "Already enrolled" },
  { value: "blocked-plan", label: "Blocked by your plan" },
  { value: "quota", label: "Quota / limit issue" },
  { value: "duplicate", label: "Duplicate course" },
  { value: "closed", label: "Closed by system" },
  { value: "cannot-request", label: "Cannot request" },
];

function buildInitialGroupControls() {
  return Object.fromEntries(COURSE_GROUPS.map((group) => [group.id, createDefaultGroupViewControls()]));
}

function buildSelectOptions(values, allLabel) {
  return [
    { value: "all", label: allLabel },
    ...values.map((value) => ({ value, label: value })),
  ];
}

function getGroupControlOptions(courses) {
  const faculties = [...new Set(courses.map((course) => course.faculty))].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
  const listTypes = [...new Set(courses.map((course) => course.listType))].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
  const typeOptions = buildSelectOptions(listTypes, "All types");

  if (courses.some((course) => course.crossFaculty)) {
    typeOptions.push({ value: "crossFaculty", label: "Cross-faculty" });
  }

  return {
    facultyOptions: buildSelectOptions(faculties, "All faculties"),
    typeOptions,
    policyOptions: buildSelectOptions(
      [...new Set(courses.map((course) => getPolicyCompactMeta(course).label))].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
      "All policies",
    ),
  };
}

function getScrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
}

function scrollNodeIntoViewIfNeeded(node) {
  const rect = node.getBoundingClientRect();
  const topBoundary = 118;
  const bottomBoundary = window.innerHeight - 28;

  if (rect.top >= topBoundary && rect.bottom <= bottomBoundary) {
    return;
  }

  node.scrollIntoView({
    behavior: getScrollBehavior(),
    block: "nearest",
    inline: "nearest",
  });
}

function AnimatedGroupBody({ expanded, children, collapsedNote, animation = "height" }) {
  const timerRef = useRef(0);
  const [renderBody, setRenderBody] = useState(expanded);
  const [visible, setVisible] = useState(expanded);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  useEffect(() => {
    if (expanded && !renderBody) {
      setRenderBody(true);
    }
  }, [expanded, renderBody]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    window.clearTimeout(timerRef.current);

    if (animation === "none" || reducedMotion) {
      setRenderBody(expanded);
      setVisible(expanded);
      return undefined;
    }

    if (expanded) {
      setRenderBody(true);
      timerRef.current = window.setTimeout(() => {
        setVisible(true);
      }, 16);
      return undefined;
    }

    setVisible(false);
    timerRef.current = window.setTimeout(() => {
      if (!expanded) {
        setRenderBody(false);
      }
    }, COLLAPSE_ANIMATION_MS);

    return undefined;
  }, [expanded, animation, reducedMotion]);

  const bodyClassName = `course-group__body${visible ? " course-group__body--visible" : ""}${
    animation === "fade" ? " course-group__body--fade" : ""
  }`;

  return (
    <>
      {renderBody ? (
        <div className={bodyClassName} aria-hidden={!expanded}>
          <div className="course-group__body-inner">{children}</div>
        </div>
      ) : null}

      {!expanded && !renderBody && collapsedNote ? (
        <div className="course-group__note">
          <div className="course-group__note-inner">{collapsedNote}</div>
        </div>
      ) : null}
    </>
  );
}

function InlineCourseLink({ text, linkedCourseCode, onJump }) {
  if (!text) {
    return <span>Not available.</span>;
  }

  if (!linkedCourseCode || !text.includes(linkedCourseCode)) {
    return <span>{text}</span>;
  }

  const [before, after] = text.split(linkedCourseCode);

  return (
    <span>
      {before}
      <button
        type="button"
        className="inline-course-link"
        onClick={(event) => {
          event.stopPropagation();
          onJump();
        }}
      >
        {linkedCourseCode}
      </button>
      {after}
    </span>
  );
}

const FilterSummaryBar = memo(function FilterSummaryBar({ chips, onClearAll }) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="toolbar-summary" aria-label="Active filters">
      <strong>Active filters</strong>
      <div className="toolbar-summary__chips">
        {chips.map((chip) => (
          <span key={chip} className="toolbar-summary__chip">
            {chip}
          </span>
        ))}
      </div>
      <button type="button" className="toolbar-summary__clear" onClick={onClearAll}>
        Clear
      </button>
    </div>
  );
});

const TimetablePanel = memo(function TimetablePanel({ timetable, selectedCourse }) {
  const selectedSummary = useMemo(
    () => (selectedCourse ? getRuleSummary(selectedCourse) : null),
    [selectedCourse],
  );
  const selectedEntry = useMemo(
    () =>
      selectedCourse && selectedCourse.schedule?.length
        ? {
            id: selectedCourse.id,
            code: selectedCourse.code,
            title: selectedCourse.title,
            subclass: selectedCourse.subclass,
            schedule: selectedCourse.schedule,
            tone: "candidate",
          }
        : null,
    [selectedCourse],
  );
  const entries = useMemo(() => {
    if (!selectedEntry) {
      return timetable;
    }

    return timetable.some((entry) => entry.id === selectedEntry.id) ? timetable : [...timetable, selectedEntry];
  }, [selectedEntry, timetable]);
  const visibleCount = useMemo(
    () => entries.filter((entry) => (entry.schedule ?? []).length > 0).length,
    [entries],
  );
  const slotsByDay = useMemo(
    () =>
      Object.fromEntries(
        TIMETABLE_DAYS.map((day) => [
          day,
          entries
            .flatMap((entry) =>
              (entry.schedule ?? [])
                .filter((slot) => slot.day === day)
                .map((slot) => ({ ...entry, slot })),
            )
            .sort((left, right) => toMinutes(left.slot.start) - toMinutes(right.slot.start)),
        ]),
      ),
    [entries],
  );

  const collapsedNote = selectedCourse ? (
    <div className="course-group__compact-note">
      <strong>Watching {selectedCourse.code}</strong>
      <span>
        {selectedSummary?.variant === "clash"
          ? selectedSummary.reasonText
          : `Open the weekly grid to compare this offering with ${Math.max(visibleCount - 1, 0)} planned class ${
              Math.max(visibleCount - 1, 0) === 1 ? "block" : "blocks"
            }.`}
      </span>
    </div>
  ) : (
    <div className="course-group__compact-note">
      <strong>Timetable comparison is idle</strong>
      <span>Select a course below only when you want to compare it against your current class pattern.</span>
    </div>
  );

  return (
    <div className="timetable-panel">
      <div className="timetable-panel__summary">
        {collapsedNote}
        <span className="course-group__count">{visibleCount}</span>
      </div>
      <div className="timetable-board">
        {TIMETABLE_DAYS.map((day) => {
          const slots = slotsByDay[day] ?? [];

          return (
            <div key={day} className="timetable-day">
              <strong>{day}</strong>
              <div className="timetable-day__body">
                {slots.length === 0 ? <span className="status-text status-text--muted">No class</span> : null}
                {slots.map((entry) => (
                  <div key={`${day}-${entry.id}-${entry.slot.start}`} className={`tt-chip tt-chip--${entry.tone}`}>
                    <strong>
                      {entry.code} {entry.subclass}
                    </strong>
                    <span>
                      {entry.slot.start} - {entry.slot.end}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const InspectionTray = memo(function InspectionTray({ selectedCourse, timetable }) {
  const [expanded, setExpanded] = useState(Boolean(selectedCourse));

  useEffect(() => {
    if (selectedCourse) {
      setExpanded(true);
    }
  }, [selectedCourse]);

  const compactNote = selectedCourse ? `${selectedCourse.code} selected for timetable comparison.` : "";

  return (
    <section className={`page-panel page-panel--inspection${expanded ? "" : " page-panel--inspection-collapsed"}`}>
      <button type="button" className="course-group__header" onClick={() => setExpanded((currentValue) => !currentValue)}>
        <span className="course-group__title-block">
          <span className="course-group__title">Timetable-aware view</span>
          {compactNote ? <span className="course-group__description">{compactNote}</span> : null}
        </span>
        <span className="course-group__toggle">{expanded ? "Hide" : "Show"}</span>
      </button>
      <AnimatedGroupBody expanded={expanded} animation="fade" collapsedNote={null}>
        <div className="inspection-tray">
          <TimetablePanel timetable={timetable} selectedCourse={selectedCourse} />
        </div>
      </AnimatedGroupBody>
    </section>
  );
});

const RulePreviewCell = memo(function RulePreviewCell({ course, onLocateCourse }) {
  const summary = getRuleSummary(course);
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(summary.reasonText || summary.nextText);

  return (
    <div className="rule-preview">
      <span className={`preview-pill preview-pill--${summary.variant}`}>{summary.conclusion}</span>
      {hasDetail ? (
        <button
          type="button"
          className="rule-preview__link"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((currentValue) => !currentValue);
          }}
          aria-expanded={expanded}
        >
          {expanded ? "Hide guidance" : "Guidance"}
        </button>
      ) : null}
      {expanded && summary.reasonText ? (
        <div className="rule-preview__line">
          <strong>Reason:</strong>
          <InlineCourseLink
            text={summary.reasonText}
            linkedCourseCode={summary.linkedCourseCode}
            onJump={() => onLocateCourse(course, summary.linkedCourseCode)}
          />
        </div>
      ) : null}
      {expanded && summary.nextText ? (
        <div className="rule-preview__line">
          <strong>Next:</strong>
          <InlineCourseLink
            text={summary.nextText}
            linkedCourseCode={summary.linkedCourseCode}
            onJump={() => onLocateCourse(course, summary.linkedCourseCode)}
          />
        </div>
      ) : null}
    </div>
  );
});

const CapacityDemandCell = memo(function CapacityDemandCell({ course }) {
  const primary = course.capacityView?.primary ?? "Not available";
  const secondary = course.capacityView?.secondary ?? "";
  const capacityLabel = course.capacityView?.capacityLabel ?? "";
  const lotteryMatch = secondary.match(/^Lottery pool · (.+)$/);
  const isFacultyReviewQueue = secondary === "Faculty review queue";
  const rows = [];

  if (lotteryMatch) {
    const claimedMatch = lotteryMatch[1].match(/^(\d+)\/(\d+) seats claimed before draw$/);
    const claimedLabel = capacityLabel || (claimedMatch ? `${claimedMatch[1]} / ${claimedMatch[2]} claimed` : lotteryMatch[1].replace(" before draw", ""));

    rows.push(["Capacity", claimedLabel]);
    rows.push(["Queue", "Lottery pool"]);
    rows.push(["Demand", primary]);
  } else if (isFacultyReviewQueue) {
    if (capacityLabel) {
      rows.push(["Capacity", capacityLabel]);
    }
    rows.push(["Demand", primary]);
    rows.push(["Queue", "Faculty review"]);
  } else {
    rows.push(["Capacity", capacityLabel || primary]);
    if (secondary) {
      rows.push(["Queue", secondary]);
    }
  }

  return (
    <div className="capacity-demand">
      {rows.map(([label, value]) => (
        <div key={`${label}-${value}`} className="capacity-demand__row">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
});

function isColumnControlActive(columnId, controls) {
  if (columnId === "schedule") {
    return controls.sortBy === "schedule" || controls.scheduleFilter !== "all";
  }

  if (columnId === "faculty") {
    return controls.sortBy === "faculty" || controls.facultyFilter !== "all" || controls.typeFilter !== "all";
  }

  if (columnId === "capacity") {
    return controls.sortBy === "capacity" || controls.capacityFilter !== "all";
  }

  if (columnId === "policy") {
    return controls.sortBy === "policy" || controls.policyFilter !== "all";
  }

  if (columnId === "rule") {
    return controls.sortBy === "rule" || controls.ruleFilter !== "all";
  }

  return false;
}

const ColumnHeaderControl = memo(function ColumnHeaderControl({
  label,
  columnId,
  controls,
  options,
  menuOpen,
  onToggleMenu,
  onChange,
  onReset,
  onClose,
}) {
  const active = isColumnControlActive(columnId, controls);

  function renderSortControls() {
    return (
      <>
        <label className="column-menu__field">
          <span>Sort</span>
          <select
            value={controls.sortBy === columnId ? controls.sortDirection : "none"}
            onChange={(event) => {
              if (event.target.value === "none") {
                onChange("sortBy", "default");
                onChange("sortDirection", "asc");
                return;
              }

              onChange("sortBy", columnId);
              onChange("sortDirection", event.target.value);
            }}
          >
            <option value="none">No sort</option>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </>
    );
  }

  function renderColumnFields() {
    if (columnId === "schedule") {
      return (
        <label className="column-menu__field">
          <span>Filter</span>
          <select value={controls.scheduleFilter} onChange={(event) => onChange("scheduleFilter", event.target.value)}>
            {GROUP_SCHEDULE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (columnId === "faculty") {
      return (
        <>
          <label className="column-menu__field">
            <span>Faculty</span>
            <select value={controls.facultyFilter} onChange={(event) => onChange("facultyFilter", event.target.value)}>
              {options.facultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="column-menu__field">
            <span>Type</span>
            <select value={controls.typeFilter} onChange={(event) => onChange("typeFilter", event.target.value)}>
              {options.typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      );
    }

    if (columnId === "capacity") {
      return (
        <label className="column-menu__field">
          <span>Filter</span>
          <select value={controls.capacityFilter} onChange={(event) => onChange("capacityFilter", event.target.value)}>
            {GROUP_CAPACITY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (columnId === "policy") {
      return (
        <label className="column-menu__field">
          <span>Filter</span>
          <select value={controls.policyFilter} onChange={(event) => onChange("policyFilter", event.target.value)}>
            {options.policyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (columnId === "rule") {
      return (
        <label className="column-menu__field">
          <span>Filter</span>
          <select value={controls.ruleFilter} onChange={(event) => onChange("ruleFilter", event.target.value)}>
            {GROUP_RULE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return null;
  }

  return (
    <div className="column-control">
      <div className="column-control__label-row">
        <span>{label}</span>
        <button
          type="button"
          className={active ? "column-control__button column-control__button--active" : "column-control__button"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          aria-expanded={menuOpen}
          aria-label={`${label} sort and filter`}
        >
          ▾
        </button>
      </div>
      {menuOpen ? (
        <div className="column-menu" onClick={(event) => event.stopPropagation()}>
          {renderSortControls()}
          {renderColumnFields()}
          <div className="column-menu__actions">
            <button type="button" className="mini-button" onClick={onReset}>
              Reset
            </button>
            <button type="button" className="mini-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

const CourseTableRow = memo(function CourseTableRow({
  course,
  selectedCourseId,
  busyCourseId,
  highlightedCourseId,
  actionFeedback,
  forceDisabled = false,
  onSelectCourse,
  onInspect,
  onAction,
  onLocateCourse,
  registerRowNode,
}) {
  const baseAction = getPrimaryAction(course);
  const action = forceDisabled
    ? {
        ...baseAction,
        disabled: true,
      }
    : baseAction;
  const busy = busyCourseId === course.id;
  const policyMeta = getPolicyCompactMeta(course);
  const rowClass = [
    getCourseRowClass(course, selectedCourseId === course.id),
    forceDisabled ? "portal-row--stabilized-disabled" : "",
    highlightedCourseId === course.id ? "portal-row--jump-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr
      key={course.id}
      ref={(node) => registerRowNode(course.id, node)}
      className={rowClass}
    >
      <td data-mobile-label="Action" onClick={(event) => event.stopPropagation()}>
        <div className="cell-actions">
          <button
            type="button"
            className="mini-button mini-button--primary"
            onClick={() => onAction(course)}
            disabled={busy || action.disabled}
          >
            {busy ? "…" : action.label}
          </button>
          {actionFeedback ? (
            <div className={`row-action-feedback row-action-feedback--${actionFeedback.tone}`} role="status" aria-live="polite">
              <strong>{actionFeedback.title}</strong>
              <span>{actionFeedback.detail}</span>
            </div>
          ) : null}
        </div>
      </td>
      <td data-mobile-label="Course">
        <div className={forceDisabled ? "cell-title cell-title--disabled" : "cell-title cell-title--course"}>
          <button
            type="button"
            className={selectedCourseId === course.id ? "course-title-button course-title-button--selected" : "course-title-button"}
            onClick={() => onSelectCourse(course.id)}
            aria-pressed={selectedCourseId === course.id}
          >
            <strong>
              {course.code} - {course.title}
            </strong>
            <span>
              Sem {course.semester} · {course.credits} credits
            </span>
          </button>
          <button
            type="button"
            className="course-title-button__inspect"
            onClick={() => onInspect(course.id)}
            aria-label={`Open inspection panel for ${course.code}`}
          >
            Inspect
          </button>
        </div>
      </td>
      <td data-mobile-label="Schedule">{formatSchedule(course)}</td>
      <td data-mobile-label="Faculty / Type">
        <div className="cell-title">
          <strong>{course.faculty}</strong>
          <span>{course.department}</span>
          <div className="tag-row">
            <span className={getListTypeClass(course.listType)} title={getListTypeLabel(course.listType)}>
              {course.listType}
            </span>
            <span className={getSubclassClass(course.subclass)}>Subclass {course.subclass}</span>
            {course.crossFaculty ? <span className="soft-tag soft-tag--accent">Cross-faculty</span> : null}
          </div>
        </div>
      </td>
      <td data-mobile-label="Capacity / Demand">
        <CapacityDemandCell course={course} />
      </td>
      <td data-mobile-label="Policy / Window">
        <div className="cell-title" title={policyMeta.title}>
          <span className={`soft-tag soft-tag--policy-compact soft-tag--policy-compact-${policyMeta.variant}`}>
            {policyMeta.label}
          </span>
          <span>{policyMeta.note}</span>
        </div>
      </td>
      <td data-mobile-label="Eligibility / Next">
        <RulePreviewCell course={course} onLocateCourse={onLocateCourse} />
      </td>
    </tr>
  );
});

const GroupedCourseTable = memo(function GroupedCourseTable({
  group,
  courses,
  totalCourses,
  expanded,
  onToggleGroup,
  controls,
  options,
  openColumnMenu,
  onToggleColumnMenu,
  onGroupControlChange,
  onResetGroupControls,
  selectedCourseId,
  busyCourseId,
  highlightedCourseId,
  actionFeedback,
  onSelectCourse,
  onInspect,
  onAction,
  onLocateCourse,
  registerRowNode,
  countLabelOverride,
  groupNote,
}) {
  const countLabel =
    countLabelOverride ??
    (totalCourses === courses.length ? `${courses.length}` : `${courses.length} / ${totalCourses}`);
  const groupAnimation = totalCourses > 6 ? "none" : "fade";

  return (
    <section className={`course-group course-group--${group.id}${expanded ? "" : " course-group--collapsed"}`}>
      <button type="button" className="course-group__header" onClick={() => onToggleGroup(group.id)}>
        <span className="course-group__title-block">
          <span className="course-group__title">
            {group.label}
            <span className="course-group__count">{countLabel}</span>
          </span>
          {group.description ? <span className="course-group__description">{group.description}</span> : null}
        </span>
        <span className="course-group__toggle">{expanded ? "Hide" : "Show"}</span>
      </button>

      <AnimatedGroupBody
        expanded={expanded}
        animation={groupAnimation}
        collapsedNote={`${formatOfferingCount(courses.length)} visible in this group.`}
      >
        {courses.length === 0 ? (
          <div className="course-group__empty">
            {totalCourses === 0 ? "No course is currently in this group." : "No course in this group matches the current sort / filter menu."}
          </div>
        ) : (
          <>
            {groupNote ? <div className="course-group__inline-note">{groupNote}</div> : null}
            <div className="table-wrap">
              <table
                className="portal-table portal-table--column-banded portal-table--responsive-cards"
                aria-label={`${group.label} course table`}
              >
              <caption className="sr-only">{`${group.label} course table`}</caption>
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Course</th>
                  <th scope="col">
                    <ColumnHeaderControl
                      label="Schedule"
                      columnId="schedule"
                      controls={controls}
                      options={options}
                      menuOpen={openColumnMenu === "schedule"}
                      onToggleMenu={() => onToggleColumnMenu(group.id, openColumnMenu === "schedule" ? null : "schedule")}
                      onChange={(field, value) => onGroupControlChange(group.id, field, value)}
                      onReset={() => onResetGroupControls(group.id)}
                      onClose={() => onToggleColumnMenu(group.id, null)}
                    />
                  </th>
                  <th scope="col">
                    <ColumnHeaderControl
                      label="Faculty / Type"
                      columnId="faculty"
                      controls={controls}
                      options={options}
                      menuOpen={openColumnMenu === "faculty"}
                      onToggleMenu={() => onToggleColumnMenu(group.id, openColumnMenu === "faculty" ? null : "faculty")}
                      onChange={(field, value) => onGroupControlChange(group.id, field, value)}
                      onReset={() => onResetGroupControls(group.id)}
                      onClose={() => onToggleColumnMenu(group.id, null)}
                    />
                  </th>
                  <th scope="col">
                    <ColumnHeaderControl
                      label="Capacity / Demand"
                      columnId="capacity"
                      controls={controls}
                      options={options}
                      menuOpen={openColumnMenu === "capacity"}
                      onToggleMenu={() => onToggleColumnMenu(group.id, openColumnMenu === "capacity" ? null : "capacity")}
                      onChange={(field, value) => onGroupControlChange(group.id, field, value)}
                      onReset={() => onResetGroupControls(group.id)}
                      onClose={() => onToggleColumnMenu(group.id, null)}
                    />
                  </th>
                  <th scope="col">
                    <ColumnHeaderControl
                      label="Policy / Window"
                      columnId="policy"
                      controls={controls}
                      options={options}
                      menuOpen={openColumnMenu === "policy"}
                      onToggleMenu={() => onToggleColumnMenu(group.id, openColumnMenu === "policy" ? null : "policy")}
                      onChange={(field, value) => onGroupControlChange(group.id, field, value)}
                      onReset={() => onResetGroupControls(group.id)}
                      onClose={() => onToggleColumnMenu(group.id, null)}
                    />
                  </th>
                  <th scope="col">
                    <ColumnHeaderControl
                      label="Eligibility / Next"
                      columnId="rule"
                      controls={controls}
                      options={options}
                      menuOpen={openColumnMenu === "rule"}
                      onToggleMenu={() => onToggleColumnMenu(group.id, openColumnMenu === "rule" ? null : "rule")}
                      onChange={(field, value) => onGroupControlChange(group.id, field, value)}
                      onReset={() => onResetGroupControls(group.id)}
                      onClose={() => onToggleColumnMenu(group.id, null)}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => {
                  return (
                    <CourseTableRow
                      key={course.id}
                      course={course}
                      selectedCourseId={selectedCourseId}
                      busyCourseId={busyCourseId}
                      highlightedCourseId={highlightedCourseId}
                      actionFeedback={actionFeedback?.courseId === course.id ? actionFeedback : null}
                      forceDisabled={group.id === "requestable" && getCourseGroup(course) !== "requestable"}
                      onSelectCourse={onSelectCourse}
                      onInspect={onInspect}
                      onAction={onAction}
                      onLocateCourse={onLocateCourse}
                      registerRowNode={registerRowNode}
                    />
                  );
                })}
              </tbody>
              </table>
            </div>
          </>
        )}
      </AnimatedGroupBody>
    </section>
  );
});

export function AddCoursePage({
  student,
  semester,
  summary,
  systemMeta,
  courses,
  timetable,
  selectedCourse,
  busyCourseId,
  recentCourseUpdate,
  preset,
  onSelectCourse,
  onInspect,
  onAction,
  onRefresh,
}) {
  const [query, setQuery] = useState("");
  const [facultyFilter, setFacultyFilter] = useState("all");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyEnrolled, setOnlyEnrolled] = useState(preset === "enrolled");
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [advancedScheduleFilter, setAdvancedScheduleFilter] = useState("all");
  const [advancedCapacityFilter, setAdvancedCapacityFilter] = useState("all");
  const [advancedRuleFilter, setAdvancedRuleFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState(() =>
    Object.fromEntries(COURSE_GROUPS.map((group) => [group.id, group.defaultExpanded])),
  );
  const [groupControls, setGroupControls] = useState(() => buildInitialGroupControls());
  const [openColumnMenus, setOpenColumnMenus] = useState({});
  const [pendingJumpCourseId, setPendingJumpCourseId] = useState(null);
  const [highlightedCourseId, setHighlightedCourseId] = useState(null);
  const rowRefs = useRef(new Map());
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setOnlyEnrolled(preset === "enrolled");
    if (preset === "enrolled") {
      setExpandedGroups((currentValue) => ({ ...currentValue, enrolled: true }));
    }
  }, [preset]);

  useEffect(() => {
    if (!pendingJumpCourseId) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const node = rowRefs.current.get(pendingJumpCourseId);

      if (node) {
        scrollNodeIntoViewIfNeeded(node);
        setHighlightedCourseId(pendingJumpCourseId);
      }

      setPendingJumpCourseId(null);
    }, 60);

    return () => window.clearTimeout(timer);
  }, [pendingJumpCourseId, query, facultyFilter, policyFilter, onlyOpen, onlyEnrolled, expandedGroups]);

  useEffect(() => {
    if (!highlightedCourseId) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setHighlightedCourseId(null);
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [highlightedCourseId]);

  useEffect(() => {
    if (!selectedCourse) {
      return;
    }

    const targetGroupId = getCourseGroup(selectedCourse);

    setExpandedGroups((currentValue) =>
      currentValue[targetGroupId] ? currentValue : { ...currentValue, [targetGroupId]: true },
    );
    setPendingJumpCourseId(selectedCourse.id);
  }, [selectedCourse]);

  useEffect(() => {
    const hasOpenMenu = Object.values(openColumnMenus).some(Boolean);

    if (!hasOpenMenu) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest(".column-control")) {
        return;
      }

      setOpenColumnMenus({});
    }

    window.addEventListener("mousedown", handlePointerDown);

    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [openColumnMenus]);

  const facultyOptions = useMemo(
    () => ["all", ...new Set(courses.map((course) => course.faculty))],
    [courses],
  );
  const policyOptions = useMemo(
    () => ["all", ...new Set(courses.map((course) => getPolicyCompactMeta(course).label))],
    [courses],
  );
  const normalizedQuery = useMemo(() => deferredQuery.trim().toLowerCase(), [deferredQuery]);

  const filteredCourses = useMemo(
    () =>
      courses.filter((course) => {
        const matchesQuery =
          normalizedQuery === "" ||
          [course.code, course.title, course.department, course.faculty].join(" ").toLowerCase().includes(normalizedQuery);
        const matchesFaculty = facultyFilter === "all" || course.faculty === facultyFilter;
        const matchesPolicy = policyFilter === "all" || getPolicyCompactMeta(course).label === policyFilter;
        const matchesOpen = !onlyOpen || course.requestOpen;
        const matchesEnrolled = !onlyEnrolled || course.currentState.kind === "approved";
        const matchesAdvanced = matchesGroupViewFilters(course, {
          scheduleFilter: advancedScheduleFilter,
          capacityFilter: advancedCapacityFilter,
          ruleFilter: advancedRuleFilter,
        });

        return matchesQuery && matchesFaculty && matchesPolicy && matchesOpen && matchesEnrolled && matchesAdvanced;
      }),
    [
      courses,
      normalizedQuery,
      facultyFilter,
      policyFilter,
      onlyOpen,
      onlyEnrolled,
      advancedScheduleFilter,
      advancedCapacityFilter,
      advancedRuleFilter,
    ],
  );

  const courseOrderMap = useMemo(() => new Map(courses.map((course, index) => [course.id, index])), [courses]);
  const filteredGroups = useMemo(() => createGroupedCourses(filteredCourses), [filteredCourses]);
  const [requestableShelfIds, setRequestableShelfIds] = useState([]);
  const lastFilterSignatureRef = useRef("");
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        normalizedQuery,
        facultyFilter,
        policyFilter,
        onlyOpen,
        onlyEnrolled,
        advancedScheduleFilter,
        advancedCapacityFilter,
        advancedRuleFilter,
      }),
    [
      normalizedQuery,
      facultyFilter,
      policyFilter,
      onlyOpen,
      onlyEnrolled,
      advancedScheduleFilter,
      advancedCapacityFilter,
      advancedRuleFilter,
    ],
  );
  const requestableShelfCourses = useMemo(() => {
    const courseById = new Map(filteredCourses.map((course) => [course.id, course]));
    return requestableShelfIds
      .map((courseId) => courseById.get(courseId))
      .filter((course) => course && getCourseGroup(course) === "blocked");
  }, [filteredCourses, requestableShelfIds]);
  const requestableDisplayCourses = useMemo(
    () => (filteredGroups.requestable.length > 0 ? filteredGroups.requestable : requestableShelfCourses),
    [filteredGroups.requestable, requestableShelfCourses],
  );
  const requestableShelfIdSet = useMemo(() => new Set(requestableShelfCourses.map((course) => course.id)), [requestableShelfCourses]);
  const displayGroups = useMemo(
    () => ({
      ...filteredGroups,
      requestable: requestableDisplayCourses,
      blocked:
        filteredGroups.requestable.length === 0
          ? filteredGroups.blocked.filter((course) => !requestableShelfIdSet.has(course.id))
          : filteredGroups.blocked,
    }),
    [filteredGroups, requestableDisplayCourses, requestableShelfIdSet],
  );
  const displayGroupTotals = useMemo(
    () =>
      Object.fromEntries(
        COURSE_GROUPS.map((group) => [group.id, displayGroups[group.id].length]),
      ),
    [displayGroups],
  );

  useLayoutEffect(() => {
    const currentRequestableIds = filteredGroups.requestable.map((course) => course.id);
    const currentFilterChanged = lastFilterSignatureRef.current !== filterSignature;

    if (currentFilterChanged) {
      lastFilterSignatureRef.current = filterSignature;
      setRequestableShelfIds(currentRequestableIds);
      return;
    }

    if (currentRequestableIds.length > 0) {
      setRequestableShelfIds(currentRequestableIds);
      return;
    }

    setRequestableShelfIds((currentValue) => {
      const filteredCourseIds = new Set(filteredCourses.map((course) => course.id));
      return currentValue.filter((courseId) => filteredCourseIds.has(courseId));
    });
  }, [filterSignature, filteredCourses, filteredGroups.requestable]);

  const renderedGroups = useMemo(
    () =>
      Object.fromEntries(
        COURSE_GROUPS.map((group) => [
          group.id,
          applyGroupViewControls(displayGroups[group.id], groupControls[group.id], courseOrderMap),
        ]),
      ),
    [displayGroups, groupControls, courseOrderMap],
  );
  const groupOptionsById = useMemo(
    () =>
      Object.fromEntries(
        COURSE_GROUPS.map((group) => [group.id, getGroupControlOptions(displayGroups[group.id])]),
      ),
    [displayGroups],
  );
  const totalVisibleCourses = filteredCourses.length;
  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (normalizedQuery) {
      chips.push(`Search: ${query.trim()}`);
    }

    if (facultyFilter !== "all") {
      chips.push(`Faculty: ${facultyFilter}`);
    }

    if (policyFilter !== "all") {
      chips.push(`Policy: ${policyFilter}`);
    }

    if (onlyOpen) {
      chips.push("Requestable only");
    }

    if (onlyEnrolled) {
      chips.push("Enrolled only");
    }

    if (advancedScheduleFilter !== "all") {
      chips.push(`Schedule: ${GROUP_SCHEDULE_FILTER_OPTIONS.find((option) => option.value === advancedScheduleFilter)?.label ?? advancedScheduleFilter}`);
    }

    if (advancedCapacityFilter !== "all") {
      chips.push(`Capacity: ${GROUP_CAPACITY_FILTER_OPTIONS.find((option) => option.value === advancedCapacityFilter)?.label ?? advancedCapacityFilter}`);
    }

    if (advancedRuleFilter !== "all") {
      chips.push(`Eligibility: ${GROUP_RULE_FILTER_OPTIONS.find((option) => option.value === advancedRuleFilter)?.label ?? advancedRuleFilter}`);
    }

    return chips;
  }, [
    normalizedQuery,
    query,
    facultyFilter,
    policyFilter,
    onlyOpen,
    onlyEnrolled,
    advancedScheduleFilter,
    advancedCapacityFilter,
    advancedRuleFilter,
  ]);
  const advancedFilterCount = useMemo(
    () =>
      [advancedScheduleFilter !== "all", advancedCapacityFilter !== "all", advancedRuleFilter !== "all"].filter(Boolean)
        .length,
    [advancedScheduleFilter, advancedCapacityFilter, advancedRuleFilter],
  );

  const registerRowNode = useCallback((courseId, node) => {
    if (node) {
      rowRefs.current.set(courseId, node);
      return;
    }

    rowRefs.current.delete(courseId);
  }, []);

  const toggleGroup = useCallback((groupId) => {
    setExpandedGroups((currentValue) => ({
      ...currentValue,
      [groupId]: !currentValue[groupId],
    }));
  }, []);

  const updateGroupControl = useCallback((groupId, field, value) => {
    setGroupControls((currentValue) => ({
      ...currentValue,
      [groupId]: {
        ...currentValue[groupId],
        [field]: value,
      },
    }));
  }, []);

  const resetGroupControls = useCallback((groupId) => {
    setGroupControls((currentValue) => ({
      ...currentValue,
      [groupId]: createDefaultGroupViewControls(),
    }));
    setOpenColumnMenus((currentValue) => ({
      ...currentValue,
      [groupId]: null,
    }));
  }, []);

  const toggleColumnMenu = useCallback((groupId, columnId) => {
    setOpenColumnMenus((currentValue) => ({
      ...currentValue,
      [groupId]: columnId,
    }));
  }, []);

  const locateRelatedCourse = useCallback((sourceCourse, relatedCode) => {
    if (!relatedCode) {
      return;
    }

    const candidates = courses.filter((course) => course.code === relatedCode && course.id !== sourceCourse.id);
    const targetCourse =
      candidates.find((course) => getCourseGroup(course) === "enrolled") ??
      candidates.find((course) => getCourseGroup(course) === "active") ??
      candidates[0] ??
      null;

    if (!targetCourse) {
      return;
    }

    const targetGroupId = getCourseGroup(targetCourse);

    if (!filteredCourses.some((course) => course.id === targetCourse.id)) {
      setQuery("");
      setFacultyFilter("all");
      setPolicyFilter("all");
      setOnlyOpen(false);
      setOnlyEnrolled(false);
      setAdvancedScheduleFilter("all");
      setAdvancedCapacityFilter("all");
      setAdvancedRuleFilter("all");
    }

    if (!matchesGroupViewFilters(targetCourse, groupControls[targetGroupId])) {
      setGroupControls((currentValue) => ({
        ...currentValue,
        [targetGroupId]: createDefaultGroupViewControls(),
      }));
    }

    setExpandedGroups((currentValue) => ({
      ...currentValue,
      [targetGroupId]: true,
    }));
    setPendingJumpCourseId(targetCourse.id);
  }, [courses, filteredCourses, groupControls]);

  return (
    <div className="page-stack">
      <div className="course-hero-grid">
        <AcademicSummaryStrip
          student={student}
          semester={semester}
          summary={summary}
          systemMeta={systemMeta}
          title="Academic Summary"
          onRefresh={onRefresh}
        />
        <WindowStatusStrip summary={summary} semester={semester} title="Current window and support" tone="info" />
      </div>

      <section className="page-panel page-panel--toolbar page-panel--toolbar-compact">
        <h3>Course controls</h3>
        <div className="toolbar-workbench">
          <div className="toolbar-section toolbar-section--search">
            <div className="toolbar-section__heading">
              <span className="toolbar-section__eyebrow">Search</span>
              <strong>Find a course fast</strong>
            </div>
            <label className="toolbar-field toolbar-field--search toolbar-field--stacked">
              <span>Code, title, department</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by code, title, department"
              />
            </label>
          </div>

          <div className="toolbar-section toolbar-section--filters" aria-label="Course filters">
            <div className="toolbar-section__heading">
              <span className="toolbar-section__eyebrow">Filters</span>
              <strong>Narrow the catalogue</strong>
            </div>
            <div className="toolbar-filter-grid">
              <label className="toolbar-field toolbar-field--compact-select toolbar-field--stacked">
                <span>Faculty</span>
                <select value={facultyFilter} onChange={(event) => setFacultyFilter(event.target.value)}>
                  {facultyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All faculties" : option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toolbar-field toolbar-field--compact-select toolbar-field--stacked">
                <span>Policy</span>
                <select value={policyFilter} onChange={(event) => setPolicyFilter(event.target.value)}>
                  {policyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All policies" : option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="toolbar-section toolbar-section--actions" aria-label="Course control actions">
            <div className="toolbar-section__heading">
              <span className="toolbar-section__eyebrow">Views</span>
              <strong>Display options</strong>
            </div>
            <div className="toolbar-action-cluster">
              <button
                type="button"
                className={onlyOpen ? "toolbar-toggle toolbar-toggle--active" : "toolbar-toggle"}
                aria-pressed={onlyOpen}
                onClick={() => {
                  setOnlyOpen((currentValue) => {
                    const nextValue = !currentValue;

                    if (nextValue) {
                      setOnlyEnrolled(false);
                    }

                    return nextValue;
                  });
                }}
              >
                Requestable only
                {onlyOpen ? <span className="toolbar-toggle__state">On</span> : null}
              </button>
              <button
                type="button"
                className={onlyEnrolled ? "toolbar-toggle toolbar-toggle--active" : "toolbar-toggle"}
                aria-pressed={onlyEnrolled}
                onClick={() => {
                  setOnlyEnrolled((currentValue) => {
                    const nextValue = !currentValue;

                    if (nextValue) {
                      setExpandedGroups((currentGroups) => ({ ...currentGroups, enrolled: true }));
                    }

                    return nextValue;
                  });
                  setOnlyOpen(false);
                }}
              >
                Enrolled only
                {onlyEnrolled ? <span className="toolbar-toggle__state">On</span> : null}
              </button>
              <button
                type="button"
                className={toolsExpanded || advancedFilterCount ? "toolbar-toggle toolbar-toggle--active" : "toolbar-toggle"}
                aria-pressed={toolsExpanded || advancedFilterCount > 0}
                onClick={() => setToolsExpanded((currentValue) => !currentValue)}
                aria-expanded={toolsExpanded}
                aria-controls="course-center-advanced-filters"
              >
                {`Advanced filters${advancedFilterCount ? ` (${advancedFilterCount})` : ""}`}
                {toolsExpanded ? <span className="toolbar-toggle__state">Open</span> : null}
              </button>
            </div>
            <p className="toolbar-section__hint">
              These controls filter which offerings stay visible. Section headers below only expand or collapse each group,
              including Blocked / Closed.
            </p>
          </div>
        </div>
        {toolsExpanded ? (
          <div id="course-center-advanced-filters" className="toolbar-grid toolbar-grid--advanced">
            <div className="toolbar-advanced-note">
              <strong>Advanced filters are now active across every group.</strong>
              <span>Use these when you need schedule, capacity, or eligibility filters beyond the quick row.</span>
            </div>
            <label className="toolbar-field toolbar-field--stacked">
              <span>Schedule</span>
              <select value={advancedScheduleFilter} onChange={(event) => setAdvancedScheduleFilter(event.target.value)}>
                {GROUP_SCHEDULE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar-field toolbar-field--stacked">
              <span>Capacity</span>
              <select value={advancedCapacityFilter} onChange={(event) => setAdvancedCapacityFilter(event.target.value)}>
                {GROUP_CAPACITY_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar-field toolbar-field--stacked">
              <span>Eligibility</span>
              <select value={advancedRuleFilter} onChange={(event) => setAdvancedRuleFilter(event.target.value)}>
                {GROUP_RULE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="toolbar-advanced-reset"
              disabled={!advancedFilterCount}
              onClick={() => {
                setAdvancedScheduleFilter("all");
                setAdvancedCapacityFilter("all");
                setAdvancedRuleFilter("all");
              }}
            >
              Reset advanced
            </button>
          </div>
        ) : null}
        <FilterSummaryBar
          chips={activeFilterChips}
          onClearAll={() => {
            setQuery("");
            setFacultyFilter("all");
            setPolicyFilter("all");
            setOnlyOpen(false);
            setOnlyEnrolled(false);
            setAdvancedScheduleFilter("all");
            setAdvancedCapacityFilter("all");
            setAdvancedRuleFilter("all");
            setToolsExpanded(false);
          }}
        />
      </section>

      <InspectionTray
        selectedCourse={selectedCourse}
        timetable={timetable}
      />

      <section className="page-panel">
        <h3>{`Course list — ${formatOfferingCount(totalVisibleCourses)}`}</h3>

        {totalVisibleCourses === 0 ? (
          <div className="course-group__empty">No courses match the current filters.</div>
        ) : (
          <div className="course-group-stack">
            {COURSE_GROUPS.map((group) => (
              <GroupedCourseTable
                key={group.id}
                group={group}
                courses={renderedGroups[group.id]}
                totalCourses={displayGroupTotals[group.id]}
                countLabelOverride={
                  group.id === "requestable" &&
                  filteredGroups.requestable.length === 0 &&
                  requestableDisplayCourses.length > 0
                    ? "0"
                    : undefined
                }
                groupNote={
                  group.id === "requestable" &&
                  filteredGroups.requestable.length === 0 &&
                  requestableDisplayCourses.length > 0
                    ? "No course is currently requestable. Recent offerings remain visible here in grey so the list does not jump."
                    : null
                }
                expanded={expandedGroups[group.id]}
                onToggleGroup={toggleGroup}
                controls={groupControls[group.id]}
                options={groupOptionsById[group.id]}
                openColumnMenu={openColumnMenus[group.id] ?? null}
                onToggleColumnMenu={toggleColumnMenu}
                onGroupControlChange={updateGroupControl}
                onResetGroupControls={resetGroupControls}
                selectedCourseId={selectedCourse?.id ?? null}
                busyCourseId={busyCourseId}
                highlightedCourseId={highlightedCourseId}
                actionFeedback={recentCourseUpdate}
                onSelectCourse={onSelectCourse}
                onInspect={onInspect}
                onAction={onAction}
                onLocateCourse={locateRelatedCourse}
                registerRowNode={registerRowNode}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
