import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { CommonHandle, CommonProps } from "../../core/types";
import { useCommonComponent } from "../../core/useCommonComponent";
import { useInstance } from "../../core/screen";
import { cx } from "../../core/cx";
import { DataGrid } from "./_lib/components/DataGrid";
import type { DataGridProps } from "./_lib/components/DataGrid";
import type { GridApi, Row as GridRow } from "./_lib/types";
import "./_lib/styles.css";
import styles from "./Grid.module.css";

// winGrid(DataGrid)의 props를 그대로 노출 (className/apiRef는 래퍼가 관리)
export interface GridProps extends CommonProps, Omit<DataGridProps, "className" | "apiRef"> {
  /** 숨길 컬럼 key 목록. 해당 컬럼 제거 + 걸친 병합 헤더 colSpan 자동 축소(비파괴적). 예: ["dept"] */
  hiddenColumns?: string[];
}

export interface GridHandle extends CommonHandle {
  /** 현재 화면(필터·정렬 적용) 행을 XLSX로 내보내기 */
  exportXlsx(fileName?: string): void;
  /** 현재 화면 행을 CSV로 내보내기 */
  exportCsv(fileName?: string): void;
  /** 푸터 표시/숨김 */
  setFooterVisible(visible: boolean): void;
  /** 선택된 행 반환 */
  getSelectedRows(): GridRow[];
  /** 선택 해제 */
  clearSelection(): void;
  /** 필터·정렬이 적용된 현재 화면 행 반환 */
  getViewRows(): GridRow[];
}

/**
 * Grid — winGrid 데이터 그리드 래퍼.
 * 가상 스크롤·정렬·병합 헤더·푸터 집계·셀타입·행선택·엑셀/CSV 내보내기 지원(라이브러리 내장).
 * 공통 규약(id/theme/CommonHandle)을 얹고, GridApi를 `win.<id>.exportXlsx()` 등으로 노출.
 */
export const Grid = forwardRef<GridHandle, GridProps>(function Grid(props, ref) {
  const {
    id,
    readOnly,
    disabled,
    background,
    border,
    font,
    styleName,
    theme,
    mask,
    className,
    style,
    columns,
    height,
    headerCells,
    bodyMerge,
    hiddenColumns,
    ...gridProps
  } = props as GridProps & { headerCells?: any[]; bodyMerge?: string[][]; hiddenColumns?: string[] };

  // header → title 별칭 (실제 prop명은 title). 그룹 컬럼은 children 재귀.
  const normCols = useMemo(() => normalizeColumns(columns as any[]), [columns]);
  // 컬럼 숨기기: 숨긴 컬럼 제거 + 병합 헤더(colSpan)·bodyMerge 자동 축소 (비파괴적)
  const { cols, headerCells: visHeaderCells, bodyMerge: visBodyMerge } = useMemo(
    () => applyHiddenColumns(normCols, headerCells, bodyMerge, hiddenColumns),
    [normCols, headerCells, bodyMerge, hiddenColumns]
  );

  // 행 수·헤더 depth에 맞춘 자동 높이 (명시 높이가 없을 때의 기본값)
  const rowCount = Array.isArray((gridProps as any).rows) ? (gridProps as any).rows.length : 0;
  const rh = typeof (gridProps as any).rowHeight === "number" ? (gridProps as any).rowHeight : 36;
  const headerH = (gridProps as any).headerRowHeight ?? 36;
  const footerH = (gridProps as any).footerHeight ?? 38;
  // 명시적 헤더(headerCells)를 쓰면 그 행 수를, 아니면 그룹 depth를 헤더 높이로
  const customHeaderRows =
    (gridProps as any).headerRows ??
    (Array.isArray(visHeaderCells) && visHeaderCells.length
      ? visHeaderCells.reduce((m: number, h: any) => Math.max(m, (h.r ?? 0) + (h.rowSpan ?? 1)), 1)
      : null);
  const depth = customHeaderRows != null ? customHeaderRows : headerDepth(cols);
  const hasFooter =
    (gridProps as any).showFooter === true ||
    ((gridProps as any).showFooter == null && anyFooter(cols));
  const autoHeight = depth * headerH + rowCount * rh + (hasFooter ? footerH : 0) + 2;

  const common: CommonProps = { id, readOnly, disabled, background, border, font, styleName, theme, mask, style };
  const elRef = useRef<HTMLDivElement>(null);
  const { style: mergedStyle, handle } = useCommonComponent(common, elRef);
  // 명시된 높이(height prop 또는 style.height)가 있으면 그 값을 쓰고(그 안에서 스크롤),
  // 없을 때만 행 수에 맞춘 자동 높이 사용 → 인스펙터에서 높이 조절 가능
  const explicitHeight = height != null ? height : pxNumber((mergedStyle as any).height);
  const effHeight = explicitHeight != null ? explicitHeight : autoHeight;
  // 높이는 DataGrid가 직접 제어하므로 래퍼 style에서 height 제거 (이중 제약 방지)
  const { height: _ignoredH, ...wrapStyle } = mergedStyle as Record<string, unknown>;

  const gridApi = useRef<GridApi | null>(null);

  const api = useInstance(
    id,
    () => ({
      ...handle,
      exportXlsx: (fileName?: string) => gridApi.current?.exportXlsx(fileName),
      exportCsv: (fileName?: string) => gridApi.current?.exportCsv(fileName),
      setFooterVisible: (visible: boolean) => gridApi.current?.setFooterVisible(visible),
      getSelectedRows: () => gridApi.current?.getSelectedRows() ?? [],
      clearSelection: () => gridApi.current?.clearSelection(),
      getViewRows: () => gridApi.current?.getViewRows() ?? [],
    }),
    [handle]
  );
  useImperativeHandle(ref, () => api, [api]);

  return (
    <div ref={elRef} id={id} className={cx(styles.grid, className)} style={wrapStyle as any}>
      <DataGrid
        apiRef={gridApi}
        columns={cols}
        headerCells={visHeaderCells}
        bodyMerge={visBodyMerge}
        height={effHeight}
        {...(gridProps as Omit<DataGridProps, "columns" | "height" | "headerCells" | "bodyMerge">)}
      />
    </div>
  );
});

/**
 * 컬럼 숨기기 적용 — 숨긴 컬럼 제거 + headerCells의 colSpan/위치·bodyMerge 재조정.
 * 병합 헤더는 사라지지 않고 걸친 폭만 축소(숨긴 열만 덮던 셀은 제거).
 */
function applyHiddenColumns(
  cols: any[],
  headerCells: any[] | undefined,
  bodyMerge: string[][] | undefined,
  hidden: string[] | undefined
): { cols: any[]; headerCells: any[] | undefined; bodyMerge: string[][] | undefined } {
  const hset = new Set(Array.isArray(hidden) ? hidden : []);
  if (!hset.size) return { cols, headerCells, bodyMerge };
  // 보이는 컬럼 + old→new 인덱스
  const visible: boolean[] = cols.map((c) => !hset.has(c.key));
  const visCols = cols.filter((_, i) => visible[i]);
  const visibleBefore = (oldC: number) => {
    let n = 0;
    for (let k = 0; k < oldC && k < visible.length; k++) if (visible[k]) n++;
    return n;
  };
  const visibleInRange = (c0: number, cs: number) => {
    let n = 0;
    for (let k = c0; k < c0 + cs && k < visible.length; k++) if (visible[k]) n++;
    return n;
  };
  let visHC = headerCells;
  if (Array.isArray(headerCells)) {
    visHC = [];
    for (const cell of headerCells) {
      const cs = cell.colSpan ?? 1;
      const newCs = visibleInRange(cell.c, cs);
      if (newCs <= 0) continue; // 숨긴 열만 덮던 셀 → 제거
      visHC.push({ ...cell, c: visibleBefore(cell.c), colSpan: newCs });
    }
  }
  let visBM = bodyMerge;
  if (Array.isArray(bodyMerge)) {
    visBM = bodyMerge.map((g) => g.filter((k) => !hset.has(k))).filter((g) => g.length > 1);
  }
  return { cols: visCols, headerCells: visHC, bodyMerge: visBM };
}

/** style.height 값을 px 숫자로 변환 (숫자 그대로 / "300px" / "300" 허용, 그 외 null) */
function pxNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d+(?:\.\d+)?)px$/) || v.trim().match(/^(\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

/** header→title 별칭 정규화 (그룹 컬럼 children 재귀). 본문 병합은 bodyMerge prop으로 처리 */
function normalizeColumns(cols: any[]): any[] {
  if (!Array.isArray(cols)) return cols;
  return cols.map((c) => {
    if (c && typeof c === "object") {
      if (Array.isArray(c.children)) return { ...c, children: normalizeColumns(c.children) };
      if (c.title == null && c.header != null) return { ...c, title: c.header };
    }
    return c;
  });
}

/** 헤더 depth (그룹 중첩 최대 깊이). 평면이면 1 */
function headerDepth(cols: any[]): number {
  if (!Array.isArray(cols) || !cols.length) return 1;
  let d = 1;
  for (const c of cols) {
    if (c && Array.isArray(c.children) && c.children.length) {
      d = Math.max(d, 1 + headerDepth(c.children));
    }
  }
  return d;
}

/** 리프 컬럼 중 footer 정의가 하나라도 있는지 */
function anyFooter(cols: any[]): boolean {
  if (!Array.isArray(cols)) return false;
  for (const c of cols) {
    if (c && Array.isArray(c.children)) {
      if (anyFooter(c.children)) return true;
    } else if (c && c.footer) {
      return true;
    }
  }
  return false;
}
