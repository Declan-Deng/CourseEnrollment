const MONTH_INDEX = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toIsoDate(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, monthName, year] = match;
  const month = MONTH_INDEX[monthName.toLowerCase()];
  if (!month) {
    return null;
  }

  return `${year}-${month}-${day.padStart(2, "0")}`;
}

export function formatIsoDate(value) {
  const isoDate = toIsoDate(value);
  if (!isoDate) {
    return value ? String(value) : "No close date";
  }

  const [year, month, day] = isoDate.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? month} ${year}`;
}

export function isWindowCurrentlyOpen(window, referenceDate = new Date()) {
  if (!window?.isOpen) {
    return false;
  }

  const isoDate = toIsoDate(window.closesOn);
  if (!isoDate) {
    return true;
  }

  const closingPoint = new Date(`${isoDate}T23:59:59`);
  return referenceDate.getTime() <= closingPoint.getTime();
}

export function getReferenceDate(value) {
  const isoDate = toIsoDate(value);

  if (!isoDate) {
    return new Date();
  }

  return new Date(`${isoDate}T12:00:00`);
}
