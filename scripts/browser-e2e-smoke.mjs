import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = resolve(ROOT, "output/playwright/fullstack-smoke");
const STARTUP_TIMEOUT_MS = 45_000;
const API_TIMEOUT_MS = 12_000;

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) {
          resolvePort(port);
        } else {
          reject(new Error("Could not allocate a local port."));
        }
      });
    });
  });
}

function spawnService(name, command, args, env) {
  const logs = [];
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const record = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.join("").length > 20_000) {
      logs.splice(0, logs.length - 20);
    }
  };

  child.stdout.on("data", record);
  child.stderr.on("data", record);
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      logs.push(`\n[${name} exited with code ${code}${signal ? ` (${signal})` : ""}]\n`);
    }
  });

  return { name, child, logs };
}

async function stopService(service) {
  if (!service?.child || service.child.killed) {
    return;
  }

  service.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveStop) => service.child.once("exit", resolveStop)),
    sleep(4_000).then(() => {
      service.child.kill("SIGKILL");
    }),
  ]);
}

async function waitForHttp(url, label) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}: ${lastError?.message ?? "unknown error"}`);
}

function createApiClient(apiBase) {
  return async function api(path, options = {}) {
    const url = `${apiBase}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
        },
        signal: options.signal ?? controller.signal,
      });
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch (error) {
        throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 300)}`);
      }
      return { response, body };
    } catch (error) {
      throw new Error(`API request failed: ${options.method ?? "GET"} ${url}: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  };
}

async function clickConfirm(page) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 8_000 });
  const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  assert.match(activeText, /Confirm/, "confirm dialog should focus the Confirm button");
  await dialog.getByRole("button", { name: "Confirm" }).click();
}

async function clickConfirmIfPresent(page) {
  const dialog = page.getByRole("dialog");
  try {
    await dialog.waitFor({ state: "visible", timeout: 1_500 });
  } catch {
    return false;
  }

  const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  assert.match(activeText, /Confirm/, "confirm dialog should focus the Confirm button when shown");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  return true;
}

async function loginStaff(page, appBase) {
  await page.goto(`${appBase}/staff`);
  await page.getByLabel("Staff account").fill("staff-office-001");
  await page.getByLabel("Password").fill("staff-demo-001");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Staff Administration" }).waitFor({ timeout: 12_000 });
}

async function resetDemo(api) {
  const reset = await api("/reset?scope=all", { method: "POST" });
  assert.equal(reset.response.status, 200, "reset endpoint should respond 200");
}

async function waitForCourseSearch(page, code) {
  await page.getByPlaceholder("Search by code, title, department").fill(code);
  await page.locator("tr", { hasText: code }).first().waitFor({ state: "visible", timeout: 8_000 });
}

async function openStaffTab(page, name) {
  await page.getByRole("tab", { name }).click();
  await page.getByRole("heading", { name: new RegExp(name, "i") }).first().waitFor({ timeout: 8_000 });
}

function staffField(page, scope, label, selector = "input, textarea, select") {
  return page
    .locator(scope)
    .locator(".staff-form-row, .staff-toolbar__field")
    .filter({ hasText: label })
    .locator(selector)
    .first();
}

async function selectStaffRequest(page, offeringId, studentId) {
  await openStaffTab(page, "Requests");
  await page.getByRole("button", { name: "Refresh" }).click();
  await staffField(page, ".staff-panel--request-list", "Search").fill(offeringId);
  let row = page.locator(".staff-panel--request-list tbody tr", { hasText: offeringId });
  if (studentId) {
    row = row.filter({ hasText: studentId });
  }
  row = row.first();
  await row.waitFor({ state: "visible", timeout: 10_000 });
  await row.click();
  await page.locator(".staff-panel--request-detail").waitFor({ state: "visible", timeout: 8_000 });
}

async function resolveVisibleRequest(page, actionName, note) {
  const detail = page.locator(".staff-panel--request-detail");
  await detail.locator("textarea").fill(note);
  await detail.getByRole("button", { name: actionName }).click();
  await clickConfirm(page);
  await page.getByRole("alert").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
}

async function assertStudentRequest(api, studentId, offeringId, predicate, label) {
  const startedAt = Date.now();
  let latest = null;

  while (Date.now() - startedAt < 10_000) {
    const { body } = await api("/bootstrap", { headers: { "x-student-id": studentId } });
    const allRecords = [
      ...(body.requestStatusView?.activeRequests ?? []),
      ...(body.requestStatusView?.archivedChanges ?? []),
    ];
    const record = allRecords.find((item) => item.course?.id === offeringId || item.courseId === offeringId);
    latest = { record, body };

    if (record && predicate(record, body)) {
      return latest;
    }

    await sleep(300);
  }

  assert.ok(latest?.record, `${label}: request record should exist for ${offeringId}`);
  assert.ok(predicate(latest.record, latest.body), `${label}: latest record was ${JSON.stringify({
    id: latest.record.id,
    status: latest.record.status,
    active: latest.record.active,
    statusLabel: latest.record.statusLabel,
  })}`);
  return latest;
}

async function assertAuditAction(api, action, targetText, label) {
  const { body } = await api(`/admin/audit?action=${encodeURIComponent(action)}`, {
    headers: { "x-actor-type": "staff", "x-actor-id": "staff-office-001" },
  });
  assert.ok(Array.isArray(body), `${label}: audit response should be an array`);
  assert.ok(
    body.some((event) => JSON.stringify(event).includes(targetText)),
    `${label}: audit should include ${action} for ${targetText}`,
  );
}

async function waitForApiCondition(check, label, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let latest;

  while (Date.now() - startedAt < timeoutMs) {
    latest = await check();
    if (latest.ok) {
      return latest.value;
    }
    await sleep(300);
  }

  assert.fail(`${label}: latest value was ${JSON.stringify(latest?.value ?? null).slice(0, 500)}`);
}

async function submitStudentReviewRequest(studentPage, api, appBase) {
  await resetDemo(api);
  await studentPage.goto(appBase);
  await waitForCourseSearch(studentPage, "MEBS6003");
  await studentPage.locator("tr", { hasText: "MEBS6003" }).first().getByRole("button", { name: "Request" }).click();
  await clickConfirmIfPresent(studentPage);

  await assertStudentRequest(
    api,
    "3036605296",
    "MEBS6003-A-S2",
    (record) => record.status === "pendingReview" && record.active === true,
    "student Request creates an active faculty-review record",
  );

  await studentPage.getByRole("button", { name: "View Enrolment Results" }).first().click();
  await studentPage.getByRole("heading", { name: "Active Requests" }).waitFor({ timeout: 8_000 });
  await studentPage.getByText("MEBS6003").first().waitFor({ timeout: 8_000 });

  await studentPage.getByRole("button", { name: "Withdraw Requests" }).click();
  await studentPage.getByText("MEBS6003").first().waitFor({ timeout: 8_000 });
}

async function approveSubmittedRequest(staffPage, studentPage, api) {
  await selectStaffRequest(staffPage, "MEBS6003-A-S2", "3036605296");
  await resolveVisibleRequest(staffPage, "Approve", "Approved after browser E2E review.");

  await assertStudentRequest(
    api,
    "3036605296",
    "MEBS6003-A-S2",
    (record) => record.status === "approved" && record.active === false,
    "staff Approve closes request and publishes approved result",
  );
  await assertAuditAction(api, "request-resolved", "MEBS6003-A-S2", "staff Approve writes audit");

  await studentPage.reload();
  await studentPage.getByRole("button", { name: "View Enrolment Results" }).first().click();
  await studentPage.getByText("Approved after browser E2E review.").waitFor({ timeout: 8_000 });
}

async function resolveSeededReviewRequest(staffPage, api, actionName, expectedStatus, expectedActive) {
  await resetDemo(api);
  await staffPage.reload();
  await selectStaffRequest(staffPage, "MEBS6003-A-S2", "4000000001");
  await resolveVisibleRequest(staffPage, actionName, `${actionName} by browser E2E note.`);

  await assertStudentRequest(
    api,
    "4000000001",
    "MEBS6003-A-S2",
    (record) => record.status === expectedStatus && record.active === expectedActive,
    `staff ${actionName} changes student-visible request state`,
  );
  await assertAuditAction(api, "request-resolved", "MEBS6003-A-S2", `staff ${actionName} writes audit`);
}

async function withdrawDefaultLotteryRequest(studentPage, api, appBase) {
  await resetDemo(api);
  await studentPage.goto(appBase);
  await studentPage.getByRole("button", { name: "Withdraw Requests" }).click();
  await studentPage.locator(".withdraw-card", { hasText: "COMP7906" }).getByRole("button", { name: "Withdraw request" }).click();
  await clickConfirmIfPresent(studentPage);

  const { record } = await assertStudentRequest(
    api,
    "3036605296",
    "COMP7906-B-S2",
    (item) => item.status === "cancelled" && item.active === false,
    "student Withdraw closes active request",
  );
  assert.equal(record.withdrawable, false, "withdrawn request should no longer be withdrawable");
  await assertAuditAction(api, "request-cancelled", "COMP7906-B-S2", "student Withdraw writes audit");
  await studentPage.getByText("No request can be withdrawn online right now.").waitFor({ timeout: 8_000 });
}

async function createCourseAndOffering(staffPage, studentPage, api, appBase) {
  await resetDemo(api);
  await staffPage.reload();
  await openStaffTab(staffPage, "Offerings");
  await staffPage.getByRole("tab", { name: "Create course" }).click();

  const code = `QAUT${String(Date.now()).slice(-4)}`;
  await staffField(staffPage, "#staff-offerings-course", "Course Code").fill(code);
  await staffField(staffPage, "#staff-offerings-course", "Title").fill("Browser E2E enrollment systems");
  await staffField(staffPage, "#staff-offerings-course", "Department").fill("Computer Science");
  await staffField(staffPage, "#staff-offerings-course", "Synopsis", "textarea").fill("Created by browser E2E smoke test.");
  await staffPage.locator("#staff-offerings-course").getByRole("button", { name: "Create Course" }).click();
  await clickConfirm(staffPage);
  const offeringId = `${code}-A-S2`;
  await staffPage.locator("#staff-offerings-offering", { hasText: offeringId }).waitFor({ timeout: 10_000 });

  await staffField(staffPage, "#staff-offerings-offering", "Venue").fill("MWT 1");
  await staffField(staffPage, "#staff-offerings-offering", "Prerequisites").fill("");
  await staffField(staffPage, "#staff-offerings-offering", "Corequisites").fill("");
  await staffPage.locator("#staff-offerings-offering").getByRole("button", { name: "Create Offering" }).click();
  await clickConfirm(staffPage);

  await waitForApiCondition(async () => {
    const offerings = await api("/admin/offerings", {
      headers: { "x-actor-type": "staff", "x-actor-id": "staff-office-001" },
    });
    return {
      ok: offerings.body.some((offering) => offering.id === offeringId),
      value: offerings.body.map((offering) => offering.id).filter((id) => id.startsWith(code)),
    };
  }, "created offering should be in staff API");

  await studentPage.goto(appBase);
  await waitForCourseSearch(studentPage, code);
  await studentPage.locator("tr", { hasText: code }).first().getByRole("button", { name: "Request" }).waitFor({ timeout: 8_000 });
  await assertAuditAction(api, "offering-created", offeringId, "staff Create Offering writes audit");
}

async function createAndRemoveOverride(staffPage, api) {
  await resetDemo(api);
  await staffPage.reload();
  await openStaffTab(staffPage, "Overrides");
  await staffField(staffPage, ".staff-panel--override-create", "Blocked offering", "select").selectOption("MECH7013-A-S2");
  const createPanel = staffPage.locator(".staff-panel--override-create");
  const timetableChip = createPanel.getByRole("button", { name: "Timetable clash" });
  if ((await timetableChip.getAttribute("aria-pressed")) !== "true") {
    await timetableChip.click();
  }
  await createPanel.getByRole("button", { name: "Create Override" }).click();
  await createPanel.getByText("This override changes the current decision").waitFor({ timeout: 8_000 }).catch(() => {});

  const allowedPreview = await api("/enrollment/preview", {
    method: "POST",
    body: JSON.stringify({ courseId: "MECH7013-A-S2" }),
  });
  assert.equal(allowedPreview.body.ok, true, "override should change student preview from timetable clash to allowed route");
  await assertAuditAction(api, "override-created", "MECH7013-A-S2", "override create writes audit");

  const overrideRow = staffPage.locator(".staff-panel--override-manage tbody tr", { hasText: "MECH7013-A-S2" }).first();
  await overrideRow.getByRole("button", { name: "Remove" }).click();
  await clickConfirm(staffPage);

  const blockedPreview = await waitForApiCondition(async () => {
    const preview = await api("/enrollment/preview", {
      method: "POST",
      body: JSON.stringify({ courseId: "MECH7013-A-S2" }),
    });
    return {
      ok: preview.body.ok === false,
      value: preview,
    };
  }, "removed override should restore blocked preview");
  assert.equal(blockedPreview.body.ok, false, "removed override should restore blocked preview");
  assert.match(blockedPreview.body.headline, /Timetable clash/);
  await assertAuditAction(api, "override-deactivated", "MECH7013-A-S2", "override remove writes audit");
}

async function exerciseAuditFilters(staffPage) {
  await openStaffTab(staffPage, "Audit");
  const filterPanel = staffPage.locator(".staff-panel--audit-filters");
  await filterPanel.getByRole("button", { name: "Override created" }).click();
  await staffField(staffPage, ".staff-panel--audit-filters", "Target / Student").fill("3036605296");
  await staffField(staffPage, ".staff-panel--audit-filters", "Direction", "select").selectOption("asc");
  await staffPage.getByRole("heading", { name: /Audit Trail .* ascending/i }).waitFor({ timeout: 8_000 });

  const rows = staffPage.locator(".staff-panel--audit-list tbody tr");
  await rows.first().waitFor({ state: "visible", timeout: 8_000 });
  const rowText = await rows.first().innerText();
  assert.match(rowText, /Override created/);
  assert.match(rowText, /MECH7013-A-S2/);
  await rows.first().click();
  await staffPage.locator(".staff-panel--audit-detail", { hasText: "State change" }).waitFor({ timeout: 8_000 });
  await filterPanel.getByRole("button", { name: "Clear all" }).click();
}

async function assertNoUnnamedButtons(page, label) {
  const unnamed = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((button) => {
        const style = window.getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        if (style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0) {
          return false;
        }
        const name = [
          button.getAttribute("aria-label"),
          button.getAttribute("title"),
          button.textContent,
        ].join(" ").trim();
        return !name;
      })
      .map((button) => button.outerHTML.slice(0, 160)),
  );
  assert.deepEqual(unnamed, [], `${label}: every visible button should have an accessible name`);
}

async function assertControlsHaveLabels(page, label) {
  const anonymousControls = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input, select, textarea"))
      .filter((control) => {
        const style = window.getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        if (style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0) {
          return false;
        }
        return !(
          control.labels?.length ||
          control.getAttribute("aria-label") ||
          control.getAttribute("title") ||
          control.getAttribute("placeholder") ||
          control.closest("label") ||
          control.closest(".staff-form-row")?.querySelector("label") ||
          control.closest(".staff-toolbar__field")?.querySelector("span")
        );
      })
      .map((control) => control.outerHTML.slice(0, 160)),
  );
  assert.deepEqual(anonymousControls, [], `${label}: every visible form control should have a label or label-like context`);
}

async function keyboardSmoke(page, label) {
  let active = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.press("Tab");
    active = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        tagName: element?.tagName,
        text: element?.textContent?.trim() ?? "",
        role: element?.getAttribute("role"),
      };
    });

    if (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(active.tagName) || active.role === "tab") {
      return;
    }
  }

  assert.fail(`${label}: Tab should focus an interactive element; latest focus was ${JSON.stringify(active)}`);
}

async function captureViewportEvidence(studentPage, staffPage, appBase) {
  const targets = [
    { page: studentPage, width: 390, name: "student-course-center-390", action: async () => {
      await studentPage.goto(appBase);
      await studentPage.getByRole("heading", { name: "Course controls" }).waitFor({ timeout: 12_000 });
    } },
    { page: studentPage, width: 768, name: "student-results-768", action: async () => {
      await studentPage.setViewportSize({ width: 1280, height: 844 });
      await studentPage.goto(appBase);
      await studentPage.getByRole("heading", { name: "Course controls" }).waitFor({ timeout: 12_000 });
      await studentPage.getByRole("button", { name: "View Enrolment Results" }).first().click();
      await studentPage.getByRole("heading", { name: "Active Requests" }).waitFor({ timeout: 12_000 }).catch(async () => {
        await studentPage.getByRole("heading", { name: "Current Enrolment" }).waitFor({ timeout: 12_000 });
      });
      await studentPage.setViewportSize({ width: 768, height: 844 });
    } },
    { page: staffPage, width: 390, name: "staff-requests-390", action: async () => {
      await staffPage.goto(`${appBase}/staff`);
      await openStaffTab(staffPage, "Requests");
      await staffPage.getByRole("heading", { name: "Request Resolution" }).waitFor({ timeout: 12_000 });
    } },
    { page: staffPage, width: 768, name: "staff-audit-768", action: async () => {
      await staffPage.goto(`${appBase}/staff`);
      await openStaffTab(staffPage, "Audit");
      await staffPage.getByRole("heading", { name: "Audit Event Detail" }).waitFor({ timeout: 12_000 });
    } },
  ];

  for (const target of targets) {
    await target.page.setViewportSize({ width: target.width, height: 844 });
    await target.action();
    await assertNoUnnamedButtons(target.page, target.name);
    await assertControlsHaveLabels(target.page, target.name);
    await keyboardSmoke(target.page, target.name);
    await target.page.screenshot({
      path: resolve(ARTIFACT_DIR, `${target.name}.png`),
      fullPage: true,
    });
  }
}

async function main() {
  await rm(ARTIFACT_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const apiPort = await getFreePort();
  const clientPort = await getFreePort();
  const apiBase = `http://127.0.0.1:${apiPort}/api`;
  const appBase = `http://127.0.0.1:${clientPort}`;
  const api = createApiClient(apiBase);
  const services = [
    spawnService("api", "npm", ["run", "start", "--prefix", "server"], {
      PORT: String(apiPort),
      ENROLLMENT_STORAGE_MODE: "memory",
    }),
    spawnService("client", "npm", ["run", "dev", "--prefix", "client", "--", "--host", "127.0.0.1", "--port", String(clientPort)], {
      VITE_API_BASE: apiBase,
    }),
  ];

  let browser;
  try {
    await waitForHttp(`${apiBase}/health`, "isolated API");
    await waitForHttp(appBase, "isolated frontend");

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const studentPage = await context.newPage();
    const staffPage = await context.newPage();

    await loginStaff(staffPage, appBase);

    await submitStudentReviewRequest(studentPage, api, appBase);
    await approveSubmittedRequest(staffPage, studentPage, api);
    await resolveSeededReviewRequest(staffPage, api, "Reject", "rejected", false);
    await resolveSeededReviewRequest(staffPage, api, "Move to waitlist", "waitlist", true);
    await resolveSeededReviewRequest(staffPage, api, "Close without outcome", "manuallyResolved", false);
    await withdrawDefaultLotteryRequest(studentPage, api, appBase);
    await createCourseAndOffering(staffPage, studentPage, api, appBase);
    await createAndRemoveOverride(staffPage, api);
    await exerciseAuditFilters(staffPage);
    await captureViewportEvidence(studentPage, staffPage, appBase);

    console.log(JSON.stringify({
      ok: true,
      apiBase,
      appBase,
      screenshots: ARTIFACT_DIR,
      covered: [
        "student request -> staff queue -> student results/withdraw",
        "staff approve/reject/waitlist/close -> student result and audit",
        "student withdraw -> inactive request and audit",
        "staff course/offering creation -> student Course Center search",
        "override create/remove -> student preview changes and reverts",
        "audit filters/sort/detail",
        "390px and 768px viewport smoke",
        "basic keyboard, form-control label, and button-name accessibility smoke",
      ],
    }, null, 2));
  } catch (error) {
    for (const service of services) {
      console.error(`\n--- ${service.name} logs ---\n${service.logs.join("").slice(-8_000)}`);
    }
    throw error;
  } finally {
    await browser?.close();
    await Promise.all(services.map(stopService));
  }
}

await main();
