import { useEffect, useRef, useState } from "react";
import { chime, systemNotify } from "./alarm.js";
import { useNow, useToday } from "./hooks.js";
import { DEFAULT_LOW_AT, doseStatus, hasStock, isLowStock, medLabel, medName, medDose, minutesSince, SENIOR_NAME, store, subscribe, todayKey } from "./store.js";
import Coqui from "./Coqui.jsx";
import BarcodeScanner from "./BarcodeScanner.jsx";
import { rules } from "./testMode.js";
import { DayTile, fmtTime, Icon, loc } from "./ui.jsx";

const ICON = { due: "bell", started: "hand", completed: "check", missed: "alert", verified: "camera", snoozed: "clock", skipped: "alert", lowstock: "box" };

export default function CaregiverView({ t, lang }) {
  const now = useNow(10000); // re-render so snoozes expire on time and "today" rolls over
  const { date, meds, allMeds, events, error } = useToday();
  const [toasts, setToasts] = useState([]);
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState("");
  const [confirming, setConfirming] = useState(null); // { id, kind: "stop" | "delete" | "refill" }, or "reset"
  const [tab, setTab] = useState("active"); // active | inactive
  const [refillN, setRefillN] = useState("30");
  const [scanFor, setScanFor] = useState(null); // "add", or a med id (refill)
  const seen = useRef(new Set());
  const nameInput = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;

  // ---- Notify the caregiver about every NEW dose event ----
  useEffect(() => {
    return subscribe((change) => {
      if (change.kind !== "event") return;
      const row = change.row;
      if (seen.current.has(row.id)) return; // ignore duplicates
      seen.current.add(row.id);

      const text = tRef.current.notify[row.type](SENIOR_NAME, row.med_name, tRef.current.dur(rules().snoozeSeconds), row.remaining);
      chime(["missed", "skipped", "lowstock"].includes(row.type));
      systemNotify("Cuidao", text);

      const toast = { id: row.id, type: row.type, text };
      setToasts((list) => [toast, ...list].slice(0, 3));
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== toast.id)), 8000);
    });
  }, []);

  // Events that already existed when the page loaded shouldn't pop up again.
  useEffect(() => {
    events.forEach((e) => seen.current.add(e.id));
  }, [events]);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(""), 6000);
    return () => clearTimeout(id);
  }, [note]);

  const blankForm = () => ({ name: "", strength: "", dose: "", time: inMinutes(1), stock: "", lowAt: String(DEFAULT_LOW_AT) });
  const [form, setForm] = useState(blankForm);

  async function run(action, success) {
    setSaveError("");
    try {
      await action();
      if (success) setNote(success);
      return true;
    } catch (err) {
      console.error(err);
      setSaveError(t.errorSave);
      return false;
    }
  }

  async function addMed(e) {
    e.preventDefault();
    const stock = form.stock === "" ? null : Math.max(0, Math.round(Number(form.stock)));
    const med = {
      name: form.name.trim(),
      strength: form.strength.trim(),
      dose: form.dose.trim(),
      time: form.time,
      stock,
      lowAt: Math.max(0, Math.round(Number(form.lowAt) || 0)),
      perDose: 1,
      active: true,
    };
    if (!med.name || !med.time) return;
    const ok = await run(() => store.addMed(med), t.added(medLabel(med)));
    if (ok) {
      setForm(blankForm());
      setTab("active");
      nameInput.current?.focus();
    }
  }

  async function removeMed(m) {
    setConfirming(null);
    await run(() => store.removeMed(m.id), t.removed(medLabel(m)));
  }

  // Prototype: a scanned bottle that isn't in the FDA list adds the demo medication
  // straight to the active list (at the time chosen in the form).
  async function addDemoMed(d) {
    const existing = meds.find((m) => m.demo && m.name === d.name);
    if (existing) {
      setNote(t.demoAlready(medLabel(existing)));
      return;
    }
    const med = {
      name: d.name,
      names: d.names,
      strength: d.strength,
      dose: d.dose.es,
      doses: d.dose,
      time: form.time,
      stock: d.count,
      lowAt: DEFAULT_LOW_AT,
      perDose: 1,
      active: true,
      demo: true,
    };
    await run(() => store.addMed(med), t.demoAddedNote(medLabel(med), fmtTime(med.time, lang)));
    setTab("active");
  }

  // Inactive = no longer taken. It stops ringing but stays in the record.
  async function stopMed(m) {
    setConfirming(null);
    await run(() => store.updateMed(m.id, { active: false, stoppedOn: todayKey() }), t.deactivated(medLabel(m)));
  }

  async function reactivate(m) {
    await run(() => store.updateMed(m.id, { active: true, stoppedOn: null }), t.reactivated(medLabel(m)));
    setTab("active");
  }

  async function refill(e, m) {
    e.preventDefault();
    const add = Math.max(0, Math.round(Number(refillN) || 0));
    if (!add) return;
    const total = (hasStock(m) ? m.stock : 0) + add;
    setConfirming(null);
    await run(() => store.updateMed(m.id, { stock: total }), t.refilled(medLabel(m), total));
  }

  async function resetDay() {
    setConfirming(null);
    await run(() => store.resetDay(date));
  }

  const withStatus = meds.map((m) => ({ ...m, status: doseStatus(m, events, now, meds) }));
  const taken = withStatus.filter((m) => m.status === "completed").length;
  const notConfirmed = withStatus.filter((m) => m.status === "missed" || m.status === "late").length;
  const inProgress = withStatus.find((m) => ["due", "started", "snoozed"].includes(m.status));
  const next = withStatus.find((m) => m.status === "upcoming" && minutesSince(m.time) < 0);
  const feed = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const lowCount = meds.filter(isLowStock).length;
  const inactive = allMeds.filter((m) => m.active === false);
  const attention = notConfirmed || lowCount;
  const is = (id, kind) => confirming && confirming.id === id && confirming.kind === kind;
  const fmtDate = (d) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString(loc(lang), { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="care">
      <div className="toasts" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast t-${x.type}`}>
            {x.text}
          </div>
        ))}
      </div>

      <section className="care-head">
        <div>
          <p className="eyebrow">{t.careFor}</p>
          <h1 tabIndex={-1}>{SENIOR_NAME}</h1>
        </div>
        {/* The coquí mirrors the day: alert if a dose isn't confirmed, cheering when all are taken */}
        <Coqui
          size={96}
          mood={attention ? "alert" : meds.length && taken === meds.length ? "cheer" : "happy"}
        />
      </section>

      {error && <p className="error" role="alert">{t.errorLoad}</p>}

      {/* ---- At-a-glance summary ---- */}
      <ul className="summary" aria-label={t.summary}>
        <li>
          <span className="sum-label">{t.sumTaken}</span>
          <span className="sum-value">
            {taken}<small> / {meds.length}</small>
          </span>
        </li>
        <li>
          <span className="sum-label">{t.sumNext}</span>
          <span className="sum-value">
            {inProgress ? (
              <span className="sum-text">{medLabel(inProgress)} · {t.statusCare[inProgress.status]}</span>
            ) : next ? (
              <>
                {fmtTime(next.time, lang)}
                <small className="sum-sub">{medLabel(next)}</small>
              </>
            ) : (
              <span className="sum-text">{t.sumNone}</span>
            )}
          </span>
        </li>
        <li className={attention ? "sum-alert" : "sum-ok"}>
          <span className="sum-label">{t.sumAttention}</span>
          {attention ? (
            <>
              {notConfirmed > 0 && (
                <span className="sum-value sum-text"><Icon name="alert" /> {t.sumNotConfirmed(notConfirmed)}</span>
              )}
              {lowCount > 0 && (
                <span className="sum-value sum-text"><Icon name="box" /> {t.sumLow(lowCount)}</span>
              )}
            </>
          ) : (
            <span className="sum-value sum-text"><Icon name="check" /> {t.sumAllGood}</span>
          )}
        </li>
      </ul>

      <div role="status" className="care-status">
        {note && <p className="note note-good"><Icon name="check" /> {note}</p>}
        {saveError && <p className="error">{saveError}</p>}
      </div>

      <div className="care-grid">
        <section className="panel" aria-labelledby="sched">
          <h2 id="sched">{t.medsTitle}</h2>
          <div className="seg-row med-tabs" role="group" aria-label={t.medsTitle}>
            <button type="button" className={`seg-btn ${tab === "active" ? "on" : ""}`} aria-pressed={tab === "active"} onClick={() => setTab("active")}>
              {t.tabActive(meds.length)}
            </button>
            <button type="button" className={`seg-btn ${tab === "inactive" ? "on" : ""}`} aria-pressed={tab === "inactive"} onClick={() => setTab("inactive")}>
              {t.tabInactive(inactive.length)}
            </button>
          </div>

          {tab === "active" ? (
            <>
              <h3 className="list-sub">{t.schedule}</h3>
              {meds.length === 0 ? (
                <div className="empty empty-art">
                  <Coqui mood="sleep" size={96} />
                  <p>{t.emptySchedule}</p>
                </div>
              ) : (
                <ul className="care-list">
                  {withStatus.map((m) => (
                    <li key={m.id} className={is(m.id, "stop") ? "is-confirming" : ""}>
                      <DayTile time={m.time} size={22} />
                      <span className="care-time">{fmtTime(m.time, lang)}</span>
                      <span className="care-name">
                        <span>{medName(m)}{m.strength && <span className="strength"> {m.strength}</span>}</span>
                        {medDose(m) && <small>{medDose(m)}</small>}
                      </span>
                      <span className="care-tags">
                        <span className={`badge b-${m.status}`}>{t.statusCare[m.status]}</span>
                        {hasStock(m) && (
                          <span className={`stock ${isLowStock(m) ? "low" : ""}`}>
                            <Icon name="box" size={16} /> {t.pillsLeft(m.stock)}
                            {isLowStock(m) && <strong> · {t.lowStock}</strong>}
                          </span>
                        )}
                      </span>
                      <span className="care-actions">
                        <button className="icon-btn" title={t.refill} aria-label={`${t.refill} ${medLabel(m)}`}
                          onClick={() => { setRefillN("30"); setConfirming({ id: m.id, kind: "refill" }); }}>
                          <Icon name="plus" size={22} />
                        </button>
                        <button className="icon-btn" title={t.deactivate} aria-label={`${t.deactivate} ${medLabel(m)}`}
                          onClick={() => setConfirming({ id: m.id, kind: "stop" })}>
                          <Icon name="archive" size={22} />
                        </button>
                      </span>
                      {is(m.id, "stop") && (
                        <div className="confirm" role="group" aria-label={t.confirmDeactivate(medLabel(m))}>
                          <p>{t.confirmDeactivate(medLabel(m))}</p>
                          <div className="confirm-actions">
                            <button className="btn primary small" onClick={() => stopMed(m)}>{t.yesDeactivate}</button>
                            <button className="btn ghost small" onClick={() => setConfirming(null)} autoFocus>{t.cancel}</button>
                          </div>
                        </div>
                      )}
                      {is(m.id, "refill") && (
                        <form className="confirm refill" onSubmit={(e) => refill(e, m)}>
                          <label>
                            {t.refillQ(medLabel(m))}
                            <input type="number" min="1" max="999" inputMode="numeric" value={refillN}
                              onChange={(e) => setRefillN(e.target.value)} autoFocus />
                          </label>
                          <div className="confirm-actions">
                            <button className="btn primary small"><Icon name="plus" size={20} /> {t.refillAdd}</button>
                            <button type="button" className="btn ghost small" onClick={() => setScanFor(m.id)}>
                              <Icon name="barcode" size={20} /> {t.scan.titleRefill}
                            </button>
                            <button type="button" className="btn ghost small" onClick={() => { setConfirming(null); setScanFor(null); }}>{t.cancel}</button>
                          </div>
                        </form>
                      )}
                      {is(m.id, "refill") && scanFor === m.id && (
                        <BarcodeScanner
                          t={t}
                          lang={lang}
                          mode="refill"
                          onDemo={(d) => setRefillN(String(d.count))}
                          onClose={() => setScanFor(null)}
                          onUse={(info) => {
                            if (info.count) setRefillN(String(info.count));
                            setScanFor(null);
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="field-hint list-sub">{t.inactiveHint}</p>
              {inactive.length === 0 ? (
                <p className="empty">{t.inactiveEmpty}</p>
              ) : (
                <ul className="care-list inactive-list">
                  {inactive.map((m) => (
                    <li key={m.id} className={is(m.id, "delete") ? "is-confirming" : ""}>
                      <span className="day-tile day-off" aria-hidden="true"><Icon name="archive" size={22} /></span>
                      <span className="care-name">
                        <span>{medName(m)}{m.strength && <span className="strength"> {m.strength}</span>}</span>
                        {medDose(m) && <small>{medDose(m)}</small>}
                        <small>
                          {t.usedAt(fmtTime(m.time, lang))}
                          {m.stoppedOn && ` · ${t.stoppedOn(fmtDate(m.stoppedOn))}`}
                          {hasStock(m) && ` · ${t.pillsLeft(m.stock)}`}
                        </small>
                      </span>
                      <span className="care-actions">
                        <button className="btn ghost small" onClick={() => reactivate(m)}>
                          <Icon name="refresh" size={18} /> {t.reactivate}
                        </button>
                        <button className="icon-btn" title={t.deleteForever} aria-label={`${t.deleteForever}: ${medLabel(m)}`}
                          onClick={() => setConfirming({ id: m.id, kind: "delete" })}>
                          <Icon name="trash" size={22} />
                        </button>
                      </span>
                      {is(m.id, "delete") && (
                        <div className="confirm" role="group" aria-label={t.confirmDelete(medLabel(m))}>
                          <p>{t.confirmDelete(medLabel(m))}</p>
                          <div className="confirm-actions">
                            <button className="btn danger small" onClick={() => removeMed(m)}>{t.yesDelete}</button>
                            <button className="btn ghost small" onClick={() => setConfirming(null)} autoFocus>{t.cancel}</button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="add-head">
            <h3>{t.addMed}</h3>
            {scanFor !== "add" && (
              <button type="button" className="btn ghost small" onClick={() => setScanFor("add")}>
                <Icon name="barcode" size={20} /> {t.scanBtn}
              </button>
            )}
          </div>
          {scanFor === "add" && (
            <BarcodeScanner
              t={t}
              lang={lang}
              mode="add"
              onDemo={addDemoMed}
              onClose={() => setScanFor(null)}
              onUse={(info) => {
                setForm((f) => ({
                  ...f,
                  name: info.name,
                  strength: info.strength,
                  stock: info.count != null ? String(info.count) : f.stock,
                }));
                setScanFor(null);
                setNote(t.scanFilled(info.strength ? `${info.name} ${info.strength}` : info.name));
                setTab("active");
                setTimeout(() => nameInput.current?.focus(), 0);
              }}
            />
          )}
          <form className="add-form" onSubmit={addMed} aria-label={t.addMed}>
            <label>
              {t.medName}
              <input
                ref={nameInput}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t.medNamePh}
                autoComplete="off"
                required
              />
            </label>
            <label>
              {t.medStrength}
              <input
                value={form.strength}
                onChange={(e) => setForm({ ...form, strength: e.target.value })}
                placeholder={t.medStrengthPh}
                autoComplete="off"
              />
            </label>
            <label>
              {t.medDose}
              <input
                value={form.dose}
                onChange={(e) => setForm({ ...form, dose: e.target.value })}
                placeholder={t.medDosePh}
                aria-describedby="dose-hint"
                autoComplete="off"
              />
              <span id="dose-hint" className="field-hint">{t.medDoseHint}</span>
            </label>
            <label>
              {t.medTime}
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                required
              />
            </label>
            <div className="form-row">
              <label>
                {t.medStock}
                <input
                  type="number" min="0" max="9999" inputMode="numeric"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  aria-describedby="stock-hint"
                />
              </label>
              <label>
                {t.medLowAt}
                <input
                  type="number" min="0" max="999" inputMode="numeric"
                  value={form.lowAt}
                  onChange={(e) => setForm({ ...form, lowAt: e.target.value })}
                />
              </label>
            </div>
            <span id="stock-hint" className="field-hint">{t.medStockHint}</span>
            <button className="btn primary">
              <Icon name="plus" /> {t.add}
            </button>
          </form>
        </section>

        <section className="panel" aria-labelledby="live">
          <h2 id="live">
            <span className="live-dot" aria-hidden="true" /> {t.liveActivity}
          </h2>
          {feed.length === 0 ? (
            <div className="empty empty-art">
              <Coqui mood="sleep" size={80} />
              <p>{t.noActivity}</p>
            </div>
          ) : (
            <ul className="feed">
              {feed.map((e) => (
                <li key={e.id} className={`f-${e.type}`}>
                  <span className="feed-icon"><Icon name={ICON[e.type]} size={22} /></span>
                  <span className="feed-text">
                    {t.notify[e.type](SENIOR_NAME, e.med_name, t.dur(rules().snoozeSeconds), e.remaining).replace(/^\S+\s/, "")}
                  </span>
                  <time dateTime={e.created_at}>
                    {new Date(e.created_at).toLocaleTimeString(loc(lang), {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
          {confirming === "reset" ? (
            <div className="confirm" role="group" aria-label={t.confirmReset}>
              <p>{t.confirmReset}</p>
              <div className="confirm-actions">
                <button className="btn danger small" onClick={resetDay}>{t.yesReset}</button>
                <button className="btn ghost small" onClick={() => setConfirming(null)} autoFocus>
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn ghost small reset" onClick={() => setConfirming("reset")}>
              <Icon name="refresh" size={20} /> {t.resetDay}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function inMinutes(n) {
  return new Date(Date.now() + n * 60000).toTimeString().slice(0, 5);
}
