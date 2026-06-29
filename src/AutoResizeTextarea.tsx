import { useCallback, useEffect, useRef, useState } from "react";

type AutoResizeTextareaProps = {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  minRows?: number;
};

export function AutoResizeTextarea({
  value,
  onChange,
  onBlur,
  readOnly = false,
  className = "cell-textarea",
  minRows = 2,
}: AutoResizeTextareaProps) {
  const [local, setLocal] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const adjust = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minRows * 22, el.scrollHeight)}px`;
  }, [minRows]);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    adjust();
  }, [local, adjust]);

  return (
    <textarea
      ref={taRef}
      className={className}
      value={local}
      readOnly={readOnly}
      rows={minRows}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        onChange?.(next);
        requestAnimationFrame(() => adjust());
      }}
      onBlur={() => onBlur?.(local)}
    />
  );
}
