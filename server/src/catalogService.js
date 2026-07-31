import { getReferenceDate, isWindowCurrentlyOpen } from "./windowDates.js";

function sortOfferings(left, right) {
  if (left.code !== right.code) {
    return left.code.localeCompare(right.code);
  }

  return left.subclass.localeCompare(right.subclass);
}

export function createCatalogIndexes(snapshot) {
  const referenceDate = getReferenceDate(snapshot.semester?.currentDate);
  const coursesByCode = new Map(snapshot.courses.map((course) => [course.code, course]));
  const offeringsById = new Map(
    snapshot.offerings.map((offering) => {
      const course = coursesByCode.get(offering.courseCode);
      const mergedOffering = {
        ...offering,
        ...course,
        id: offering.id,
        courseId: course?.id ?? offering.courseCode,
        code: offering.courseCode,
        credits: course?.credits ?? offering.credits ?? 0,
        listType: course?.listType ?? offering.listType ?? "Elective",
        crossFaculty: course?.crossFaculty ?? offering.crossFaculty ?? false,
        faculty: course?.faculty ?? offering.faculty ?? "",
        department: course?.department ?? offering.department ?? "",
        title: course?.title ?? offering.title ?? offering.courseCode,
        synopsis: course?.synopsis ?? offering.synopsis ?? "",
        requestOpen: isWindowCurrentlyOpen(offering.requestWindow, referenceDate),
        dropOpen: isWindowCurrentlyOpen(offering.dropWindow, referenceDate),
        seats: {
          capacity: offering.capacity,
          taken: offering.seatsTaken,
          waitlist: offering.waitlistCount,
        },
        schedule: offering.schedule ?? [],
        prerequisites: offering.prerequisites ?? [],
        corequisites: offering.corequisites ?? [],
      };

      return [offering.id, mergedOffering];
    }),
  );

  return {
    coursesByCode,
    offeringsById,
  };
}

export function listCatalogOfferings(snapshot) {
  const { offeringsById } = createCatalogIndexes(snapshot);
  return [...offeringsById.values()].sort(sortOfferings);
}

export function getCatalogOffering(snapshot, offeringId) {
  return createCatalogIndexes(snapshot).offeringsById.get(offeringId) ?? null;
}

export function getStudentPlanningOfferings(snapshot) {
  const { offeringsById } = createCatalogIndexes(snapshot);
  const approvedOfferingIds = snapshot.enrollments
    .filter((enrollment) => enrollment.status === "approved")
    .map((enrollment) => enrollment.offeringId);
  const activeRequestOfferingIds = snapshot.requests.filter((request) => request.active).map((request) => request.offeringId);

  return {
    approvedOfferings: approvedOfferingIds.map((offeringId) => offeringsById.get(offeringId)).filter(Boolean),
    activeRequestOfferings: activeRequestOfferingIds.map((offeringId) => offeringsById.get(offeringId)).filter(Boolean),
  };
}
