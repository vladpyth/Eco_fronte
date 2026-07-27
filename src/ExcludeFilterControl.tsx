import { useEffect, useRef, useState } from "react";
import "./ExcludeFilterControl.css";

function IconFilter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
    </svg>
  );
}

/** Строка считается исключённой, если status или excluded = true. */
export function isExcludedRow(row: Record<string, unknown>): boolean {
  return row.status === true || row.excluded === true;
}

type Props = {
  showExcluded: boolean;
  onChange: (show: boolean) => void;
  /** Подпись тумблера */
  label?: string;
  className?: string;
};

/** Иконка фильтра у поиска + окно с тумблером «показывать исключённые». */
export function ExcludeFilterControl({
  showExcluded,
  onChange,
  label = "Показывать исключённые объекты",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`hub-filter-wrap${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="hub-filter-btn"
        aria-label="Фильтры списка"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Фильтры"
        onClick={() => setOpen((v) => !v)}
      >
        <IconFilter />
      </button>
      {open ? (
        <div className="hub-filter-popover" role="dialog" aria-label="Настройки фильтра">
          <div className="hub-filter-popover-title">Фильтры</div>
          <div className="hub-filter-row">
            <span className="hub-filter-row-label">{label}</span>
            <button
              type="button"
              className={`hub-switch${showExcluded ? " hub-switch--on" : ""}`}
              role="switch"
              aria-checked={showExcluded}
              aria-label={label}
              onClick={() => onChange(!showExcluded)}
            >
              <span className="hub-switch-thumb" />
            </button>
          </div>
          <button type="button" className="hub-filter-done" onClick={() => setOpen(false)}>
            Готово
          </button>
        </div>
      ) : null}
    </div>
  );
}
