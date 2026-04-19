import { ACTIVE_RECORD_STATUSES } from "./enrollmentMeta.js";

function parseRecordSequence(recordId) {
  const match = /^req-(\d+)$/.exec(recordId ?? "");
  return match ? Number(match[1]) : null;
}

export function createRuntimeState(source) {
  const cloned = structuredClone(source);
  let recordSequence = Number.isFinite(cloned.recordSequence) ? cloned.recordSequence : 0;
  cloned.stateRevision = Number.isFinite(cloned.stateRevision) ? cloned.stateRevision : 0;

  cloned.requestRecords = (cloned.requestRecords ?? []).map((record) => {
    const existingSequence = parseRecordSequence(record.id);

    if (Number.isFinite(existingSequence)) {
      recordSequence = Math.max(recordSequence, existingSequence);
    }

    if (!record.id) {
      recordSequence += 1;
    }

    return {
      ...record,
      id: record.id ?? `req-${recordSequence}`,
      active: record.active ?? ACTIVE_RECORD_STATUSES.has(record.status),
    };
  });

  cloned.recordSequence = recordSequence;
  return cloned;
}

export function nextRecordId(state) {
  state.recordSequence = Number.isFinite(state.recordSequence) ? state.recordSequence + 1 : 1;
  return `req-${state.recordSequence}`;
}
