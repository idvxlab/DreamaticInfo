import { useEffect, useRef, useState } from "react";
import { ChartNoAxesCombined, ChevronDown, Settings2 } from "lucide-react";

export default function BrandMenu({ onSettings }: { onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const area = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!area.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    area.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="brand-area" ref={area}>
      <button
        ref={trigger}
        className="brand"
        aria-label="Dreamatic · Info 菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "brand-menu" : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="brand-icon">
          <ChartNoAxesCombined size={21} />
        </span>
        <span className="brand-copy">
          <strong>
            Dreamatic · <b>Info</b>
          </strong>
          <small>DATA INTO STORIES</small>
        </span>
        <ChevronDown className="brand-chevron" size={14} />
      </button>
      {open && (
        <div
          id="brand-menu"
          className="brand-menu"
          role="menu"
          aria-label="Dreamatic · Info 菜单"
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLElement>(
                  '[role="menuitem"]',
                ),
              ];
              const index = items.indexOf(
                document.activeElement as HTMLElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }
            if (event.key === "Tab") setOpen(false);
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
          >
            <Settings2 size={16} /> 设置
          </button>
        </div>
      )}
    </div>
  );
}
