import type { CSSProperties } from "react";
import type { BorderSpec, FontSpec } from "./types";

/** 'r,g,b' → 'rgb(r,g,b)'. 이미 CSS 색이면 그대로. */
export function resolveColor(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  // 순수 '255,255,255' 또는 '255, 255, 255, 0.5' 형태만 rgb()로 감싼다
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?$/.test(v)) {
    const parts = v.split(",").map((s) => s.trim());
    return parts.length === 4 ? `rgba(${v})` : `rgb(${v})`;
  }
  return v;
}

/** 한 변의 border 값 정규화: 숫자 → "Npx solid currentColor", 문자열 → 그대로 */
function resolveSide(value?: string | number): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return `${value}px solid var(--rve-border)`;
  return value;
}

/** BorderSpec → CSSProperties */
export function resolveBorder(border?: BorderSpec): CSSProperties {
  if (!border) return {};
  const out: CSSProperties = {};
  const all = resolveSide(border.all);
  if (all) out.border = all;
  const left = resolveSide(border.left);
  const top = resolveSide(border.top);
  const right = resolveSide(border.right);
  const bottom = resolveSide(border.bottom);
  if (left) out.borderLeft = left;
  if (top) out.borderTop = top;
  if (right) out.borderRight = right;
  if (bottom) out.borderBottom = bottom;
  if (border.round != null) {
    out.borderRadius = typeof border.round === "number" ? `${border.round}px` : border.round;
  }
  return out;
}

/** FontSpec → CSSProperties */
export function resolveFont(font?: FontSpec): CSSProperties {
  if (!font) return {};
  const out: CSSProperties = {};
  if (font.family) out.fontFamily = font.family;
  if (font.size != null) out.fontSize = typeof font.size === "number" ? `${font.size}px` : font.size;
  if (font.bold != null) out.fontWeight = font.bold ? 600 : 400;
  if (font.color) out.color = resolveColor(font.color);
  switch (font.effect) {
    case "underline":
      out.textDecoration = "underline";
      break;
    case "line-through":
      out.textDecoration = "line-through";
      break;
    case "italic":
      out.fontStyle = "italic";
      break;
  }
  return out;
}

/** 공간(gap/padding 등) 토큰 해석: 숫자→px, 1~6 스케일 키워드 지원 */
export function resolveSpace(value?: number | string): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return `${value}px`;
  const scale: Record<string, string> = {
    "1": "var(--rve-space-1)",
    "2": "var(--rve-space-2)",
    "3": "var(--rve-space-3)",
    "4": "var(--rve-space-4)",
    "5": "var(--rve-space-5)",
    "6": "var(--rve-space-6)",
  };
  return scale[value] ?? value;
}
