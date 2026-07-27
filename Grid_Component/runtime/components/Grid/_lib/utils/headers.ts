import { Column, ColumnDefaults, GroupColumn, LeafColumn, Row, isGroupColumn } from '../types';

/** 모든 리프 컬럼에 기본값을 병합한다. 컬럼 개별 설정이 우선. */
export function applyColumnDefaults<R extends Row>(
  columns: Column<R>[],
  defaults?: ColumnDefaults<R>,
): Column<R>[] {
  if (!defaults || Object.keys(defaults).length === 0) return columns;
  return columns.map((c) =>
    isGroupColumn(c)
      ? { ...c, children: applyColumnDefaults(c.children, defaults) }
      : { ...defaults, ...c },
  );
}

/** 헤더 한 칸의 배치 정보 (1-based, CSS grid / XLSX 좌표 공용) */
export interface HeaderCellSpec<R extends Row = Row> {
  title: string;
  column: Column<R>;
  leaf: LeafColumn<R> | null;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

export interface HeaderModel<R extends Row = Row> {
  /** 헤더 행 수 (그룹 중첩 깊이) */
  depth: number;
  /** 데이터가 실제로 매핑되는 리프 컬럼들 (왼쪽부터) */
  leaves: LeafColumn<R>[];
  cells: HeaderCellSpec<R>[];
}

function treeDepth<R extends Row>(cols: Column<R>[]): number {
  let max = 1;
  for (const c of cols) {
    if (isGroupColumn(c)) max = Math.max(max, 1 + treeDepth(c.children));
  }
  return max;
}

function leafCount<R extends Row>(c: Column<R>): number {
  if (!isGroupColumn(c)) return 1;
  return c.children.reduce((n, ch) => n + leafCount(ch), 0);
}

/**
 * 컬럼 트리를 펼쳐 다중 행 헤더 배치를 계산한다.
 * - 그룹 컬럼: colspan = 자손 리프 수, rowspan = 1
 * - 리프 컬럼: colspan = 1, rowspan = 남은 깊이 전체 (아래로 병합)
 */
export function buildHeaderModel<R extends Row>(columns: Column<R>[]): HeaderModel<R> {
  const depth = treeDepth(columns);
  const leaves: LeafColumn<R>[] = [];
  const cells: HeaderCellSpec<R>[] = [];

  const walk = (cols: Column<R>[], level: number, startCol: number): number => {
    let col = startCol;
    for (const c of cols) {
      if (isGroupColumn(c)) {
        const span = leafCount(c);
        cells.push({
          title: c.title,
          column: c,
          leaf: null,
          colStart: col,
          colSpan: span,
          rowStart: level,
          rowSpan: 1,
        });
        walk((c as GroupColumn<R>).children, level + 1, col);
        col += span;
      } else {
        leaves.push(c);
        cells.push({
          title: c.title,
          column: c,
          leaf: c,
          colStart: col,
          colSpan: 1,
          rowStart: level,
          rowSpan: depth - level + 1,
        });
        col += 1;
      }
    }
    return col;
  };

  walk(columns, 1, 1);
  return { depth, leaves, cells };
}

/** 푸터 셀 배치: colspan 병합을 반영해 (colStart, colSpan, def) 목록 생성 */
export interface FooterCellSpec<R extends Row = Row> {
  leaf: LeafColumn<R>;
  colStart: number;
  colSpan: number;
}

export function buildFooterCells<R extends Row>(leaves: LeafColumn<R>[]): FooterCellSpec<R>[] {
  const out: FooterCellSpec<R>[] = [];
  let i = 0;
  while (i < leaves.length) {
    const leaf = leaves[i];
    const span = Math.max(1, Math.min(leaf.footer?.colspan ?? 1, leaves.length - i));
    out.push({ leaf, colStart: i + 1, colSpan: span });
    i += span; // 병합된 범위의 뒤 컬럼 푸터 정의는 소비(무시)된다
  }
  return out;
}
