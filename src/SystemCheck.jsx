import { useCallback, useEffect, useState } from "react";
import { ping } from "./presence.js";
import { doseStatus, minutesSince, MODE } from "./store.js";
import { Icon } from "./ui.jsx";

// "Revisión del sistema": checks the conditions that silently stop the app
// from working on a real device, so testing doesn't depend on breakpoints.

async function modelOk(url) {
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    const type = r.headers.get("content-type") || "";
    const size = Number(r.headers.get("content-length") || 0) || (await r.clone().arrayBuffer()).byteLength;
    return r.ok && !type.includes("text/html") && size > 1e6;
  } catch {
    return false;
  }
}

export default function SystemCheck({ t, meds, events, now }) {
  const c = t.admin.check;
  const [res, setRes] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const screens = await ping();
    const notif = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    let camera = "unknown", cams = null;
    try { camera = (await navigator.permissions.query({ name: "camera" })).state; } catch { /* not supported */ }
    try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length; } catch { /* ignore */ }
    const [hand, yolo] = await Promise.all([modelOk("/vision/models/hand_landmarker.task"), modelOk("/vision/models/yolo11n.onnx")]);
    setRes({ screens, notif, camera, cams, hand, yolo, at: new Date() });
    setRunning(false);
  }, []);

  useEffect(() => { run(); }, [run]);

  const items = [];
  if (res) {
    const senior = res.screens?.filter((s) => s.role === "senior") || [];
    const care = res.screens?.filter((s) => s.role === "caregiver") || [];
    if (res.screens === null) items.push(["warn", c.senior, c.noChannel]);
    else if (!senior.length) items.push(["fail", c.senior, c.seniorMissing]);
    else if (senior.every((s) => !s.started || s.audio !== "running")) items.push(["warn", c.senior, c.seniorLocked]);
    else if (senior.every((s) => s.hidden)) items.push(["warn", c.senior, c.seniorHidden]);
    else {
      const live = senior.find((s) => s.started && s.audio === "running") || senior[0];
      items.push(["ok", c.senior, live.alarm ? c.seniorRinging(live.alarm) : c.seniorOk]);
    }
    if (senior.length > 1) items.push(["warn", c.senior, c.seniorMany(senior.length)]);

    items.push(care.length ? ["ok", c.caregiver, c.caregiverOk] : ["info", c.caregiver, c.caregiverMissing]);
    items.push(["info", c.data, MODE === "local" ? c.dataLocal : c.dataCloud]);

    const stale = meds.filter((m) => doseStatus(m, events, now) === "upcoming" && minutesSince(m.time, now) >= 60);
    items.push(meds.length === 0 ? ["warn", c.meds, c.noMeds] : stale.length ? ["warn", c.meds, c.stale(stale.map((m) => m.name).join(", "))] : ["ok", c.meds, c.medsOk(meds.length)]);

    items.push(res.notif === "granted" ? ["ok", c.notif, c.notifOk] : ["warn", c.notif, c.notifOff(res.notif)]);
    items.push(
      res.camera === "denied" ? ["warn", c.camera, c.cameraDenied]
        : res.cams === 0 ? ["warn", c.camera, c.cameraNone]
          : ["ok", c.camera, c.cameraOk(res.camera)]
    );
    items.push(res.hand && res.yolo ? ["ok", c.models, c.modelsOk] : ["fail", c.models, c.modelsMissing(!res.hand, !res.yolo)]);
  }

  const icon = { ok: "check", warn: "alert", fail: "alert", info: "globe" };
  const today = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <section className="panel syscheck" aria-labelledby="syscheck-title">
      <div className="syscheck-head">
        <h2 id="syscheck-title">{c.title}</h2>
        <button className="btn ghost small" onClick={run} disabled={running}>
          <Icon name="refresh" size={20} /> {running ? c.running : c.rerun}
        </button>
      </div>
      <p className="field-hint">{c.intro}</p>
      <ul className="check-list" aria-live="polite">
        {items.map(([state, label, detail], i) => (
          <li key={i} className={`chk chk-${state}`}>
            <span className="chk-icon"><Icon name={icon[state]} size={20} /></span>
            <span><strong>{label}</strong><small>{detail}</small></span>
          </li>
        ))}
      </ul>

      <h3 className="syscheck-log-title">{c.log}</h3>
      {today.length === 0 ? (
        <p className="field-hint">{c.logEmpty}</p>
      ) : (
        <ol className="event-log">
          {today.map((e) => (
            <li key={e.id}>
              <time>{new Date(e.created_at).toLocaleTimeString()}</time> {e.med_name} · <code>{e.type}</code>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
