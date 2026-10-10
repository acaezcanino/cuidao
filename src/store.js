// Data layer.
// - No Supabase keys in .env.local  -> "local" mode: data lives in this browser,
//   and tabs talk to each other with BroadcastChannel (perfect for a laptop demo:
//   open the older-adult view and the caregiver view side by side).
// - Supabase keys present           -> "supabase" mode: data lives in the cloud,
//   and Realtime pushes changes to every phone/laptop instantly.
// Both modes expose the SAME functions, so the screens don't care which is used.

import { createClient } from "@supabase/supabase-js";
import { REAL, rules } from "./testMode.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const HOUSEHOLD = import.meta.env.VITE_HOUSEHOLD || "demo-family";
export const SENIOR_NAME = import.meta.env.VITE_SENIOR_NAME || "Doña Luz";
export const GRACE_MINUTES = REAL.graceSeconds / 60;
// Snooze: the older adult can postpone a ringing dose 5 minutes, at most
// 2 times per dose (decided with the team). Test mode can change these;
// always read them through rules() (see testMode.js).
export const SNOOZE_MINUTES = REAL.snoozeSeconds / 60;
export const MAX_SNOOZES = REAL.maxSnoozes;
export const MODE = url && key ? "supabase" : "local";

// Event types, in the order they happen for one dose.
//   due       -> alarm rings, caregiver gets "time to take pills"
//   started   -> elder tapped "I'm taking them now"
//   completed -> elder tapped "Done"
//   missed    -> no response after GRACE_MINUTES
//   snoozed   -> elder tapped "Posponer 5 minutos" (can repeat, max MAX_SNOOZES);
//                the alarm stops and rings again SNOOZE_MINUTES later
//   verified  -> optional camera check saw the pill bottle in the person's hand
//                (informational only: it does NOT change the dose status)
//   skipped   -> before taking a later dose, the elder said she did NOT take
//                an earlier one ("No, no me la tomé")
//   lowstock  -> after a dose was taken, the pills left fell to the medication's
//                "warn at" level; the caregiver is asked to refill (row.remaining)
export const EVENT_TYPES = ["due", "started", "completed", "missed", "snoozed", "verified", "skipped", "lowstock"];

// ---- Medication fields (all optional except name/time) ----
//   strength  "50 mg"          active    false = inactive (kept for the record)
//   stock     pills on hand    lowAt     warn the caregiver at this many left (default 7)
//   perDose   pills per dose   stoppedOn "YYYY-MM-DD" it became inactive
export const DEFAULT_LOW_AT = 7;
export const isActive = (m) => m.active !== false;
// Name in the current app language when the medication has translations
// (e.g. the demo "Levothyroxine" / "Levotiroxina"); otherwise as entered.
export const medName = (m) => m.names?.[document.documentElement.lang] || m.name;
export const medDose = (m) => m.doses?.[document.documentElement.lang] || m.dose;
export const medLabel = (m) => (m.strength ? `${medName(m)} ${m.strength}` : medName(m));
export const hasStock = (m) => typeof m.stock === "number" && !Number.isNaN(m.stock);
export const isLowStock = (m) => hasStock(m) && m.stock <= (m.lowAt ?? DEFAULT_LOW_AT);

// Pills left after this dose was taken (or null when stock isn't tracked).
function stockAfterDose(m) {
  if (!hasStock(m)) return null;
  return Math.max(0, m.stock - (m.perDose || 1));
}
const REPEATABLE = new Set(["snoozed"]);

export function todayKey(d = new Date()) {
  return d.toLocaleDateString("en-CA"); // "2026-10-09"
}

const listeners = new Set();
function emit(change) {
  listeners.forEach((fn) => fn(change));
}

/* ------------------------------ LOCAL MODE ------------------------------ */

const LS_MEDS = "Cuidao.meds";
const LS_EVENTS = "Cuidao.events";
const channel =
  MODE === "local" && "BroadcastChannel" in window
    ? new BroadcastChannel("Cuidao")
    : null;

if (channel) channel.onmessage = (e) => emit(e.data);

// BroadcastChannel can arrive BEFORE another tab's localStorage write is
// visible here, which left the caregiver's list/feed stale. The "storage"
// event fires only once the write has landed, so reload on it too.
if (MODE === "local") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_MEDS || e.key === LS_EVENTS) emit({ kind: "changed" });
  });
}

function read(k, fallback) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
}
function broadcast(change) {
  emit(change); // this tab
  channel?.postMessage(change); // other tabs
}

const LS_SEED_FIX = "Cuidao.seed2";
const LS_SEED_STOCK = "Cuidao.seed3";

// Example medications for the demo (fictional patient; doses/strengths are illustrative, not advice).
const SEED = [
  { old: "Morning pills", name: "Losartán", strength: "50 mg", dose: "1 tableta", time: "08:00", stock: 30, lowAt: 7, perDose: 1 },
  { old: "Lunch pills", name: "Metformina", strength: "500 mg", dose: "1 tableta con comida", time: "13:00", stock: 60, lowAt: 7, perDose: 1 },
  { old: "Night pills", name: "Simvastatina", strength: "20 mg", dose: "1 tableta", time: "21:00", stock: 8, lowAt: 7, perDose: 1 },
];
// English/Spanish names and doses for the demo medications (shown in the app's language).
const SEED_I18N = {
  "Losartán": { names: { es: "Losartán", en: "Losartan" }, doses: { es: "1 tableta", en: "1 tablet" } },
  "Metformina": { names: { es: "Metformina", en: "Metformin" }, doses: { es: "1 tableta con comida", en: "1 tablet with food" } },
  "Simvastatina": { names: { es: "Simvastatina", en: "Simvastatin" }, doses: { es: "1 tableta", en: "1 tablet" } },
  "Amoxicilina": { names: { es: "Amoxicilina", en: "Amoxicillin" }, doses: { es: "1 cápsula", en: "1 capsule" } },
  "Levothyroxine": { names: { es: "Levotiroxina", en: "Levothyroxine" }, doses: { es: "1 tableta", en: "1 tablet" } },
};
const LS_SEED_I18N = "Cuidao.seed4";
// A past medication, kept in the record as an example of the "Inactivos" list.
function seedInactive() {
  const d = new Date(Date.now() - 20 * 86400000);
  return { id: crypto.randomUUID(), name: "Amoxicilina", strength: "500 mg", dose: "1 cápsula", time: "14:00", stock: 0, lowAt: 0, perDose: 1, active: false, stoppedOn: todayKey(d) };
}

function seedMeds() {
  // Fixed times. To demo an alarm at any hour, use "Ring now" in the test panel (#admin).
  return [
    ...SEED.map(({ old, ...m }) => ({ id: crypto.randomUUID(), ...m, ...SEED_I18N[m.name] })),
    { ...seedInactive(), ...SEED_I18N.Amoxicilina },
  ];
}

const local = {
  async listMeds() {
    let meds = read(LS_MEDS, null);
    if (!meds) {
      meds = seedMeds();
      write(LS_MEDS, meds);
    } else if (!localStorage.getItem(LS_SEED_FIX)) {
      // One-time update for browsers that saved the old demo list ("Morning pills"...):
      // new names, doses and times. Runs once only, so later caregiver edits are kept.
      meds = meds.map((m) => {
        const s = SEED.find((x) => x.old === m.name);
        return s ? { ...m, name: s.name, dose: s.dose, time: s.time } : m;
      });
      write(LS_MEDS, meds);
    }
    localStorage.setItem(LS_SEED_FIX, "1");
    if (!localStorage.getItem(LS_SEED_STOCK)) {
      // One-time: give the demo medications a strength and pill count, and add the
      // inactive example. Only fills fields that are empty, so edits are kept.
      meds = meds.map((m) => {
        const s = SEED.find((x) => x.name === m.name);
        if (!s) return m;
        return { ...m, strength: m.strength ?? s.strength, stock: m.stock ?? s.stock, lowAt: m.lowAt ?? s.lowAt, perDose: m.perDose ?? s.perDose };
      });
      if (!meds.some((m) => m.name === "Amoxicilina")) meds.push(seedInactive());
      write(LS_MEDS, meds);
      localStorage.setItem(LS_SEED_STOCK, "1");
    }
    if (!localStorage.getItem(LS_SEED_I18N)) {
      // One-time: add English names/doses to the demo medications already saved.
      // Only when the dose wasn't changed, so caregiver edits are kept.
      meds = meds.map((m) => {
        const tr = SEED_I18N[m.name];
        if (!tr || m.doses) return m;
        const sameDose = m.dose === tr.doses.es || m.dose === tr.doses.en;
        return { ...m, names: m.names || tr.names, ...(sameDose ? { doses: tr.doses } : {}) };
      });
      write(LS_MEDS, meds);
      localStorage.setItem(LS_SEED_I18N, "1");
    }
    return [...meds].sort((a, b) => a.time.localeCompare(b.time));
  },
  async addMed(med) {
    const meds = read(LS_MEDS, []);
    meds.push({ id: crypto.randomUUID(), active: true, ...med });
    write(LS_MEDS, meds);
    broadcast({ kind: "changed" });
  },
  async updateMed(id, patch) {
    write(LS_MEDS, read(LS_MEDS, []).map((m) => (m.id === id ? { ...m, ...patch } : m)));
    broadcast({ kind: "changed" });
  },
  async removeMed(id) {
    write(LS_MEDS, read(LS_MEDS, []).filter((m) => m.id !== id));
    write(LS_EVENTS, read(LS_EVENTS, []).filter((e) => e.med_id !== id));
    broadcast({ kind: "changed" });
  },
  async listEvents(date) {
    return read(LS_EVENTS, []).filter((e) => e.date === date);
  },
  async logEvent(med, type, date, remaining) {
    const events = read(LS_EVENTS, []);
    const same = events.filter((e) => e.med_id === med.id && e.date === date && e.type === type);
    // Never log the same step twice for the same dose (protects against two open tabs),
    // except snoozes, which may repeat up to MAX_SNOOZES times.
    if (REPEATABLE.has(type) ? same.length >= rules().maxSnoozes : same.length) return;
    const row = {
      id: crypto.randomUUID(),
      household: HOUSEHOLD,
      med_id: med.id,
      med_name: medLabel(med),
      type,
      date,
      created_at: new Date().toISOString(),
      ...(remaining !== undefined ? { remaining } : {}),
    };
    events.push(row);
    write(LS_EVENTS, events);
    broadcast({ kind: "event", row });

    // A dose was taken: one less in the bottle. Warn the caregiver when it runs low.
    if (type === "completed") {
      const fresh = read(LS_MEDS, []).find((m) => m.id === med.id);
      const left = fresh ? stockAfterDose(fresh) : null;
      if (left !== null) {
        await local.updateMed(med.id, { stock: left });
        if (left <= (fresh.lowAt ?? DEFAULT_LOW_AT)) await local.logEvent({ ...fresh, stock: left }, "lowstock", date, left);
      }
    }
  },
  async resetDay(date) {
    write(LS_EVENTS, read(LS_EVENTS, []).filter((e) => e.date !== date));
    broadcast({ kind: "changed" });
  },
  // Test mode: forget today's events for ONE dose so it can ring again.
  async resetDose(med, date) {
    write(LS_EVENTS, read(LS_EVENTS, []).filter((e) => !(e.date === date && e.med_id === med.id)));
    broadcast({ kind: "changed" });
  },
};

/* ---------------------------- SUPABASE MODE ----------------------------- */

// App fields (camelCase) <-> database columns (snake_case).
function toRow(m) {
  const map = { lowAt: "low_at", perDose: "per_dose", stoppedOn: "stopped_on" };
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [map[k] || k, v]));
}
function fromRow(r) {
  const { low_at, per_dose, stopped_on, ...rest } = r;
  return { ...rest, lowAt: low_at, perDose: per_dose, stoppedOn: stopped_on };
}

const supabase = MODE === "supabase" ? createClient(url, key) : null;

if (supabase) {
  supabase
    .channel("Cuidao-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "dose_events" }, (p) => {
      if (p.eventType === "INSERT" && p.new.household === HOUSEHOLD) {
        emit({ kind: "event", row: p.new });
      } else {
        emit({ kind: "changed" });
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "medications" }, () =>
      emit({ kind: "changed" })
    )
    .subscribe();
}

function check({ data, error }) {
  if (error) {
    console.error("Supabase error:", error);
    throw error;
  }
  return data;
}

const cloud = {
  async listMeds() {
    const rows = check(
      await supabase.from("medications").select("*").eq("household", HOUSEHOLD).order("time")
    );
    return rows.map(fromRow);
  },
  async addMed(med) {
    check(await supabase.from("medications").insert({ ...toRow(med), household: HOUSEHOLD }));
  },
  async updateMed(id, patch) {
    check(await supabase.from("medications").update(toRow(patch)).eq("id", id));
    emit({ kind: "changed" });
  },
  async removeMed(id) {
    check(await supabase.from("medications").delete().eq("id", id));
  },
  async listEvents(date) {
    return check(
      await supabase
        .from("dose_events")
        .select("*")
        .eq("household", HOUSEHOLD)
        .eq("date", date)
        .order("created_at")
    );
  },
  async logEvent(med, type, date, remaining) {
    if (REPEATABLE.has(type)) {
      const { count, error: countError } = await supabase
        .from("dose_events")
        .select("id", { count: "exact", head: true })
        .eq("med_id", med.id).eq("date", date).eq("type", type);
      if (countError) throw countError;
      if (count >= rules().maxSnoozes) return;
    }
    const { data, error } = await supabase
      .from("dose_events")
      .insert({ household: HOUSEHOLD, med_id: med.id, med_name: medLabel(med), type, date, ...(remaining !== undefined ? { remaining } : {}) })
      .select()
      .single();
    // 23505 = this step was already logged (unique constraint). That's fine.
    if (error && error.code !== "23505") throw error;
    if (data) emit({ kind: "event", row: data }); // update this screen right away

    if (type === "completed" && data) {
      const fresh = fromRow(check(await supabase.from("medications").select("*").eq("id", med.id).single()));
      const left = stockAfterDose(fresh);
      if (left !== null) {
        await cloud.updateMed(med.id, { stock: left });
        if (left <= (fresh.lowAt ?? DEFAULT_LOW_AT)) await cloud.logEvent({ ...fresh, stock: left }, "lowstock", date, left);
      }
    }
  },
  async resetDay(date) {
    check(await supabase.from("dose_events").delete().eq("household", HOUSEHOLD).eq("date", date));
    emit({ kind: "changed" });
  },
  async resetDose(med, date) {
    check(await supabase.from("dose_events").delete().eq("household", HOUSEHOLD).eq("date", date).eq("med_id", med.id));
    emit({ kind: "changed" });
  },
};

/* ------------------------------ PUBLIC API ------------------------------ */

export const store = MODE === "supabase" ? cloud : local;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Snoozes for one dose today: how many, and until when the current one lasts.
export function snoozeInfo(med, events, now = new Date()) {
  const snoozes = events
    .filter((e) => e.med_id === med.id && e.type === "snoozed")
    .map((e) => new Date(e.created_at).getTime())
    .sort((a, b) => a - b);
  const last = snoozes.at(-1);
  const { snoozeSeconds, maxSnoozes } = rules();
  const until = last ? new Date(last + snoozeSeconds * 1000) : null;
  return {
    count: snoozes.length,
    left: Math.max(0, maxSnoozes - snoozes.length),
    until,
    active: !!until && now < until,
  };
}

// Works out where each medication is today, from its events.
// A dose whose snooze is still running shows as "snoozed"; when the snooze
// ends it goes back to "due"/"missed" and the alarm rings again.
// "late" (No fue tomada): not taken, and either she said so ("skipped"), a later
// dose was already taken, or its time passed over an hour ago without ringing.
export function doseStatus(med, events, now = new Date(), meds = []) {
  const types = new Set(events.filter((e) => e.med_id === med.id).map((e) => e.type));
  if (types.has("completed")) return "completed";
  if (types.has("skipped")) return "late";
  if (types.has("started")) return "started";
  if (types.has("snoozed") && snoozeInfo(med, events, now).active) return "snoozed";
  // A LATER dose was already taken but this one wasn't -> "late" (not taken).
  const laterTaken = meds.some(
    (o) => o.id !== med.id && o.time > med.time && events.some((e) => e.med_id === o.id && e.type === "completed"),
  );
  if (types.has("missed")) return laterTaken ? "late" : "missed";
  if (types.has("due")) return "due";
  // Never rang (app closed) and its hour is long past -> "late" too.
  if (laterTaken || minutesSince(med.time, now) >= 60) return "late";
  return "upcoming";
}

// When the alarm (re)started ringing for this dose: when its "due" event was
// logged (normally the scheduled time; "now" when rung from the test panel),
// or the end of the last snooze, whichever is later. "Missed" is counted from here.
export function ringingSince(med, events, now = new Date()) {
  const { until } = snoozeInfo(med, events, now);
  const [h, m] = med.time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  const due = events
    .filter((e) => e.med_id === med.id && e.type === "due")
    .map((e) => new Date(e.created_at).getTime())
    .sort((a, b) => a - b)
    .at(-1);
  let start = due ? new Date(due) : scheduled;
  if (until && until > start) start = until;
  return start;
}

export function minutesSince(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  return (now - t) / 60000;
}
