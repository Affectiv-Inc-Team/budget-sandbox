import posthog from 'posthog-js';
import { useEffect, useState } from 'react';

// HIPAA posture (free plan, no BAA): PostHog must never receive PHI. PostHog's
// privacy controls run in the browser, so masked content is redacted BEFORE it
// is transmitted. We mask aggressively — all inputs AND all on-screen text (shown
// as asterisks in replay) — plus scrub network request metadata.
posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  enable_exception_autocapture: true,
  // DOM autocapture is OFF: it would capture clicked element text (e.g. a
  // participant name in a referral row) into events, and maskTextSelector only
  // masks the replay, not event properties. We rely on explicit posthog.capture()
  // calls instead so no PHI reaches PostHog. (Exception autocapture above is separate.)
  autocapture: false,
  capture_pageview: false, // captured manually on route change in App.jsx
  disable_session_recording: false,
  session_recording: {
    maskAllInputs: true,           // mask every <input> (default true, kept explicit)
    maskTextSelector: '*',         // mask ALL visible text — names, SSN reveal, DOB, diagnoses
    recordCrossOriginIframes: false,
    // Scrub potential PHI from captured network request metadata in-browser.
    // Returning null on a request drops it from the recording entirely; otherwise
    // we strip query strings (which can carry ids) and never capture bodies.
    maskCapturedNetworkRequestFn: (request) => {
      try {
        const url = new URL(request.url, window.location.origin);
        request.url = url.origin + url.pathname; // drop query string
      } catch {
        // non-absolute / unparseable URL — leave as-is, bodies are not captured by default
      }
      request.requestBody = undefined;
      request.responseBody = undefined;
      return request;
    },
  },
});

/**
 * Read a PostHog feature flag. Safe to call before flags have loaded — returns
 * `false` until they do. Use `posthog.onFeatureFlags(cb)` (or the React hook
 * below) when you need to re-render once flags arrive.
 */
export function isFeatureEnabled(key) {
  return posthog.isFeatureEnabled(key) ?? false;
}

/**
 * React hook for a PostHog feature flag. Returns `false` until flags load, then
 * re-renders when they arrive or change. Use this to gate UI / enable kill-switches.
 */
export function useFeatureFlag(key) {
  const [enabled, setEnabled] = useState(() => posthog.isFeatureEnabled(key) ?? false);
  useEffect(() => {
    setEnabled(posthog.isFeatureEnabled(key) ?? false);
    // onFeatureFlags returns an unsubscribe fn — re-evaluate whenever flags update.
    return posthog.onFeatureFlags(() => setEnabled(posthog.isFeatureEnabled(key) ?? false));
  }, [key]);
  return enabled;
}

export default posthog;
