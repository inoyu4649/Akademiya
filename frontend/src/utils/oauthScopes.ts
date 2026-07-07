import type { OptionalScope, ScopeRange } from "../api/openoauth.api";

export const OPTIONAL_SCOPES: OptionalScope[] = ["picture", "org_membership", "class_membership"];

/** scope_range가 org/class인 앱은 해당 소속 정보 scope가 서버에서 강제로 켜진다 */
export function forcedScopesFor(scopeRange: ScopeRange): OptionalScope[] {
  if (scopeRange === "org") return ["org_membership"];
  if (scopeRange === "class") return ["class_membership"];
  return [];
}
