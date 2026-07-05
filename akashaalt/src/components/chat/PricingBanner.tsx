import { findModelPricing, PRICE_AS_OF, type AiProvider } from "../../data/modelCatalog";

function fmt(n: number): string {
  return n % 1 === 0 ? n.toFixed(0) : n.toString();
}

export default function PricingBanner({ provider, modelId }: { provider: AiProvider; modelId: string }) {
  if (!modelId) return null;
  const pricing = findModelPricing(provider, modelId);
  const isFree = pricing && pricing.priceIn === 0 && pricing.priceOut === 0;

  return (
    <span
      style={{
        flexShrink: 0, fontSize: 11, padding: "3px 8px", borderRadius: "var(--radius-sm)",
        background: isFree ? "rgba(139,195,74,0.14)" : pricing ? "rgba(255,193,7,0.12)" : "rgba(244,67,54,0.1)",
        border: `1px solid ${isFree ? "rgba(139,195,74,0.4)" : pricing ? "rgba(255,193,7,0.35)" : "rgba(244,67,54,0.3)"}`,
        color: isFree ? "#7cb342" : pricing ? "var(--warning)" : "var(--danger)",
        whiteSpace: "nowrap",
      }}
      title={pricing ? `100만 토큰당 요금 · ${PRICE_AS_OF} 기준` : "사전설정 목록에 없는 모델입니다. 요금은 직접 확인해 주세요."}
    >
      {isFree
        ? "🆓 무료 모델 (Free tier)"
        : pricing
          ? `⚠ 입력 $${fmt(pricing.priceIn)} / 출력 $${fmt(pricing.priceOut)} (100만 토큰당, ${PRICE_AS_OF} 기준)`
          : "⚠ 요금 정보 없음 · 직접 확인 필요"}
    </span>
  );
}
