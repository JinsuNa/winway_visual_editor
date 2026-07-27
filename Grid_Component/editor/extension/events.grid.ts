/**
 * Grid — 사용 가능한 이벤트 목록 (출처: src/events.ts)
 *
 * 에디터 속성 탭의 "이벤트" 섹션에서 드롭박스로 선택하면 빈 껍데기 핸들러
 * (`onRowClick={(row) => {}}`)만 코드에 삽입한다. 내용은 사용자가 직접 작성.
 * 여기 정의된 이벤트는 Grid가 실제로 지원(forward)하는 것만 들어 있다.
 */
export interface EventDoc {
  /** JSX 속성 이름 (예: onRowClick) */
  name: string;
  /** 핸들러 파라미터 이름 (삽입 껍데기에 사용) */
  param: string;
  /** 설명 */
  description: string;
}

/** src/events.ts 의 Grid 항목 원문 */
export const GRID_EVENTS: EventDoc[] = [
  { name: "onRowClick", param: "row", description: "행 클릭 시 (인자: row, index)" },
  { name: "onCellChange", param: "rowIndex", description: "셀 편집 시 (인자: rowIndex, key, value, row)" },
  { name: "onSelectionChange", param: "keys", description: "선택 변경 시 (인자: keys, rows)" },
  { name: "onSortChange", param: "sorts", description: "정렬 변경 시 (인자: SortState[])" },
];

/** 컴포넌트 이름 → 사용 가능한 이벤트 목록 */
export const COMPONENT_EVENTS: Record<string, EventDoc[]> = {
  Grid: GRID_EVENTS,
};

/** 컴포넌트 이름 → 이벤트 목록 (알 수 없으면 undefined) */
export function eventsFor(name: string): EventDoc[] | undefined {
  return COMPONENT_EVENTS[name];
}

/** 웹뷰로 한 번에 보낼 이벤트 맵 */
export function allEvents(): Record<string, EventDoc[]> {
  return COMPONENT_EVENTS;
}
