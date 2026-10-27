import { ButtonHTMLAttributes, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Full research text remains accessible when the preview is visually truncated.
export function OverviewHint({ hint, children, onKeyDown, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { hint: string }) {
  const id = useId(), ref = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; above: boolean }>();
  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(undefined);
    window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [!!position]);
  function show() {
    const rect = ref.current!.getBoundingClientRect(), width = Math.min(360, innerWidth - 24);
    const above = rect.bottom + 156 > innerHeight;
    setPosition({ left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)), top: above ? rect.top - 6 : rect.bottom + 6, width, above });
  }
  return <>
    <button {...props} ref={ref} aria-describedby={position ? id : undefined}
      onMouseEnter={show} onMouseLeave={() => setPosition(undefined)} onFocus={show} onBlur={() => setPosition(undefined)}
      onClick={e => { setPosition(undefined); props.onClick?.(e); }}
      onKeyDown={e => { if (e.key === "Escape") { setPosition(undefined); e.stopPropagation(); } onKeyDown?.(e); }}>{children}</button>
    {position && createPortal(<div id={id} role="tooltip" className="overview-hint" style={{ left: position.left, top: position.top, width: position.width, transform: position.above ? "translateY(-100%)" : undefined }}>{hint}</div>, document.body)}
  </>;
}
