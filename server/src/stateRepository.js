import { MongoClient } from "mongodb";
import { createSeedDomainSnapshot, createSeedStudentState, domainSeed } from "./domainSeed.js";
import { clone } from "./clone.js";
import { assembleDomainSnapshot } from "./snapshotAssembler.js";

const DEFAULT_DB_NAME = "course_enrollment_prototype";
const DEFAULT_COLLECTION_NAME = "runtime_state";

function buildStateInfo(seed, collections = null) {
  return {
    defaultStudentId: seed.defaultStudentId,
    demoMode: true,
    roleReady: true,
    adminApiReady: true,
    entityRepositoryMode: true,
    sharedCourseSupply: true,
    sharedSupplyMode: "offering-entities",
    collections,
  };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function sortById(items) {
  return [...items].sort((left, right) => String(left.id ?? left._id ?? "").localeCompare(String(right.id ?? right._id ?? "")));
}

function normalizeStudentMeta(seedState, currentMeta = {}) {
  return {
    studentId: seedState.studentMeta.studentId,
    recordSequence: Number.isFinite(currentMeta.recordSequence)
      ? currentMeta.recordSequence
      : seedState.studentMeta.recordSequence,
    stateRevision: Number.isFinite(currentMeta.stateRevision) ? currentMeta.stateRevision : 0,
  };
}

function normalizeOfferingVersion(offering, expectedVersion = null) {
  const baseVersion = Number.isFinite(expectedVersion)
    ? expectedVersion
    : Number.isFinite(offering?.version)
      ? offering.version
      : 0;

  return {
    ...clone(offering),
    version: baseVersion + 1,
  };
}

export class RepositoryConflictError extends Error {
  constructor(message = "Repository state changed during save.") {
    super(message);
    this.name = "RepositoryConflictError";
    this.status = 409;
    this.headline = "Concurrent update detected.";
  }
}

class MemoryStateRepository {
  constructor(seed = domainSeed) {
    this.seed = clone(seed);
    this.students = new Map();
    this.studentMeta = new Map();
    this.enrollments = new Map();
    this.requests = new Map();
    this.offerings = new Map(seed.offerings.map((offering) => [offering.id, clone(offering)]));
    this.auditEvents = [];
    this.overrides = [];

    this.semesterRepository = {
      get: async () => clone(this.seed.semester),
    };
    this.programRepository = {
      list: async () => clone(this.seed.programs),
    };
    this.departmentRepository = {
      list: async () => clone(this.seed.departments),
    };
    this.courseRepository = {
      list: async () => clone(this.seed.courses),
      getById: async (courseId) => clone(this.seed.courses.find((course) => course.id === courseId) ?? null),
    };
    this.offeringRepository = {
      list: async () => sortById([...this.offerings.values()]).map(clone),
      getById: async (offeringId) => clone(this.offerings.get(offeringId) ?? null),
      updateMany: async (changes = []) => this.updateOfferings(changes),
      resetAll: async () => {
        this.offerings = new Map(this.seed.offerings.map((offering) => [offering.id, clone(offering)]));
        return sortById([...this.offerings.values()]).map(clone);
      },
    };
    this.studentRepository = {
      ensure: async (studentId = this.seed.defaultStudentId) => {
        this.ensureStudent(studentId);
        return clone(this.students.get(studentId));
      },
      get: async (studentId = this.seed.defaultStudentId) => {
        this.ensureStudent(studentId);
        return clone(this.students.get(studentId));
      },
      getMeta: async (studentId = this.seed.defaultStudentId) => {
        this.ensureStudent(studentId);
        return clone(this.studentMeta.get(studentId));
      },
      listIds: async () => [...this.students.keys()].sort((left, right) => left.localeCompare(right)),
    };
    this.enrollmentRepository = {
      listByStudentId: async (studentId = this.seed.defaultStudentId) => {
        this.ensureStudent(studentId);
        return clone(this.enrollments.get(studentId) ?? []);
      },
      replaceForStudent: async (studentId = this.seed.defaultStudentId, items = []) => {
        this.ensureStudent(studentId);
        this.enrollments.set(studentId, clone(ensureArray(items)));
        return clone(this.enrollments.get(studentId));
      },
    };
    this.requestRepository = {
      listByStudentId: async (studentId = this.seed.defaultStudentId) => {
        this.ensureStudent(studentId);
        return clone(this.requests.get(studentId) ?? []);
      },
      replaceForStudent: async (studentId = this.seed.defaultStudentId, items = []) => {
        this.ensureStudent(studentId);
        this.requests.set(studentId, clone(ensureArray(items)));
        return clone(this.requests.get(studentId));
      },
    };
    this.ruleRepository = {
      get: async () => clone(this.seed.rules),
    };
    this.auditRepository = {
      list: async () => clone(this.auditEvents),
      append: async (events = []) => this.appendAuditEvents(events),
      replace: async (events = []) => this.replaceAuditEvents(events),
      clear: async () => {
        this.auditEvents = [];
        return [];
      },
    };
    this.overrideRepository = {
      list: async (filters = {}) => this.listOverrides(filters),
      replaceForStudent: async (studentId = this.seed.defaultStudentId, items = []) =>
        this.replaceOverridesForStudent(studentId, items),
      create: async (override) => this.createOverride(override),
      deactivate: async (overrideId) => this.deactivateOverride(overrideId),
      resetForStudent: async (studentId = this.seed.defaultStudentId) => this.resetOverridesForStudent(studentId),
      clear: async () => {
        this.overrides = [];
        return [];
      },
    };

    const defaultState = createSeedStudentState(seed.defaultStudentId);
    this.students.set(seed.defaultStudentId, defaultState.student);
    this.studentMeta.set(seed.defaultStudentId, defaultState.studentMeta);
    this.enrollments.set(seed.defaultStudentId, defaultState.enrollments);
    this.requests.set(seed.defaultStudentId, defaultState.requests);
  }

  ensureStudent(studentId = this.seed.defaultStudentId) {
    if (this.students.has(studentId)) {
      return;
    }

    const seedState = createSeedStudentState(studentId);
    this.students.set(studentId, seedState.student);
    this.studentMeta.set(studentId, seedState.studentMeta);
    this.enrollments.set(studentId, seedState.enrollments);
    this.requests.set(studentId, seedState.requests);
  }

  async getState(studentId = this.seed.defaultStudentId) {
    return assembleDomainSnapshot(this, studentId);
  }

  async saveState(nextState, studentId = nextState.student?.id ?? this.seed.defaultStudentId) {
    const currentState = await this.getState(studentId);
    const previousOfferings = new Map(currentState.offerings.map((offering) => [offering.id, offering]));
    const offeringChanges = ensureArray(nextState.offerings)
      .filter((offering) => JSON.stringify(previousOfferings.get(offering.id)) !== JSON.stringify(offering))
      .map((offering) => ({
        offering,
        expectedVersion: previousOfferings.get(offering.id)?.version ?? null,
      }));

    await this.saveStudentState(studentId, {
      student: nextState.student,
      studentMeta: nextState.studentMeta,
      enrollments: nextState.enrollments,
      requests: nextState.requests,
    });
    await this.updateOfferings(offeringChanges);
    await this.replaceOverridesForStudent(studentId, nextState.overrides ?? []);
    await this.replaceAuditEvents(nextState.auditEvents);

    return this.getState(studentId);
  }

  async saveStudentState(studentId = this.seed.defaultStudentId, nextStudentState = {}) {
    this.ensureStudent(studentId);

    const seedState = createSeedStudentState(studentId);
    const currentMeta = this.studentMeta.get(studentId);
    const baseMeta = normalizeStudentMeta(seedState, currentMeta);

    this.students.set(studentId, clone(nextStudentState.student));
    this.studentMeta.set(studentId, {
      ...baseMeta,
      recordSequence: nextStudentState.studentMeta?.recordSequence ?? baseMeta.recordSequence,
      stateRevision: baseMeta.stateRevision + 1,
    });
    this.enrollments.set(studentId, clone(ensureArray(nextStudentState.enrollments)));
    this.requests.set(studentId, clone(ensureArray(nextStudentState.requests)));

    return this.getState(studentId);
  }

  async updateOfferings(changes = []) {
    for (const change of ensureArray(changes)) {
      const currentOffering = this.offerings.get(change.offering.id);

      if (!currentOffering) {
        throw new Error(`Offering ${change.offering.id} was not found.`);
      }

      if (
        Number.isFinite(change.expectedVersion) &&
        currentOffering.version !== change.expectedVersion
      ) {
        throw new RepositoryConflictError();
      }

      this.offerings.set(
        change.offering.id,
        normalizeOfferingVersion(change.offering, change.expectedVersion ?? currentOffering.version),
      );
    }

    return sortById([...this.offerings.values()]).map(clone);
  }

  async appendAuditEvents(events = []) {
    this.auditEvents.push(...clone(ensureArray(events)));
    return clone(this.auditEvents);
  }

  async replaceAuditEvents(events = []) {
    this.auditEvents = clone(ensureArray(events));
    return clone(this.auditEvents);
  }

  async listOverrides(filters = {}) {
    return clone(this.overrides.filter((override) => {
      if (filters.studentId && override.studentId !== filters.studentId) {
        return false;
      }

      if (filters.offeringId && override.offeringId !== filters.offeringId) {
        return false;
      }

      if (filters.active === true && !override.active) {
        return false;
      }

      if (filters.constraintType && !ensureArray(override.constraintTypes).includes(filters.constraintType)) {
        return false;
      }

      return true;
    }));
  }

  async replaceOverridesForStudent(studentId = this.seed.defaultStudentId, items = []) {
    this.overrides = this.overrides.filter((override) => override.studentId !== studentId);
    this.overrides.push(...clone(ensureArray(items)));
    return this.listOverrides({ studentId });
  }

  async createOverride(override) {
    this.overrides.push(clone(override));
    return clone(override);
  }

  async deactivateOverride(overrideId) {
    const override = this.overrides.find((item) => item.id === overrideId);

    if (!override) {
      return null;
    }

    override.active = false;
    return clone(override);
  }

  async resetOverridesForStudent(studentId = this.seed.defaultStudentId) {
    this.overrides = this.overrides.filter((override) => override.studentId !== studentId);
    return [];
  }

  async reset(studentId = this.seed.defaultStudentId) {
    const seedState = createSeedStudentState(studentId);
    this.students.set(studentId, seedState.student);
    this.studentMeta.set(studentId, seedState.studentMeta);
    this.enrollments.set(studentId, seedState.enrollments);
    this.requests.set(studentId, seedState.requests);
    await this.resetOverridesForStudent(studentId);
    return this.getState(studentId);
  }

  async resetAll() {
    this.students = new Map();
    this.studentMeta = new Map();
    this.enrollments = new Map();
    this.requests = new Map();
    this.offerings = new Map(this.seed.offerings.map((offering) => [offering.id, clone(offering)]));
    this.auditEvents = [];
    this.overrides = [];

    const defaultState = createSeedStudentState(this.seed.defaultStudentId);
    this.students.set(this.seed.defaultStudentId, defaultState.student);
    this.studentMeta.set(this.seed.defaultStudentId, defaultState.studentMeta);
    this.enrollments.set(this.seed.defaultStudentId, defaultState.enrollments);
    this.requests.set(this.seed.defaultStudentId, defaultState.requests);

    return this.getState(this.seed.defaultStudentId);
  }

  async listStudentIds() {
    return [...this.students.keys()].sort((left, right) => left.localeCompare(right));
  }

  getInfo() {
    return {
      mode: "memory",
      ...buildStateInfo(this.seed),
    };
  }

  async close() {}
}

class MongoStateRepository {
  constructor({ mongoUri, dbName = DEFAULT_DB_NAME, collectionName = DEFAULT_COLLECTION_NAME, seed = domainSeed }) {
    this.mongoUri = mongoUri;
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.seed = clone(seed);
    this.client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 });
    this.collections = null;
  }

  async init() {
    await this.client.connect();
    const db = this.client.db(this.dbName);
    this.collections = {
      semester: db.collection(`${this.collectionName}_semester`),
      programs: db.collection(`${this.collectionName}_programs`),
      departments: db.collection(`${this.collectionName}_departments`),
      courses: db.collection(`${this.collectionName}_courses`),
      offerings: db.collection(`${this.collectionName}_offerings`),
      rules: db.collection(`${this.collectionName}_rules`),
      students: db.collection(`${this.collectionName}_students`),
      studentMeta: db.collection(`${this.collectionName}_student_meta`),
      enrollments: db.collection(`${this.collectionName}_enrollments`),
      requests: db.collection(`${this.collectionName}_requests`),
      auditEvents: db.collection(`${this.collectionName}_audit_events`),
      constraintOverrides: db.collection(`${this.collectionName}_constraint_overrides`),
    };

    this.semesterRepository = {
      get: async () => {
        const docs = await this.collections.semester.find({}).toArray();
        return clone(stripMongoId(docs[0] ?? this.seed.semester));
      },
    };
    this.programRepository = {
      list: async () => sortById((await this.collections.programs.find({}).toArray()).map(stripMongoId)),
    };
    this.departmentRepository = {
      list: async () => sortById((await this.collections.departments.find({}).toArray()).map(stripMongoId)),
    };
    this.courseRepository = {
      list: async () => sortById((await this.collections.courses.find({}).toArray()).map(stripMongoId)),
      getById: async (courseId) => {
        const course = await this.collections.courses.findOne({ _id: courseId });
        return clone(stripMongoId(course));
      },
    };
    this.offeringRepository = {
      list: async () => sortById((await this.collections.offerings.find({}).toArray()).map(stripMongoId)),
      getById: async (offeringId) => clone(stripMongoId(await this.collections.offerings.findOne({ _id: offeringId }))),
      updateMany: async (changes = []) => this.updateOfferings(changes),
      resetAll: async () => {
        await this.replaceCollection(this.collections.offerings, this.seed.offerings);
        return sortById((await this.collections.offerings.find({}).toArray()).map(stripMongoId));
      },
    };
    this.studentRepository = {
      ensure: async (studentId = this.seed.defaultStudentId) => {
        await this.ensureStudentSeed(studentId);
        return clone(stripMongoId(await this.collections.students.findOne({ _id: studentId })));
      },
      get: async (studentId = this.seed.defaultStudentId) => {
        await this.ensureStudentSeed(studentId);
        return clone(stripMongoId(await this.collections.students.findOne({ _id: studentId })));
      },
      getMeta: async (studentId = this.seed.defaultStudentId) => {
        await this.ensureStudentSeed(studentId);
        return clone(stripMongoId(await this.collections.studentMeta.findOne({ _id: studentId })));
      },
      listIds: async () => {
        const students = await this.collections.students.find({}, { projection: { _id: 1 } }).toArray();
        return students.map((student) => student._id).sort((left, right) => left.localeCompare(right));
      },
    };
    this.enrollmentRepository = {
      listByStudentId: async (studentId = this.seed.defaultStudentId) =>
        sortById((await this.collections.enrollments.find({ studentId }).sort({ createdAt: 1, id: 1 }).toArray()).map(stripMongoId)),
      replaceForStudent: async (studentId = this.seed.defaultStudentId, items = []) => {
        await this.replaceCollection(
          this.collections.enrollments,
          ensureArray(items).map((item) => ({ ...item, _id: item.id })),
          { studentId },
        );
        return sortById((await this.collections.enrollments.find({ studentId }).toArray()).map(stripMongoId));
      },
    };
    this.requestRepository = {
      listByStudentId: async (studentId = this.seed.defaultStudentId) =>
        (await this.collections.requests.find({ studentId }).sort({ submittedAt: -1, id: -1 }).toArray()).map(stripMongoId),
      replaceForStudent: async (studentId = this.seed.defaultStudentId, items = []) => {
        await this.replaceCollection(
          this.collections.requests,
          ensureArray(items).map((item) => ({ ...item, _id: item.id })),
          { studentId },
        );
        return (await this.collections.requests.find({ studentId }).sort({ submittedAt: -1, id: -1 }).toArray()).map(stripMongoId);
      },
    };
    this.ruleRepository = {
      get: async () => clone(stripMongoId((await this.collections.rules.find({}).toArray())[0] ?? this.seed.rules)),
    };
    this.auditRepository = {
      list: async () => (await this.collections.auditEvents.find({}).sort({ timestamp: 1, id: 1 }).toArray()).map(stripMongoId),
      append: async (events = []) => this.appendAuditEvents(events),
      replace: async (events = []) => this.replaceAuditEvents(events),
      clear: async () => {
        await this.collections.auditEvents.deleteMany({});
        return [];
      },
    };
    this.overrideRepository = {
      list: async (filters = {}) => this.listOverrides(filters),
      replaceForStudent: async (studentId = this.seed.defaultStudentId, items = []) =>
        this.replaceOverridesForStudent(studentId, items),
      create: async (override) => this.createOverride(override),
      deactivate: async (overrideId) => this.deactivateOverride(overrideId),
      resetForStudent: async (studentId = this.seed.defaultStudentId) => this.resetOverridesForStudent(studentId),
      clear: async () => {
        await this.collections.constraintOverrides.deleteMany({});
        return [];
      },
    };

    await this.ensureCatalogSeed();
    await this.ensureStudentSeed(this.seed.defaultStudentId);
    return this;
  }

  async ensureCatalogSeed() {
    const existingOffering = await this.collections.offerings.findOne({});

    if (existingOffering) {
      return;
    }

    await Promise.all([
      this.collections.semester.replaceOne(
        { _id: this.seed.semester.number },
        { _id: this.seed.semester.number, ...clone(this.seed.semester) },
        { upsert: true },
      ),
      this.replaceCollection(this.collections.programs, this.seed.programs),
      this.replaceCollection(this.collections.departments, this.seed.departments),
      this.replaceCollection(this.collections.courses, this.seed.courses),
      this.replaceCollection(this.collections.offerings, this.seed.offerings),
      this.replaceCollection(this.collections.rules, [this.seed.rules]),
    ]);
  }

  async ensureStudentSeed(studentId = this.seed.defaultStudentId) {
    const existingStudent = await this.collections.students.findOne({ _id: studentId });

    if (existingStudent) {
      return;
    }

    const seedState = createSeedStudentState(studentId);
    await this.collections.students.replaceOne(
      { _id: studentId },
      { _id: studentId, ...clone(seedState.student) },
      { upsert: true },
    );
    await this.collections.studentMeta.replaceOne(
      { _id: studentId },
      { _id: studentId, ...clone(seedState.studentMeta) },
      { upsert: true },
    );
    await this.replaceCollection(
      this.collections.enrollments,
      seedState.enrollments.map((item) => ({ ...item, _id: item.id })),
      { studentId },
    );
    await this.replaceCollection(
      this.collections.requests,
      seedState.requests.map((item) => ({ ...item, _id: item.id })),
      { studentId },
    );
  }

  async getState(studentId = this.seed.defaultStudentId) {
    return assembleDomainSnapshot(this, studentId);
  }

  async saveState(nextState, studentId = nextState.student?.id ?? this.seed.defaultStudentId) {
    const currentState = await this.getState(studentId);
    const previousOfferings = new Map(currentState.offerings.map((offering) => [offering.id, offering]));
    const offeringChanges = ensureArray(nextState.offerings)
      .filter((offering) => JSON.stringify(previousOfferings.get(offering.id)) !== JSON.stringify(offering))
      .map((offering) => ({
        offering,
        expectedVersion: previousOfferings.get(offering.id)?.version ?? null,
      }));

    await this.saveStudentState(studentId, {
      student: nextState.student,
      studentMeta: nextState.studentMeta,
      enrollments: nextState.enrollments,
      requests: nextState.requests,
    });
    await this.updateOfferings(offeringChanges);
    await this.replaceOverridesForStudent(studentId, nextState.overrides ?? []);
    await this.replaceAuditEvents(nextState.auditEvents);

    return this.getState(studentId);
  }

  async saveStudentState(studentId = this.seed.defaultStudentId, nextStudentState = {}) {
    await this.ensureCatalogSeed();
    await this.ensureStudentSeed(studentId);

    const currentMeta = await this.collections.studentMeta.findOne({ _id: studentId });
    const seedState = createSeedStudentState(studentId);
    const baseMeta = normalizeStudentMeta(seedState, stripMongoId(currentMeta ?? {}));

    await this.collections.students.replaceOne(
      { _id: studentId },
      { _id: studentId, ...clone(nextStudentState.student) },
      { upsert: true },
    );
    await this.collections.studentMeta.replaceOne(
      { _id: studentId },
      {
        _id: studentId,
        studentId,
        recordSequence: nextStudentState.studentMeta?.recordSequence ?? baseMeta.recordSequence,
        stateRevision: baseMeta.stateRevision + 1,
      },
      { upsert: true },
    );
    await this.replaceCollection(
      this.collections.enrollments,
      ensureArray(nextStudentState.enrollments).map((item) => ({ ...item, _id: item.id })),
      { studentId },
    );
    await this.replaceCollection(
      this.collections.requests,
      ensureArray(nextStudentState.requests).map((item) => ({ ...item, _id: item.id })),
      { studentId },
    );

    return this.getState(studentId);
  }

  async updateOfferings(changes = []) {
    await this.ensureCatalogSeed();

    for (const change of ensureArray(changes)) {
      const currentOffering = await this.collections.offerings.findOne({ _id: change.offering.id });

      if (!currentOffering) {
        throw new Error(`Offering ${change.offering.id} was not found.`);
      }

      if (
        Number.isFinite(change.expectedVersion) &&
        currentOffering.version !== change.expectedVersion
      ) {
        throw new RepositoryConflictError();
      }

      const nextOffering = normalizeOfferingVersion(
        change.offering,
        change.expectedVersion ?? currentOffering.version,
      );
      const result = await this.collections.offerings.replaceOne(
        {
          _id: change.offering.id,
          ...(Number.isFinite(change.expectedVersion) ? { version: change.expectedVersion } : {}),
        },
        { _id: change.offering.id, ...clone(nextOffering) },
      );

      if (result.matchedCount === 0) {
        throw new RepositoryConflictError();
      }
    }

    return this.collections.offerings.find({}).toArray().then((items) => sortById(items.map(stripMongoId)));
  }

  async appendAuditEvents(events = []) {
    const docs = ensureArray(events).map((item) => ({ ...item, _id: item.id }));

    if (docs.length > 0) {
      await this.collections.auditEvents.insertMany(clone(docs), { ordered: true });
    }

    return docs.map(stripMongoId);
  }

  async replaceAuditEvents(events = []) {
    await this.collections.auditEvents.deleteMany({});
    const docs = ensureArray(events).map((item) => ({ ...item, _id: item.id }));

    if (docs.length > 0) {
      await this.collections.auditEvents.insertMany(clone(docs), { ordered: true });
    }

    return docs.map(stripMongoId);
  }

  async listOverrides(filters = {}) {
    const query = {};

    if (filters.studentId) {
      query.studentId = filters.studentId;
    }

    if (filters.offeringId) {
      query.offeringId = filters.offeringId;
    }

    if (filters.active === true) {
      query.active = true;
    }

    if (filters.constraintType) {
      query.constraintTypes = filters.constraintType;
    }

    return (await this.collections.constraintOverrides.find(query).sort({ createdAt: -1, id: 1 }).toArray())
      .map(stripMongoId);
  }

  async replaceOverridesForStudent(studentId = this.seed.defaultStudentId, items = []) {
    await this.replaceCollection(
      this.collections.constraintOverrides,
      ensureArray(items).map((item) => ({ ...item, _id: item.id })),
      { studentId },
    );

    return this.listOverrides({ studentId });
  }

  async createOverride(override) {
    const doc = { ...clone(override), _id: override.id };
    await this.collections.constraintOverrides.replaceOne({ _id: doc._id }, doc, { upsert: true });
    return stripMongoId(doc);
  }

  async deactivateOverride(overrideId) {
    const existing = await this.collections.constraintOverrides.findOne({ _id: overrideId });

    if (!existing) {
      return null;
    }

    await this.collections.constraintOverrides.updateOne(
      { _id: overrideId },
      { $set: { active: false } },
    );

    return {
      ...stripMongoId(existing),
      active: false,
    };
  }

  async resetOverridesForStudent(studentId = this.seed.defaultStudentId) {
    await this.collections.constraintOverrides.deleteMany({ studentId });
    return [];
  }

  async reset(studentId = this.seed.defaultStudentId) {
    const seedState = createSeedStudentState(studentId);
    await this.collections.students.replaceOne(
      { _id: studentId },
      { _id: studentId, ...clone(seedState.student) },
      { upsert: true },
    );
    await this.collections.studentMeta.replaceOne(
      { _id: studentId },
      { _id: studentId, ...clone(seedState.studentMeta) },
      { upsert: true },
    );
    await this.replaceCollection(
      this.collections.enrollments,
      seedState.enrollments.map((item) => ({ ...item, _id: item.id })),
      { studentId },
    );
    await this.replaceCollection(
      this.collections.requests,
      seedState.requests.map((item) => ({ ...item, _id: item.id })),
      { studentId },
    );
    await this.resetOverridesForStudent(studentId);
    return this.getState(studentId);
  }

  async resetAll() {
    await this.replaceCollection(this.collections.programs, this.seed.programs);
    await this.replaceCollection(this.collections.departments, this.seed.departments);
    await this.replaceCollection(this.collections.courses, this.seed.courses);
    await this.replaceCollection(this.collections.offerings, this.seed.offerings);
    await this.replaceCollection(this.collections.rules, [this.seed.rules]);
    await this.collections.students.deleteMany({});
    await this.collections.studentMeta.deleteMany({});
    await this.collections.enrollments.deleteMany({});
    await this.collections.requests.deleteMany({});
    await this.collections.auditEvents.deleteMany({});
    await this.collections.constraintOverrides.deleteMany({});
    await this.ensureStudentSeed(this.seed.defaultStudentId);
    return this.getState(this.seed.defaultStudentId);
  }

  async listStudentIds() {
    const students = await this.collections.students.find({}, { projection: { _id: 1 } }).toArray();
    return students.map((student) => student._id).sort((left, right) => left.localeCompare(right));
  }

  getInfo() {
    return {
      mode: "mongo",
      dbName: this.dbName,
      collectionPrefix: this.collectionName,
      ...buildStateInfo(this.seed, Object.values(this.collections ?? {}).map((collection) => collection.collectionName)),
    };
  }

  async replaceCollection(collection, docs, filter = {}) {
    await collection.deleteMany(filter);

    if (docs.length > 0) {
      await collection.insertMany(docs.map((doc) => clone(doc)));
    }
  }

  async close() {
    await this.client.close();
  }
}

function stripMongoId(document) {
  if (!document) {
    return document;
  }

  const { _id, ...rest } = document;
  void _id;
  return rest;
}

export async function createStateRepository({
  storageMode = process.env.ENROLLMENT_STORAGE_MODE ?? "auto",
  mongoUri = process.env.MONGODB_URI,
  dbName = process.env.MONGODB_DB_NAME ?? DEFAULT_DB_NAME,
  collectionName = process.env.MONGODB_COLLECTION_NAME ?? DEFAULT_COLLECTION_NAME,
} = {}) {
  if (storageMode === "memory") {
    return new MemoryStateRepository(domainSeed);
  }

  if (storageMode === "mongo" && !mongoUri) {
    throw new Error("ENROLLMENT_STORAGE_MODE is set to mongo, but MONGODB_URI is missing.");
  }

  if (mongoUri) {
    try {
      return await new MongoStateRepository({
        mongoUri,
        dbName,
        collectionName,
        seed: domainSeed,
      }).init();
    } catch (error) {
      if (storageMode === "mongo") {
        throw error;
      }

      console.warn(`MongoDB unavailable, falling back to in-memory repository: ${error.message}`);
    }
  }

  return new MemoryStateRepository(domainSeed);
}
