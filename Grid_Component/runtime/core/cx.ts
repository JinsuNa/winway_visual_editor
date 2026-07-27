/** 간단한 클래스명 결합기 (falsy 제거) */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
