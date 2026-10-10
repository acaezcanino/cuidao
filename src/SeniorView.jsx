import { useEffect, useRef, useState } from "react";
import { audioState, startAlarm, stopAlarm } from "./alarm.js";
import { setPresence } from "./presence.js";
import { useNow, useToday } from "./hooks.js";
import { doseStatus, medLabel, medDose, minutesSince, ringingSince, SENIOR_NAME, snoozeInfo, store } from "./store.js";
import { rules, useTestMode } from "./testMode.js";
import CameraCheck from "./CameraCheck.jsx";
import Coqui from "./Coqui.jsx";
import { DayTile, fmtTime, Icon, loc } from "./ui.jsx";

export default function SeniorView({ t, lang }) {
  const now = useNow(1000);
  const { date, meds, events, error } = useToday();
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pending, setPending] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [camFailed, setCamFailed] = useState(false);
  const [fallbackReady, setFallbackReady] = useState(false);
  const [askPrev, setAskPrev] = useState(false); // confirming earlier doses first
  const test = useTestMode();
  const busy = useRef(false);
  const alarmBtn = useRef(null);

  const withStatus = meds.map((m) => ({ ...m, status: doseStatus(m, events, now, meds) }));

  // The dose that needs attention right now (alarm screen).
  const active = withStatus.find((m) => ["due", "missed", "started"].includes(m.status));
  const ringing = active && active.status !== "started";

  // Earlier doses today that were never confirmed (and she hasn't said "no" to):
  // she must answer for them before taking the current one.
  const prevPending = active
    ? withStatus.filter(
        (m) => m.status === "late" && m.time < active.time &&
          !events.some((e) => e.med_id === m.id && e.type === "skipped"),
      )
    : [];
  const prev = askPrev && ringing ? prevPending[0] : null;

  // ---- Scheduler: every 10 seconds, check if any dose is due or missed ----
  useEffect(() => {
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        for (const m of withStatus) {
          const late = minutesSince(m.time);
          // Only fire for doses whose time arrived in the last hour
          // (so opening the app at night doesn't ring for the morning pills).
          if (m.status === "upcoming" && late >= 0 && late < 60) {
            await store.logEvent(m, "due", date);
          } else if (m.status === "due" && (Date.now() - ringingSince(m, events)) / 1000 >= rules().graceSeconds) {
            // "Missed" counts from when the alarm (re)started: the scheduled
            // time, or the end of the last snooze.
            await store.logEvent(m, "missed", date);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        busy.current = false;
      }
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(withStatus.map((m) => [m.id, m.status, m.time])), date]);

  // ---- Tell the test panel which alarm is on screen ----
  const alarmLabel = active ? `${active.name} (${active.status})` : null;
  useEffect(() => {
    setPresence({ alarm: alarmLabel });
    return () => setPresence({ alarm: null });
  }, [alarmLabel]);

  // ---- Alarm sound on/off ----
  useEffect(() => {
    if (ringing) startAlarm();
    else stopAlarm();
    return stopAlarm;
  }, [ringing]);

  // ---- Alarm is a modal: focus its button, make the page behind it inert ----
  const activeKey = active ? `${active.id}-${active.status}` : "";
  useEffect(() => { setCamOpen(false); setAskPrev(false); }, [activeKey]);
  // Once every earlier dose is answered, continue with the current one.
  useEffect(() => {
    if (askPrev && ringing && prevPending.length === 0 && !pending) {
      setAskPrev(false);
      record(active, "started");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askPrev, ringing, prevPending.length, pending]);
  useEffect(() => { if (prev) alarmBtn.current?.focus(); }, [prev?.id]);

  function startTaking() {
    if (prevPending.length) setAskPrev(true);
    else record(active, "started");
  }
  // Show the "confirm without camera" backup 15 s after the camera opens.
  useEffect(() => {
    setFallbackReady(false);
    if (!camOpen) return;
    const id = setTimeout(() => setFallbackReady(true), 15000);
    return () => clearTimeout(id);
  }, [camOpen]);
  const snooze = active ? snoozeInfo(active, events, now) : { left: 0 };
  useEffect(() => {
    const behind = document.querySelectorAll(".topbar, .footer, .senior-page");
    behind.forEach((el) => (el.inert = !!activeKey));
    if (activeKey) alarmBtn.current?.focus();
    return () => behind.forEach((el) => (el.inert = false));
  }, [activeKey]);

  // Clear the "well done" note after a few seconds.
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(id);
  }, [message]);

  // Camera saw the bottle in her hand: log it, then complete the dose.
  async function confirmWithCamera() {
    try {
      await store.logEvent(active, "verified", date);
    } catch (err) {
      console.error(err);
    }
    await record(active, "completed", t.doneToast);
  }

  async function record(med, type, after) {
    if (pending) return;
    setPending(true);
    setSaveError("");
    try {
      await store.logEvent(med, type, date);
      if (after) setMessage(after);
    } catch (err) {
      console.error(err);
      setSaveError(t.errorSave);
    } finally {
      setPending(false);
    }
  }

  // Test mode only: ring the next dose now. If every dose is already done,
  // reuse one (its events for today are cleared first) so testing never runs out.
  async function testAlarm() {
    const pick = withStatus.find((m) => m.status === "upcoming") || withStatus.find((m) => m.status !== "started") || withStatus[0];
    if (!pick) return;
    setMessage("");
    if (pick.status !== "upcoming") await store.resetDose(pick, date);
    await record(pick, "due");
  }

  const taken = withStatus.filter((m) => m.status === "completed").length;
  const next = withStatus.find((m) => m.status === "upcoming" && minutesSince(m.time) < 0);
  const snoozedDose = withStatus.find((m) => m.status === "snoozed");
  const snoozedUntil = snoozedDose ? snoozeInfo(snoozedDose, events, now).until : null;
  const hhmmOf = (d) => d.toTimeString().slice(0, 5);
  const clock = now.toLocaleTimeString(loc(lang), { hour: "numeric", minute: "2-digit" });
  const day = now.toLocaleDateString(loc(lang), { weekday: "long", month: "long", day: "numeric" });
  const pct = meds.length ? Math.round((taken / meds.length) * 100) : 0;

  return (
    <div className="senior">
      <div className="senior-page">
        {error && <p className="error" role="alert">{t.errorLoad}</p>}

        <section className="senior-clock" aria-labelledby="hello">
          <h1 id="hello" className="senior-hello" tabIndex={-1}>{t.hello(SENIOR_NAME)}</h1>
          <p className="senior-day">{day}</p>
          <p className="senior-time">{clock}</p>
          {meds.length > 0 && (
            <div className="progress">
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={meds.length}
                aria-valuenow={taken}
                aria-label={t.progress(taken, meds.length)}
              >
                <span style={{ width: `${pct}%` }} />
              </div>
              <p>{t.progress(taken, meds.length)}</p>
            </div>
          )}
        </section>

        <div role="status" className="senior-status">
          {message && <p className="note note-good"><Coqui mood="cheer" size={44} /> {message}</p>}
          {saveError && <p className="error">{saveError}</p>}
        </div>

        {!active && meds.length > 0 && (
          <div className="senior-next-wrap">
          {(next || snoozedDose) && <img className="peek" src="/brand/coqui-peek.png" alt="" width="150" height="81" />}
          <section className={`senior-next ${snoozedDose ? "is-snoozed" : ""}`}>
            {snoozedDose ? (
              <div>
                <p className="senior-next-label">{t.snoozedLabel}</p>
                <p className="senior-next-time">{fmtTime(hhmmOf(snoozedUntil), lang)}</p>
                <p className="senior-next-name">
                  {medLabel(snoozedDose)}
                  {medDose(snoozedDose) && <span> · {medDose(snoozedDose)}</span>}
                </p>
                <p className="senior-next-sub">{t.ringsAgain}</p>
              </div>
            ) : next ? (
              <>
                <div>
                  <p className="senior-next-label">{t.nextAt}</p>
                  <p className="senior-next-time">{fmtTime(next.time, lang)}</p>
                  <p className="senior-next-name">
                    {medLabel(next)}
                    {medDose(next) && <span> · {medDose(next)}</span>}
                  </p>
                </div>
              </>
            ) : taken === meds.length ? (
              <div className="senior-next-done"><Coqui mood="cheer" size={92} /><p>{t.allDone}</p></div>
            ) : null}
          </section>
          </div>
        )}

        <h2 className="section-title">{t.todaysPills}</h2>
        {meds.length === 0 ? (
          <div className="empty empty-art">
            <Coqui mood="sleep" size={110} />
            <p>{t.noMedsSenior}</p>
          </div>
        ) : (
          <ul className="senior-list">
            {withStatus.map((m) => (
              <li key={m.id} className={`senior-item s-${m.status}`}>
                <DayTile time={m.time} />
                <span className="senior-item-main">
                  <span className="senior-item-time">{fmtTime(m.time, lang)}</span>
                  <span className="senior-item-name">{medLabel(m)}</span>
                  {medDose(m) && <span className="senior-item-dose">{medDose(m)}</span>}
                </span>
                <span className={`badge b-${m.status}`}>
                  {m.status === "completed" && <Icon name="check" size={16} />}
                  {m.status === "snoozed" && <Icon name="clock" size={16} />}
                  {t.status[m.status]}
                  {m.status === "snoozed" && ` · ${fmtTime(hhmmOf(snoozeInfo(m, events, now).until), lang)}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {test.enabled && meds.length > 0 && (
          <div className="test-alarm">
            <button className="btn ghost wide" onClick={testAlarm} disabled={pending}>
              <Icon name="bell" /> {t.testAlarm}
            </button>
            <p className="hint small">{t.testAlarmNote}</p>
          </div>
        )}
      </div>

      {/* ---- Full-screen alarm ---- */}
      {active && (
        <div
          className={`alarm ${ringing ? "ringing" : "taking"}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="alarm-title"
          aria-describedby="alarm-med"
        >
          <div className={`alarm-inner${camOpen && !ringing ? " wide" : ""}`}>
            {prev ? (
              <div className="prev-ask">
                <p className="alarm-step" aria-hidden="true">{t.prevStep}</p>
                <h2 id="alarm-title">{t.prevTitle}</h2>
                <div id="alarm-med" className="alarm-medbox">
                  <p className="alarm-med">{medLabel(prev)}</p>
                  {medDose(prev) && <p className="alarm-dose">{medDose(prev)}</p>}
                  <p className="alarm-time">{fmtTime(prev.time, lang)}</p>
                </div>
                {saveError && <p className="error" role="alert">{saveError}</p>}
                <div className="row">
                  <button ref={alarmBtn} className="btn huge on-dark" disabled={pending} onClick={() => record(prev, "completed")}>
                    <Icon name="check" size={28} /> {t.prevYes}
                  </button>
                  <button className="btn ghost-dark" disabled={pending} onClick={() => record(prev, "skipped")}>
                    {t.prevNo}
                  </button>
                </div>
              </div>
            ) : (<>
            <p className="alarm-step" aria-hidden="true">
              <span className="on" /><span className={ringing ? "" : "on"} />
              {t.step(ringing ? 1 : 2)}
            </p>
            {!(camOpen && !ringing) && (
              <div className="alarm-art" aria-hidden="true">
                <span className="ripple" /><span className="ripple r2" />
                <Coqui mood={ringing ? "alert" : "happy"} size={190} />
              </div>
            )}
            <h2 id="alarm-title">{ringing ? t.timeToTake : t.takingSub}</h2>
            <div id="alarm-med" className="alarm-medbox">
              <p className="alarm-med">{medLabel(active)}</p>
              {medDose(active) && <p className="alarm-dose">{medDose(active)}</p>}
              <p className="alarm-time">{fmtTime(active.time, lang)}</p>
            </div>
            {saveError && <p className="error" role="alert">{saveError}</p>}
            {ringing ? (
              <button
                ref={alarmBtn}
                className="btn huge on-dark"
                disabled={pending}
                onClick={startTaking}
              >
                {t.takingNow}
              </button>
            ) : null}
            {ringing && snooze.left > 0 ? (
              <button
                className="btn ghost-dark snooze"
                disabled={pending}
                onClick={() => record(active, "snoozed", t.snoozedToast(t.dur(rules().snoozeSeconds)))}
              >
                <Icon name="clock" size={24} />
                <span>
                  {t.snooze(t.dur(rules().snoozeSeconds))}
                  <small>{snooze.left === Infinity ? t.snoozeUnlimited : t.snoozeLeft(snooze.left)}</small>
                </span>
              </button>
            ) : ringing ? (
              <p className="snooze-none">{t.snoozeNone}</p>
            ) : null}
            {/* Step 2: ONE button. "Listo" opens the camera; showing the bottle
                confirms the dose. A no-camera fallback appears if the camera
                fails or after 15 s, so she can never get stuck. */}
            {!ringing && !camOpen && (
              <button
                ref={alarmBtn}
                className="btn huge sun"
                disabled={pending}
                onClick={() => { setCamFailed(false); setCamOpen(true); }}
              >
                <Icon name="check" size={30} /> {t.done}
              </button>
            )}
            {camOpen && !ringing && (
              <>
                <p className="cam-confirm-prompt">{t.camConfirmPrompt}</p>
                <CameraCheck
                  t={t}
                  onVerified={confirmWithCamera}
                  onError={() => setCamFailed(true)}
                  onClose={() => setCamOpen(false)}
                />
                {(camFailed || fallbackReady) && (
                  <div className="cam-fallback">
                    <p>{t.confirmNoCamHint}</p>
                    <button
                      className="btn ghost-dark"
                      disabled={pending}
                      onClick={() => record(active, "completed", t.doneToast)}
                    >
                      <Icon name="check" size={24} /> {t.confirmNoCam}
                    </button>
                  </div>
                )}
              </>
            )}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
