export function ensureStaffActor(actor = { type: "staff", id: "staff-office-001" }) {
  if (actor?.type && actor?.id) {
    return actor;
  }

  return { type: "staff", id: "staff-office-001" };
}
