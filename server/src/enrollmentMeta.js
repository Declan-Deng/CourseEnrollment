const RECORD_STATUS_META = {
  approved: {
    active: false,
    stateLabel: "Approved",
    recordLabel: "Approved to enrol",
  },
  lotteryQueued: {
    active: true,
    stateLabel: "Lottery queued",
    recordLabel: "Lottery queued",
  },
  pendingReview: {
    active: true,
    stateLabel: "Pending review",
    recordLabel: "Pending review",
  },
  waitlist: {
    active: true,
    stateLabel: "Waitlist",
    recordLabel: "Waitlist",
  },
  cancelled: {
    active: false,
    stateLabel: "Cancelled",
    recordLabel: "Request cancelled",
  },
  dropped: {
    active: false,
    stateLabel: "Dropped",
    recordLabel: "Dropped from plan",
  },
  rejected: {
    active: false,
    stateLabel: "Rejected",
    recordLabel: "Rejected",
  },
  manuallyResolved: {
    active: false,
    stateLabel: "Manually resolved",
    recordLabel: "Manually resolved",
  },
};

export const ACTIVE_RECORD_STATUSES = new Set(
  Object.entries(RECORD_STATUS_META)
    .filter(([, meta]) => meta.active)
    .map(([status]) => status),
);

export function getStateStatusLabel(status) {
  return RECORD_STATUS_META[status]?.stateLabel ?? status;
}

export function getRecordStatusLabel(status) {
  return RECORD_STATUS_META[status]?.recordLabel ?? status;
}
