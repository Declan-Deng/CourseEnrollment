// Deterministic identity for simulated students. Every student id — seeded,
// cohort, or generated for an untracked seat — resolves to the same stable
// name everywhere in the system (seat rosters, override previews, student
// portal bootstrap), so no surface ever shows a dead-end identity.

const SURNAMES = [
  "Chan", "Wong", "Cheung", "Lau", "Ng", "Ho", "Lam", "Leung",
  "Yip", "Tsang", "Kwok", "Ma", "Fung", "Siu", "Tam", "Chow",
  "Yuen", "Lo", "Mak", "Poon", "Hui", "Ko", "Yeung", "Tse",
];

const GIVEN_NAMES = [
  "Ka Ho", "Wing Yan", "Tsz Ching", "Chun Kit", "Hoi Lam", "Ka Yan",
  "Ming Hei", "Wai Kin", "Sze Wing", "Yat Long", "Cheuk Lam", "Kwan Ho",
  "Yuen Ting", "Chi Yan", "Long Hin", "Sum Yi", "Ho Yin", "Mei Kwan",
  "Tin Lok", "Wing Sze", "Pak Hei", "Yan Tung", "Kai Chung", "Hiu Tung",
];

function hashStudentId(studentId) {
  return [...String(studentId ?? "")].reduce(
    (total, char, index) => (total * 31 + char.charCodeAt(0) * (index + 7)) % 2_147_483_647,
    7,
  );
}

export function getSimulatedStudentName(studentId) {
  const hash = hashStudentId(studentId);
  const surname = SURNAMES[hash % SURNAMES.length];
  const givenName = GIVEN_NAMES[Math.floor(hash / SURNAMES.length) % GIVEN_NAMES.length];

  return `${surname} ${givenName}`;
}
