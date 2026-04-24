/**
 * Horarios de referencia (America/Santiago). Ajusta en producción o carga desde API.
 * Formato: día en inglés minúsculas -> lista de { open, close } "HH:MM" 24h
 */
const SCHEDULE = {
  monday: [{ open: "09:00", close: "13:00" }],
  tuesday: [{ open: "09:00", close: "12:45" }],
  wednesday: [
    { open: "09:00", close: "13:00" },
    { open: "14:30", close: "20:00" },
  ],
  thursday: [{ open: "08:30", close: "12:45" }],
  friday: [{ open: "09:15", close: "12:45" }],
  saturday: [],
  sunday: [],
};

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function nowMinutesInSantiago() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = map[weekdayShort] ?? 1;
  return { dow, minutes: hour * 60 + minute };
}

function isOpenNow() {
  const { dow, minutes } = nowMinutesInSantiago();
  const key = WEEKDAY_KEYS[dow];
  const slots = SCHEDULE[key];
  if (!slots || slots.length === 0) return false;
  return slots.some(({ open, close }) => {
    const a = timeToMinutes(open);
    const b = timeToMinutes(close);
    return minutes >= a && minutes <= b;
  });
}

function initStatus() {
  const el = document.getElementById("status-pill");
  if (!el) return;
  const open = isOpenNow();
  el.dataset.open = open ? "true" : "false";
  const label = el.querySelector("[data-status-label]");
  if (label) label.textContent = open ? "Abierto" : "Cerrado";
}

document.addEventListener("DOMContentLoaded", initStatus);
