import { useEffect, useState } from "react";
import { useNow, useToday } from "./hooks.js";
import { doseStatus, medLabel, store } from "./store.js";
import { setTest } from "./testMode.js";
import { DayTile, fmtTime, Icon, PeopleHeartIcon, PillBellIcon } from "./ui.jsx";

// Team-only test panel (#admin). Opening it turns test mode ON automatically
// with the short demo timers (30 s snooze, unlimited, 30 s "sin confirmar");
// a banner shows on every screen and "Salir del modo prueba" turns it off.

export default function AdminPanel({ t, lang }) {
  const a = t.admin;
  const now = useNow(5000);
  const { date, meds, events } = useToday();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Entering the test panel always switches test mode on.
  useEffect(() => {
    setTest({ enabled: true, snoozeSeconds: 30, maxSnoozes: Infinity, graceSeconds: 30 });
  }, []);

  async function act(fn, msg) {
    setBusy(true);
    try {
      await fn();
      setNote(msg);
    } catch (err) {
      console.error(err);
      setNote(t.errorSave);
    } finally {
      setBusy(false);
    }
  }

  const ringNow = (m) =>
    act(async () => {
      await store.resetDose(m, date);
      await store.logEvent(m, "due", date);
    }, a.rang(medLabel(m)));


  return (
    <div className="admin">
      <a href="#" className="btn ghost small admin-back">
        <Icon name="arrowLeft" size={20} /> {a.backToApp}
      </a>
      <header className="admin-head">
        <p className="eyebrow">Cuidao</p>
        <h1 tabIndex={-1}>{a.title}</h1>
      </header>

      <div role="status" className="admin-status">
        {note && <p className="note note-good"><Icon name="check" /> {note}</p>}
      </div>

      <section className="panel" aria-labelledby="admin-doses">
        <h2 id="admin-doses">{a.doses}</h2>
        <p className="field-hint">{a.ringHint}</p>
        {meds.length === 0 ? (
          <p className="empty">{a.noMeds}</p>
        ) : (
          <ul className="admin-list">
            {meds.map((m) => {
              const st = doseStatus(m, events, now, meds);
              return (
                <li key={m.id}>
                  <DayTile time={m.time} size={22} />
                  <span className="admin-med">
                    <strong>{medLabel(m)}</strong>
                    <small>{fmtTime(m.time, lang)} · {t.statusCare[st]}</small>
                  </span>
                  <button className="btn primary small" disabled={busy} onClick={() => ringNow(m)}>
                    <Icon name="bell" size={20} /> {a.ringNow}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="admin-actions">
          <button className="btn ghost" disabled={busy} onClick={() => act(() => store.resetDay(date), a.resetDone)}>
            <Icon name="refresh" /> {a.reset}
          </button>
        </div>
      </section>

      <section aria-labelledby="admin-roles" className="panel admin-roles">
        <h2 id="admin-roles">{a.whoTitle}</h2>
        <p className="field-hint">{a.whoHint}</p>
        <div className="roles">
          <a className="role-card role-senior" href="#senior" target="_blank" rel="noopener">
            <span className="role-art" aria-hidden="true"><PillBellIcon size={96} /></span>
            <strong>{t.seniorRole}</strong>
            <span className="role-sub">{t.seniorRoleSub}</span>
          </a>
          <a className="role-card role-care" href="#caregiver" target="_blank" rel="noopener">
            <span className="role-art" aria-hidden="true"><PeopleHeartIcon size={96} /></span>
            <strong>{t.caregiverRole}</strong>
            <span className="role-sub">{t.caregiverRoleSub}</span>
          </a>
        </div>
      </section>

    </div>
  );
}
