import { useState, useEffect, useRef, useCallback } from "react";
import { getTourStops } from "../../lib/onboarding.js";

// Spotlight tour over the real, already-mounted dashboard. Finds each stop's
// target by its data-tour attribute; a stop whose target isn't currently in
// the DOM (e.g. the company switcher when there's only one company) is
// skipped automatically rather than shown empty or pointing at nothing.
export default function GuidedTour({ role, multiCompany, onFinish, onSkip }) {
  const stops = useRef(getTourStops({ role, multiCompany })).current;
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);
  const skipRef = useRef(null);
  const nextRef = useRef(null);

  const stop = stops[index] ?? null;

  // Measuring AND deciding to skip must happen atomically per index: reading
  // a `rect` left over from the *previous* index (which is what a separate
  // "does rect say skip?" effect would see for one stale render) causes a
  // spurious extra skip. So resolving a given index — find its target, and
  // either show it or advance past it — lives in one effect keyed on index.
  useEffect(() => {
    if (!stop) {
      onFinish?.();
      return;
    }
    const el = document.querySelector(`[data-tour="${stop.target}"]`);
    if (!el) {
      if (index >= stops.length - 1) {
        onFinish?.();
        return;
      }
      // Clear rect in the same batch as advancing index — otherwise the next
      // render shows the NEW stop's title/body positioned at the OLD stop's
      // rect for one paint, since this effect (which resolves the new rect)
      // only runs after that render commits.
      setRect(null);
      setIndex((i) => i + 1);
      return;
    }
    setRect(el.getBoundingClientRect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Re-measure the CURRENT stop's target on resize/scroll — never re-runs
  // skip logic; if the target existed when this stop was resolved above, a
  // layout change doesn't retroactively make it disappear from the tour.
  const remeasure = useCallback(() => {
    if (!stop) return;
    const el = document.querySelector(`[data-tour="${stop.target}"]`);
    if (el) setRect(el.getBoundingClientRect());
  }, [stop]);

  useEffect(() => {
    function scheduleRemeasure() {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        remeasure();
      });
    }
    window.addEventListener("resize", scheduleRemeasure);
    window.addEventListener("scroll", scheduleRemeasure, true);
    return () => {
      window.removeEventListener("resize", scheduleRemeasure);
      window.removeEventListener("scroll", scheduleRemeasure, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [remeasure]);

  function handleNext() {
    if (index >= stops.length - 1) {
      onFinish?.();
      return;
    }
    // See the comment above the auto-skip effect: clear rect in the same
    // batch as index so a render never pairs the new stop's copy with the
    // previous stop's position.
    setRect(null);
    setIndex((i) => i + 1);
  }

  // Move focus into the tour whenever a stop becomes visible, so keyboard
  // users land on a real control instead of whatever the underlying
  // (still-interactive) dashboard happened to have focused.
  useEffect(() => {
    if (stop && rect) nextRef.current?.focus();
  }, [stop, rect]);

  // Escape skips the tour (same as the Skip tour button); Tab/Shift+Tab wrap
  // between the two buttons so focus can't escape into the dashboard behind
  // the spotlight while the tour is up — a minimal trap for a 2-control dialog.
  function handleKeyDown(e) {
    if (e.key === "Escape") {
      onSkip?.();
      return;
    }
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === skipRef.current) {
      e.preventDefault();
      nextRef.current?.focus();
    } else if (!e.shiftKey && document.activeElement === nextRef.current) {
      e.preventDefault();
      skipRef.current?.focus();
    }
  }

  if (!stop || !rect) return null; // no stops, or still resolving this stop's target

  const pad = 6;
  const holeStyle = {
    position: "fixed",
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 8,
    boxShadow: "0 0 0 9999px rgba(9,32,38,0.62)",
    pointerEvents: "none",
    zIndex: 9998,
    transition: "all 0.25s cubic-bezier(.2,.8,.2,1)",
  };

  // Clamp both axes to the viewport — the sidebar target spans nearly the
  // full page height, so rect.bottom + 14 alone can place the tooltip below
  // the fold with no vertical clamp (caught by a real browser during e2e;
  // jsdom's zero-valued rects never surfaced it). ~130px estimated tooltip
  // height keeps this from clamping against the tooltip's own unmeasured size.
  // Reserve ~64px at the bottom to sit clear of the fixed action buttons
  // (Referral Tracker, Team, Admin Panel) which live at bottom:16 with z-index 9999.
  const TOOLTIP_HEIGHT_ESTIMATE = 130;
  const BOTTOM_RESERVED = 64;
  const tipTop = Math.min(
    Math.max(8, rect.bottom + 14),
    window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - BOTTOM_RESERVED,
  );
  const tipLeft = Math.min(Math.max(8, rect.left), window.innerWidth - 260);
  const tipStyle = {
    position: "fixed",
    top: tipTop,
    left: tipLeft,
    maxWidth: 260,
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 18px 44px rgba(10,44,53,0.16), 0 4px 12px rgba(10,44,53,0.08)",
    padding: "13px 14px",
    zIndex: 10001,

    transition: "all 0.25s cubic-bezier(.2,.8,.2,1)",
  };

  const isLast = index === stops.length - 1;

  return (
    <>
      <div style={holeStyle} />
      <div style={tipStyle} role="dialog" aria-label="Guided tour" onKeyDown={handleKeyDown}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9.5, color: "#C9921A", letterSpacing: 1, marginBottom: 4 }}>
          {index + 1} / {stops.length} · {stop.title}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "#0F4F5E", marginBottom: 10 }}>{stop.body}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {stops.map((s, i) => (
              <span
                key={s.id}
                style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: i === index ? "#0E6B78" : "#d3dce7",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              ref={skipRef}
              type="button"
              onClick={onSkip}
              style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "#94a3b8", cursor: "pointer" }}
            >
              Skip tour
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={handleNext}
              style={{ fontSize: 11, fontWeight: 700, border: "none", background: "#0E6B78", color: "#fff", padding: "5px 11px", borderRadius: 6, cursor: "pointer" }}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
