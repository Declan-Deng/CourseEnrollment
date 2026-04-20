import { randomUUID } from "node:crypto";
import { createAuditEvent } from "./auditService.js";
import { ensureStaffActor } from "./actors.js";
import { clone } from "./clone.js";
import { CONSTRAINT_OVERRIDE_TYPES } from "./constraints.js";
import { badRequest, notFound } from "./domainErrors.js";
import { formatRecordTimestamp } from "./requestTrackingService.js";

const ALLOWED_CONSTRAINT_TYPES = new Set(Object.values(CONSTRAINT_OVERRIDE_TYPES));

function validateConstraintTypes(constraintTypes) {
  if (!Array.isArray(constraintTypes) || constraintTypes.length === 0) {
    throw badRequest("Invalid override payload.", "constraintTypes must be a non-empty array.");
  }

  const normalized = [...new Set(constraintTypes.map((item) => String(item).trim()).filter(Boolean))];

  if (normalized.length === 0) {
    throw badRequest("Invalid override payload.", "constraintTypes must include at least one valid constraint type.");
  }

  for (const item of normalized) {
    if (!ALLOWED_CONSTRAINT_TYPES.has(item)) {
      throw badRequest("Invalid override payload.", `Unsupported constraint override type: ${item}`);
    }
  }

  return normalized;
}

export function createConstraintOverride(payload, actor = { type: "staff", id: "staff-office-001" }) {
  const effectiveActor = ensureStaffActor(actor);

  if (typeof payload?.studentId !== "string" || payload.studentId.trim() === "") {
    throw badRequest("Invalid override payload.", "studentId is required for a constraint override.");
  }

  if (typeof payload?.offeringId !== "string" || payload.offeringId.trim() === "") {
    throw badRequest("Invalid override payload.", "offeringId is required for a constraint override.");
  }

  const override = {
    id: payload.id ?? `ovr-${randomUUID()}`,
    studentId: payload.studentId.trim(),
    offeringId: payload.offeringId.trim(),
    constraintTypes: validateConstraintTypes(payload.constraintTypes),
    note: typeof payload.note === "string" ? payload.note.trim() : "",
    createdBy: effectiveActor.id,
    createdAt: payload.createdAt ?? formatRecordTimestamp(),
    active: payload.active ?? true,
  };

  const auditEvent = createAuditEvent({
    actor: effectiveActor,
    action: "override-created",
    targetType: "constraintOverride",
    targetId: override.id,
    before: null,
    after: clone(override),
    subjectStudentId: override.studentId,
  });

  return { override, auditEvent };
}

export function deactivateConstraintOverride(existingOverride, actor = { type: "staff", id: "staff-office-001" }) {
  if (!existingOverride) {
    throw notFound("Constraint override not found.", "Constraint override was not found.");
  }

  const effectiveActor = ensureStaffActor(actor);
  const before = clone(existingOverride);
  const after = {
    ...clone(existingOverride),
    active: false,
  };

  const auditEvent = createAuditEvent({
    actor: effectiveActor,
    action: "override-deactivated",
    targetType: "constraintOverride",
    targetId: existingOverride.id,
    before,
    after,
    subjectStudentId: existingOverride.studentId,
  });

  return { override: after, auditEvent };
}
