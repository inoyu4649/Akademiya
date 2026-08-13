/**
 * 사람이 읽는 용량 표기.
 * 소수점은 1자리까지만 — 사용량 표시는 정확도보다 "얼마나 남았는지"가 중요하다.
 * (0은 '0 KB'로 적는다. '0 B'는 어색하고 단위가 튀어 보인다)
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return '1 KB' // 1KB 미만도 한 칸은 차지한 것으로 보여준다
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  // 10 이상이면 정수로 — '12.3 MB'보다 '12 MB'가 읽기 쉽다
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
}
