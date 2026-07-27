import { useEffect, useRef, useState } from "react";

/** YYYY-MM-DD из API / массива / ДД.ММ.ГГГГ */
export function toIsoDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value) && value.length >= 3) {
    const y = Number(value[0]);
    const m = Number(value[1]);
    const d = Number(value[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dotted = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotted) {
    const d = Number(dotted[1]);
    const m = Number(dotted[2]);
    const y = Number(dotted[3]);
    if (!isValidYmd(y, m, d)) return "";
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 8) {
    const d = Number(digits.slice(0, 2));
    const m = Number(digits.slice(2, 4));
    const y = Number(digits.slice(4, 8));
    if (!isValidYmd(y, m, d)) return "";
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

export function formatDateRu(value: unknown): string {
  const iso = toIsoDate(value);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Маска ввода: только цифры → ДД.ММ.ГГГГ */
export function maskDateDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

type DateFieldProps = {
  value: unknown;
  disabled?: boolean;
  /** CSS-класс обёртки */
  className?: string;
  /** CSS-класс текстового поля */
  inputClassName?: string;
  /** YYYY-MM-DD или "" при очистке */
  onChange: (iso: string) => void;
};

/**
 * Дата: ввод цифрами (ДД.ММ.ГГГГ) + всплывающий календарь.
 */
export function DateField(props: DateFieldProps) {
  const { value, disabled, onChange } = props;
  const iso = toIsoDate(value);
  const [text, setText] = useState(() => formatDateRu(value));
  const [focused, setFocused] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setText(formatDateRu(value));
  }, [value, focused]);

  const commitText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setText("");
      return;
    }
    const next = toIsoDate(trimmed) || toIsoDate(maskDateDigits(trimmed));
    if (next) {
      onChange(next);
      setText(formatDateRu(next));
    } else {
      setText(formatDateRu(value));
    }
  };

  const openPicker = () => {
    if (disabled) return;
    const el = pickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      /* ignore — fallback to click */
    }
    el.click();
  };

  return (
    <div className={`date-field ${props.className ?? ""}`.trim()}>
      <input
        type="text"
        className={props.inputClassName ?? "hub-input date-field-text"}
        inputMode="numeric"
        placeholder="ДД.ММ.ГГГГ"
        disabled={disabled}
        value={text}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(maskDateDigits(e.target.value))}
        onBlur={(e) => {
          setFocused(false);
          commitText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className="date-field-calendar"
        disabled={disabled}
        title="Выбрать в календаре"
        aria-label="Выбрать в календаре"
        onMouseDown={(e) => e.preventDefault()}
        onClick={openPicker}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-field-native"
        lang="ru"
        tabIndex={-1}
        disabled={disabled}
        value={iso}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          setText(formatDateRu(v));
        }}
      />
    </div>
  );
}
