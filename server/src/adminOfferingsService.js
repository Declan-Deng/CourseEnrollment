import { createAuditEvent } from "./auditService.js";
import { clone } from "./clone.js";
import { badRequest, notFound, conflict } from "./domainErrors.js";

const ALLOWED_PATCH_KEYS = new Set([
  "capacity",
  "seatsTaken",
  "waitlistCount",
  "allocationPolicy",
  "requestWindow",
  "dropWindow",
]);
const ALLOWED_POLICIES = new Set([
  "firstComeFirstServed",
  "lottery",
  "priorityReview",
  "locked",
]);

function validateOfferingPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw badRequest("Invalid offering patch.", "Offering patch must be an object.");
  }

  for (const key of Object.keys(patch)) {
    if (!ALLOWED_PATCH_KEYS.has(key)) {
      throw badRequest("Invalid offering patch.", `Unsupported offering patch field: ${key}`);
    }
  }

  for (const numericField of ["capacity", "seatsTaken", "waitlistCount"]) {
    if (patch[numericField] !== undefined && (!Number.isInteger(patch[numericField]) || patch[numericField] < 0)) {
      throw badRequest("Invalid offering patch.", `${numericField} must be a non-negative integer.`);
    }
  }

  for (const windowField of ["requestWindow", "dropWindow"]) {
    if (patch[windowField] !== undefined && (typeof patch[windowField] !== "object" || Array.isArray(patch[windowField]))) {
      throw badRequest("Invalid offering patch.", `${windowField} must be an object.`);
    }

    if (patch[windowField]?.isOpen !== undefined && typeof patch[windowField].isOpen !== "boolean") {
      throw badRequest("Invalid offering patch.", `${windowField}.isOpen must be a boolean.`);
    }
  }

  if (patch.allocationPolicy !== undefined && !ALLOWED_POLICIES.has(patch.allocationPolicy)) {
    throw badRequest("Invalid offering patch.", `Unsupported allocation policy: ${patch.allocationPolicy}`);
  }
}

function validateOfferingState(offering) {
  if (offering.seatsTaken > offering.capacity) {
    throw conflict("Invalid offering state.", "capacity cannot be lower than seatsTaken.");
  }

  if (offering.waitlistCount < 0) {
    throw badRequest("Invalid offering state.", "waitlistCount cannot be negative.");
  }
}

export function listAdminOfferings(snapshot) {
  return snapshot.offerings.map((offering) => ({
    ...offering,
    adminFlags: {
      requestWindowClosed: !offering.requestWindow?.isOpen,
      dropWindowClosed: !offering.dropWindow?.isOpen,
      lockedByPolicy: offering.allocationPolicy === "locked",
    },
  }));
}

export function updateOfferingForAdmin(snapshot, offeringId, patch, actor = { type: "staff", id: "staff-office-001" }) {
  validateOfferingPatch(patch);
  const nextSnapshot = clone(snapshot);
  const offering = nextSnapshot.offerings.find((item) => item.id === offeringId);

  if (!offering) {
    throw notFound("Offering not found.", `Offering ${offeringId} was not found.`);
  }

  const before = clone(offering);

  if (patch.capacity !== undefined) {
    offering.capacity = patch.capacity;
  }
  if (patch.requestWindow?.isOpen !== undefined) {
    offering.requestWindow = { ...offering.requestWindow, ...patch.requestWindow };
  }
  if (patch.dropWindow?.isOpen !== undefined) {
    offering.dropWindow = { ...offering.dropWindow, ...patch.dropWindow };
  }
  if (patch.allocationPolicy) {
    offering.allocationPolicy = patch.allocationPolicy;
  }
  if (patch.waitlistCount !== undefined) {
    offering.waitlistCount = patch.waitlistCount;
  }
  if (patch.seatsTaken !== undefined) {
    offering.seatsTaken = patch.seatsTaken;
  }

  validateOfferingState(offering);

  nextSnapshot.auditEvents.push(
    createAuditEvent({
      actor,
      action: "offering-updated",
      targetType: "offering",
      targetId: offeringId,
      before,
      after: clone(offering),
      subjectStudentId: null,
    }),
  );

  return nextSnapshot;
}

export function previewOfferingUpdate(snapshot, offeringId, patch) {
  validateOfferingPatch(patch);
  const offering = snapshot.offerings.find((item) => item.id === offeringId);

  if (!offering) {
    throw notFound("Offering not found.", `Offering ${offeringId} was not found.`);
  }

  const beforeAvailable = Math.max(offering.capacity - offering.seatsTaken, 0);
  const previewSnapshot = updateOfferingForAdmin(snapshot, offeringId, patch, { type: "system", id: "preview" });
  previewSnapshot.auditEvents = snapshot.auditEvents;
  const nextOffering = previewSnapshot.offerings.find((item) => item.id === offeringId);
  const afterAvailable = Math.max(nextOffering.capacity - nextOffering.seatsTaken, 0);
  const affectedRequests = snapshot.requests.filter((request) => request.active && request.offeringId === offeringId).length;

  return {
    ok: true,
    headline: "Offering impact preview ready.",
    offeringId,
    before: offering,
    after: nextOffering,
    summary: {
      capacityChange: nextOffering.capacity - offering.capacity,
      availableSeatsBefore: beforeAvailable,
      availableSeatsAfter: afterAvailable,
      seatsDelta: afterAvailable - beforeAvailable,
      affectedActiveRequests: affectedRequests,
      requestWindowClosingNow: Boolean(offering.requestWindow?.isOpen && !nextOffering.requestWindow?.isOpen),
      dropWindowClosingNow: Boolean(offering.dropWindow?.isOpen && !nextOffering.dropWindow?.isOpen),
    },
  };
}
