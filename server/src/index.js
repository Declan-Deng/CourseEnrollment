import cors from "cors";
import express from "express";
import { pathToFileURL } from "node:url";
import {
  cancelRequest,
  createAdminCourse,
  createAdminOffering,
  closeDataStore,
  createAdminOverride,
  deleteAdminOverride,
  dropCourse,
  getBootstrap,
  getAuditTrail,
  previewAdminOverrideImpact,
  listAdminCourseView,
  listAdminOverrideView,
  listAdminOfferingView,
  listAdminRequestView,
  previewAdminOfferingImpact,
  previewAdminRequestResolution,
  getStorageInfo,
  initDataStore,
  previewRequest,
  resetDemo,
  resolveAdminRequest,
  submitRequest,
  updateAdminOffering,
} from "./dataStore.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function createRequestError(status, headline, message = headline) {
  const error = new Error(message);
  error.status = status;
  error.headline = headline;
  return error;
}

function requireCourseId(request) {
  const { courseId } = request.body ?? {};

  if (typeof courseId !== "string" || courseId.trim() === "") {
    throw createRequestError(400, "Invalid request payload.", "A non-empty courseId is required.");
  }

  return courseId;
}

function resolveRequestOptions(request) {
  const headerStudentId = request.get("x-student-id");
  const queryStudentId = typeof request.query?.studentId === "string" ? request.query.studentId : "";
  const studentId = headerStudentId?.trim() || queryStudentId?.trim();
  const actorType = request.get("x-actor-type")?.trim() || "";
  const actorId = request.get("x-actor-id")?.trim() || "";
  const actor = actorType && actorId ? { type: actorType, id: actorId } : undefined;

  return {
    ...(studentId ? { studentId } : {}),
    ...(actor ? { actor } : {}),
  };
}

function requireRequestIdParam(request) {
  const requestId = request.params?.requestId;

  if (typeof requestId !== "string" || requestId.trim() === "") {
    throw createRequestError(400, "Invalid request path.", "A non-empty requestId is required.");
  }

  return requestId;
}

function requireOfferingIdParam(request) {
  const offeringId = request.params?.offeringId;

  if (typeof offeringId !== "string" || offeringId.trim() === "") {
    throw createRequestError(400, "Invalid request path.", "A non-empty offeringId is required.");
  }

  return offeringId;
}

function requireOverrideIdParam(request) {
  const overrideId = request.params?.overrideId;

  if (typeof overrideId !== "string" || overrideId.trim() === "") {
    throw createRequestError(400, "Invalid request path.", "A non-empty overrideId is required.");
  }

  return overrideId;
}

function requireObjectPayload(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createRequestError(400, "Invalid request payload.", message);
  }

  return value;
}

function resolveAdminRequestFilters(request) {
  const filters = {};

  if (typeof request.query?.active === "string") {
    filters.active = request.query.active === "true";
  }

  for (const key of ["status", "studentId", "offeringId"]) {
    if (typeof request.query?.[key] === "string" && request.query[key].trim() !== "") {
      filters[key] = request.query[key].trim();
    }
  }

  return filters;
}

function resolveAuditFilters(request) {
  const filters = {};

  for (const key of ["actorType", "actorId", "targetType", "targetId", "subjectStudentId", "action"]) {
    if (typeof request.query?.[key] === "string" && request.query[key].trim() !== "") {
      filters[key] = request.query[key].trim();
    }
  }

  return filters;
}

function resolveOverrideFilters(request) {
  const filters = {};

  if (typeof request.query?.active === "string") {
    filters.active = request.query.active === "true";
  }

  for (const key of ["studentId", "offeringId", "constraintType"]) {
    if (typeof request.query?.[key] === "string" && request.query[key].trim() !== "") {
      filters[key] = request.query[key].trim();
    }
  }

  return filters;
}

function resolveResetOptions(request) {
  const requestOptions = resolveRequestOptions(request);
  const bodyScope = typeof request.body?.scope === "string" ? request.body.scope.trim() : "";
  const queryScope = typeof request.query?.scope === "string" ? request.query.scope.trim() : "";
  const scope = bodyScope || queryScope;

  return {
    ...requestOptions,
    ...(scope ? { scope } : {}),
  };
}

function respondJson(handler) {
  return async (request, response) => {
    try {
      response.json(await handler(request));
    } catch (error) {
      response.status(error.status ?? 500).json({
        ok: false,
        headline: error.headline ?? "Unexpected server error.",
        message: error.message,
      });
    }
  };
}

app.get(
  "/api/health",
  respondJson(async () => ({
    ok: true,
    service: "course-enrollment-api",
    storage: await getStorageInfo(),
  })),
);
app.get("/api/bootstrap", respondJson((request) => getBootstrap(resolveRequestOptions(request))));
app.post(
  "/api/enrollment/preview",
  respondJson((request) => previewRequest(requireCourseId(request), resolveRequestOptions(request))),
);
app.post(
  "/api/enrollment/request",
  respondJson((request) => submitRequest(requireCourseId(request), resolveRequestOptions(request))),
);
app.post(
  "/api/enrollment/drop",
  respondJson((request) => dropCourse(requireCourseId(request), resolveRequestOptions(request))),
);
app.delete(
  "/api/enrollment/request/:courseId",
  respondJson((request) => cancelRequest(request.params.courseId, resolveRequestOptions(request))),
);
app.post("/api/reset", respondJson((request) => resetDemo(resolveResetOptions(request))));

app.get(
  "/api/admin/courses",
  respondJson((request) => listAdminCourseView(resolveRequestOptions(request))),
);
app.post(
  "/api/admin/courses",
  respondJson((request) =>
    createAdminCourse(
      requireObjectPayload(request.body, "A course payload object is required."),
      resolveRequestOptions(request),
    )),
);
app.post(
  "/api/admin/offerings",
  respondJson((request) =>
    createAdminOffering(
      requireObjectPayload(request.body, "An offering payload object is required."),
      resolveRequestOptions(request),
    )),
);
app.get(
  "/api/admin/offerings",
  respondJson((request) => listAdminOfferingView(resolveRequestOptions(request))),
);
app.patch(
  "/api/admin/offerings/:offeringId",
  respondJson((request) =>
    updateAdminOffering(
      requireOfferingIdParam(request),
      requireObjectPayload(request.body, "An offering patch object is required."),
      resolveRequestOptions(request),
    )),
);
app.post(
  "/api/admin/offerings/:offeringId/preview",
  respondJson((request) =>
    previewAdminOfferingImpact(
      requireOfferingIdParam(request),
      requireObjectPayload(request.body, "An offering preview patch object is required."),
      resolveRequestOptions(request),
    )),
);
app.get(
  "/api/admin/requests",
  respondJson((request) =>
    listAdminRequestView({
      ...resolveRequestOptions(request),
      filters: resolveAdminRequestFilters(request),
    })),
);
app.post(
  "/api/admin/requests/:requestId/resolve",
  respondJson((request) =>
    resolveAdminRequest(
      requireRequestIdParam(request),
      requireObjectPayload(request.body, "A resolution payload is required."),
      resolveRequestOptions(request),
    )),
);
app.post(
  "/api/admin/requests/:requestId/preview-resolution",
  respondJson((request) =>
    previewAdminRequestResolution(
      requireRequestIdParam(request),
      requireObjectPayload(request.body, "A resolution payload object is required."),
      resolveRequestOptions(request),
    )),
);
app.get(
  "/api/admin/audit",
  respondJson((request) =>
    getAuditTrail({
      ...resolveRequestOptions(request),
      filters: resolveAuditFilters(request),
    })),
);
app.get(
  "/api/admin/overrides",
  respondJson((request) =>
    listAdminOverrideView({
      ...resolveRequestOptions(request),
      filters: resolveOverrideFilters(request),
    })),
);
app.post(
  "/api/admin/overrides/preview",
  respondJson((request) =>
    previewAdminOverrideImpact(
      requireObjectPayload(request.body, "An override preview payload is required."),
      resolveRequestOptions(request),
    )),
);
app.post(
  "/api/admin/overrides",
  respondJson((request) =>
    createAdminOverride(
      requireObjectPayload(request.body, "An override payload is required."),
      resolveRequestOptions(request),
    )),
);
app.delete(
  "/api/admin/overrides/:overrideId",
  respondJson((request) =>
    deleteAdminOverride(
      requireOverrideIdParam(request),
      resolveRequestOptions(request),
    )),
);

app.use((_request, response) => {
  response.status(404).json({
    ok: false,
    headline: "Route not found.",
    message: "The requested API endpoint does not exist on this server.",
  });
});

export async function startServer({ port = PORT, storageOptions, attachSignalHandlers = true } = {}) {
  const storageInfo = await initDataStore(storageOptions);

  const server = await new Promise((resolve) => {
    const instance = app.listen(port, () => {
      const address = instance.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      console.log(
        `Enrollment API running at http://localhost:${resolvedPort} using ${storageInfo.mode} storage`,
      );
      resolve(instance);
    });
  });

  const shutdown = async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    });
    await closeDataStore();
    if (attachSignalHandlers) {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
    }
  };

  if (attachSignalHandlers) {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  return { server, shutdown, storageInfo };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error("Failed to start the enrollment API.");
    console.error(error);
    process.exit(1);
  });
}

export { app };
