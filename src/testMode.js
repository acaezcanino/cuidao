// Test mode ("Modo prueba"): lets the team rehearse the alarm flow as many
// times as they want. OFF by default; when OFF the app uses the real rules.
// Stored per browser in localStorage, so every tab on this device shares it.

import { useEffect, useState } from "react";

const KEY = "Cuidao.test";
const EVENT = "cuidao-test";

// Real rules (used whenever test mode is OFF).
export const REAL = { snoozeSeconds: 5 * 60, maxSnoozes: 2, graceSeconds: Number(import.meta.env.VITE_GRACE_MINUTES || 2) * 60 };

export const TEST_DEFAULTS = { enabled: false, snoozeSeconds: 30, maxSnoozes: Infinity, graceSeconds: 30 };

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const v = { ...TEST_DEFAULTS, ...raw };
    if (raw.maxSnoozes === null) v.maxSnoozes = Infinity; // JSON can't store Infinity
    return v;
  } catch {
    return { ...TEST_DEFAULTS };
  }
}

export function getTest() {
  return read();
}

export function setTest(patch) {
  const next = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, maxSnoozes: next.maxSnoozes === Infinity ? null : next.maxSnoozes }));
  } catch {
    /* storage blocked: test mode just won't persist */
  }
  window.dispatchEvent(new Event(EVENT)); // this tab; other tabs get a "storage" event
}

// Rules in effect right now (real rules unless test mode is on).
export function rules() {
  const t = read();
  return t.enabled ? t : { enabled: false, ...REAL };
}

export function useTestMode() {
  const [state, setState] = useState(read);
  useEffect(() => {
    const on = (e) => { if (!e.key || e.key === KEY) setState(read()); };
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  return state;
}
