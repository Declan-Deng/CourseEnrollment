import { useEffect, useRef, useState } from "react";
import { getPageLabel, navItems, topLinks } from "./portalModel";
import { usePortalController } from "./usePortalController";
import { QuickGlanceDock } from "./components/QuickGlanceDock";
import { Banner, ConfirmDialog, CourseInfoDialog, ToastNotice } from "./components/PortalFeedback";
import { AnnouncementPage } from "./pages/AnnouncementPage";
import { AddCoursePage } from "./pages/AddCoursePage";
import { ResultsPage } from "./pages/ResultsPage";
import { CancelPage } from "./pages/CancelPage";
import { OnlineEnrolmentPage } from "./pages/OnlineEnrolmentPage";
import { TimetablePage } from "./pages/TimetablePage";
import { ContactPage } from "./pages/ContactPage";
import { PasswordPage } from "./pages/PasswordPage";
import { LogoutPage } from "./pages/LogoutPage";
import { StaffAdminPage } from "./pages/StaffAdminPage";

const SIDEBAR_COLLAPSE_QUERY = "(max-width: 920px)";
const CLOCK_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  weekday: "short",
});

function formatClockLabel(date) {
  const parts = Object.fromEntries(
    CLOCK_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return `${parts.day} ${parts.month} ${parts.year} (${parts.weekday})`;
}

function getSurfaceFromLocation() {
  return window.location.pathname.startsWith("/staff") ? "staff" : "student";
}

function navigateToSurface(surface) {
  const nextPath = surface === "staff" ? "/staff" : "/";
  const nextState = { surface };
  window.history.pushState(nextState, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate", { state: nextState }));
}

function renderPage({
  activePage,
  data,
  systemMeta,
  selectedCourse,
  activeRequests,
  addCoursePreset,
  busyCourseId,
  recentCourseUpdate,
  handleNavigation,
  handleRefresh,
  handleSelectCourse,
  handlePreview,
  handlePrimaryAction,
  handleRecordPreview,
}) {
  if (activePage === "announcement") {
    return <AnnouncementPage semester={data.semester} announcementContent={data.announcementContent} />;
  }

  if (activePage === "add") {
    return (
      <AddCoursePage
        student={data.student}
        semester={data.semester}
        summary={data.summary}
        systemMeta={systemMeta}
        courses={data.courses}
        timetable={data.timetable}
        selectedCourse={selectedCourse}
        busyCourseId={busyCourseId}
        recentCourseUpdate={recentCourseUpdate}
        preset={addCoursePreset}
        onRefresh={handleRefresh}
        onSelectCourse={handleSelectCourse}
        onInspect={handlePreview}
        onAction={handlePrimaryAction}
      />
    );
  }

  if (activePage === "results") {
    return (
      <ResultsPage
        student={data.student}
        semester={data.semester}
        summary={data.summary}
        systemMeta={systemMeta}
        approvedCourses={data.approvedCourses}
        requestRecords={data.requestRecords}
        requestStatusView={data.requestStatusView}
        onNavigate={handleNavigation}
        onRefresh={handleRefresh}
      />
    );
  }

  if (activePage === "online") {
    return <OnlineEnrolmentPage semester={data.semester} announcementContent={data.announcementContent} />;
  }

  if (activePage === "timetable") {
    return <TimetablePage />;
  }

  if (activePage === "contact") {
    return <ContactPage />;
  }

  if (activePage === "password") {
    return <PasswordPage student={data.student} />;
  }

  if (activePage === "logout") {
    return <LogoutPage onReturnToPortal={() => handleNavigation("add")} />;
  }

  return (
    <CancelPage
      student={data.student}
      semester={data.semester}
      summary={data.summary}
      systemMeta={systemMeta}
      records={data.requestStatusView?.activeRequests ?? activeRequests}
      busyCourseId={busyCourseId}
      onInspectRecord={handleRecordPreview}
      onAction={handlePrimaryAction}
      onNavigate={handleNavigation}
      onRefresh={handleRefresh}
    />
  );
}

function StudentPortalApp({ onOpenStaffConsole }) {
  const lastCompactViewportRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [clockLabel, setClockLabel] = useState(() => formatClockLabel(new Date()));
  const {
    data,
    systemMeta,
    activePage,
    addCoursePreset,
    busyCourseId,
    error,
    banner,
    statusToast,
    recentCourseUpdate,
    infoDialog,
    confirmAction,
    selectedCourse,
    activeRequests,
    handleTopLinkClick,
    handleNavigation,
    handleReset,
    handleRefresh,
    handleSelectCourse,
    handlePreview,
    handlePrimaryAction,
    handleRecordPreview,
    closeBanner,
    closeStatusToast,
    closeInfoDialog,
    closeConfirmAction,
    confirmPendingAction,
  } = usePortalController();

  useEffect(() => {
    function syncClock() {
      setClockLabel(formatClockLabel(new Date()));
    }

    syncClock();
    const timer = window.setInterval(syncClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(SIDEBAR_COLLAPSE_QUERY);

    function syncSidebar(matches) {
      if (lastCompactViewportRef.current === null || lastCompactViewportRef.current !== matches) {
        setSidebarCollapsed(matches);
      }

      lastCompactViewportRef.current = matches;
    }

    syncSidebar(mediaQuery.matches);

    const handleChange = (event) => syncSidebar(event.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  if (!data) {
    return (
      <div className="portal portal--loading">
        <div className="page-panel">
          <h1>Loading enrolment portal…</h1>
          {error ? <p className="message message--error">{error}</p> : null}
        </div>
      </div>
    );
  }

  const showQuickDock = ["add", "results", "cancel"].includes(activePage);
  const showPageHeader = activePage !== "online";

  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-brand">
          <img src="/hkulogo.jpg" alt="The University of Hong Kong crest" className="portal-crest-image" />
          <div>
            <h1>Faculty of Engineering</h1>
            <p>The University of Hong Kong</p>
          </div>
        </div>
        <div className="portal-mark">MSc(Eng)</div>
      </header>

      <div className="portal-links">
        <div className="portal-links__menu">
          {topLinks.map((item) => (
            item.external ? (
              <a key={item.id} href={item.href} className="top-link" target="_blank" rel="noreferrer">
                {item.label}
              </a>
            ) : (
              <button
                key={item.id}
                type="button"
                className={activePage === item.pageId ? "top-link top-link--active" : "top-link"}
                onClick={() => handleTopLinkClick(item)}
              >
                {item.label}
              </button>
            )
          ))}
        </div>
        <div className="portal-links__meta">
          <span>{clockLabel}</span>
          <button type="button" className="portal-reset portal-reset--secondary" onClick={onOpenStaffConsole}>
            Staff Console
          </button>
          <button
            type="button"
            className="portal-reset"
            onClick={handleReset}
            disabled={busyCourseId === "reset" || busyCourseId === "logout"}
          >
            {busyCourseId === "reset" ? "Resetting…" : "Reset state"}
          </button>
        </div>
      </div>

      <div className={sidebarCollapsed ? "portal-layout portal-layout--sidebar-collapsed" : "portal-layout"}>
        <aside className={sidebarCollapsed ? "portal-sidebar portal-sidebar--collapsed" : "portal-sidebar"}>
          <div className="sidebar-heading">
            <span className="sidebar-heading__label">Online Enrolment</span>
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarCollapsed((currentValue) => !currentValue)}
            >
              <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
            </button>
          </div>
          <nav className="sidebar-nav" aria-label="Enrolment navigation" hidden={sidebarCollapsed}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[
                  "sidebar-link",
                  item.id === "add" ? "sidebar-link--primary" : "",
                  activePage === item.id ? "sidebar-link--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleNavigation(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="portal-main">
          {showQuickDock ? (
        <QuickGlanceDock
          approvedCourses={data.approvedCourses}
          activeRequests={activeRequests}
          summary={data.summary}
          systemMeta={systemMeta}
          onNavigate={handleNavigation}
          onRefresh={handleRefresh}
          activePage={activePage}
        />
      ) : null}

          {showPageHeader ? (
            <div className="page-header">
              <h2>{getPageLabel(activePage)}</h2>
              {error ? <p className="message message--error">{error}</p> : null}
            </div>
          ) : null}

          {banner ? <Banner tone={banner.tone} title={banner.title} detail={banner.detail} onClose={closeBanner} /> : null}

          {statusToast ? (
            <ToastNotice
              key={statusToast.id}
              tone={statusToast.tone}
              title={statusToast.title}
              detail={statusToast.detail}
              onClose={closeStatusToast}
            />
          ) : null}

          {renderPage({
            activePage,
            data,
            systemMeta,
            selectedCourse,
            activeRequests,
            addCoursePreset,
            busyCourseId,
            recentCourseUpdate,
            handleNavigation,
            handleRefresh,
            handleSelectCourse,
            handlePreview,
            handlePrimaryAction,
            handleRecordPreview,
          })}
        </main>
      </div>

      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.title}
          detail={confirmAction.detail}
          onCancel={closeConfirmAction}
          onConfirm={confirmPendingAction}
        />
      ) : null}

      {infoDialog ? <CourseInfoDialog dialog={infoDialog} onClose={closeInfoDialog} /> : null}
    </div>
  );
}

function App() {
  const [surface, setSurface] = useState(() => getSurfaceFromLocation());

  useEffect(() => {
    function handlePopState() {
      setSurface(getSurfaceFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (surface === "staff") {
    return <StaffAdminPage onReturnToPortal={() => navigateToSurface("student")} />;
  }

  return <StudentPortalApp onOpenStaffConsole={() => navigateToSurface("staff")} />;
}

export default App;
