// React connector.
//
//   const { place, loading, error } = useReverseGeocode(lat, lon, { base });
//   const { place, locate, loading } = useMyCity({ base });
//
// Requires React 16.8+. No other dependency.
import { useState, useEffect, useCallback, useRef } from 'react';
import { reverseGeocode, locateUser } from './browser.js';

export function useReverseGeocode(lat, lon, opts = {}) {
  const [state, setState] = useState({ place: null, loading: false, error: null });
  const base = opts.base;

  useEffect(() => {
    if (lat == null || lon == null) return;
    const ctl = new AbortController();
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    reverseGeocode(lat, lon, { base, signal: ctl.signal })
      .then((place) => { if (live) setState({ place, loading: false, error: null }); })
      .catch((error) => {
        // An abort is this effect being superseded, not a failure to report.
        if (live && error.name !== 'AbortError') setState({ place: null, loading: false, error });
      });
    return () => { live = false; ctl.abort(); };
  }, [lat, lon, base]);

  return state;
}

export function useMyCity(opts = {}) {
  const [state, setState] = useState({ place: null, loading: false, error: null });
  const running = useRef(false);

  const locate = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ place: await locateUser(opts), loading: false, error: null });
    } catch (error) {
      setState({ place: null, loading: false, error });
    } finally {
      running.current = false;
    }
  }, [opts.base]);

  return { ...state, locate };
}
