import React, { useEffect, useRef } from 'react';

export function TimerDisplay({ timeRemaining, onLongPress, modeClass }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t;
    const down = () => { t = setTimeout(()=> onLongPress && onLongPress(), 1000); };
    const clear = () => clearTimeout(t);
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', clear);
    el.addEventListener('mouseleave', clear);
    return () => { el.removeEventListener('mousedown', down); el.removeEventListener('mouseup', clear); el.removeEventListener('mouseleave', clear); };
  }, [onLongPress]);

  const minutes = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
  const seconds = (timeRemaining % 60).toString().padStart(2, '0');
  useEffect(()=> { document.title = `${minutes}:${seconds} - Flow`; }, [minutes, seconds]);

  return <div ref={ref} id="timer-display" className={`font-black text-7xl sm:text-8xl md:text-9xl tracking-tighter mb-4 transition-all duration-300 transform timer-gradient cursor-pointer ${modeClass}`}>{minutes}:{seconds}</div>;
}
