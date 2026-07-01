import { useMemo, useRef, useState } from "react";
import { getPresetModels, VENDOR_LABELS, type AiProvider, type Vendor } from "../../data/modelCatalog";
import s from "./ModelPicker.module.css";

interface Props {
  provider: AiProvider;
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

function fmtPrice(n: number): string {
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toString()}`;
}

export default function ModelPicker({ provider, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customInput, setCustomInput] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => getPresetModels(provider), [provider]);
  const selected = presets.find((m) => m.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter((m) => m.displayName.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [presets, query]);

  const grouped = useMemo(() => {
    const map = new Map<Vendor, typeof filtered>();
    for (const m of filtered) {
      const list = map.get(m.vendor) ?? [];
      list.push(m);
      map.set(m.vendor, list);
    }
    return map;
  }, [filtered]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const applyCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    pick(trimmed);
    setCustomInput("");
  };

  return (
    <div className={s.wrapper} ref={wrapRef}>
      <button
        type="button"
        className={s.trigger}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`${s.triggerText} ${!value ? s.triggerPlaceholder : ""}`}>
          {selected?.displayName ?? value ?? "모델 선택"}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className={s.backdrop} onClick={() => setOpen(false)} />
          <div className={s.panel}>
            <div className={s.searchBox}>
              <input
                className={s.searchInput}
                placeholder="모델 검색..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className={s.list}>
              {filtered.length === 0 ? (
                <p className={s.empty}>일치하는 사전설정 모델이 없습니다</p>
              ) : (
                [...grouped.entries()].map(([vendor, models]) => (
                  <div className={s.vendorGroup} key={vendor}>
                    <p className={s.vendorLabel}>{VENDOR_LABELS[vendor]}</p>
                    {models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`${s.item} ${m.id === value ? s.itemActive : ""}`}
                        onClick={() => pick(m.id)}
                      >
                        <span className={s.itemName}>{m.displayName}</span>
                        <span className={s.itemPrice}>{fmtPrice(m.priceIn)}/{fmtPrice(m.priceOut)}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className={s.customSection}>
              <p className={s.customLabel}>목록에 없는 모델 직접 입력 (예: {provider === "openrouter" ? "mistralai/mistral-large" : "model-id"})</p>
              <div className={s.customRow}>
                <input
                  className={s.customInput}
                  placeholder="모델 ID"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }}
                />
                <button className={s.customBtn} disabled={!customInput.trim()} onClick={applyCustom}>
                  적용
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
