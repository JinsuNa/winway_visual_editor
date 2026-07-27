import type { CSSProperties } from "react";

/*
 * named-style 레지스트리 — SpiderGen의 .stl 개념.
 * 이름으로 스타일을 등록해 두고, styleName prop이나
 * setSwitchOnStyle('이름') 같은 imperative API에서 참조한다.
 */

const registry = new Map<string, CSSProperties>();

/** 스타일 등록/교체 */
export function registerStyle(name: string, style: CSSProperties): void {
  registry.set(name, style);
}

/** 여러 스타일 한 번에 등록 */
export function registerStyles(styles: Record<string, CSSProperties>): void {
  for (const [name, style] of Object.entries(styles)) {
    registry.set(name, style);
  }
}

/** 이름으로 스타일 조회 (없으면 undefined) */
export function getStyle(name?: string): CSSProperties | undefined {
  return name ? registry.get(name) : undefined;
}

/** 등록 해제 */
export function unregisterStyle(name: string): void {
  registry.delete(name);
}
