import React, { useEffect, useRef, useMemo } from 'react';

const R = 45;                       // arc radius in the 100x100 viewBox
const CIRC = 2 * Math.PI * R;       // arc circumference

// 60 graduations around the bezel, like a watch face. Static, faint.
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const angle = (i * 6) * (Math.PI / 180);
  const major = i % 5 === 0;
  const outer = 47.5;
  const inner = major ? 42.5 : 44.5;
  const cx = 50, cy = 50;
  return {
    major,
    x1: cx + outer * Math.cos(angle),
    y1: cy + outer * Math.sin(angle),
    x2: cx + inner * Math.cos(angle),
    y2: cy + inner * Math.sin(angle)
  };
});

export function TimerDisplay({ timeRemaining, progress = 0, modeLabel, onLongPress }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t;
    const down = () => { t = setTimeout(() => onLongPress && onLongPress(), 1000); };
    const clear = () => clearTimeout(t);
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', clear);
    el.addEventListener('mouseleave', clear);
    return () => { el.removeEventListener('mousedown', down); el.removeEventListener('mouseup', clear); el.removeEventListener('mouseleave', clear); };
  }, [onLongPress]);

  const minutes = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
  const seconds = (timeRemaining % 60).toString().padStart(2, '0');
  useEffect(() => { document.title = `${minutes}:${seconds} · Flow`; }, [minutes, seconds]);

  const offset = useMemo(() => CIRC * (1 - Math.min(1, Math.max(0, progress))), [progress]);

  return (
    <div ref={ref} className="dial" role="timer" aria-label={`${minutes} minutes ${seconds} seconds remaining`}>
      <svg className="dial-svg" viewBox="0 0 100 100" aria-hidden="true">
        {TICKS.map((tk, i) => (
          <line key={i} className={`dial-tick${tk.major ? ' major' : ''}`} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} />
        ))}
        <circle className="dial-track" cx="50" cy="50" r={R} />
        <circle
          className="dial-arc"
          cx="50" cy="50" r={R}
          style={{ strokeDasharray: CIRC, strokeDashoffset: offset }}
        />
      </svg>
      <div className="dial-center">
        <div className="dial-time">{minutes}:{seconds}</div>
        {modeLabel && <div className="dial-label">{modeLabel}</div>}
      </div>
    </div>
  );
}
