/**
 * Grid — 인스턴스 메서드 문서 (출처: src/methods.ts)
 *
 * 에디터 "메서드" 탭에서 선택한 컴포넌트가 노출하는 imperative 메서드를 보여준다.
 * (this.<component>.method(...) 형태로 호출)
 * COMMON_METHODS(모든 컴포넌트 공통) + GRID(그리드 고유) 를 합쳐서 노출한다.
 */
export interface MethodDoc {
  name: string;
  signature: string;
  description: string;
  example: string;
}

/** 모든 컴포넌트 공통 (명세 2-1) — Grid에도 그대로 적용 */
export const COMMON_METHODS: MethodDoc[] = [
  { name: "readOnly", signature: "readOnly(value: boolean): void", description: "false가 기본. true면 readOnly 상태로 전환", example: "this.component.readOnly(true)" },
  { name: "enable", signature: "enable(): void", description: "활성화", example: "this.component.enable()" },
  { name: "disable", signature: "disable(): void", description: "비활성화", example: "this.component.disable()" },
  { name: "setFont", signature: "setFont({ family, size, effect, bold }): void", description: "폰트·크기·효과·굵기 설정", example: "this.component.setFont({ size: 16, bold: true })" },
  { name: "background", signature: "background(rgb: string): void", description: "배경색을 rgb 값으로 설정", example: "this.component.background('255,255,255')" },
  { name: "setBorder", signature: "setBorder({ left, top, right, bottom, round }): void", description: "테두리(각 변 + round) 설정", example: "this.component.setBorder({ all: 1, round: 8 })" },
];

/** 마스크 지원 컴포넌트 공통(명세 2-1: Label/TextField/Button/Switch/Grid/DropBox) */
export const MASK_METHOD: MethodDoc = {
  name: "mask", signature: "mask(type): void", description: "표시값 마스크 (예: TRUNC_NUMBER_MASK → 0.12345678 을 0으로)", example: "this.component.mask('TRUNC_NUMBER_MASK')",
};

/** Grid 고유 메서드 (src/methods.ts 의 GRID 원문) */
export const GRID: MethodDoc[] = [
  { name: "exportXlsx", signature: "exportXlsx(fileName?): void", description: "현재 화면(필터·정렬 적용) 행을 엑셀(XLSX)로 내보내기", example: "this.grid.exportXlsx('users.xlsx')" },
  { name: "exportCsv", signature: "exportCsv(fileName?): void", description: "현재 화면 행을 CSV로 내보내기", example: "this.grid.exportCsv('users.csv')" },
  { name: "setFooterVisible", signature: "setFooterVisible(visible): void", description: "푸터 표시/숨김", example: "this.grid.setFooterVisible(true)" },
  { name: "getSelectedRows", signature: "getSelectedRows(): Row[]", description: "선택된 행 반환", example: "this.grid.getSelectedRows()" },
  { name: "clearSelection", signature: "clearSelection(): void", description: "선택 해제", example: "this.grid.clearSelection()" },
  { name: "getViewRows", signature: "getViewRows(): Row[]", description: "필터·정렬이 적용된 현재 화면 행 반환", example: "this.grid.getViewRows()" },
];

/** 컴포넌트별 고유 메서드 */
export const COMPONENT_METHODS: Record<string, MethodDoc[]> = {
  Grid: GRID,
};

/** 컴포넌트 이름 → 공통+고유 메서드 (알 수 없는 컴포넌트는 undefined) */
export function methodsFor(name: string): MethodDoc[] | undefined {
  const own = COMPONENT_METHODS[name];
  if (own === undefined) return undefined;
  return [...COMMON_METHODS, ...own];
}

/** 웹뷰로 한 번에 보낼 메서드 맵 */
export function allMethods(): Record<string, MethodDoc[]> {
  const out: Record<string, MethodDoc[]> = {};
  for (const name of Object.keys(COMPONENT_METHODS)) {
    out[name] = methodsFor(name)!;
  }
  return out;
}
