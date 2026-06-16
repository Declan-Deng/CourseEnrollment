import { createSeedDomainSnapshot } from "./domainSeed.js";
import { previewEnrollmentDecision } from "./enrollmentDecisionService.js";
import {
  createCourseForAdmin,
  createOfferingForAdmin,
  listAdminCourses,
  listAdminOfferings,
  previewOfferingUpdate,
  updateOfferingForAdmin,
} from "./adminOfferingsService.js";
import {
  createConstraintOverride,
  deactivateConstraintOverride,
} from "./adminOverrideService.js";
import { listAdminRequests, previewRequestResolution, resolveRequestForAdmin } from "./adminRequestService.js";
import { buildBootstrapResponse } from "./portalAdapter.js";
import { badRequest, conflict, notFound, unauthorized } from "./domainErrors.js";
import { createStateRepository, RepositoryConflictError } from "./stateRepository.js";
import { findStaffUserByLogin, sanitizeStaffUser, verifyStaffPassword } from "./staffAuthService.js";
import {
  cancelStudentRequest,
  dropStudentEnrollment,
  resetStudentState,
  submitStudentRequest,
} from "./studentEnrollmentService.js";

let repository = null;
let repositoryPromise = null;
let writeQueue = Promise.resolve();

function resolveStudentId(options = {}) {
  return typeof options?.studentId === "string" && options.studentId.trim() !== ""
    ? options.studentId.trim()
    : undefined;
}

function resolveActor(options = {}, fallback) {
  if (options?.actor?.type && options?.actor?.id) {
    return options.actor;
  }

  return fallback;
}

function withWriteLock(task) {
  const pending = writeQueue.then(task, task);
  writeQueue = pending.catch(() => {});
  return pending;
}

function toStudentStatePayload(snapshot) {
  return {
    student: snapshot.student,
    studentMeta: snapshot.studentMeta,
    enrollments: snapshot.enrollments,
    requests: snapshot.requests,
  };
}

function buildOfferingChanges(previousState, nextSnapshot) {
  const previousOfferings = new Map(previousState.offerings.map((offering) => [offering.id, offering]));

  return nextSnapshot.offerings
    .filter((offering) => JSON.stringify(previousOfferings.get(offering.id)) !== JSON.stringify(offering))
    .map((offering) => ({
      offering,
      expectedVersion: previousOfferings.get(offering.id)?.version ?? null,
    }));
}

function buildAuditPersistencePlan(previousEvents = [], nextEvents = []) {
  const isAppendOnly =
    previousEvents.length <= nextEvents.length &&
    previousEvents.every((event, index) => nextEvents[index]?.id === event.id);

  if (isAppendOnly) {
    return {
      mode: "append",
      events: nextEvents.slice(previousEvents.length),
    };
  }

  return {
    mode: "replace",
    events: nextEvents,
  };
}

function shouldReplaceStudentOverrides(previousOverrides = [], nextOverrides = []) {
  return JSON.stringify(previousOverrides) !== JSON.stringify(nextOverrides);
}

async function persistSnapshotTransition(activeRepository, previousState, nextSnapshot, studentId) {
  const offeringChanges = buildOfferingChanges(previousState, nextSnapshot);
  const auditPlan = buildAuditPersistencePlan(previousState.auditEvents, nextSnapshot.auditEvents);

  await activeRepository.saveStudentState(studentId, toStudentStatePayload(nextSnapshot));

  if (shouldReplaceStudentOverrides(previousState.overrides, nextSnapshot.overrides)) {
    await activeRepository.overrideRepository.replaceForStudent(studentId, nextSnapshot.overrides ?? []);
  }

  if (offeringChanges.length > 0) {
    await activeRepository.updateOfferings(offeringChanges);
  }

  if (auditPlan.mode === "replace") {
    await activeRepository.replaceAuditEvents(auditPlan.events);
  } else if (auditPlan.events.length > 0) {
    await activeRepository.appendAuditEvents(auditPlan.events);
  }
}

async function getRepository() {
  if (repository) {
    return repository;
  }

  if (!repositoryPromise) {
    repositoryPromise = createStateRepository();
  }

  repository = await repositoryPromise;
  return repository;
}

async function getStateContext(options = {}) {
  const studentId = resolveStudentId(options);
  const activeRepository = await getRepository();
  const state = await activeRepository.getState(studentId);

  return {
    repository: activeRepository,
    state,
    studentId: state.student?.id ?? studentId,
  };
}

async function buildAdminAggregateState(activeRepository) {
  const studentIds = await activeRepository.listStudentIds();
  const effectiveStudentIds =
    studentIds.length > 0 ? studentIds : [activeRepository.seed?.defaultStudentId ?? createSeedDomainSnapshot().student.id];
  const snapshots = await Promise.all(effectiveStudentIds.map((studentId) => activeRepository.getState(studentId)));
  const baseSnapshot = snapshots[0] ?? createSeedDomainSnapshot();

  return {
    ...baseSnapshot,
    enrollments: snapshots.flatMap((snapshot) => snapshot.enrollments ?? []),
    requests: snapshots.flatMap((snapshot) => snapshot.requests ?? []),
    overrides: snapshots.flatMap((snapshot) => snapshot.overrides ?? []),
  };
}

async function saveStateWithRetry(mutator, options = {}, attempts = 3) {
  const studentId = resolveStudentId(options);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { repository: activeRepository, state } = await getStateContext({ studentId });
    const result = await mutator(state);

    if (result?.persist === false) {
      return result.value;
    }

    try {
      await persistSnapshotTransition(activeRepository, state, result.snapshot, studentId ?? state.student.id);
      return result.value;
    } catch (error) {
      if (!(error instanceof RepositoryConflictError) || attempt === attempts - 1) {
        throw error;
      }
    }
  }

  throw new RepositoryConflictError();
}

export async function initDataStore(options = {}) {
  if (repository) {
    await repository.close?.();
  }

  repository = null;
  repositoryPromise = createStateRepository(options);
  repository = await repositoryPromise;
  return repository.getInfo();
}

export async function closeDataStore() {
  if (repository) {
    await repository.close?.();
  }

  repository = null;
  repositoryPromise = null;
}

export async function getStorageInfo() {
  const activeRepository = await getRepository();
  return {
    ...activeRepository.getInfo(),
    compatibilityMode: "student-portal-adapter",
  };
}

export async function loginStaff(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw badRequest("Invalid login payload.", "A username and password are required.");
  }

  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!username || !password) {
    throw unauthorized("Staff login failed.", "Enter a valid staff account and password.");
  }

  const activeRepository = await getRepository();
  const staffUsers = await activeRepository.staffUserRepository.list();
  const staffUser = findStaffUserByLogin(staffUsers, username);

  if (!staffUser || !verifyStaffPassword(staffUser, password)) {
    throw unauthorized("Staff login failed.", "The staff account or password is incorrect.");
  }

  return {
    ok: true,
    staff: sanitizeStaffUser(staffUser),
  };
}

export async function getStaffSession(options = {}) {
  const actor = resolveActor(options, null);

  if (actor?.type !== "staff" || !actor.id) {
    throw unauthorized("Staff session required.", "Please sign in with a staff account.");
  }

  const activeRepository = await getRepository();
  const staffUser = await activeRepository.staffUserRepository.getById(actor.id);

  if (!staffUser?.active) {
    throw unauthorized("Staff session expired.", "Please sign in again with an active staff account.");
  }

  return {
    ok: true,
    staff: sanitizeStaffUser(staffUser),
  };
}

export async function getBootstrap(options = {}) {
  const { state } = await getStateContext(options);
  return buildBootstrapResponse(state);
}

export async function previewRequest(offeringId, options = {}) {
  const { state } = await getStateContext(options);
  return previewEnrollmentDecision(state, offeringId);
}

export async function previewAdminOverrideImpact(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw badRequest("Invalid override preview payload.", "A preview payload object is required.");
  }

  const studentId =
    (typeof payload.studentId === "string" && payload.studentId.trim()) ||
    resolveStudentId(options);
  const offeringId = typeof payload.offeringId === "string" ? payload.offeringId.trim() : "";

  if (!studentId) {
    throw badRequest("Invalid override preview payload.", "studentId is required for override impact preview.");
  }

  if (!offeringId) {
    throw badRequest("Invalid override preview payload.", "offeringId is required for override impact preview.");
  }

  const { state } = await getStateContext({ ...options, studentId });
  const offering = state.offerings.find((item) => item.id === offeringId);

  if (!offering) {
    throw notFound("Offering not found.", `Offering ${offeringId} was not found.`);
  }

  const actor = resolveActor(options, { type: "staff", id: "staff-office-001" });
  const currentDecision = previewEnrollmentDecision(state, offeringId);
  const { override } = createConstraintOverride(
    {
      studentId,
      offeringId,
      constraintTypes: payload.constraintTypes,
      note: typeof payload.note === "string" ? payload.note : "",
      active: true,
    },
    actor,
  );
  const matchingOverrides = (state.overrides ?? []).filter(
    (item) => item.active && item.studentId === studentId && item.offeringId === offeringId,
  );
  const overrideState = {
    ...state,
    overrides: [...(state.overrides ?? []), override],
  };
  const overrideDecision = previewEnrollmentDecision(overrideState, offeringId);

  return {
    ok: true,
    headline: "Override impact preview ready.",
    studentId,
    offeringId,
    currentDecision,
    overrideDecision,
    activeOverrides: matchingOverrides,
  };
}

export async function submitRequest(offeringId, options = {}) {
  return withWriteLock(() =>
    saveStateWithRetry((state) => {
      const actor = resolveActor(options, { type: "student", id: state.student.id });
      const result = submitStudentRequest(state, offeringId, { actor });

      if (result.snapshot === state) {
        return { persist: false, value: result.decision };
      }

      return {
        persist: true,
        snapshot: result.snapshot,
        value: result.decision,
      };
    }, options),
  );
}

export async function cancelRequest(offeringId, options = {}) {
  return withWriteLock(() =>
    saveStateWithRetry((state) => {
      const actor = resolveActor(options, { type: "student", id: state.student.id });
      const result = cancelStudentRequest(state, offeringId, { actor });

      if (result.snapshot === state) {
        return { persist: false, value: result.decision };
      }

      return {
        persist: true,
        snapshot: result.snapshot,
        value: result.decision,
      };
    }, options),
  );
}

export async function dropCourse(offeringId, options = {}) {
  return withWriteLock(() =>
    saveStateWithRetry((state) => {
      const actor = resolveActor(options, { type: "student", id: state.student.id });
      const result = dropStudentEnrollment(state, offeringId, { actor });

      if (result.snapshot === state) {
        return { persist: false, value: result.decision };
      }

      return {
        persist: true,
        snapshot: result.snapshot,
        value: result.decision,
      };
    }, options),
  );
}

export async function resetDemo(options = {}) {
  return withWriteLock(async () => {
    const scope = options?.scope === "all" ? "all" : "student";
    const actor = resolveActor(options, { type: "system", id: "system-reset" });
    const studentId = resolveStudentId(options);
    const activeRepository = await getRepository();

    if (scope === "all") {
      await activeRepository.resetAll();
      const resetState = await activeRepository.getState(studentId);
      return buildBootstrapResponse(resetState);
    }

    return saveStateWithRetry((state) => {
      const resetSnapshot = resetStudentState(state, createSeedDomainSnapshot(state.student.id), { actor });

      return {
        persist: true,
        snapshot: resetSnapshot,
        value: buildBootstrapResponse(resetSnapshot),
      };
    }, { studentId });
  });
}

export async function listAdminOfferingView(options = {}) {
  const activeRepository = await getRepository();
  const aggregateState = await buildAdminAggregateState(activeRepository);
  return listAdminOfferings(aggregateState);
}

export async function listAdminCourseView(options = {}) {
  const activeRepository = await getRepository();
  const aggregateState = await buildAdminAggregateState(activeRepository);
  return listAdminCourses(aggregateState);
}

export async function createAdminCourse(payload, options = {}) {
  return withWriteLock(async () => {
    const activeRepository = await getRepository();
    const aggregateState = await buildAdminAggregateState(activeRepository);
    const actor = resolveActor(options, { type: "staff", id: "staff-office-001" });
    const { course, department, auditEvent } = createCourseForAdmin(aggregateState, payload, actor);

    await activeRepository.courseRepository.create(course);
    await activeRepository.departmentRepository.upsert(department);
    await activeRepository.auditRepository.append([auditEvent]);

    return {
      ok: true,
      headline: "Course created.",
      course,
    };
  });
}

export async function createAdminOffering(payload, options = {}) {
  return withWriteLock(async () => {
    const activeRepository = await getRepository();
    const aggregateState = await buildAdminAggregateState(activeRepository);
    const actor = resolveActor(options, { type: "staff", id: "staff-office-001" });
    const { offering, auditEvent } = createOfferingForAdmin(aggregateState, payload, actor);

    await activeRepository.offeringRepository.create(offering);
    await activeRepository.auditRepository.append([auditEvent]);

    const nextState = await buildAdminAggregateState(activeRepository);
    const createdOffering = listAdminOfferings(nextState).find((item) => item.id === offering.id) ?? offering;

    return {
      ok: true,
      headline: "Offering created.",
      offering: createdOffering,
    };
  });
}

export async function updateAdminOffering(offeringId, patch, options = {}) {
  return withWriteLock(() =>
    saveStateWithRetry((state) => {
      const nextSnapshot = updateOfferingForAdmin(
        state,
        offeringId,
        patch,
        resolveActor(options, { type: "staff", id: "staff-office-001" }),
      );
      const updatedOffering = nextSnapshot.offerings.find((offering) => offering.id === offeringId) ?? null;

      return {
        persist: true,
        snapshot: nextSnapshot,
        value: { ok: true, headline: "Offering updated.", offeringId, offering: updatedOffering },
      };
    }, options),
  );
}

export async function previewAdminOfferingImpact(offeringId, patch, options = {}) {
  const activeRepository = await getRepository();
  const aggregateState = await buildAdminAggregateState(activeRepository);
  return previewOfferingUpdate(aggregateState, offeringId, patch);
}

export async function listAdminRequestView(options = {}) {
  const activeRepository = await getRepository();
  const studentIds = await activeRepository.listStudentIds();
  const snapshots = await Promise.all(studentIds.map((studentId) => activeRepository.getState(studentId)));

  return snapshots.flatMap((snapshot) =>
    listAdminRequests(snapshot, options.filters ?? {}).map((request) => ({
      ...request,
      student: snapshot.student,
    })),
  );
}

export async function resolveAdminRequest(requestId, resolution, options = {}) {
  return withWriteLock(async () => {
    const activeRepository = await getRepository();
    const studentIds = await activeRepository.listStudentIds();

    for (const studentId of studentIds) {
      const state = await activeRepository.getState(studentId);

      if (!state.requests.some((request) => request.id === requestId)) {
        continue;
      }

      const nextSnapshot = resolveRequestForAdmin(
        state,
        requestId,
        resolution,
        resolveActor(options, { type: "staff", id: "staff-office-001" }),
      );
      await persistSnapshotTransition(activeRepository, state, nextSnapshot, studentId);
      const resolvedRequest = nextSnapshot.requests.find((request) => request.id === requestId) ?? null;
      return { ok: true, headline: "Request resolved.", requestId, request: resolvedRequest };
    }

    throw notFound("Request not found.", `Request ${requestId} was not found.`);
  });
}

export async function previewAdminRequestResolution(requestId, resolution, options = {}) {
  const activeRepository = await getRepository();
  const studentIds = await activeRepository.listStudentIds();

  for (const studentId of studentIds) {
    const state = await activeRepository.getState(studentId);

    if (!state.requests.some((request) => request.id === requestId)) {
      continue;
    }

    return previewRequestResolution(state, requestId, resolution);
  }

  throw notFound("Request not found.", `Request ${requestId} was not found.`);
}

export async function listAdminOverrideView(options = {}) {
  const activeRepository = await getRepository();
  return activeRepository.overrideRepository.list(options.filters ?? {});
}

export async function createAdminOverride(payload, options = {}) {
  return withWriteLock(async () => {
    const activeRepository = await getRepository();
    const actor = resolveActor(options, { type: "staff", id: "staff-office-001" });
    const { override, auditEvent } = createConstraintOverride(payload, actor);
    const existingOverride = (await activeRepository.overrideRepository.list({
      studentId: override.studentId,
      offeringId: override.offeringId,
      active: true,
    })).find((item) =>
      JSON.stringify([...item.constraintTypes].sort()) === JSON.stringify([...override.constraintTypes].sort()),
    );

    await activeRepository.studentRepository.ensure(override.studentId);
    const offering = await activeRepository.offeringRepository.getById(override.offeringId);

    if (!offering) {
      throw notFound("Offering not found.", `Offering ${override.offeringId} was not found.`);
    }

    if (existingOverride) {
      throw conflict(
        "Constraint override already exists.",
        "An active override for the same student, offering, and constraint set already exists.",
      );
    }

    await activeRepository.overrideRepository.create(override);
    await activeRepository.auditRepository.append([auditEvent]);

    return {
      ok: true,
      headline: "Constraint override created.",
      override,
    };
  });
}

export async function deleteAdminOverride(overrideId, options = {}) {
  return withWriteLock(async () => {
    const activeRepository = await getRepository();
    const actor = resolveActor(options, { type: "staff", id: "staff-office-001" });
    const existing = (await activeRepository.overrideRepository.list({})).find((override) => override.id === overrideId);

    if (!existing) {
      throw notFound("Constraint override not found.", `Constraint override ${overrideId} was not found.`);
    }

    const { override, auditEvent } = deactivateConstraintOverride(existing, actor);
    await activeRepository.overrideRepository.deactivate(overrideId);
    await activeRepository.auditRepository.append([auditEvent]);

    return {
      ok: true,
      headline: "Constraint override deactivated.",
      override,
    };
  });
}

export async function getDomainSnapshot(options = {}) {
  const { state } = await getStateContext(options);
  return state;
}

export async function getAuditTrail(options = {}) {
  const { state } = await getStateContext(options);
  const filters = options?.filters ?? {};

  return (state.auditEvents ?? []).filter((event) => {
    if (filters.actorType && event.actorType !== filters.actorType) {
      return false;
    }

    if (filters.actorId && event.actorId !== filters.actorId) {
      return false;
    }

    if (filters.targetType && event.targetType !== filters.targetType) {
      return false;
    }

    if (filters.targetId && event.targetId !== filters.targetId) {
      return false;
    }

    if (filters.subjectStudentId && event.subjectStudentId !== filters.subjectStudentId) {
      return false;
    }

    if (filters.action && event.action !== filters.action) {
      return false;
    }

    return true;
  });
}
