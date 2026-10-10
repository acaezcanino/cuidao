// Lets the test panel ask "which Cuidao screens are open in this browser?".
// Each open screen answers a ping over a BroadcastChannel with its status.
// Only works between tabs of the SAME browser (like the demo-mode sync).

const ch = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("Cuidao-presence") : null;

// Extra live details a screen can attach (e.g. which alarm is on screen).
let extra = {};
export function setPresence(patch) {
  extra = { ...extra, ...patch };
}

// Called by a screen: answer pings with getInfo() while mounted.
export function announce(getInfo) {
  if (!ch) return () => {};
  const on = (e) => {
    if (e.data?.ping) ch.postMessage({ pong: true, ...extra, ...getInfo() });
  };
  ch.addEventListener("message", on);
  return () => ch.removeEventListener("message", on);
}

// Called by the test panel: collect answers for `ms` milliseconds.
export function ping(ms = 1500) {
  return new Promise((resolve) => {
    if (!ch) return resolve(null);
    const got = [];
    const on = (e) => { if (e.data?.pong) got.push(e.data); };
    ch.addEventListener("message", on);
    ch.postMessage({ ping: true });
    setTimeout(() => { ch.removeEventListener("message", on); resolve(got); }, ms);
  });
}
