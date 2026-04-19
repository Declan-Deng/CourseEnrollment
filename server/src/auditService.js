import { randomUUID } from "node:crypto";
import { formatRecordTimestamp } from "./requestTrackingService.js";

export function createAuditEvent({
  actor,
  action,
  targetType,
  targetId,
  before,
  after,
  subjectStudentId = null,
  timestamp = formatRecordTimestamp(),
  id = `audit-${randomUUID()}`,
}) {
  return {
    id,
    actorType: actor.type,
    actorId: actor.id,
    action,
    targetType,
    targetId,
    subjectStudentId,
    before,
    after,
    timestamp,
  };
}
