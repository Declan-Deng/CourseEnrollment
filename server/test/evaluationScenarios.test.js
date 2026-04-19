import test from "node:test";
import assert from "node:assert/strict";
import { closeDataStore, initDataStore, previewRequest, resetDemo } from "../src/dataStore.js";

test.before(async () => {
  await initDataStore({ storageMode: "memory" });
});

test.beforeEach(async () => {
  await resetDemo({ scope: "all" });
});

test.after(async () => {
  await resetDemo({ scope: "all" });
  await closeDataStore();
});

test("co-requisite requirements are explained before submission", async () => {
  const decision = await previewRequest("STAT7601-A-S2");

  assert.equal(decision.ok, false);
  assert.equal(decision.headline, "Co-requisite not satisfied.");
  assert.match(decision.reasons[0], /TDLL6024/);
  assert.match(decision.suggestedActions[0], /TDLL6024/);
});

test("timetable clash identifies the conflicting approved course", async () => {
  const decision = await previewRequest("MECH7013-A-S2");

  assert.equal(decision.ok, false);
  assert.equal(decision.headline, "Timetable clash detected.");
  assert.match(decision.reasons[0], /COMP7506/);
  assert.match(decision.suggestedActions[0], /COMP7506/);
});

test("lottery and review remain distinct request paths", async () => {
  const lotteryDecision = await previewRequest("LATX7517-A-S2");
  const reviewDecision = await previewRequest("MEBS6003-A-S2");

  assert.equal(lotteryDecision.ok, true);
  assert.equal(lotteryDecision.outcome, "lotteryQueued");
  assert.equal(lotteryDecision.uiVariant, "lottery");

  assert.equal(reviewDecision.ok, true);
  assert.equal(reviewDecision.outcome, "pendingReview");
  assert.equal(reviewDecision.uiVariant, "review");
});

test("closed offerings surface the next relevant checkpoint", async () => {
  const decision = await previewRequest("IDAT7100-A-S2");

  assert.equal(decision.ok, false);
  assert.equal(decision.uiVariant, "closed");
  assert.match(decision.reasons.join(" "), /20 - 25 February 2026/);
});
