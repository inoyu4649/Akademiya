import { useState, type ReactNode } from "react";

interface Props {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

// 추론 과정(<think>)·코드 블록 등을 접었다 펼 수 있는 연녹색 블록으로 감싸는 공용 컴포넌트
export default function CollapsibleBlock({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      margin: "8px 0", borderRadius: "var(--radius-sm)",
      background: "rgba(139,195,74,0.10)", border: "1px solid rgba(139,195,74,0.35)",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px", background: "rgba(139,195,74,0.16)", border: "none",
          color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {title}
      </button>
      {open && (
        <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
