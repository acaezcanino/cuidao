# Cuidao · ¿Ya te las tomaste?

<img src="public/brand/cuidao-logo.png" alt="Cuidao: ¿Ya te las tomaste?" width="420">

Medication reminders for older adults, with live updates for their caregivers.
Built for the Caribbean AI Summit hackathon (healthcare theme).

**The flow:**

| Step | Older adult sees | Caregiver gets |
|---|---|---|
| 1. Dose time arrives | Full-screen flashing alarm + loud sound | ⏰ "It's time for Doña Luz to take…" |
| 2. Taps **I'm taking them now** | Alarm stops, shows "Done" button | 💊 "Doña Luz is taking…" |
| 3. Taps **Done ✓** | Dose marked done | ✅ "Doña Luz finished taking…" |
| Taps **Posponer 5 minutos** (max 2×) | Alarm stops, rings again in 5 min | 💤 "Doña Luz snoozed…" |
| (No response in 2 min) | Alarm keeps ringing | ⚠️ "Doña Luz hasn't confirmed…" |

Spanish/English toggle in the top right (Spanish by default).

📐 Architecture, design system and known issues: [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)

---

## 1. Run it on your computer (VS Code)

1. Install **Node.js LTS**, **VS Code**, and **Git** (default options).
2. Unzip this folder somewhere easy, like `Documents/Cuidao`.
3. In VS Code: **File → Open Folder…** → pick `Cuidao`.
4. **Terminal → New Terminal**, then run:
   ```
   npm install
   npm run dev
   ```
5. Ctrl+click the `http://localhost:5173` link.

**Demo it:** open two browser windows side by side →
`http://localhost:5173/#senior` and `http://localhost:5173/#caregiver`.
Tap **Tap to start** in each (this unlocks sound + notifications).
Press **Ring test alarm** on the senior window and watch the caregiver window.

This works with **no accounts** ("Demo mode · this device"): the two tabs talk to each other inside your browser.

> 💡 To schedule a live alarm, add a medication in the caregiver view — the time field defaults to 1 minute from now.
> Use **Reset today (demo)** to rehearse again.

## 2. Save to GitHub (Milton #1)

1. Create an empty repo at github.com/new named `Cuidao` (no README).
2. In the VS Code terminal:
   ```
   git init
   git add .
   git commit -m "Cuidao first version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/Cuidao.git
   git push -u origin main
   ```

## 3. Put it online with Vercel (Milton #1 + #3 CI/CD)

1. vercel.com → sign in with GitHub → **Add New → Project** → import `Cuidao`.
2. Framework: **Vite** (auto-detected). Click **Deploy**.
3. You get a live link. From now on, every `git push` redeploys automatically — that *is* your CI/CD.

## 4. Connect Supabase so phones sync (Milton #2)

Demo mode only syncs tabs on one computer. For a senior's phone + a caregiver's phone:

1. supabase.com → **New project**.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Project Settings → API**: copy the Project URL and the publishable (anon) key.
4. In VS Code, copy `.env.example` to a new file named `.env.local` and paste them in.
5. Stop the dev server (Ctrl+C) and run `npm run dev` again. The badge now says **Live · Supabase**.
6. In Vercel → your project → **Settings → Environment Variables**: add the same two `VITE_…` values, then **Redeploy**.

⚠️ The database policies are **demo-only** (anyone with the key can read/write). Use fictional data.

## 🧪 Test panel

Open `http://localhost:5173/#admin` (or "Panel de pruebas" in the footer). **"Sonar ahora"** rings any dose instantly, at any hour, even if it was already taken; medication times never change. Opening the panel turns on **Modo prueba** automatically (unlimited snoozes, 30-second timers); there are no settings to touch. "Salir del modo prueba" in the yellow bar goes back to the real timing. Below the doses, "¿Quién eres?" opens the patient or caregiver screen in a new tab. A yellow banner shows while it's on. Turn it off before a real demo of the timing.

## 📦 Scan a medicine bottle (caregiver)

In the caregiver screen, **Añadir un medicamento → Escanear el código del frasco** reads the bottle's barcode and fills in the name, strength (mg) and pills per bottle from the FDA's public NDC Directory. Works with manufacturer / over-the-counter bottles (UPC with the NDC). Pharmacy labels usually only carry the prescription number, so they show "not found"; you can also type the number under the barcode. Needs internet for the lookup.

## 📷 Camera check (optional)

At alarm step 2, **"Verificar con la cámara"** uses Google **MediaPipe** (21-point hand skeleton) and **YOLO11n** (bottle detection, ONNX in the browser) to check that the pill bottle is held in the person's hand. It runs on the device (no video is uploaded), never blocks "Listo", and does not prove the pill was swallowed.

- After pulling this change, run `npm install` (it also downloads the hand model). To download it again: `npm run models`.
- Using Supabase created before this feature? Run the migration at the bottom of `supabase/schema.sql`.
- YOLO/Ultralytics is AGPL-3.0 — see `docs/SYSTEM_DESIGN.md` §9.

## Project map

```
src/
  App.jsx            home screen, role picker, language toggle
  SeniorView.jsx     big clock, schedule, alarm + scheduler
  CaregiverView.jsx  schedule, add meds, live feed, notifications
  store.js           data layer (demo mode OR Supabase, same functions)
  alarm.js           alarm sound, chime, system notifications
  hooks.js           live data hook
  i18n.js            English + Spanish text
  ui.jsx             logo, icons, time formatting
  Coqui.jsx          the coquí mascot (5 moods)
  CameraCheck.jsx    optional camera check (alarm step 2)
  vision.js          MediaPipe hands + YOLO11n (onnxruntime-web)
  visionLogic.js     YOLO decoding, 'holding the bottle' logic
public/vision/models YOLO11n ONNX + MediaPipe hand model
scripts/             fetch-models.mjs (hand model download)
public/brand/        official logo assets
  App.css            design system + all styles (tokens at the top)
docs/SYSTEM_DESIGN.md  architecture, design system, journeys, known issues
supabase/schema.sql  database tables + realtime
```

## Honest limits (say these to judges — it shows you understand the problem)

- Alarms ring while the senior's page is open (it can be in the background with system notifications on). Closed-app alerts need **web push** from a server.
- "Taken" is self-reported, not verified.

## Roadmap

1. **Push notifications when the app is closed** — Supabase Edge Function + cron + Web Push (or SMS/WhatsApp via Twilio).
2. **Real accounts** — Supabase Auth; caregivers linked to one or more seniors; secure per-user policies.
3. **Better camera check** — fine-tune YOLO on pill bottles; add hand-to-mouth detection.
4. Refill reminders and weekly adherence reports for the caregiver/doctor.
