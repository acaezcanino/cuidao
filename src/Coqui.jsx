// Cuidao's mascot: the little brown coquí from the official logo, redrawn
// as SVG so it can change pose. Colors are sampled from the logo artwork.
//   <Coqui mood="wave|alert|happy|cheer|sleep|love" />
// Decorative only (aria-hidden); the text next to it always carries the meaning.

const C = {
  body: "#c66b31",
  dark: "#ad5a2b",
  belly: "#fed5a6",
  cheek: "#f18a41",
  eye: "#391803",
  spark: "#ff941e",
  heart: "#f64b44",
};

function Eye({ cx, cy, mood }) {
  if (mood === "cheer" || mood === "sleep" || mood === "love") {
    // closed eyes: smiling (^ ^) or sleepy (– –)
    const d = mood === "sleep"
      ? `M${cx - 10} ${cy + 2}q10 7 20 0`
      : `M${cx - 10} ${cy + 3}q10-12 20 0`;
    return (
      <>
        <circle cx={cx} cy={cy} r="17" fill={C.body} />
        <path d={d} fill="none" stroke={C.eye} strokeWidth="4.5" strokeLinecap="round" />
      </>
    );
  }
  const look = mood === "alert" ? 0 : 2;
  return (
    <>
      <circle cx={cx} cy={cy} r="17" fill="#fff" />
      <circle cx={cx + look} cy={cy + 1} r={mood === "alert" ? 12 : 11} fill={C.eye} />
      <circle cx={cx + look + 4} cy={cy - 4} r="4" fill="#fff" />
    </>
  );
}

function Frog({ mood = "happy", hideFeet = false }) {
  const armsUp = mood === "cheer";
  const waving = mood === "wave";
  return (
    <>
      {(mood === "alert" || mood === "cheer") && (
        <g stroke={C.spark} strokeWidth="7" strokeLinecap="round" className="coqui-spark">
          <path d="M162 22l9-14M168 42l17-7M168 60l16 2" />
          {mood === "cheer" && <path d="M38 22l-9-14M32 42l-17-7M32 60l-16 2" />}
        </g>
      )}
      {mood === "sleep" && (
        <g fill={C.dark} fontFamily="Nunito, sans-serif" fontWeight="900" className="coqui-z">
          <text x="150" y="40" fontSize="22">z</text>
          <text x="166" y="22" fontSize="16">z</text>
        </g>
      )}

      {armsUp && (
        <g fill={C.body} stroke={C.dark} strokeWidth="3">
          <path d="M52 112 28 70" stroke={C.body} strokeWidth="16" strokeLinecap="round" />
          <path d="M148 112l24-42" stroke={C.body} strokeWidth="16" strokeLinecap="round" />
          <circle cx="26" cy="64" r="9" /><circle cx="174" cy="64" r="9" />
        </g>
      )}
      {waving && (
        <g className="coqui-wave-arm">
          <path d="M150 116l22-44" stroke={C.body} strokeWidth="16" strokeLinecap="round" />
          <circle cx="174" cy="66" r="9" fill={C.body} stroke={C.dark} strokeWidth="3" />
          <path d="M168 58l-3-8M176 56v-9M183 60l4-7" stroke={C.body} strokeWidth="5" strokeLinecap="round" />
        </g>
      )}

      {/* body + belly */}
      <ellipse cx="100" cy="140" rx="62" ry="42" fill={C.body} stroke={C.dark} strokeWidth="3" />
      <ellipse cx="100" cy="148" rx="36" ry="28" fill={C.belly} />

      {/* head with eye bumps */}
      <g stroke={C.dark} strokeWidth="3">
        <circle cx="66" cy="54" r="24" fill={C.body} />
        <circle cx="134" cy="54" r="24" fill={C.body} />
        <ellipse cx="100" cy="88" rx="66" ry="40" fill={C.body} />
      </g>
      <ellipse cx="100" cy="88" rx="63" ry="37" fill={C.body} />
      <circle cx="66" cy="56" r="21" fill={C.body} />
      <circle cx="134" cy="56" r="21" fill={C.body} />

      {(
        <g fill={C.dark} opacity=".55">
          <circle cx="94" cy="66" r="3" /><circle cx="106" cy="62" r="2.5" /><circle cx="112" cy="72" r="2.2" />
          <circle cx="150" cy="96" r="2.5" /><circle cx="48" cy="94" r="2.2" />
        </g>
      )}

      <Eye cx={66} cy={54} mood={mood} />
      <Eye cx={134} cy={54} mood={mood} />

      <ellipse cx="54" cy="94" rx="12" ry="8" fill={C.cheek} opacity=".85" />
      <ellipse cx="146" cy="94" rx="12" ry="8" fill={C.cheek} opacity=".85" />

      {mood === "alert" ? (
        <ellipse cx="100" cy="98" rx="10" ry="8" fill={C.eye} />
      ) : mood === "cheer" ? (
        <path d="M80 92q20 24 40 0Z" fill={C.eye} />
      ) : mood === "sleep" ? (
        <path d="M90 98q10 6 20 0" fill="none" stroke={C.eye} strokeWidth="4" strokeLinecap="round" />
      ) : (
        <path d="M80 92q20 18 40 0" fill="none" stroke={C.eye} strokeWidth="4.5" strokeLinecap="round" />
      )}

      {!armsUp && !hideFeet && (
        <g fill={C.body} stroke={C.dark} strokeWidth="3">
          <ellipse cx="66" cy="168" rx="16" ry="10" />
          <ellipse cx="134" cy={waving ? 170 : 168} rx="16" ry="10" />
        </g>
      )}
    </>
  );
}

export default function Coqui({ mood = "happy", size = 160, className = "" }) {
  return (
    <svg
      width={size}
      height={size * 0.95}
      viewBox="0 0 200 190"
      aria-hidden="true"
      className={`coqui coqui-${mood} ${className}`}
    >
      <ellipse cx="100" cy="182" rx="58" ry="6" fill="rgba(6,52,113,.1)" />
      <Frog mood={mood} />
    </svg>
  );
}
