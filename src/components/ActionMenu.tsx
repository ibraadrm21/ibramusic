import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const menuAction = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10";

export function ActionMenu({ label, button, className, contextRequest, animated = false, children }: {
  label: string;
  button: ReactNode;
  className: string;
  contextRequest?: number;
  animated?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (contextRequest) setOpen(true); }, [contextRequest]);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const anchor = trigger.current;
    const menu = panel.current;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const below = rect.bottom + margin;
      const above = rect.top - height - margin;
      const top = below + height <= innerHeight - margin ? below : above >= margin ? above
        : Math.max(margin, Math.min(below, innerHeight - height - margin));
      menu.style.top = top + "px";
      menu.style.left = Math.max(margin, Math.min(rect.right - width, innerWidth - width - margin)) + "px";
    };
    place();
    menu.querySelector<HTMLElement>("button")?.focus();
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!trigger.current?.contains(node) && !panel.current?.contains(node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (animated) event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, animated]);

  return <>
    <button ref={trigger} type="button" aria-label={label} title={label} aria-expanded={open} className={className}
      onClick={event => { event.stopPropagation(); setOpen(previous => !previous); }}>{button}</button>
    {(open || animated) && createPortal(
      <div ref={panel} aria-label={label} role="group" inert={!open} data-open={open} onClick={event => event.stopPropagation()}
        className={"fixed z-[110] grid w-56 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-auto rounded-2xl border border-white/10 bg-brand-darkBg p-1.5 " + (animated ? "playlist-options-panel shadow-lg shadow-black/40" : "shadow-2xl shadow-black/70")}>
        {children(close)}
      </div>, document.body)}
  </>;
}
