import test from "node:test";
import assert from "node:assert/strict";
import { createStateRepository, RepositoryConflictError } from "../src/stateRepository.js";

async function runRepositoryContract(repository) {
  const defaultStudent = await repository.studentRepository.get(repository.seed.defaultStudentId);
  assert.equal(defaultStudent.id, repository.seed.defaultStudentId);

  const createdOverride = await repository.overrideRepository.create({
    id: "ovr-contract-1",
    studentId: repository.seed.defaultStudentId,
    offeringId: "MECH7013-A-S2",
    constraintTypes: ["timetableClash"],
    note: "Repository contract test",
    createdBy: "staff-contract",
    createdAt: "2026-04-02 18:00",
    active: true,
  });

  assert.equal(createdOverride.id, "ovr-contract-1");

  const overrides = await repository.overrideRepository.list({
    studentId: repository.seed.defaultStudentId,
    active: true,
  });
  assert.equal(overrides.length, 1);

  const offeringsBefore = await repository.offeringRepository.list();
  const offeringBefore = offeringsBefore.find((item) => item.id === "IDAT7212-A-S2");

  await repository.offeringRepository.updateMany([
    {
      offering: {
        ...offeringBefore,
        waitlistCount: offeringBefore.waitlistCount + 1,
      },
      expectedVersion: offeringBefore.version,
    },
  ]);

  const offeringAfter = await repository.offeringRepository.getById("IDAT7212-A-S2");
  assert.equal(offeringAfter.waitlistCount, offeringBefore.waitlistCount + 1);
  assert.equal(offeringAfter.version, offeringBefore.version + 1);

  const staleWrite = repository.offeringRepository.updateMany([
    {
      offering: {
        ...offeringBefore,
        waitlistCount: offeringBefore.waitlistCount + 2,
      },
      expectedVersion: offeringBefore.version,
    },
  ]);
  await assert.rejects(staleWrite, RepositoryConflictError);

  await repository.auditRepository.append([
    {
      id: "audit-contract-1",
      actorType: "staff",
      actorId: "staff-contract",
      action: "contract-check",
      targetType: "offering",
      targetId: offeringAfter.id,
      before: { waitlistCount: offeringBefore.waitlistCount },
      after: { waitlistCount: offeringAfter.waitlistCount },
      subjectStudentId: repository.seed.defaultStudentId,
      timestamp: "2026-04-02 18:05",
    },
  ]);
  const auditTrail = await repository.auditRepository.list();
  assert.ok(auditTrail.some((event) => event.id === "audit-contract-1"));

  await repository.studentRepository.ensure("4000000001");
  await repository.requestRepository.replaceForStudent("4000000001", [
    {
      id: "req-contract-1",
      studentId: "4000000001",
      offeringId: "MEBS6003-A-S2",
      status: "pendingReview",
      active: true,
      submittedAt: "2026-04-02 18:06",
      message: "Pending review",
      resolution: null,
    },
  ]);
  await repository.reset("4000000001");
  const otherStudentRequests = await repository.requestRepository.listByStudentId("4000000001");
  const defaultStudentRequests = await repository.requestRepository.listByStudentId(repository.seed.defaultStudentId);
  assert.equal(otherStudentRequests.length, 0);
  assert.ok(defaultStudentRequests.length > 0);

  await repository.overrideRepository.resetForStudent(repository.seed.defaultStudentId);
  const clearedOverrides = await repository.overrideRepository.list({
    studentId: repository.seed.defaultStudentId,
  });
  assert.equal(clearedOverrides.length, 0);
}

test("memory repository exposes consistent entity operations", async () => {
  const repository = await createStateRepository({ storageMode: "memory" });

  try {
    await runRepositoryContract(repository);
    await repository.resetAll();
    const stateAfterReset = await repository.getState(repository.seed.defaultStudentId);
    assert.equal(stateAfterReset.auditEvents.length, 0);
  } finally {
    await repository.close?.();
  }
});

const mongoTest = process.env.TEST_MONGODB_URI ? test : test.skip;

mongoTest("mongo repository matches the entity repository contract", async () => {
  const repository = await createStateRepository({
    storageMode: "mongo",
    mongoUri: process.env.TEST_MONGODB_URI,
    dbName: process.env.TEST_MONGODB_DB_NAME ?? "course_enrollment_prototype_test",
    collectionName: `runtime_state_contract_${Date.now()}`,
  });

  try {
    await runRepositoryContract(repository);
  } finally {
    await repository.close?.();
  }
});
