/**
 * Grid — 팔레트 항목 (출처: src/palette.ts)
 *
 * 팔레트는 미리보기 패널의 드래그 소스이고, 드롭하면 snippet이 소스에 삽입되고
 * importSource에서 자동 import 된다. 이식 시 대상 프로젝트의 PALETTE 배열에
 * GRID_PALETTE_ITEM 하나만 추가하면 된다.
 */
export interface PaletteComponent {
  /** JSX 태그명 (= import 이름) */
  name: string;
  /** 표시 라벨 */
  label: string;
  /** 분류 */
  category: string;
  /** import 출처 모듈 */
  importSource: string;
  /** 삽입할 JSX 스니펫 */
  snippet: string;
  /** children을 담을 수 있는 컨테이너인지 (드롭 위치 판정에 사용) */
  container?: boolean;
}

/** src/palette.ts 의 Grid 항목 원문 */
export const GRID_PALETTE_ITEM: PaletteComponent = {
  name: "Grid",
  label: "Grid",
  category: "복합",
  importSource: "@rve/components", // ← 이식 대상의 컴포넌트 패키지 이름으로 교체
  // 기본: 헤더 1행 · 5열(빈 헤더) · 빈 데이터 5행 — 사용자가 Properties/데이터바인딩에서 채운다
  snippet: `<Grid style={{ width: 600 }} columns={[{ key: "col1", title: "" }, { key: "col2", title: "" }, { key: "col3", title: "" }, { key: "col4", title: "" }, { key: "col5", title: "" }]} rows={[{}, {}, {}, {}, {}]} />`,
};

export const PALETTE: PaletteComponent[] = [GRID_PALETTE_ITEM];
