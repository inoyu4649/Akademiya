import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import styles from "./CodeInput.module.css";

interface CodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  alphaOnly?: boolean;
}

export default function CodeInput({ length = 8, value, onChange, disabled = false, alphaOnly = false }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const chars = value.padEnd(length, "").split("").slice(0, length);

  function updateValue(index: number, char: string) {
    const next = [...chars];
    next[index] = char.toUpperCase();
    onChange(next.join("").trimEnd());
  }

  function handleChange(index: number, raw: string) {
    const ch = alphaOnly
      ? raw.replace(/[^A-Za-z]/g, "").toUpperCase().slice(-1)
      : raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(-1);
    if (!ch) return;
    updateValue(index, ch);
    // Move focus to next
    if (index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (chars[index]) {
        updateValue(index, "");
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        updateValue(index - 1, "");
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = alphaOnly
      ? e.clipboardData.getData("text").replace(/[^A-Za-z]/g, "").toUpperCase()
      : e.clipboardData.getData("text").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const next = chars.map((c, i) => pasted[i] ?? c).join("").slice(0, length);
    onChange(next.trimEnd());
    const nextFocus = Math.min(pasted.length, length - 1);
    refs.current[nextFocus]?.focus();
  }

  return (
    <div className={styles.wrapper} aria-label="code input">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`${styles.box} ${focusedIndex === i ? styles.focused : ""} ${chars[i] ? styles.filled : ""}`}
          type="text"
          inputMode="text"
          maxLength={2}
          value={chars[i] || ""}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={() => setFocusedIndex(i)}
          onBlur={() => setFocusedIndex(null)}
          autoComplete="off"
          spellCheck={false}
        />
      ))}
    </div>
  );
}
