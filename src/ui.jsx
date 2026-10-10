// Small shared UI pieces: brand mark, icons, time formatting.

// Brand mark: the official logo's jar + coquí (public/brand/cuidao-mark.png).
export function Logo({ size = 40 }) {
  return <img src="/brand/cuidao-mark.png" alt="" width={Math.round(size * 0.58)} height={size} className="logo" />;
}

const paths = {
  bell: "M12 3a6 6 0 0 0-6 6v3.5L4.5 15.5h15L18 12.5V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0",
  check: "M4.5 12.5l4.5 4.5L19.5 6.5",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20Z",
  hand: "M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5V4.5a1.5 1.5 0 0 1 3 0v6m0-1a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.9-2.6L3.6 15a1.5 1.5 0 0 1 2.4-1.8L9 15",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  alert: "M12 4 2.8 19.5h18.4L12 4Zm0 6v4m0 3h.01",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12",
  arrowLeft: "M15 6l-6 6 6 6",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z",
  refresh: "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5m5 3a8 8 0 0 1-14 5.3L4 15m0 5v-5h5",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  sunset: "M7.5 16a4.5 4.5 0 0 1 9 0M12 5v4m-7.1 1 1.4 1.4M19.1 10l-1.4 1.4M2 16h3m14 0h3M3 20h18",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  barcode: "M4 5v14M7 5v14M10 5v14M13 5v14M15.5 5v14M18 5v14M20 5v14",
  close: "M6 6l12 12M18 6 6 18",
  box: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Zm0 0L12 12l8.5-4.5M12 12v9",
  archive: "M3.5 4.5h17v4h-17zM5 8.5V19h14V8.5M10 12.5h4",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
};

// Time of day for a "HH:MM" dose time. Used for a factual row icon
// (never a picture of the pill itself, which could be mistaken for its real look).
export function partOfDay(hhmm) {
  const h = Number(hhmm.split(":")[0]);
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "night";
}
const DAY_ICON = { morning: "sun", afternoon: "sunset", night: "moon" };

export function DayTile({ time, size = 28 }) {
  const part = partOfDay(time);
  return (
    <span className={`day-tile day-${part}`} aria-hidden="true">
      <Icon name={DAY_ICON[part]} size={size} />
    </span>
  );
}

export function Icon({ name, size = 24, className = "" }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      className={`icon ${className}`} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

// Locale used for dates/times: Puerto Rico Spanish (12-hour clock) or US English.
export const loc = (lang) => (lang === "es" ? "es-PR" : "en-US");

// "14:30" -> "2:30 p. m." in the current language.
export function fmtTime(hhmm, lang) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(loc(lang), { hour: "numeric", minute: "2-digit" });
}

/* ---------------------------------------------------------------------
   Minimal, literal icons for the home role cards (easy to recognize for
   older adults): a pill with an alarm bell, and two people with a heart.
   Flat shapes, brand colors, no small details.
   --------------------------------------------------------------------- */
export function PillBellIcon({ size = 120 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      {/* capsule */}
      <g transform="rotate(-40 54 72)">
        <rect x="8" y="52" width="92" height="40" rx="20" fill="#ffffff" stroke="#063471" strokeWidth="4" />
        <path d="M54 52H28a20 20 0 0 0 0 40h26Z" fill="#f64b44" stroke="#063471" strokeWidth="4" strokeLinejoin="round" />
      </g>
      {/* bell badge */}
      <circle cx="94" cy="26" r="21" fill="#14478a" stroke="#fffaf3" strokeWidth="4" />
      <path d="M94 14a8 8 0 0 0-8 8v5l-3 4h22l-3-4v-5a8 8 0 0 0-8-8Zm-3.5 20a3.5 3.5 0 0 0 7 0" fill="#ffffff" />
    </svg>
  );
}

export function PeopleHeartIcon({ size = 120 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      {/* person (caregiver) */}
      <circle cx="40" cy="44" r="15" fill="#14478a" />
      <path d="M12 104a28 28 0 0 1 56 0Z" fill="#14478a" />
      {/* person (older adult) */}
      <circle cx="82" cy="50" r="14" fill="#ff941e" />
      <path d="M56 104a26 26 0 0 1 52 0Z" fill="#ff941e" />
      {/* heart */}
      <path d="M61 22c-4-8-17-7-17 3 0 8 9 13 17 19 8-6 17-11 17-19 0-10-13-11-17-3Z" fill="#f64b44" className="role-heart" />
    </svg>
  );
}
