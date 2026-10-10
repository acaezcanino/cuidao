import { useEffect, useRef, useState } from "react";
import { askNotificationPermission, unlockAudio } from "./alarm.js";
import CaregiverView from "./CaregiverView.jsx";
import { strings } from "./i18n.js";
import SeniorView from "./SeniorView.jsx";
import { MODE, SENIOR_NAME } from "./store.js";
import Coqui from "./Coqui.jsx";
import AdminPanel from "./AdminPanel.jsx";
import { setTest, useTestMode } from "./testMode.js";
import { announce } from "./presence.js";
import { audioState } from "./alarm.js";
import { Icon, Logo, PeopleHeartIcon, PillBellIcon } from "./ui.jsx";

// Which screen to show comes from the URL: #senior or #caregiver.
// That way each phone/window can be bookmarked to its own view.
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function savedLang() {
  try {
    return localStorage.getItem("Cuidao.lang") || "es";
  } catch {
    return "es";
  }
}

export default function App() {
  const role = useHash();
  const [lang, setLangState] = useState(() => {
    const l = savedLang();
    document.documentElement.lang = l; // set before the first render (medication names read it)
    return l;
  });
  const setLang = (l) => {
    document.documentElement.lang = l; // before re-render, so translated names update at once
    setLangState(l);
  };
  const [started, setStarted] = useState(false);
  const t = strings[lang];

  useEffect(() => {
    try {
      localStorage.setItem("Cuidao.lang", lang);
    } catch {
      /* private mode: language just won't be remembered */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  const test = useTestMode();
  const isAdmin = role === "admin";
  const inView = role === "senior" || role === "caregiver";

  // Move keyboard / screen-reader focus to the new screen's heading.
  useEffect(() => {
    document.querySelector("main h1, main h2")?.focus({ preventScroll: false });
  }, [role, started]);

  // Answer the test panel's "which screens are open?" check.
  const startedRef = useRef(started);
  startedRef.current = started;
  useEffect(() => {
    if (!inView) return;
    return announce(() => ({ role, started: startedRef.current, audio: audioState(), hidden: document.hidden }));
  }, [role, inView]);

  // Never wait on these: in Chrome/Edge the notification prompt (or Edge's
  // "quiet" bell in the address bar) can stay unanswered forever, and
  // AudioContext.resume() can stall, which used to leave the button doing nothing.
  // Both are started inside the tap (so the browser allows them) and run on their own.
  function start() {
    unlockAudio().catch((err) => console.warn("[audio]", err));
    askNotificationPermission().catch((err) => console.warn("[notifications]", err));
    setStarted(true);
  }

  return (
    <div className={`app ${role === "senior" ? "app-senior" : ""}`}>
      <a className="skip" href="#main">{t.skip}</a>

      <header className="topbar">
        <a href="#" className="brand" onClick={() => setStarted(false)}>
          <Logo size={34} />
          <span className="brand-word">Cuidao</span>
        </a>
        <div className="topbar-right">
          <span className={`mode mode-${MODE}`}>{t.mode[MODE]}</span>
          <button
            className="lang"
            onClick={() => setLang(lang === "es" ? "en" : "es")}
            aria-label={t.langAria}
            lang={lang === "es" ? "en" : "es"}
          >
            <Icon name="globe" size={20} />
            {t.langLabel}
          </button>
        </div>
      </header>

      {test.enabled && (
        <div className="test-banner" role="note">
          <Icon name="alert" size={18} /> <strong>{t.testBanner}</strong>
          {!isAdmin && <a href="#admin">{t.testBannerLink}</a>}
          <button type="button" className="test-exit" onClick={() => setTest({ enabled: false })}>
            {t.testExit}
          </button>
        </div>
      )}

      <main id="main">
        {isAdmin && <AdminPanel t={t} lang={lang} />}

        {!inView && !isAdmin && (
          <div className="home">
            <section className="hero">
              <div className="hero-text">
                <h1 tabIndex={-1} className="hero-logo">
                  <img src="/brand/cuidao-logo-noslogan.png" alt="Cuidao" width="760" height="291" />
                </h1>
                <p className="hero-tagline">
                  {t.heroTitle.split("\n").map((line, i) => (
                    <span key={i}>{line} </span>
                  ))}
                </p>
              </div>
              <div className="hero-art">
                <p className="bubble">{t.mascotHello}</p>
                <Coqui mood="wave" size={230} />
              </div>
            </section>

            <section aria-labelledby="choose" className="choose">
              <h2 id="choose" className="section-title choose-title">{t.chooseRole}</h2>
              <div className="roles">
                <a className="role-card role-senior" href="#senior">
                  <span className="role-art" aria-hidden="true"><PillBellIcon size={112} /></span>
                  <strong>{t.seniorRole}</strong>
                  <span className="role-sub">{t.seniorRoleSub}</span>
                </a>
                <a className="role-card role-care" href="#caregiver">
                  <span className="role-art" aria-hidden="true"><PeopleHeartIcon size={112} /></span>
                  <strong>{t.caregiverRole}</strong>
                  <span className="role-sub">{t.caregiverRoleSub}</span>
                </a>
              </div>
            </section>

            <section aria-labelledby="how" className="how">
              <h2 id="how" className="section-title">{t.howTitle}</h2>
              <ol className="steps">
                {t.steps.map((s, i) => (
                  <li key={i}>
                    <span className="step-num" aria-hidden="true">{i + 1}</span>
                    <div>
                      <strong>{s.title}</strong>
                      <p>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

          </div>
        )}

        {inView && !started && (
          <section className="start">
            <div className="start-art" aria-hidden="true">
              <Coqui mood={role === "senior" ? "alert" : "wave"} size={170} />
            </div>
            <h1 tabIndex={-1}>{t.startTitle[role]}</h1>
            <p className="start-body">
              {role === "senior" ? t.startBody.senior : t.startBody.caregiver(SENIOR_NAME)}
            </p>
            <button className="btn huge primary" onClick={start}>
              {t.tapToStart[role]}
            </button>
            <p className="hint">{t.startNote}</p>
          </section>
        )}

        {inView && started && role === "senior" && <SeniorView t={t} lang={lang} />}
        {inView && started && role === "caregiver" && <CaregiverView t={t} lang={lang} />}
      </main>

      <footer className="footer">
        {(inView || isAdmin) && (
          <a href="#" className="back" onClick={() => setStarted(false)}>
            <Icon name="arrowLeft" size={20} /> {t.back}
          </a>
        )}
        <p className={`mode mode-${MODE} mode-footer`}>{t.mode[MODE]}</p>
        <p><strong>{t.disclaimerLabel}</strong> {t.disclaimer}</p>
        {!isAdmin && <a className="admin-link" href="#admin">{t.adminLink}</a>}
      </footer>
    </div>
  );
}
