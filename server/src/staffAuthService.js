import { createHash, timingSafeEqual } from "node:crypto";

const PASSWORD_PEPPER = process.env.STAFF_PASSWORD_PEPPER ?? "course-enrollment-demo-staff";

const DEMO_STAFF_ACCOUNTS = [
  {
    id: "staff-office-001",
    username: "staff-office-001",
    password: "staff-demo-001",
    displayName: "Programme Office",
    role: "programme-office",
    email: "staff-office-001@hku.hk",
  },
  {
    id: "staff-office-002",
    username: "staff-office-002",
    password: "staff-demo-002",
    displayName: "Faculty Reviewer",
    role: "faculty-reviewer",
    email: "staff-office-002@hku.hk",
  },
  {
    id: "staff-office-003",
    username: "staff-office-003",
    password: "staff-demo-003",
    displayName: "Audit Reviewer",
    role: "audit-reviewer",
    email: "staff-office-003@hku.hk",
  },
];

function normalizeLogin(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hashPassword(password, salt) {
  return createHash("sha256")
    .update(`${salt}:${password}:${PASSWORD_PEPPER}`)
    .digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "hex");
  const rightBuffer = Buffer.from(String(right ?? ""), "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSeedStaffUsers() {
  return DEMO_STAFF_ACCOUNTS.map((account) => ({
    id: account.id,
    username: account.username,
    usernameNormalized: normalizeLogin(account.username),
    displayName: account.displayName,
    role: account.role,
    email: account.email,
    emailNormalized: normalizeLogin(account.email),
    passwordSalt: account.id,
    passwordHash: hashPassword(account.password, account.id),
    active: true,
  }));
}

export function sanitizeStaffUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    email: user.email,
    active: Boolean(user.active),
  };
}

export function findStaffUserByLogin(staffUsers = [], login = "") {
  const normalizedLogin = normalizeLogin(login);

  if (!normalizedLogin) {
    return null;
  }

  return (
    staffUsers.find(
      (user) =>
        normalizeLogin(user.id) === normalizedLogin ||
        normalizeLogin(user.username ?? user.usernameNormalized) === normalizedLogin ||
        normalizeLogin(user.email ?? user.emailNormalized) === normalizedLogin,
    ) ?? null
  );
}

export function verifyStaffPassword(user, password = "") {
  if (!user?.active || !password) {
    return false;
  }

  const expectedHash = user.passwordHash;
  const actualHash = hashPassword(password, user.passwordSalt ?? user.id);

  return safeEqual(actualHash, expectedHash);
}
