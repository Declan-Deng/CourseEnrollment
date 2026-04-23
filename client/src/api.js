const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
export const DEFAULT_STAFF_ACTOR_ID = "staff-office-001";

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.message ?? payload?.headline ?? `Request failed with status ${response.status}`);
    error.headline = payload?.headline ?? null;
    error.detail = payload?.message ?? payload?.headline ?? null;
    error.status = response.status;
    throw error;
  }

  return payload;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

function buildStaffHeaders(actorId = DEFAULT_STAFF_ACTOR_ID) {
  return {
    "x-actor-type": "staff",
    "x-actor-id": actorId,
  };
}

function buildStudentHeaders(studentId = "") {
  return studentId ? { "x-student-id": studentId } : {};
}

function buildStudentRequestOptions(studentId = "") {
  return {
    headers: buildStudentHeaders(studentId),
  };
}

export function fetchBootstrap(options = {}) {
  return request(`/bootstrap${buildQuery({ studentId: options.studentId })}`, {
    ...buildStudentRequestOptions(options.studentId),
  });
}

export function previewDecision(courseId, options = {}) {
  return request("/enrollment/preview", {
    method: "POST",
    ...buildStudentRequestOptions(options.studentId),
    body: JSON.stringify({ courseId }),
  });
}

export function submitRequest(courseId, options = {}) {
  return request("/enrollment/request", {
    method: "POST",
    ...buildStudentRequestOptions(options.studentId),
    body: JSON.stringify({ courseId }),
  });
}

export function cancelRequest(courseId, options = {}) {
  return request(`/enrollment/request/${encodeURIComponent(courseId)}`, {
    method: "DELETE",
    ...buildStudentRequestOptions(options.studentId),
  });
}

export function dropCourse(courseId, options = {}) {
  return request("/enrollment/drop", {
    method: "POST",
    ...buildStudentRequestOptions(options.studentId),
    body: JSON.stringify({ courseId }),
  });
}

export function resetDemo(options = null) {
  const hasOptions = options && Object.keys(options).length > 0;

  return request("/reset", {
    method: "POST",
    ...buildStudentRequestOptions(options?.studentId),
    ...(hasOptions ? { body: JSON.stringify(options) } : {}),
  });
}

export function fetchAdminOfferings(actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request("/admin/offerings", {
    headers: buildStaffHeaders(actorId),
  });
}

export function fetchAdminCourses(actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request("/admin/courses", {
    headers: buildStaffHeaders(actorId),
  });
}

export function createAdminCourse(payload, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request("/admin/courses", {
    method: "POST",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(payload),
  });
}

export function createAdminOffering(payload, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request("/admin/offerings", {
    method: "POST",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(payload),
  });
}

export function updateAdminOffering(offeringId, patch, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/offerings/${encodeURIComponent(offeringId)}`, {
    method: "PATCH",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(patch),
  });
}

export function previewAdminOfferingImpact(offeringId, patch, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/offerings/${encodeURIComponent(offeringId)}/preview`, {
    method: "POST",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(patch),
  });
}

export function fetchAdminRequests(filters = {}, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/requests${buildQuery(filters)}`, {
    headers: buildStaffHeaders(actorId),
  });
}

export function resolveAdminRequest(requestId, resolution, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/requests/${encodeURIComponent(requestId)}/resolve`, {
    method: "POST",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(resolution),
  });
}

export function previewAdminRequestResolution(requestId, resolution, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/requests/${encodeURIComponent(requestId)}/preview-resolution`, {
    method: "POST",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(resolution),
  });
}

export function fetchAdminOverrides(filters = {}, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/overrides${buildQuery(filters)}`, {
    headers: buildStaffHeaders(actorId),
  });
}

export function previewAdminOverrideImpact(payload, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request("/admin/overrides/preview", {
    method: "POST",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(payload),
  });
}

export function createAdminOverride(payload, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request("/admin/overrides", {
    method: "POST",
    headers: buildStaffHeaders(actorId),
    body: JSON.stringify(payload),
  });
}

export function deleteAdminOverride(overrideId, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/overrides/${encodeURIComponent(overrideId)}`, {
    method: "DELETE",
    headers: buildStaffHeaders(actorId),
  });
}

export function fetchAdminAudit(filters = {}, actorId = DEFAULT_STAFF_ACTOR_ID) {
  return request(`/admin/audit${buildQuery(filters)}`, {
    headers: buildStaffHeaders(actorId),
  });
}
