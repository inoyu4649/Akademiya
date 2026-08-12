import type { OptionalScope, ScopeRange } from "../api/openoauth.api";

export const OPTIONAL_SCOPES: OptionalScope[] = ["picture", "org_membership", "cloud"];

/** scope_range가 org인 앱은 조직 소속 정보 scope가 서버에서 강제로 켜진다 */
export function forcedScopesFor(scopeRange: ScopeRange): OptionalScope[] {
  if (scopeRange === "org") return ["org_membership"];
  return [];
}
