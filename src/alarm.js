// Sound + system notifications.
// Browsers block sound until the user taps something, so each view
// starts with a "Tap to start" screen that calls unlockAudio().

let ctx = null;
let loop = null;

// "running" once the person tapped "Activar"; "locked" before that.
export const audioState = () => (ctx ? ctx.state : "locked");

export async function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = ctx || new AC();
  await ctx.resume();
}

function tone(freq, start, length, volume = 0.25) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

// Loud, repeating alarm for the older adult.
export function startAlarm() {
  if (loop || !ctx) return;
  const ring = () => {
    const t = ctx.currentTime;
    tone(880, t, 0.2, 0.35);
    tone(1175, t + 0.25, 0.2, 0.35);
    tone(880, t + 0.5, 0.2, 0.35);
    tone(1175, t + 0.75, 0.3, 0.35);
    navigator.vibrate?.([300, 150, 300]);
  };
  ring();
  loop = setInterval(ring, 1800);
}

export function stopAlarm() {
  clearInterval(loop);
  loop = null;
}

// Short chime for caregiver updates. "urgent" is used for missed doses.
export function chime(urgent = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (urgent) {
    tone(660, t, 0.25, 0.3);
    tone(440, t + 0.3, 0.4, 0.3);
  } else {
    tone(784, t, 0.18, 0.2);
    tone(1047, t + 0.18, 0.3, 0.2);
  }
}

export async function askNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }
  return Notification.permission;
}

// Shows an OS-level notification (works while the tab is in the background).
export function systemNotify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: title + body });
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
    // The in-app alert still shows, so we ignore this.
  }
}
