import type { ReactNode } from 'react';

/** 행 데이터는 DB에서 받은 JSON 객체 그대로 사용한다. */
export type Row = Record<string, unknown>;

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export type Align = 'left' | 'center' | 'right';

/** 셀 표시/편집 타입 */
export type CellType = 'text' | 'number' | 'checkbox' | 'radio' | 'select' | 'button';

export interface SelectOption {
  value: string | number | boolean;
  label: string;
}

export type AggregateName = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** 푸터 셀 정의 (리프 컬럼 단위) */
export interface FooterDef<R extends Row = Row> {
  /** 내장 집계 함수 이름 */
  agg?: AggregateName;
  /** 고정 라벨 (agg보다 우선 낮음: label + agg 결과를 함께 표시하지 않음) */
  label?: ReactNode;
  /** 완전 커스텀 렌더 (현재 화면에 보이는 행 전체를 받음) */
  render?: (rows: R[]) => ReactNode;
  /** 오른쪽으로 n개 푸터 셀 병합 (기본 1) */
  colspan?: number;
  align?: Align;
  /** 집계 결과 포맷터 */
  format?: (value: number) => ReactNode;
}

/** 리프(데이터) 컬럼 */
export interface LeafColumn<R extends Row = Row> {
  /** 행 객체에서 값을 읽을 키 */
  key: string;
  title: string;
  width?: number;
  minWidth?: number;
  align?: Align;
  headerAlign?: Align;
  /** 기본 true */
  sortable?: boolean;
  /** 기본 true */
  resizable?: boolean;
  /** 기본 'text' */
  type?: CellType;
  /** type이 'radio' | 'select'일 때 선택지 */
  options?: SelectOption[];
  /** checkbox/radio/select 편집 가능 여부. 기본 true */
  editable?: boolean;
  /** 화면 표시용 포맷터 */
  formatter?: (value: unknown, row: R) => ReactNode;
  /** 내보내기(XLSX/CSV) 값 변환. 없으면 원본 값 사용 */
  exportValue?: (value: unknown, row: R) => string | number | boolean | null;
  /** 커스텀 정렬 비교 함수 */
  comparator?: (a: R, b: R) => number;
  footer?: FooterDef<R>;
}

/** 그룹(병합) 헤더 컬럼 — children의 리프 수만큼 colspan 병합된다 */
export interface GroupColumn<R extends Row = Row> {
  title: string;
  headerAlign?: Align;
  children: Column<R>[];
}

export type Column<R extends Row = Row> = LeafColumn<R> | GroupColumn<R>;

/** 그리드 전체 리프 컬럼에 적용할 기본값 (컬럼 개별 설정이 우선) */
export type ColumnDefaults<R extends Row = Row> = Partial<
  Omit<LeafColumn<R>, 'key' | 'title' | 'footer'>
>;

export function isGroupColumn<R extends Row>(c: Column<R>): c is GroupColumn<R> {
  return Array.isArray((c as GroupColumn<R>).children);
}

export type SelectionMode = 'none' | 'checkbox' | 'radio';

export type RowKey = string | number;

/** ref로 노출되는 명령형 API */
export interface GridApi<R extends Row = Row> {
  exportXlsx: (fileName?: string) => void;
  exportCsv: (fileName?: string) => void;
  setFooterVisible: (visible: boolean) => void;
  getSelectedRows: () => R[];
  clearSelection: () => void;
  /** 필터·정렬이 적용된 현재 화면 기준 행 */
  getViewRows: () => R[];
}
