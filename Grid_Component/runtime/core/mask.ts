/*
 * 마스크 — Label/TextField/Button/Switch/Grid/DropBox 공용 표시 변환.
 * value가 0.12345678 일 때 TRUNC_NUMBER_MASK → "0" 처럼, 원본값은 유지하고
 * "표시값"만 변환한다. 새 마스크는 registerMask로 자유롭게 확장 가능.
 */

export type MaskFn = (value: string | number) => string;

const registry = new Map<string, MaskFn>();

/** 마스크 등록/교체 (커스텀 마스크 확장용) */
export function registerMask(name: string, fn: MaskFn): void {
  registry.set(name, fn);
}

/** 등록된 마스크 함수 조회 */
export function getMask(name: string): MaskFn | undefined {
  return registry.get(name);
}

/** 값에 마스크를 적용해 표시 문자열을 반환. 미등록/NONE이면 원본 문자열. */
export function applyMask(value: string | number, mask?: string): string {
  if (value == null) return "";
  if (!mask || mask === "NONE") return String(value);
  const fn = registry.get(mask);
  return fn ? fn(value) : String(value);
}

/** 숫자로 파싱 (콤마·공백 제거) — 실패 시 NaN */
function toNumber(value: string | number): number {
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[\s,]/g, ""));
}

// ---- 기본 제공 마스크 ----

/** 소수점 이하 절삭: 0.12345678 → "0" */
registerMask("TRUNC_NUMBER_MASK", (v) => {
  const n = toNumber(v);
  return Number.isFinite(n) ? String(Math.trunc(n)) : String(v);
});

/** 천 단위 콤마: 1234567 → "1,234,567" */
registerMask("COMMA_NUMBER_MASK", (v) => {
  const n = toNumber(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(v);
});

/** 소수점 2자리 절삭(반올림 아님): 0.12345 → "0.12" */
registerMask("TRUNC_2_MASK", (v) => {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return String(v);
  const truncated = Math.trunc(n * 100) / 100;
  return truncated.toFixed(2);
});

/** 천 단위 콤마 + 소수점 2자리: 1234.5 → "1,234.50" */
registerMask("COMMA_TRUNC_2_MASK", (v) => {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return String(v);
  const truncated = Math.trunc(n * 100) / 100;
  return truncated.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

/** 마스킹 처리(비밀번호 등): abcd → "••••" */
registerMask("HIDE_MASK", (v) => "•".repeat(String(v).length));

/** 기본 제공 마스크 이름 유니온 (타입 힌트용, 문자열이면 무엇이든 허용) */
export type MaskType =
  | "NONE"
  | "TRUNC_NUMBER_MASK"
  | "COMMA_NUMBER_MASK"
  | "TRUNC_2_MASK"
  | "COMMA_TRUNC_2_MASK"
  | "HIDE_MASK"
  | (string & {});
