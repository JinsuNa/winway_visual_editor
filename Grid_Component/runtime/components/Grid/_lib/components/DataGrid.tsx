import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  Ref,
  UIEvent,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Align,
  Column,
  ColumnDefaults,
  GridApi,
  LeafColumn,
  Row,
  RowKey,
  SelectionMode,
  SortState,
} from '../types';
import { applyColumnDefaults, buildFooterCells, buildHeaderModel } from '../utils/headers';
import { buildOffsets, findRowAtOffset } from '../utils/virtual';
import { cycleSort, sortRows } from '../utils/sort';
import { aggregate, formatAggregate } from '../utils/aggregate';
import { exportXlsx } from '../export/xlsx';
import { exportCsv } from '../export/csv';
import { CellContent } from './cells';

export interface DataGridProps<R extends Row = Row> {
  /** 컬럼 정의 (그룹 중첩으로 헤더 병합) */
  columns: Column<R>[];
  /** 모든 리프 컬럼에 적용할 기본값 (컬럼 개별 설정이 우선) */
  columnDefaults?: ColumnDefaults<R>;
  /** DB에서 받은 JSON 배열 그대로 */
  rows: R[];
  /** 행 식별자. 기본: row.id ?? index */
  rowKey?: (row: R, index: number) => RowKey;
  height?: number | string;
  /** 행 높이(px). 숫자 = 전체 고정, 함수 = 행별 커스텀 (viewIndex는 필터·정렬 후 기준) */
  rowHeight?: number | ((row: R, viewIndex: number) => number);
  headerRowHeight?: number;
  footerHeight?: number;
  /** 푸터 표시 여부. 기본: footer 정의가 있으면 true */
  showFooter?: boolean;
  /** 행 선택 모드 */
  selection?: SelectionMode;
  selectedKeys?: RowKey[];
  onSelectionChange?: (keys: RowKey[], rows: R[]) => void;
  /** 정렬 (controlled). 생략 시 내부 상태 */
  sort?: SortState[];
  defaultSort?: SortState[];
  onSortChange?: (sorts: SortState[]) => void;
  /** shift+클릭 다중 정렬 허용. 기본 true */
  multiSort?: boolean;
  /** 그리드 전체 정렬 on/off. 기본 true. false면 모든 컬럼 정렬 비활성 */
  sortable?: boolean;
  /** 모든 컬럼 텍스트 대상 퀵 필터 */
  quickFilter?: string;
  /** 본문 셀 병합(가로 colSpan) — 인접 리프 key들을 묶으면 각 행에서 그 셀들이 하나로 합쳐짐(값 공백 이어붙임). 헤더는 그대로. 예: [["id","dept"]] */
  bodyMerge?: string[][];
  /** 리프 헤더 병합(가로 colSpan) — 인접 리프 key들의 컬럼 헤더를 한 칸으로(제목 공백 이어붙임). 본문은 그대로. 예: [["id","dept"]] */
  headerMerge?: string[][];
  /** 명시적 헤더 레이아웃(가로+세로 직사각형 병합). 주면 columns의 그룹 대신 이걸로 헤더를 그린다. r/c는 0-기준 격자 위치. key가 있으면 그 리프 컬럼과 연결(정렬/리사이즈). */
  headerCells?: Array<{ r: number; c: number; rowSpan?: number; colSpan?: number; title?: string; key?: string; align?: Align }>;
  /** headerCells 사용 시 헤더 행 수(생략 시 자동 계산) */
  headerRows?: number;
  /** checkbox/radio/select 셀 변경 콜백 */
  onCellChange?: (rowIndex: number, key: string, value: unknown, row: R) => void;
  onRowClick?: (row: R, index: number) => void;
  loading?: boolean;
  emptyText?: ReactNode;
  exportFileName?: string;
  className?: string;
  /** 명령형 API */
  apiRef?: Ref<GridApi<R>>;
}

const OVERSCAN = 6;

function defaultRowKey<R extends Row>(row: R, index: number): RowKey {
  const id = row['id'];
  return typeof id === 'string' || typeof id === 'number' ? id : index;
}

export function DataGrid<R extends Row = Row>(props: DataGridProps<R>) {
  const {
    columns: rawColumns,
    columnDefaults,
    rows,
    rowKey = defaultRowKey,
    height = 480,
    rowHeight = 36,
    headerRowHeight = 36,
    footerHeight = 38,
    selection = 'none',
    multiSort = true,
    sortable: gridSortable = true,
    quickFilter,
    bodyMerge,
    headerMerge,
    headerCells,
    headerRows,
    onCellChange,
    onRowClick,
    loading = false,
    emptyText = '데이터가 없습니다',
    exportFileName = 'grid',
    className,
  } = props;

  const gridId = useId();
  const columns = useMemo(
    () => applyColumnDefaults(rawColumns, columnDefaults),
    [rawColumns, columnDefaults],
  );
  const model = useMemo(() => buildHeaderModel(columns), [columns]);
  const { leaves, depth, cells } = model;

  // 명시적 헤더 레이아웃(직사각형 병합) 사용 여부 + 헤더 행 수
  const useCustomHeader = Array.isArray(headerCells) && headerCells.length > 0;
  const headerDepthEff = useCustomHeader
    ? headerRows ?? headerCells!.reduce((m, h) => Math.max(m, h.r + (h.rowSpan ?? 1)), 1)
    : depth;

  // 본문 병합(colSpan): 리프 key → { role:'start', span, keys } | { role:'covered' }
  const bodyMergeByKey = useMemo(() => {
    const map = new Map<string, { role: 'start'; span: number; keys: string[] } | { role: 'covered' }>();
    (bodyMerge ?? []).forEach((group) => {
      const g = group.filter((k) => leaves.some((l) => l.key === k));
      if (g.length > 1) {
        g.forEach((k, idx) =>
          map.set(k, idx === 0 ? { role: 'start', span: g.length, keys: g } : { role: 'covered' }),
        );
      }
    });
    return map;
  }, [bodyMerge, leaves]);

  // 리프 헤더 병합(colSpan): 리프 key → { role:'start', span, title } | { role:'covered' }
  const headerMergeByKey = useMemo(() => {
    const map = new Map<string, { role: 'start'; span: number; title: string } | { role: 'covered' }>();
    (headerMerge ?? []).forEach((group) => {
      const g = group.filter((k) => leaves.some((l) => l.key === k));
      if (g.length > 1) {
        const title = g
          .map((k) => leaves.find((l) => l.key === k)?.title ?? '')
          .filter((s) => s !== '')
          .join(' ');
        g.forEach((k, idx) =>
          map.set(k, idx === 0 ? { role: 'start', span: g.length, title } : { role: 'covered' }),
        );
      }
    });
    return map;
  }, [headerMerge, leaves]);

  // ── 컬럼 폭 (리사이즈) ─────────────────────────────────────────
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>({});
  const colWidth = useCallback(
    (leaf: LeafColumn<R>) => widthOverrides[leaf.key] ?? leaf.width ?? 120,
    [widthOverrides],
  );
  const selectionWidth = selection === 'none' ? 0 : 44;
  const widths = leaves.map(colWidth);
  const totalWidth = selectionWidth + widths.reduce((a, b) => a + b, 0);
  const templateColumns =
    (selection !== 'none' ? `${selectionWidth}px ` : '') +
    widths.map((w) => `${w}px`).join(' ');

  // ── 정렬 ──────────────────────────────────────────────────────
  const [innerSort, setInnerSort] = useState<SortState[]>(props.defaultSort ?? []);
  const sorts = props.sort ?? innerSort;
  const handleSortClick = (leaf: LeafColumn<R>, shiftKey: boolean) => {
    if (leaf.sortable === false) return;
    const next = cycleSort(sorts, leaf.key, multiSort && shiftKey);
    if (props.sort === undefined) setInnerSort(next);
    props.onSortChange?.(next);
  };

  // 원본 행 -> 원본 인덱스 (rowKey/셀 변경 콜백용, O(1) 조회)
  const srcIndexMap = useMemo(() => new Map(rows.map((r, i) => [r, i])), [rows]);
  const srcIndexOf = useCallback((row: R) => srcIndexMap.get(row) ?? -1, [srcIndexMap]);

  // ── 필터 + 정렬된 뷰 행 ───────────────────────────────────────
  const viewRows = useMemo(() => {
    let out = rows;
    const q = quickFilter?.trim().toLowerCase();
    if (q) {
      out = out.filter((row) =>
        leaves.some((l) => {
          const v = row[l.key];
          return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
        }),
      );
    }
    return sortRows(out, sorts, leaves);
  }, [rows, quickFilter, sorts, leaves]);

  // ── 선택 ──────────────────────────────────────────────────────
  const [innerSelected, setInnerSelected] = useState<RowKey[]>([]);
  const selectedKeys = props.selectedKeys ?? innerSelected;
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const applySelection = (keys: RowKey[]) => {
    if (props.selectedKeys === undefined) setInnerSelected(keys);
    if (props.onSelectionChange) {
      const keySet = new Set(keys);
      props.onSelectionChange(
        keys,
        rows.filter((r, i) => keySet.has(rowKey(r, i))),
      );
    }
  };
  const toggleRow = (key: RowKey) => {
    if (selection === 'radio') {
      applySelection([key]);
    } else {
      applySelection(
        selectedSet.has(key) ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key],
      );
    }
  };
  const allViewKeys = useMemo(
    () => viewRows.map((r) => rowKey(r, srcIndexOf(r))),
    [viewRows, srcIndexOf, rowKey],
  );
  const allSelected = allViewKeys.length > 0 && allViewKeys.every((k) => selectedSet.has(k));
  const someSelected = allViewKeys.some((k) => selectedSet.has(k));
  const toggleAll = () => applySelection(allSelected ? [] : allViewKeys);
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  // ── 푸터 ──────────────────────────────────────────────────────
  const hasFooterDefs = leaves.some((l) => l.footer);
  const [innerFooterVisible, setInnerFooterVisible] = useState(true);
  const footerVisible = (props.showFooter ?? innerFooterVisible) && hasFooterDefs;
  const footerCells = useMemo(() => buildFooterCells(leaves), [leaves]);

  // ── 가상 스크롤 ───────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  };
  const headerH = depth * headerRowHeight;
  const bodyViewport = Math.max(0, viewportH - headerH - (footerVisible ? footerHeight : 0));

  // 행높이: 숫자면 고정(빠른 경로), 함수면 누적 오프셋 + 이진 탐색
  const fixedRowHeight = typeof rowHeight === 'number' ? rowHeight : null;
  const offsets = useMemo(() => {
    if (typeof rowHeight !== 'function') return null;
    return buildOffsets(viewRows.length, (i) => rowHeight(viewRows[i], i));
  }, [viewRows, rowHeight]);
  const totalHeight = offsets
    ? offsets[viewRows.length]
    : viewRows.length * (fixedRowHeight ?? 36);
  const rowTop = (i: number) => (offsets ? offsets[i] : i * fixedRowHeight!);
  const rowHeightAt = (i: number) =>
    offsets ? offsets[i + 1] - offsets[i] : fixedRowHeight!;

  const startIdx = Math.max(
    0,
    (offsets
      ? findRowAtOffset(offsets, scrollTop)
      : Math.floor(scrollTop / fixedRowHeight!)) - OVERSCAN,
  );
  const endIdx = Math.min(
    viewRows.length,
    (offsets
      ? findRowAtOffset(offsets, scrollTop + bodyViewport) + 1
      : Math.ceil((scrollTop + bodyViewport) / fixedRowHeight!)) + OVERSCAN,
  );
  const visibleRows = viewRows.slice(startIdx, endIdx);

  // ── 컬럼 리사이즈 ─────────────────────────────────────────────
  const resizeState = useRef<{ key: string; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = resizeState.current;
      if (!st) return;
      const leaf = leaves.find((l) => l.key === st.key);
      const min = leaf?.minWidth ?? 40;
      setWidthOverrides((prev) => ({
        ...prev,
        [st.key]: Math.max(min, st.startW + (e.clientX - st.startX)),
      }));
    };
    const onUp = () => {
      resizeState.current = null;
      document.body.classList.remove('wg-resizing');
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [leaves]);
  const startResize = (leaf: LeafColumn<R>, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { key: leaf.key, startX: e.clientX, startW: colWidth(leaf) };
    document.body.classList.add('wg-resizing');
  };

  // ── 명령형 API ────────────────────────────────────────────────
  useImperativeHandle(
    props.apiRef,
    (): GridApi<R> => ({
      exportXlsx: (fileName) =>
        exportXlsx(
          { columns, rows: viewRows, includeFooter: footerVisible || undefined },
          fileName ?? `${exportFileName}.xlsx`,
        ),
      exportCsv: (fileName) => exportCsv(columns, viewRows, fileName ?? `${exportFileName}.csv`),
      setFooterVisible: (v) => setInnerFooterVisible(v),
      getSelectedRows: () => rows.filter((r, i) => selectedSet.has(rowKey(r, i))),
      clearSelection: () => applySelection([]),
      getViewRows: () => viewRows,
    }),
  );

  // ── 렌더 ──────────────────────────────────────────────────────
  const rootStyle: CSSProperties = { height };

  return (
    <div className={`wg-root${className ? ` ${className}` : ''}`} style={rootStyle}>
      <div className="wg-scroll" ref={scrollRef} onScroll={onScroll} role="grid">
        {/* 헤더 (병합 지원, sticky) */}
        <div
          className="wg-header"
          style={{
            width: totalWidth,
            display: 'grid',
            gridTemplateColumns: templateColumns,
            gridTemplateRows: `repeat(${headerDepthEff}, ${headerRowHeight}px)`,
          }}
          role="rowgroup"
        >
          {selection !== 'none' && (
            <div
              className="wg-header-cell wg-selection-cell"
              style={{ gridColumn: '1 / span 1', gridRow: `1 / span ${headerDepthEff}` }}
            >
              {selection === 'checkbox' && (
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="wg-checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                />
              )}
            </div>
          )}
          {useCustomHeader
            ? headerCells!.map((hc, i) => {
                const colOffset = selection !== 'none' ? 1 : 0;
                const leaf = hc.key != null ? leaves.find((l) => l.key === hc.key) : undefined;
                const sortIdx = leaf ? sorts.findIndex((s) => s.key === leaf.key) : -1;
                const sortState = sortIdx >= 0 ? sorts[sortIdx] : null;
                const sortable = gridSortable && !!leaf && leaf.sortable !== false;
                return (
                  <div
                    key={i}
                    className={`wg-header-cell wg-align-${hc.align ?? 'center'}${sortable ? ' wg-sortable' : ''}${leaf ? '' : ' wg-group-header'}`}
                    style={{
                      gridColumn: `${hc.c + 1 + colOffset} / span ${hc.colSpan ?? 1}`,
                      gridRow: `${hc.r + 1} / span ${hc.rowSpan ?? 1}`,
                    }}
                    role="columnheader"
                    aria-sort={sortState ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    onClick={leaf && sortable ? (e) => handleSortClick(leaf, e.shiftKey) : undefined}
                  >
                    <span className="wg-header-title">{hc.title ?? leaf?.title ?? ''}</span>
                    {sortState && (hc.title ?? leaf?.title ?? '') !== '' && (
                      <span className="wg-sort-indicator">
                        {sortState.direction === 'asc' ? '▲' : '▼'}
                        {sorts.length > 1 && <sub>{sortIdx + 1}</sub>}
                      </span>
                    )}
                    {leaf && leaf.resizable !== false && (
                      <span
                        className="wg-resize-handle"
                        onMouseDown={(e) => startResize(leaf, e)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                );
              })
            : cells.map((c, i) => {
            const leaf = c.leaf;
            const hm = leaf ? headerMergeByKey.get(leaf.key) : undefined;
            if (hm && hm.role === 'covered') return null; // 헤더 병합에 흡수된 리프 헤더는 렌더 안 함
            const sortIdx = leaf ? sorts.findIndex((s) => s.key === leaf.key) : -1;
            const sortState = sortIdx >= 0 ? sorts[sortIdx] : null;
            const sortable = gridSortable && !!leaf && leaf.sortable !== false;
            const colOffset = selection !== 'none' ? 1 : 0;
            const headerAlign =
              leaf?.headerAlign ??
              (c.column as { headerAlign?: string }).headerAlign ??
              'center';
            const effColSpan = hm && hm.role === 'start' ? c.colSpan + hm.span - 1 : c.colSpan;
            const title = hm && hm.role === 'start' ? hm.title : c.title;
            return (
              <div
                key={i}
                className={`wg-header-cell wg-align-${headerAlign}${sortable ? ' wg-sortable' : ''}${leaf ? '' : ' wg-group-header'}`}
                style={{
                  gridColumn: `${c.colStart + colOffset} / span ${effColSpan}`,
                  gridRow: `${c.rowStart} / span ${c.rowSpan}`,
                }}
                role="columnheader"
                aria-sort={
                  sortState ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : undefined
                }
                onClick={leaf && sortable ? (e) => handleSortClick(leaf, e.shiftKey) : undefined}
              >
                <span className="wg-header-title">{title}</span>
                {sortState && (
                  <span className="wg-sort-indicator">
                    {sortState.direction === 'asc' ? '▲' : '▼'}
                    {sorts.length > 1 && <sub>{sortIdx + 1}</sub>}
                  </span>
                )}
                {leaf && leaf.resizable !== false && (
                  <span
                    className="wg-resize-handle"
                    onMouseDown={(e) => startResize(leaf, e)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 바디 (가상 스크롤 캔버스) */}
        <div
          className="wg-canvas"
          style={{ width: totalWidth, height: Math.max(totalHeight, 1) }}
          role="rowgroup"
        >
          {visibleRows.map((row, i) => {
            const vIndex = startIdx + i;
            const srcIndex = srcIndexOf(row);
            const key = rowKey(row, srcIndex);
            const selected = selectedSet.has(key);
            return (
              <div
                key={String(key)}
                className={`wg-row${vIndex % 2 ? ' wg-row-alt' : ''}${selected ? ' wg-row-selected' : ''}`}
                style={{
                  top: rowTop(vIndex),
                  height: rowHeightAt(vIndex),
                  display: 'grid',
                  gridTemplateColumns: templateColumns,
                }}
                role="row"
                onClick={() => onRowClick?.(row, srcIndex)}
              >
                {selection !== 'none' && (
                  <div className="wg-cell wg-selection-cell" onClick={(e) => e.stopPropagation()}>
                    <input
                      type={selection === 'radio' ? 'radio' : 'checkbox'}
                      className="wg-checkbox"
                      name={selection === 'radio' ? `${gridId}-row-selection` : undefined}
                      checked={selected}
                      onChange={() => toggleRow(key)}
                      aria-label="행 선택"
                    />
                  </div>
                )}
                {leaves.map((leaf) => {
                  const bm = bodyMergeByKey.get(leaf.key);
                  if (bm && bm.role === 'covered') return null; // 병합에 흡수된 셀은 렌더 안 함
                  if (bm && bm.role === 'start') {
                    // 그룹 key들의 값을 공백으로 이어붙여 colSpan 셀로
                    const merged = bm.keys
                      .map((k) => {
                        const v = (row as Record<string, unknown>)[k];
                        return v == null ? '' : String(v);
                      })
                      .filter((s) => s !== '')
                      .join(' ');
                    return (
                      <div
                        key={leaf.key}
                        className={`wg-cell wg-align-${leaf.align ?? 'left'}`}
                        style={{ gridColumn: `span ${bm.span}` }}
                        role="gridcell"
                      >
                        {merged}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={leaf.key}
                      className={`wg-cell wg-align-${leaf.align ?? (leaf.type === 'number' ? 'right' : 'left')}`}
                      role="gridcell"
                    >
                      <CellContent
                        column={leaf}
                        row={row}
                        rowIndex={srcIndex}
                        gridId={gridId}
                        onCellChange={onCellChange}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
          {!loading && viewRows.length === 0 && (
            <div className="wg-empty">{emptyText}</div>
          )}
        </div>

        {/* 푸터 (병합·집계, sticky) */}
        {footerVisible && (
          <div
            className="wg-footer"
            style={{
              width: totalWidth,
              height: footerHeight,
              display: 'grid',
              gridTemplateColumns: templateColumns,
            }}
            role="rowgroup"
          >
            {selection !== 'none' && <div className="wg-footer-cell wg-selection-cell" />}
            {footerCells.map((fc) => {
              const def = fc.leaf.footer;
              let content: ReactNode = null;
              if (def?.render) content = def.render(viewRows);
              else if (def?.agg) {
                const v = aggregate(def.agg, viewRows, fc.leaf.key);
                content = def.format ? def.format(v) : formatAggregate(v);
              } else if (def?.label !== undefined) content = def.label;
              const colOffset = selection !== 'none' ? 1 : 0;
              return (
                <div
                  key={fc.leaf.key}
                  className={`wg-footer-cell wg-align-${def?.align ?? fc.leaf.align ?? 'right'}`}
                  style={{
                    gridColumn: `${fc.colStart + colOffset} / span ${fc.colSpan}`,
                  }}
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {loading && (
        <div className="wg-loading">
          <div className="wg-spinner" />
        </div>
      )}
    </div>
  );
}
