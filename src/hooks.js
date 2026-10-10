import { useCallback, useEffect, useRef, useState } from "react";
import { isActive, store, subscribe, todayKey } from "./store.js";

// Current time, refreshed every `ms` milliseconds.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// Today's medications + dose events, kept up to date live.
export function useToday() {
  const date = todayKey();
  const [allMeds, setAllMeds] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    try {
      const [m, e] = await Promise.all([store.listMeds(), store.listEvents(date)]);
      if (request !== latest.current) return; // a newer reload already started
      setAllMeds(m);
      setEvents(e);
      setError(null);
    } catch (err) {
      if (request !== latest.current) return;
      setError(err.message || String(err));
    }
  }, [date]);

  useEffect(() => {
    reload();
    return subscribe(reload);
  }, [reload]);

  // Only ACTIVE medications ring and count for today; inactive ones stay in the record.
  const meds = allMeds.filter(isActive);
  return { date, meds, allMeds, events, reload, error };
}
