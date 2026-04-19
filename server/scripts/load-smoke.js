const baseUrl = process.env.ENROLLMENT_API_BASE_URL ?? "http://localhost:4000";
const totalRequests = Number.parseInt(process.env.LOAD_REQUESTS ?? "40", 10);
const concurrency = Number.parseInt(process.env.LOAD_CONCURRENCY ?? "8", 10);

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

async function measure(path, options) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, options);
  const elapsed = performance.now() - startedAt;

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} failed with ${response.status}: ${body}`);
  }

  return elapsed;
}

async function requestJson(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} failed with ${response.status}: ${body}`);
  }

  return response.json();
}

async function runSeries(taskFactory) {
  const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
    const samples = [];

    for (let index = workerIndex; index < totalRequests; index += concurrency) {
      samples.push(await taskFactory(index));
    }

    return samples;
  });

  return (await Promise.all(workers)).flat();
}

async function main() {
  try {
    await measure("/api/health");
  } catch (error) {
    console.error("Load smoke test could not reach the enrollment API.");
    console.error(`Expected server at ${baseUrl}.`);
    console.error(error.message);
    process.exit(1);
  }

  const bootstrapSamples = await runSeries(() => measure("/api/bootstrap"));
  const previewSamples = await runSeries((index) =>
    measure("/api/enrollment/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: index % 2 === 0 ? "IDAT7212-A-S2" : "MEBS6003-A-S2",
      }),
    }),
  );

  const allSamples = [...bootstrapSamples, ...previewSamples];
  const average = allSamples.reduce((sum, value) => sum + value, 0) / allSamples.length;

  await requestJson("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "all" }),
  });

  const adminHeaders = {
    "Content-Type": "application/json",
    "x-actor-type": "staff",
    "x-actor-id": "load-smoke-admin",
  };
  const writeSamples = [];

  writeSamples.push(
    await measure("/api/admin/offerings/IDAT7212-A-S2", {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({
        capacity: 1,
        seatsTaken: 0,
        waitlistCount: 0,
        allocationPolicy: "firstComeFirstServed",
        requestWindow: { isOpen: true },
      }),
    }),
  );

  const requestDurations = await Promise.all([
    measure("/api/enrollment/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-student-id": "4000000001",
      },
      body: JSON.stringify({ courseId: "IDAT7212-A-S2" }),
    }),
    measure("/api/enrollment/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-student-id": "4000000002",
      },
      body: JSON.stringify({ courseId: "IDAT7212-A-S2" }),
    }),
  ]);
  writeSamples.push(...requestDurations);

  const activeRequests = await requestJson("/api/admin/requests?active=true&offeringId=IDAT7212-A-S2");
  if (Array.isArray(activeRequests) && activeRequests.length > 0) {
    writeSamples.push(
      await measure(`/api/admin/requests/${encodeURIComponent(activeRequests[0].id)}/resolve`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          action: "manual-close",
          note: "Closed by load smoke scenario.",
        }),
      }),
    );
  }

  await requestJson("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "all" }),
  });

  console.log("Load smoke summary");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Requests per endpoint: ${totalRequests}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Average: ${average.toFixed(1)}ms`);
  console.log(`P50: ${percentile(allSamples, 0.5).toFixed(1)}ms`);
  console.log(`P95: ${percentile(allSamples, 0.95).toFixed(1)}ms`);
  console.log(`Max: ${Math.max(...allSamples).toFixed(1)}ms`);
  console.log(`Write scenario average: ${(writeSamples.reduce((sum, value) => sum + value, 0) / writeSamples.length).toFixed(1)}ms`);
  console.log(`Write scenario max: ${Math.max(...writeSamples).toFixed(1)}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
