import { useState, useRef, useEffect, useCallback } from "react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function formatDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function todayISO() {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
}
function getViewFromISO(iso) {
  if (iso) {
    const [y, m] = iso.split("-").map(Number);
    return { year: y, month: m - 1 };
  }
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth() };
}

export default function DatePicker({ value, onChange, label, placeholder = "Select a date" }) {
  const today           = todayISO();
  const [open, setOpen]             = useState(false);
  const [view, setView]             = useState(() => getViewFromISO(value));
  const [popupPos, setPopupPos]     = useState({ top: 0, left: 0, width: 320 });
  const [isMobile, setIsMobile]     = useState(false);
  const [hoveredDay, setHoveredDay] = useState(null);

  const triggerRef = useRef(null);
  const popupRef   = useRef(null);

  const computePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect   = triggerRef.current.getBoundingClientRect();
    const calH   = 390;
    const calW   = Math.max(320, rect.width);
    const mobile = window.innerWidth < 520;
    setIsMobile(mobile);
    if (mobile) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top  = spaceBelow < calH && rect.top > calH ? rect.top - calH - 6 : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - calW - 8));
    setPopupPos({ top, left, width: calW });
  }, []);

  const openCalendar  = () => { setView(getViewFromISO(value)); setHoveredDay(null); computePos(); setOpen(true); };
  const closeCalendar = () => { setOpen(false); setHoveredDay(null); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popupRef.current   && !popupRef.current.contains(e.target)
      ) closeCalendar();
    };
    const onKey = (e) => { if (e.key === "Escape") closeCalendar(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown",   onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || isMobile) return;
    const update = () => computePos();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, isMobile, computePos]);

  const prevMonth = () =>
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const nextMonth = () =>
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth  = new Date(view.year, view.month + 1, 0).getDate();
  const pickDay      = (day) => { onChange(toISO(view.year, view.month, day)); closeCalendar(); };

  const navBtnStyle = {
    width: 34, height: 34, borderRadius: 8,
    border: "1.5px solid var(--border)", background: "var(--surface)",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, color: "var(--muted)", transition: "all .15s", flexShrink: 0,
  };

  // The calendar body is kept as a plain JSX variable — NOT a nested component.
  // If it were written as `const CalBody = () => (...)` and rendered as `<CalBody />`,
  // React would see a new component type on every parent re-render (hoveredDay changes)
  // and unmount/remount the whole calendar, breaking hover and click interaction.
  const calendarBody = (
    <div style={{ padding: "16px 16px 14px" }}>
      {/* Month / year header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button
          type="button"
          onClick={prevMonth}
          style={navBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.color = "var(--muted)"; }}
        >‹</button>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink)", lineHeight: 1 }}>
            {MONTHS[view.month]}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 2, letterSpacing: 2 }}>
            {view.year}
          </div>
        </div>

        <button
          type="button"
          onClick={nextMonth}
          style={navBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.color = "var(--muted)"; }}
        >›</button>
      </div>

      {/* Day-of-week labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 800, color: "var(--subtle)", padding: "4px 0", fontFamily: "var(--font-display)", letterSpacing: 1 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {Array(firstWeekday).fill(null).map((_, i) => <div key={`e${i}`} />)}
        {Array(daysInMonth).fill(null).map((_, i) => {
          const day        = i + 1;
          const iso        = toISO(view.year, view.month, day);
          const isSelected = iso === value;
          const isToday    = iso === today;
          const isHovered  = hoveredDay === day && !isSelected;

          let bg      = "transparent";
          let color   = "var(--ink)";
          let fw      = 400;
          let outline = "none";

          if (isSelected)     { bg = "var(--primary)";    color = "#fff";          fw = 800; }
          else if (isHovered) { bg = "var(--primary-dim)"; color = "var(--primary)"; fw = 600; }
          else if (isToday)   { color = "var(--primary)"; fw = 700; outline = "2px solid var(--primary)"; }

          return (
            <div
              key={day}
              onClick={() => pickDay(day)}
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              style={{
                textAlign: "center", height: 36, display: "flex", alignItems: "center",
                justifyContent: "center", borderRadius: 8, fontSize: 13,
                cursor: "pointer", fontWeight: fw, background: bg, color,
                outline, outlineOffset: -2, transition: "background .1s, color .1s",
                fontFamily: "var(--font-body)",
              }}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
          {value ? formatDisplay(value) : "No date selected"}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); closeCalendar(); }}
            style={{
              fontSize: 11, color: "var(--red)", background: "none", border: "none",
              cursor: "pointer", fontWeight: 700, padding: "3px 8px",
              borderRadius: 4, transition: "background .12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--red-dim)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >Clear</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {label && (
        <label style={{
          display: "block", fontSize: 11, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 1,
          color: "var(--muted)", marginBottom: 6,
        }}>
          {label}
        </label>
      )}

      {/* Trigger */}
      <div
        ref={triggerRef}
        className="input"
        role="button"
        tabIndex={0}
        style={{
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", userSelect: "none", gap: 8,
          borderColor: open ? "var(--primary)" : undefined,
          boxShadow:   open ? "0 0 0 3px rgba(255,107,53,0.12)" : undefined,
        }}
        onClick={open ? closeCalendar : openCalendar}
        onKeyDown={e => (e.key === "Enter" || e.key === " ") && (open ? closeCalendar() : openCalendar())}
      >
        <span style={{ color: value ? "var(--ink)" : "var(--muted)", fontSize: 14, flex: 1 }}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: open ? "var(--primary)" : "var(--muted)", flexShrink: 0, transition: "color .15s" }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
      </div>

      {/* Calendar popup — position:fixed escapes overflow:hidden on .card parent */}
      {open && (
        <>
          {isMobile && (
            <div
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998, backdropFilter: "blur(2px)" }}
              onClick={closeCalendar}
            />
          )}
          <div
            ref={popupRef}
            style={
              isMobile
                ? {
                    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
                    background: "var(--surface)", borderRadius: "18px 18px 0 0",
                    border: "1.5px solid var(--border-mid)",
                    boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
                    animation: "slideDown .2s ease",
                  }
                : {
                    position: "fixed",
                    top:   popupPos.top,
                    left:  popupPos.left,
                    width: popupPos.width,
                    zIndex: 9999,
                    background: "var(--surface)",
                    border: "1.5px solid var(--border-mid)",
                    borderRadius: 14,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
                    animation: "fadeIn .15s ease",
                    minWidth: 300,
                  }
            }
            onClick={e => e.stopPropagation()}
          >
            {isMobile && (
              <div style={{ width: 40, height: 4, background: "var(--border-mid)", borderRadius: 2, margin: "12px auto 4px" }} />
            )}
            {calendarBody}
          </div>
        </>
      )}
    </>
  );
}
