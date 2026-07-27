import type { CSSProperties } from "react";
import type { MaskType } from "./mask";

/** 폰트 설정 — imperative setFont / font prop 공용 */
export interface FontSpec {
  /** 글꼴 패밀리 */
  family?: string;
  /** 크기 (px 숫자 또는 CSS 값) */
  size?: number | string;
  /** 굵게 */
  bold?: boolean;
  /** 밑줄/취소선 등 효과 */
  effect?: "none" | "underline" | "line-through" | "italic";
  /** 글자 색 (CSS 값 또는 'r,g,b') */
  color?: string;
}

/**
 * 테두리 설정 — imperative setBorder / border prop 공용.
 * 각 변은 CSS border 값("1px solid #ccc") 또는 숫자(px 두께, solid, 현재 색)를 받는다.
 */
export interface BorderSpec {
  left?: string | number;
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  /** 모서리 라운드 (px 숫자 또는 CSS 값) */
  round?: number | string;
  /** 네 변을 한 번에 지정하는 단축 (left~bottom 미지정 시 사용) */
  all?: string | number;
}

/**
 * 모든 컴포넌트가 공유하는 선언형 props.
 * 비주얼 에디터가 AST로 편집하는 대상이기도 하다.
 */
export interface CommonProps {
  /** 컴포넌트 id — this.<id>.method() 로 인스턴스 접근에 사용 */
  id?: string;
  /** 읽기 전용 (기본 false) */
  readOnly?: boolean;
  /** 비활성화 */
  disabled?: boolean;
  /** 배경색 — 'r,g,b' 형식(255,255,255) 또는 CSS 색 */
  background?: string;
  /** 테두리 */
  border?: BorderSpec;
  /** 폰트 */
  font?: FontSpec;
  /** 등록된 named-style 이름 (styleRegistry 참조) */
  styleName?: string;
  /** 이 컴포넌트의 테마 (light/dark). 지정 시 루트에 해당 테마 토큰(CSS 변수)을 주입 */
  theme?: "light" | "dark";
  /** 마스크 (지원 컴포넌트에서만 사용) */
  mask?: MaskType;
  /** 추가 클래스 */
  className?: string;
  /** 인라인 스타일 오버라이드 (가장 마지막에 병합) */
  style?: CSSProperties;
}

/**
 * 모든 컴포넌트가 ref로 노출하는 명령형 공통 핸들.
 * SpiderGen/AFC 화면 로직의 `this.component.method()` 규약에 대응.
 */
export interface CommonHandle {
  /** true면 읽기 전용으로 전환 (기본 false) */
  readOnly(value: boolean): void;
  /** 활성화 */
  enable(): void;
  /** 비활성화 */
  disable(): void;
  /** 폰트 설정 (family, size, bold, effect) */
  setFont(font: FontSpec): void;
  /** 배경색 설정 — 'r,g,b' (예: '255,255,255') */
  background(rgb: string): void;
  /** 테두리 설정 (left, top, right, bottom, round) */
  setBorder(border: BorderSpec): void;
  /** 현재 활성 여부 */
  isEnabled(): boolean;
  /** 현재 읽기 전용 여부 */
  isReadOnly(): boolean;
  /** 루트 DOM 요소 반환 */
  getElement(): HTMLElement | null;
}
