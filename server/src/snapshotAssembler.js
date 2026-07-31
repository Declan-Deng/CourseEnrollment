export async function assembleDomainSnapshot(repository, studentId = repository.seed?.defaultStudentId) {
  const effectiveStudentId =
    typeof studentId === "string" && studentId.trim() !== ""
      ? studentId.trim()
      : repository.seed?.defaultStudentId;

  const [
    semester,
    programs,
    departments,
    courses,
    rules,
    offerings,
    student,
    studentMeta,
    enrollments,
    requests,
    overrides,
    auditEvents,
  ] = await Promise.all([
    repository.semesterRepository.get(),
    repository.programRepository.list(),
    repository.departmentRepository.list(),
    repository.courseRepository.list(),
    repository.ruleRepository.get(),
    repository.offeringRepository.list(),
    repository.studentRepository.get(effectiveStudentId),
    repository.studentRepository.getMeta(effectiveStudentId),
    repository.enrollmentRepository.listByStudentId(effectiveStudentId),
    repository.requestRepository.listByStudentId(effectiveStudentId),
    repository.overrideRepository.list({ studentId: effectiveStudentId }),
    repository.auditRepository.list(),
  ]);

  return {
    semester,
    programs,
    departments,
    courses,
    rules,
    offerings,
    student,
    studentMeta,
    enrollments,
    requests,
    overrides,
    auditEvents,
  };
}
export async function assembleDomainSnapshot(repository, studentId = repository.seed?.defaultStudentId) {
  const effectiveStudentId =
    typeof studentId === "string" && studentId.trim() !== ""
      ? studentId.trim()
      : repository.seed?.defaultStudentId;

  await repository.studentRepository.ensure(effectiveStudentId);

  const [
    semester,
    programs,
    departments,
    courses,
    rules,
    offerings,
    student,
    studentMeta,
    enrollments,
    requests,
    overrides,
    auditEvents,
  ] = await Promise.all([
    repository.semesterRepository.get(),
    repository.programRepository.list(),
    repository.departmentRepository.list(),
    repository.courseRepository.list(),
    repository.ruleRepository.get(),
    repository.offeringRepository.list(),
    repository.studentRepository.get(effectiveStudentId),
    repository.studentRepository.getMeta(effectiveStudentId),
    repository.enrollmentRepository.listByStudentId(effectiveStudentId),
    repository.requestRepository.listByStudentId(effectiveStudentId),
    repository.overrideRepository.list({ studentId: effectiveStudentId }),
    repository.auditRepository.list(),
  ]);

  return {
    semester,
    programs,
    departments,
    courses,
    rules,
    offerings,
    student,
    studentMeta,
    enrollments,
    requests,
    overrides,
    auditEvents,
  };
}
