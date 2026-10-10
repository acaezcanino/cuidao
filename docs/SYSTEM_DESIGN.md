# Cuidao — System Design

Medication reminders for older adults, with live updates for their caregivers.
Hackathon prototype (Caribbean AI Summit, Oct 2026). Last updated: 2026-10-09.

> **Legend:** ✅ implemented and verified · 🟡 implemented, not verified in this environment · 💡 proposal (not built)

---

## 1. Architecture (as built)

```
Browser (React 19 + Vite 8, single page, no router)
 ├─ App.jsx            role from URL hash (#senior / #caregiver), language, unlock screen
 ├─ SeniorView.jsx     clock, progress, schedule, scheduler loop, full-screen alarm
 ├─ CaregiverView.jsx  summary, schedule CRUD, live feed, toasts + system notifications
 ├─ hooks.js           useNow (clock), useToday (meds + today's events, live)
 ├─ store.js           data layer — same API in two modes ↓
 ├─ alarm.js           Web Audio alarm/chime, vibration, Notification API
 ├─ ui.jsx             Logo (official mark), Icon set, day tiles, time formatting (es-PR / en-US)
 ├─ Coqui.jsx          mascot SVG in 5 moods
 ├─ AdminPanel.jsx     team-only test panel at #admin (§11)
 ├─ testMode.js        test-mode settings + rules() used by the scheduler/snooze
 ├─ SystemCheck.jsx    (unused) former "Revisión del sistema" checklist, removed from the test panel
 ├─ presence.js        open screens answer the checklist's ping (BroadcastChannel)
 ├─ CameraCheck.jsx    optional camera check UI (alarm step 2) — see §9
 ├─ vision.js          MediaPipe HandLandmarker + YOLO11n (onnxruntime-web), lazy-loaded
 ├─ visionLogic.js     pure CV helpers: letterbox, YOLO decode + NMS, 'is holding', hold tracker
public/brand/          official logo assets (PNG)
public/vision/models/  yolo11n.onnx (committed) + hand_landmarker.task (downloaded by `npm run models`)
scripts/fetch-models.mjs  downloads the MediaPipe hand model (runs on `npm install`)
 └─ i18n.js            all copy, Spanish (default) + English

store.js
 ├─ "local" mode (no env keys)   localStorage + BroadcastChannel + storage event → tabs on ONE device
 └─ "supabase" mode (env keys)   Postgres tables + Realtime → phones on different devices
```

**Data model** (`supabase/schema.sql`, mirrored in local mode)
- `medications(id, household, name, dose, time "HH:MM")`
- `dose_events(id, household, med_id, med_name, type, date "YYYY-MM-DD")`, unique `(med_id, date, type)`
- `type`: `due → started → completed`, or `due → missed`; `snoozed` (up to 2 per dose, each pauses the alarm 5 min) (no confirmation after `GRACE_MINUTES`, default 2); plus the informational `verified` (camera saw the bottle in hand), which never changes the dose status; and `skipped` (she answered "No, no me la tomé" for an earlier dose, see §14)

**Dose state machine** (`doseStatus`): `completed > started > snoozed (while a snooze is running) > missed > due > upcoming`. When a snooze ends, the dose goes back to `due`/`missed` and the alarm rings again. **"Missed" is counted from when the alarm (re)started**: the scheduled time, or the end of the last snooze (`ringingSince`), so a snooze never triggers a false "sin confirmar".
The **senior's page** runs the scheduler (every 10 s). It logs `due` when a dose's time arrived within the last 60 min, and `missed` when a `due` dose passes the grace period. If no senior page is open, nothing is logged.

## 2. What works / what's mocked

| Area | Status |
|---|---|
| Two-tab demo (local mode): add med → alarm → "taking" → "done" → caregiver feed/toasts | ✅ automated test |
| "Not confirmed" (missed) alert to caregiver, alarm keeps ringing for senior | ✅ automated test |
| Remove medication / reset day with confirmation | ✅ automated test |
| Spanish/English toggle, 12-hour Puerto Rico time format | ✅ automated test |
| Mobile 360 px layout, no horizontal scroll | ✅ automated test |
| Alarm sound (Web Audio) and OS notifications | 🟡 code path runs; audio/notification output not observable headless |
| Supabase mode (cloud sync across phones) | 🟡 not tested here: no project keys in this environment |
| Camera check: YOLO11n in the browser (load, inference, box decoding) | ✅ automated test, boxes match Ultralytics (IoU 0.97–0.99) |
| Camera check: UI, fallback when models can't load, "Listo" never blocked | ✅ automated test with a fake webcam |
| Camera check: real hand tracking + "holding the bottle" on a real camera | 🟡 logic unit-tested; needs a run on a real device (hand model can't be downloaded in the test environment) |
| Alerts when the app is closed (web push / SMS) | 💡 not built |
| Real accounts / per-user security | 💡 not built; DB policies are demo-only |
| Verifying that pills were actually taken | 💡 not built; confirmations are self-reported |
| Google Fonts (Nunito, Atkinson Hyperlegible) | 🟡 loaded from Google at runtime; falls back to system fonts offline |

## 3. Design system

**Personality.** A friendly Puerto Rican home, not a hospital: warm, respectful, never childish. Slogan: **"¿Ya te las tomaste?"** (EN: "Did you take them?").

**Official logo** (supplied by the team, 2026-10-09): an orange pill jar with a blue cap and a red heart label, a little brown coquí peeking over the top, the navy "Cuidao" wordmark and the slogan. The assets are in `public/brand/`:
- `cuidao-logo-noslogan.png`: logo without the slogan line (home hero `<h1>`, alt "Cuidao")
- `cuidao-logo.png`: full logo with slogan (README; available for marketing)
- `cuidao-mark.png`: jar + coquí (top bar, apple-touch icon)
- `coqui-peek.png`: the logo's coquí, peeking over the top edge of the senior's "Próxima" card
- `favicon.png`: 64 px browser-tab icon

**Color tokens** (`src/App.css :root`), sampled from the logo artwork. All text pairs ≥ 4.5:1; control borders ≥ 3:1.

| Token | Hex | From the logo | Use |
|---|---|---|---|
| `--navy` / `--brand-strong` | `#063471` | wordmark, slogan | headings, alarm pulse, focus ring, button text on orange (11.6:1 on bg) |
| `--brand` | `#14478a` | jar cap | primary buttons, senior clock card, alarm screen (white on it 9.1:1) |
| `--brand-light` | `#4679bf` | cap stripes | graphics only |
| `--accent` | `#ff941e` | jar body | progress bar, "Próxima" bar, step-2 "Listo" button (navy text 5.5:1), coquí sparks |
| `--accent-ink` | `#a14f00` | (darkened jar) | orange used as text (5.6:1) |
| `--heart` | `#f64b44` | label heart | graphics only |
| `--frog` / `--frog-dark` / `--belly` / `--cheek` | `#c66b31` / `#ad5a2b` / `#fed5a6` / `#f18a41` | coquí | mascot only |
| `--bg` / `--surface` / `--surface-2` | `#fffaf3` / `#ffffff` / `#fff1e0` | warm white | page / cards / panels |
| `--ink` / `--muted` | `#142640` / `#4f5a6e` | — | body text (14.6:1 / 6.7:1) |
| `--control` | `#7f889c` | — | input and button borders |
| status `due / taking / done / miss` | `#93460c / #1f5d99 / #1b6b3e / #a8261b` on `-soft` tints | — | badges, feed, toasts (all ≥ 5.6:1) |

Status colors stay semantic (green = taken, red = not confirmed) and always come with an icon and a text label, so color is never the only signal.

**Typography.** Nunito 800–900 for headings and the wordmark (rounded, matching the logo lettering); Atkinson Hyperlegible for body/UI (made for low-vision readers). Base size 18 px; senior screen 21 px; the alarm button is 28 px.

**Mascot: the coquí** (`src/Coqui.jsx`). It's redrawn from the logo as SVG so it can change pose, using the logo's exact colors. It is always decorative (`aria-hidden`); the text next to it carries the meaning.

| Mood | Where |
|---|---|
| `wave` (waving arm, animated) | home hero with speech bubble "¡Hola! Soy el coquí de Cuidao. Yo te aviso cuando toque."; caregiver start screen |
| `alert` (open mouth, the logo's orange lines) | senior start screen; alarm step 1 (hops while ringing); caregiver header when a dose is not confirmed |
| `happy` | alarm step 2 ("Tómese su medicina…"); caregiver header by default |
| `cheer` (arms up, sparks) | "¡Muy bien! Su familia ya sabe."; senior "Todo listo por hoy"; caregiver header when every dose is taken |
| `sleep` (z z) | empty schedule (senior + caregiver), empty live activity |
| logo PNG "peek" | peeking from behind the senior's "Próxima" card |

**Role-card icons** (`ui.jsx`). The home role cards deliberately use plain, literal icons instead of the mascot, so older adults recognize them instantly: `PillBellIcon` (a capsule with an alarm bell) for "Yo tomo medicamentos", and `PeopleHeartIcon` (two people with a heart) for "Yo cuido a alguien".

**Day tiles.** Each schedule row has a time-of-day tile (sun = morning, sunset = afternoon, moon = night), derived only from the dose time.
- **Safety rule:** the UI never draws a pill in a per-medication color or shape, because an older adult could match the drawing to the wrong real pill. If pill appearance is ever shown, it must come from pharmacy/prescription data.

**Alarm screen.** Full-color (cap blue ↔ navy, 1.6 s cycle, no flashing) with ripple rings and a hopping alert coquí. "Paso 1 de 2 / Paso 2 de 2" indicator. Step 1 uses a white button ("Las estoy tomando"), step 2 an orange button with navy text ("Listo, ya me las tomé"), so the two steps can't be confused. White focus ring on dark.

**Components.** `.btn` (primary / success / danger / ghost; min 48 px tall, 56 px default, 88 px `huge`), `.badge` (status pill), `.panel`, `.summary` cards, `.empty` (dashed empty state), `.note` / `.error` (`role=status` / `role=alert`), `.confirm` (inline two-step destructive action), `.toast`, `.alarm` (modal), `Icon` (12 stroke icons), `Logo`.

**Copy voice.** Senior screens use "usted"; caregiver screens use "tú". Short sentences. No medical instructions anywhere. Dose text is shown exactly as the caregiver typed it.

## 4. User journeys

1. **First visit → choose role.** Home explains the promise ("Las pastillas a tiempo. La familia tranquila."), shows the 3-step "Así funciona", and asks "¿Quién va a usar este equipo?".
2. **Unlock.** A role-specific screen explains why the tap is needed (browsers block sound until a tap) and asks for notification permission.
3. **Senior, daily.** Greeting + clock + "1 de 3 tomadas hoy" progress → "Próxima" card → list. When the alarm rings, a full-screen dialog shows one button at a time: "Las estoy tomando" → "Listo, ya me las tomé" → "¡Muy bien! Su familia ya sabe."
4. **Caregiver, daily.** Summary (taken / next dose / needs attention) → schedule with add/remove → live feed. A chime + toast + OS notification fires for each step; "Sin confirmar" turns the attention card red.

## 5. Changes made in this audit (2026-10-09)

**Brand & visual:** official logo, palette and slogan applied; coquí mascot in 5 moods; time-of-day tiles; full-color alarm screen with a 2-step indicator; warm palette and tokens, two-font type system, SVG icon set replacing emojis in the UI, redesigned home (hero, role cards, how-it-works), start, senior and caregiver screens.

**Storytelling & feedback:** role-specific unlock screens; senior progress bar and "next dose" card; caregiver at-a-glance summary; empty states for no medications and no activity; success messages after add/remove/done; field hint "Escríbela tal como dice la receta"; translated placeholders; clearer disclaimer.

**Accessibility (WCAG 2.2 AA):** skip link; `lang` on html (es) and on the language button; focus moves to the new screen's heading; the alarm is a true modal (`aria-modal`, labelled, focus on its button, page behind made `inert`); destructive confirms focus "Cancelar" first; touch targets ≥ 44–48 px (remove button 36 → 48 px); contrast fixes (input/button borders, placeholder); no opacity-dimmed completed items; reduced-motion and forced-colors support; alarm pulse slowed to 1.6 s (well under 3 flashes/s).

**Bugs fixed:**
- *Stale caregiver screen in demo mode.* BroadcastChannel could arrive before the other tab's localStorage write was visible, so the schedule/feed missed the "due" step. Fixed by reloading on the `storage` event, plus ignoring out-of-order reloads in `useToday`. (Data layer only; no change to dose logic.)
- Caregiver view didn't roll over to a new day at midnight (now re-renders every 30 s).
- Save/record errors were unhandled promise rejections; they now show a message and the UI recovers.
- Double-tap on alarm buttons could fire twice; buttons now disable while saving.
- Language preference crashed if localStorage was blocked (private mode); now guarded.
- Medication names and doses are trimmed; whitespace-only names are rejected.

**Medication-safety wording:** "Missed" → **"Not confirmed" / "Sin confirmar"**. The app only knows the user didn't tap, not that the dose was skipped.

## 6. Open issues & safety ambiguities (not resolved: need product decisions)

1. **"Test alarm" uses a real dose.** It logs `due` on the next scheduled medication. If the senior then taps "Done", that real dose is recorded as taken early. Now labelled "(demo)" with a warning; it should be removed or made non-recording before real use.
2. **Snooze is implemented (2 × 5 min, decided with the team); there is still no "skip" or "I already took it" path.** After 2 snoozes the alarm can only be closed by confirming or it becomes "sin confirmar". Whether a senior may dismiss without confirming is a clinical/product decision.
3. **Late opening.** If the senior page opens more than 2 min after a dose time (but within 60 min), the dose goes `due` → `missed` within ~10 s and the caregiver is alerted right away.
4. **Doses more than 60 min past are never alarmed or flagged** if the page was closed. The caregiver sees "Más tarde"/"Later" for a dose that is actually overdue. Needs an "overdue" state.
5. **Removing a medication erases its history for today** (warned in the confirm). A real product should archive, not delete.
6. **Scheduling lives in the senior's browser tab.** Closed tab, sleeping phone, or a dead battery means no alarm and no caregiver alert. This is the most important gap.
7. **Demo security.** Anyone with the publishable key can read/write all households. Use fictional data only.
8. **Same-time medications** ring one after another, not together.
9. **No lint or unit-test setup** in the repo. Verification was done with a Playwright script outside the repo (see §7).

## 7. How this was verified

- `npm run build`: passes (Vite 8).
- End-to-end Playwright run (headless Chromium, two tabs in demo mode), 30/30 checks passing on 3 consecutive runs: language toggle, required-field validation, add medication + confirmation, alarm opens with focus + inert background, caregiver toast and status at each step, "Done" closes the alarm, not-confirmed flagged in summary + feed while the senior alarm keeps ringing, remove/reset confirmations (cancel and confirm), 12-hour es-PR times, 360 px mobile with no horizontal scroll, zero runtime errors.
- Contrast ratios computed for every token pair (§3).
- Not verified: audible output, OS notifications on real phones, Supabase mode, screen readers (NVDA/VoiceOver).

## 8. Future improvements (proposals)

1. 💡 **Server-side scheduling + push** (Supabase Edge Function + cron → Web Push / SMS / WhatsApp), so alarms and caregiver alerts work with the app closed. Fixes issue 6.
2. 💡 **Accounts and per-household security** (Supabase Auth + RLS).
3. 💡 **"Overdue" state and a clinician-approved policy** for snooze/skip/late doses (issues 2–4).
4. 💡 **Installable PWA** (manifest + service worker) so the senior screen opens like an app and keeps the screen on.
5. 💡 **Weekly adherence view** for the caregiver; refill reminders.
6. 💡 **Better camera check:** fine-tune YOLO on a pill-bottle dataset (COCO has no pill-bottle class); add hand-to-mouth detection with MediaPipe FaceLandmarker; record a confidence score with the `verified` event.
7. 💡 Add ESLint + Vitest, and move the Playwright script into the repo as `npm test`.
8. 💡 Ask the designer for the logo as SVG (sharper at every size, smaller files) and an English-slogan variant.
9. 💡 Self-host the two fonts (remove the Google Fonts dependency for privacy and offline use).

## 9. Camera check (computer vision) — implemented 2026-10-09

**What it does.** At alarm step 2 ("Tómese su medicina y luego toque Listo"), an optional **"Verificar con la cámara"** button opens the front camera. The 21-point hand skeleton and boxes around bottle-like objects are drawn live. When a hand **holds** a bottle steadily for 1.2 s, it shows "¡Listo! Vimos el frasco en su mano." and logs a `verified` event. The caregiver gets "📷 Doña Luz mostró el frasco a la cámara". The alarm then shows a badge "Frasco visto por la cámara".

**Pipeline (all in the browser, `src/vision.js`).**
1. `getUserMedia` (front camera, 640×480 ideal).
2. **MediaPipe HandLandmarker** (`@mediapipe/tasks-vision`, VIDEO mode, up to 2 hands, GPU delegate with CPU fallback) runs on every animation frame and returns 21 landmarks per hand.
3. **YOLO11n** (Ultralytics, COCO-pretrained, exported to ONNX at 320 px, 10 MB) runs via **onnxruntime-web** (WASM, 1 thread) at most every 150 ms. The frame is letterboxed to 320×320 (gray 114 padding), and the output `[1, 84, 2100]` is decoded for COCO classes **39 "bottle"** and **41 "cup"** (score ≥ 0.3), then NMS (IoU 0.45).
4. **Holding test** (`isHolding`): the bottle box is expanded by 20%. A hand holds it if ≥ 3 of the 5 fingertips (landmarks 4, 8, 12, 16, 20) are inside, or ≥ 2 fingertips plus ≥ 25% of the hand box overlaps the bottle.
5. **Stability** (`createHoldTracker`): holding must stay on for 1.2 s, tolerating ≤ 300 ms dropouts.

**Loading.** Only when the button is pressed (dynamic import). The WASM runtimes are bundled by Vite (no CDN). `yolo11n.onnx` is committed. `hand_landmarker.task` is downloaded to `public/vision/models/` by `npm run models` (also on `npm install`); if missing, it's fetched from Google at runtime.

**Safety & privacy rules (implemented).**
- Optional and **never required**: "Listo" stays above the camera and always works; closing the camera or any error leaves the normal flow untouched.
- It **does not** claim the medicine was taken. It only reports that the camera saw the bottle in the person's hand. The copy says "Esto no confirma que se tomó la medicina."
- `verified` is informational; `doseStatus` ignores it.
- Video frames are processed in memory on the device. Nothing is recorded, stored or uploaded. The camera stops when the check finishes, the dose is completed, or the dialog closes.
- Friendly errors: camera blocked, no camera, models unavailable (each suggests just tapping "Listo").

**Supabase.** `dose_events.type` now allows `'verified'`. Existing projects must run the migration at the bottom of `supabase/schema.sql`.

**Verification so far.**
- YOLO decoding vs Ultralytics' own predictions on a reference image: 4/4 confident boxes match (IoU 0.96–0.99) in Node and in Chromium. No false bottles on an image without bottles.
- `visionLogic` unit tests (8): grip vs far hand vs single-finger touch, tracker timing and dropouts, letterbox math, NMS.
- Browser test with a fake webcam: button at step 2, stream reaches the video, a friendly error when the hand model is unavailable, "Listo" completes the dose with the camera open, camera UI removed, no page errors.
- **Not yet verified:** real hand tracking and the holding threshold on a real camera with a real pill bottle. Do this before the demo.

**Known limitations.**
- COCO has **no pill-bottle class**. Pill bottles are usually detected as "bottle", sometimes "cup", sometimes not at all (small, transparent or label-covered bottles, poor light).
- "Holding" is a 2-D heuristic; a hand in front of the bottle can count as holding.
- Performance depends on the device: YOLO11n at 320 px is lightweight, but older phones may run at a few FPS.

**Licenses.** MediaPipe: Apache-2.0. onnxruntime-web: MIT. **YOLO11 / Ultralytics: AGPL-3.0.** Fine for an open-source hackathon repo; a closed-source commercial product would need an Ultralytics Enterprise license or a permissively licensed detector (e.g. MediaPipe's EfficientDet-Lite object detector).

## 10. Snooze — implemented 2026-10-09

- **Senior (alarm step 1):** under "Las estoy tomando", a smaller **"Posponer 5 minutos"** button shows how many snoozes are left ("Quedan 2 veces" / "Queda 1 vez"). Tapping it closes the alarm and shows "Está bien, le recuerdo en 5 minutos. Su familia ya sabe.". The "Próxima" card turns into **"Pospuesta · 5:36 p. m. — La alarma vuelve a sonar a esta hora."**, and the dose badge reads "Pospuesta · 5:36 p. m.".
- **Limit:** 2 snoozes per dose (`MAX_SNOOZES`, `SNOOZE_MINUTES` in `store.js`). After that the button is replaced by "Ya no se puede posponer esta dosis."
- **Caregiver:** toast + chime + system notification "💤 Doña Luz pospuso Pastillas prueba por 5 minutos.", feed entry, "Pospuesta" badge and summary. They're also notified as before when she's taking it, finished ("terminó de tomar"), or did not confirm ("no ha confirmado").
- **Data:** new event type `snoozed` (may repeat). Supabase: the per-step uniqueness is now a partial unique index that excludes `snoozed`; existing projects run the migration at the bottom of `supabase/schema.sql`.
- **Verified:** automated test with a fast-forwarded clock (19 checks). Alarm at dose time; snooze closes it; caregiver toast + badge; no alarm at 4.5 min; rings again at 5 min with 1 snooze left; not marked missed during snoozes; no button after 2; "sin confirmar" exactly 2 min after the last snooze ends; taking it afterwards still notifies "Tomada"; no page errors.

## 11. Test panel ("Modo prueba") — implemented 2026-10-09

A team-only page at **`#admin`** ("Panel de pruebas", linked in the footer) for rehearsing the alarm flow without limits.

- **Layout (top to bottom):** "Hacer sonar una dosis ahora" → "¿Quién eres?" (patient / caregiver cards, each opens in a new tab). The settings card (switch + rule pickers) was removed at the owner's request: opening the panel always applies the demo timers (30 s snooze, unlimited snoozes, 30 s "sin confirmar"); "Salir del modo prueba" in the banner restores the real rules.
- **Toggle "Modo prueba"**: turns ON automatically every time the panel is opened (can be switched off there or with the banner), stored per browser (`localStorage` key `Cuidao.test`), and shared live across tabs on the same device. While ON, a yellow **"MODO PRUEBA"** banner shows on every screen, so it's never mistaken for real use.
- **Rules it can change** (`testMode.js → rules()`, read by the scheduler and snooze logic): snooze length (30 s / 1 min / 5 min), snoozes per dose (2 / 5 / unlimited), "sin confirmar" after (30 s / 1 min / 2 min). Test defaults: 30 s, unlimited, 30 s. **When OFF, the real rules apply unchanged** (2 × 5 min, 2 min).
- **Tools (always available, ON or OFF):** "Sonar ahora" per medication rings it instantly at any hour without changing its scheduled time (clears that dose's events for today, then logs `due`); "Borrar toda la actividad de hoy"; links to open both screens. The toggle only changes the timing rules.
- **Grace for a manually rung dose:** `ringingSince()` counts the "missed" grace from the latest `due` event (or snooze end), not the scheduled time, so ringing an 08:00 dose at 15:00 doesn't flip to "Sin confirmar" right away.
- **Medication times are fixed** (seed: 08:00 Losartán, 13:00 Metformina, 21:00 Simvastatina — example names; doses are illustrative); demos use "Sonar ahora" instead of moving times.
- The senior's **"Probar la alarma"** button now appears **only in test mode**. When every dose is done, it reuses one instead of saying there's nothing to test.
- Caregiver snooze notices show the actual snooze length ("por 30 segundos").
- **Scope:** test mode is per device/browser. In Supabase mode, the senior's device decides the timing, so turn test mode on there.
- **Verified:** automated test (21 checks) with a fast-forwarded clock across 3 tabs. Also the existing suites with test mode off: 30/30 regression, 19/19 snooze, 7/7 camera.

## 12. How the app works, step by step, and every gate that can stop it (audit 2026-10-09)

Audited on the team's own localhost (Windows, Chrome-based browser) and in automated tests. **Result: the code path works end to end on localhost.** Alarm at the dose time, steps logged, both AI models load (YOLO 0.4 s, hand model 1.4 s), and the camera errors are handled. Failures seen while testing come from the gates below, not from broken code.

| # | Step | Where | Gate (if not met → what you see) |
|---|---|---|---|
| 1 | Open the screen | `App.jsx` (`#senior` / `#caregiver`) | Each screen is a separate page; opening one does not open the other. |
| 2 | Tap "Activar mi alarma" / "Activar avisos" | `App.jsx → unlockAudio()` | **Required after every page load/reload.** Browsers block sound until a tap. Without it, the senior screen isn't running at all → **no alarms**. |
| 3 | Load schedule + today's events | `hooks.js useToday → store.js` | Demo mode: data lives in **this browser's** localStorage. Chrome, VS Code's browser and the Claude app browser each have their own, separate data. |
| 4 | Scheduler tick every 10 s | `SeniorView.jsx` | **Runs only on an open, activated senior screen.** Hidden/minimized tabs are throttled by the browser (alarm up to ~1 min late). |
| 5 | Dose becomes `due` | scheduler | Only if its time arrived **within the last 60 min**. Older pending doses never ring on their own (by design). |
| 6 | Alarm + sound | `alarm.js` | Needs step 2. Each step is logged **once per dose per day**, so a taken dose can't ring again the same day unless reset (test panel "Sonar ahora"). |
| 7 | Snooze / taking / done | `SeniorView.jsx → store.logEvent` | Snooze limit 2 × 5 min (test mode can change it). |
| 8 | Not confirmed | scheduler | 2 min after the alarm (re)started (test mode: 30 s). |
| 9 | Caregiver notified | `CaregiverView.jsx` (subscribe) | Demo mode: only if the caregiver screen is open **in the same browser**. OS notifications need permission; otherwise only in-app toasts. |
| 10 | Camera check | `CameraCheck.jsx → vision.js` | Needs camera permission (the Claude app's browser always blocks cameras; use Chrome), both model files, a visible tab (the loop pauses when hidden), and ≥ 3 fingertips around a box detected as COCO "bottle"/"cup" for 1.2 s. |
| 11 | "Probar la alarma" | `SeniorView.jsx` | Shown **only in test mode**. |

**Defects found and fixed in this audit**
- **Dev-only page reload:** on localhost a full page reload happened the first time the camera code loaded (consistent with Vite discovering new dependencies). It would close the camera and return to "Activar mi alarma". Fixed with `optimizeDeps.include` in `vite.config.js` (camera libraries are pre-bundled at server start). Couldn't be reproduced from a clean start after the fix.
- **5-second freeze on the first camera frame:** the first hand inference compiles GPU shaders (5.3 s measured on the team laptop). Now done during the "Preparando la cámara…" spinner (`engine.warmUp()`).

**How to verify without breakpoints**
- **"Revisión del sistema"** was removed from the test panel at the owner's request; use the checklist above to troubleshoot.
- Automated suites (Playwright, currently in the dev environment, not in the repo): app 30 checks, snooze 19, test panel 21, system check 8, camera UI 7, YOLO decoding vs Ultralytics, vision logic unit tests 8. Proposal: move them into the repo as `npm test`.

## 13. Step 2 = one button that confirms with the camera (changed 2026-10-09)

At alarm step 2 there is now a single button, **"Listo, ya me las tomé"**, which opens the camera ("Para confirmar, muestre a la cámara el frasco de pastillas en su mano").
- **Bottle held for 1.2 s** → logs `verified` then `completed` automatically. Caregiver gets 📷 + ✅.
- **Safety backup, "Confirmar sin cámara"**: shown immediately if the camera or models fail (blocked, no camera, no internet), or after **15 s** if the bottle isn't recognized. Logs `completed` only, so the caregiver sees ✅ without 📷 and can tell the difference.
- "Cerrar cámara" returns to the "Listo" button. Snooze and "missed" rules are unchanged.
- Reason for the backup: COCO-pretrained YOLO is not a pill-bottle detector, and a camera can be unavailable. A mandatory camera with no way out would block real confirmations and trigger false "sin confirmar" alerts.
- Verified by an automated test (11 checks) with a fake webcam and a fake vision engine: success path, 15-second backup, error backup, close camera. Plus the existing suites (app 30, snooze 19, panel 21, checklist 8).

## 14. Doses not taken + confirming earlier doses (added 2026-10-09)

- **New derived status `late` → "No fue tomada" (solid red badge)** on both screens. A dose is `late` when it isn't completed and either: she said she didn't take it (`skipped`), a **later dose was already taken**, or its time passed more than 60 min ago without ringing (app closed). An unanswered alarm stays "Sin confirmar" (`missed`) until a later dose is taken. The caregiver's "Necesita atención" count includes `late`.
- **Earlier doses must be answered first.** When she taps "Las estoy tomando" for the current dose, any earlier `late` dose not yet answered appears first: "Antes de esta: ¿se tomó esta dosis anterior?" → **"Sí, me la tomé"** (logs `completed`) or **"No, no me la tomé"** (logs `skipped`, caregiver gets ❌ "dice que NO se tomó…"). Then the current dose continues to step 2. The app does not tell her to take the missed dose now (that's a medical decision).
- **Demo names:** Losartán, Metformina, Simvastatina replace "Morning/Lunch/Night pills". Browsers that saved the old list are renamed once (`Cuidao.seed2` flag); later caregiver edits are kept.
- **Supabase:** event type check now includes `skipped` (see migration in `schema.sql`).
- Verified with Playwright (`late_test.cjs`): red badge, earlier-dose prompt, both answers, caregiver feed; admin/snooze/merged suites still pass.

## 15. "Activar" did nothing in Chrome/Edge — fixed 2026-10-09

- **Cause:** the Activar button waited for `Notification.requestPermission()` and `AudioContext.resume()` before showing the screen. If the notification prompt is ignored, closed, or shown as Edge's "quiet" bell icon in the address bar, that promise never resolves, so the button looked dead on both screens.
- **Fix:** `start()` now shows the screen immediately; audio unlock and the notification request still start inside the tap but are not awaited. Verified with a Playwright test that makes both promises hang forever.
- **Auto-translate:** the browser was translating the page (the footer read "Warning:"). Translation rewrites the DOM under React and can break buttons, so `index.html` now has `translate="no"` and `<meta name="google" content="notranslate">`; use the app's own language button.
- **Reminder:** in demo mode both screens must be in the **same browser** (Chrome+Chrome or Edge+Edge). A senior tab in Edge and a caregiver tab in Chrome never see each other.

## 16. Medication history, stock and strength (added 2026-10-09)

- **New medication fields:** `strength` ("50 mg"), `active` (false = inactive), `stoppedOn`, `stock` (pills on hand), `lowAt` (warn at, default 7), `perDose` (default 1). Shown everywhere as "Name strength" (`medLabel`).
- **Active / Inactive (caregiver):** the panel is now "Medicamentos" with two tabs. *Activos* = today's schedule (status, pills left, refill, "Dejar de tomar"). *Inactivos* = medications no longer taken, kept for reference with the time it was taken, the stop date and pills left; "Volver a activar" or "Borrar del historial" (with confirmation). Inactive medications never ring and don't count for today (`useToday()` returns `meds` = active only, `allMeds` = all).
- **Stock:** each `completed` dose subtracts `perDose` from `stock` (inside `store.logEvent`, once per dose per day). When the count reaches `lowAt` or less, a `lowstock` event is logged with `remaining`, and the caregiver gets a toast/notification ("📦 Quedan 7 pastillas de Simvastatina 20 mg. Es hora de pedir el refill.") plus a red "Pocas pastillas" chip and "N medicamento(s) por acabarse" in *Necesita atención*. "Rellenar" adds pills.
- **Seed:** Losartán 50 mg (30 pills), Metformina 500 mg (60), Simvastatina 20 mg (8, so one dose triggers the low-stock alert), and an inactive example, Amoxicilina 500 mg. Existing browsers get these fields once (`Cuidao.seed3`), without overwriting edits. Strengths and counts are illustrative demo data, not medical advice.
- **Supabase:** new columns + `update` policy + `lowstock` type — see migration in `schema.sql`.
- **Known limits:** the test panel's "Sonar ahora" + taking a dose also lowers stock (refill afterwards); stock isn't restored when "Reiniciar hoy" clears events; one low-stock alert per medication per day.
- Verified with Playwright (`stock_test.cjs`, 17 checks) plus the existing suites.

## 17. Barcode scanner for bottles (caregiver, added 2026-10-10)

- **Where:** "Añadir un medicamento" → **Escanear el código del frasco**, and inside **Rellenar** → **Escanear el frasco nuevo**.
- **How:** the camera (back camera on phones) reads the barcode on this device — native `BarcodeDetector` when the browser has it (Android/macOS), otherwise **ZXing-C++ as WebAssembly** (`zxing-wasm`, .wasm served by the app itself, no CDN) for Windows/Linux Chrome & Edge, loaded only when the scanner opens. Each frame is cropped to the on-screen box, enlarged 2–3× and sharpened (unsharp mask) before decoding; rotations are tried by the decoder. Formats: UPC/EAN, Code 128/39/93, ITF, Codabar, DataMatrix, QR, PDF417. If nothing is read in 8 s, tips appear; **Leerlo desde una foto** decodes a sharp still photo (phone camera) on the device. The code is converted to an NDC (UPC-A `3+NDC10+check`, EAN-13, GS1 `(01)` GTIN-14, or a typed NDC; the 3 possible 4-4-2/5-3-2/5-4-1 splits are tried) and looked up in the FDA's public **NDC Directory** (`api.fda.gov/drug/ndc.json`, no key). Result: generic name (+ brand), strength per ingredient ("100 mg / 25 mg"), pills per bottle from the package description ("30 TABLET … in 1 BOTTLE"), form, NDC, labeler. The caregiver reviews it, then "Usar estos datos" fills name/strength/stock (time and dose stay for the caregiver to set); in refill it sets the number of pills to add.
- **Fallbacks:** type the number under the barcode or the NDC; clear messages for camera denied / no camera / no internet / code not found.
- **Honest limit:** pharmacy-printed labels usually encode the pharmacy's prescription number, which isn't in any public database, so those show "not found". Manufacturer bottles and most over-the-counter bottles carry the NDC barcode and work. Package count = pills in a *full, unopened* bottle. openFDA data is not validated for clinical use; the app asks to compare with the label.
- **Privacy:** video never leaves the device; only the barcode number is sent to the FDA.
- **Verified:** `ndc_unit.mjs` (16 checks, incl. UPC/EAN/GS1 parsing and a real openFDA record), `scan_test.cjs` (14 checks: a real UPC-A image through the fake camera decoded by ZXing, form fill, save, refill, not-found, offline). The live FDA API was called from the user's own browser at `localhost:5173`: CORS allowed, 200 for `31722-757-30`, 404 for a non-match.
- **Dependency:** `zxing-wasm` 3.1.4 (MIT; replaced `@zxing/library` after it failed on blurry webcam frames — run `npm install`).
- **Scanner robustness (2026-10-10):** synthetic webcam-like frames (640×480, barcode 140–300 px wide, blur σ 0.6–1.5): the original JS decoder read none of the blurry ones; with crop+enlarge+sharpen and zxing-wasm, codes ≥200 px wide read in ~0.5–1 s, including blur 1.5 at 300 px. Barcodes under ~170 px wide with blur stay unreadable on any decoder (too few pixels per bar): use the photo option or hold closer if the camera focuses.

## 18. Prototype: bottle seen → registered as Levothyroxine (updated 2026-10-10)

- **PROTOTYPE ONLY.** While the scanner is open, the on-device YOLO model (`loadBottleDetector()` in `vision.js`, COCO "bottle"/"cup", score ≥ 0.3) looks for a bottle ~5×/s. Seen in 4 checks (~1 s): the frame turns green ("Frasco detectado… manténgalo quieto", progress bar), then **"¡Frasco registrado!"** with a check, and the fixed `DEMO_MED` — **Levothyroxine / Levotiroxina 50 mcg, 1 tableta, 30 pills** — is added to the **active** list at the form's time. Not duplicated.
- Also registers when a barcode is read but isn't in the FDA list, when there's no internet, and when a photo can't be read. A barcode that IS in the FDA list still shows the real FDA data for review.
- The medication is **not identified** from the bottle; the interface no longer labels it as an example (owner's request for the demo). If judges ask, it should be described as simulated.
- If the YOLO model can't load, it registers after 5 s of scanning.
- Verified: `bottle_test.cjs` — mocked detector: green in ~0.6 s, registered in 1.4 s, card + active list, camera released; no bottle → nothing for 6 s; real YOLO (production build) on a scene without a bottle → no false registration. Not yet tried with a real bottle on the owner's webcam.
- To remove: delete `register()`/`DEMO_MED`, the bottle loop in `BarcodeScanner.jsx`.
