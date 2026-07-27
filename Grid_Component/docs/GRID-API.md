# Grid API 명세

`runtime/components/Grid/Grid.tsx` (래퍼) + `runtime/components/Grid/_lib/` (winGrid 본체) 기준.

```
GridProps = CommonProps                          // 모든 컴포넌트 공통 선언형 props
          + Omit<DataGridProps, "className"|"apiRef">   // 그리드 본체 props 전부
          + { hiddenColumns?: string[] }         // 래퍼가 추가한 컬럼 숨기기
```

---

## 1. 데이터 · 컬럼

| prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `columns` | `Column<R>[]` | (필수) | 컬럼 정의. `children`을 주면 그룹(병합) 헤더 |
| `rows` | `R[]` | (필수) | DB/API에서 받은 JSON 배열 그대로 (`Row = Record<string, unknown>`) |
| `columnDefaults` | `ColumnDefaults<R>` | – | 모든 리프 컬럼에 적용할 기본값 (컬럼 개별 설정이 우선) |
| `rowKey` | `(row, index) => string \| number` | `row.id ?? index` | 행 식별자 |

### Column

```ts
type Column<R> = LeafColumn<R> | GroupColumn<R>;

interface LeafColumn<R> {
  key: string;              // 행 객체에서 값을 읽을 키
  title: string;            // 헤더 텍스트  (별칭: header — 래퍼가 title로 정규화)
  width?: number;           // px. 없으면 자동
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  sortable?: boolean;       // 기본 true
  resizable?: boolean;      // 기본 true
  type?: CellType;          // 기본 'text'
  options?: { value: string | number | boolean; label: string }[];  // radio/select용
  editable?: boolean;       // checkbox/radio/select 편집 가능 여부. 기본 true
  formatter?: (value: unknown, row: R) => ReactNode;      // 화면 표시용
  exportValue?: (value: unknown, row: R) => string | number | boolean | null;  // XLSX/CSV용
  comparator?: (a: R, b: R) => number;                    // 커스텀 정렬
  footer?: FooterDef<R>;
}

interface GroupColumn<R> {
  title: string;
  headerAlign?: 'left' | 'center' | 'right';
  children: Column<R>[];    // 리프 수만큼 colSpan 병합
}

type CellType = 'text' | 'number' | 'checkbox' | 'radio' | 'select' | 'button';
```

### FooterDef (푸터 집계)

```ts
interface FooterDef<R> {
  agg?: 'sum' | 'avg' | 'min' | 'max' | 'count';   // 내장 집계
  label?: ReactNode;                                // 고정 라벨
  render?: (rows: R[]) => ReactNode;                // 완전 커스텀 (현재 화면 행 전체)
  colspan?: number;                                 // 오른쪽으로 n칸 병합 (기본 1)
  align?: 'left' | 'center' | 'right';
  format?: (value: number) => ReactNode;            // 집계 결과 포맷
}
```

## 2. 크기 · 레이아웃

| prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `height` | `number \| string` | 자동 | 미지정 시 래퍼가 `헤더깊이×headerRowHeight + 행수×rowHeight + 푸터` 로 자동 계산. `style.height`(px)도 명시 높이로 인정 |
| `rowHeight` | `number \| (row, viewIndex) => number` | `36` | 함수면 행별 커스텀 (viewIndex = 필터·정렬 후 기준) |
| `headerRowHeight` | `number` | `36` | |
| `footerHeight` | `number` | `38` | |
| `showFooter` | `boolean` | footer 정의가 있으면 true | |

> 높이가 명시되면 그 안에서 가상 스크롤, 없으면 행 수에 맞춰 늘어납니다.
> (가상 스크롤: `_lib/utils/virtual.ts`, overscan 6행)

## 3. 병합 · 숨기기

| prop | 타입 | 설명 |
| --- | --- | --- |
| `headerCells` | `Array<{ r, c, rowSpan?, colSpan?, title?, key?, align? }>` | 명시적 헤더 레이아웃(가로+세로 직사각형 병합). 주면 `columns`의 그룹 대신 이걸로 헤더를 그린다. `r`/`c`는 0-기준 격자 위치. `key`가 있으면 그 리프 컬럼과 연결(정렬/리사이즈 가능) |
| `headerRows` | `number` | `headerCells` 사용 시 헤더 행 수 (생략 시 자동 계산) |
| `bodyMerge` | `string[][]` | 본문 셀 가로 병합. 인접 리프 key들을 묶으면 각 행에서 그 셀들이 하나로 합쳐짐(값 공백 이어붙임). 헤더는 그대로. 예: `[["id","dept"]]` |
| `headerMerge` | `string[][]` | 리프 헤더만 가로 병합(제목 공백 이어붙임). 본문은 그대로 |
| `hiddenColumns` | `string[]` | 숨길 컬럼 key. 해당 컬럼 제거 + 걸친 병합 헤더 `colSpan` 자동 축소 + `bodyMerge` 재조정. **비파괴적** — 목록에서 빼면 그대로 복원 |

## 4. 선택 · 정렬 · 필터

| prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `selection` | `'none' \| 'checkbox' \| 'radio'` | `'none'` | 행 선택 모드 |
| `selectedKeys` | `RowKey[]` | – | controlled 선택 |
| `onSelectionChange` | `(keys, rows) => void` | – | |
| `sortable` | `boolean` | `true` | 그리드 전체 정렬 on/off. false면 모든 컬럼 정렬 비활성 |
| `sort` | `SortState[]` | – | controlled 정렬 (`{ key, direction: 'asc'\|'desc' }`) |
| `defaultSort` | `SortState[]` | – | 초기 정렬 |
| `onSortChange` | `(sorts) => void` | – | |
| `multiSort` | `boolean` | `true` | shift+클릭 다중 정렬 |
| `quickFilter` | `string` | – | 모든 컬럼 텍스트 대상 퀵 필터 |

## 5. 이벤트 · 상태

| prop | 타입 | 설명 |
| --- | --- | --- |
| `onRowClick` | `(row, index) => void` | 행 클릭 |
| `onCellChange` | `(rowIndex, key, value, row) => void` | checkbox/radio/select 셀 변경 |
| `onSelectionChange` | `(keys, rows) => void` | 선택 변경 |
| `onSortChange` | `(sorts: SortState[]) => void` | 정렬 변경 |
| `loading` | `boolean` | 로딩 표시 |
| `emptyText` | `ReactNode` | 데이터 없음 표시 |
| `exportFileName` | `string` | 내보내기 기본 파일명 |

> 에디터 "이벤트" 섹션에 노출되는 4개는 `onRowClick` / `onCellChange` /
> `onSelectionChange` / `onSortChange` 입니다 (`editor/extension/events.grid.ts`).

## 6. 공통 props (CommonProps — `runtime/core/types.ts`)

| prop | 타입 | 설명 |
| --- | --- | --- |
| `id` | `string` | `win.<id>.method()` 인스턴스 접근 키 (`ScreenProvider` 필요) |
| `readOnly` | `boolean` | 읽기 전용 (기본 false) |
| `disabled` | `boolean` | 비활성화 |
| `background` | `string` | `'r,g,b'`(예: `255,255,255`) 또는 CSS 색 |
| `border` | `BorderSpec` | `{ left, top, right, bottom, all, round }` — 각 변은 CSS 값 또는 px 숫자 |
| `font` | `FontSpec` | `{ family, size, bold, effect, color }` |
| `styleName` | `string` | 등록된 named-style 이름 (`core/styleRegistry.ts`) |
| `theme` | `'light' \| 'dark'` | 루트에 해당 테마 토큰(CSS 변수) 주입 |
| `mask` | `MaskType` | 표시값 마스크 (`core/mask.ts`) |
| `className` | `string` | 추가 클래스 |
| `style` | `CSSProperties` | 인라인 스타일 (마지막에 병합) |

## 7. 명령형 API (ref / 인스턴스)

`GridHandle = CommonHandle + Grid 고유 6개`

```ts
// Grid 고유
exportXlsx(fileName?: string): void   // 현재 화면(필터·정렬 적용) 행을 XLSX로
exportCsv(fileName?: string): void    // 현재 화면 행을 CSV로
setFooterVisible(visible: boolean): void
getSelectedRows(): Row[]
clearSelection(): void
getViewRows(): Row[]                  // 필터·정렬 적용된 현재 화면 행

// CommonHandle (모든 컴포넌트 공통)
readOnly(value: boolean): void
enable(): void
disable(): void
setFont({ family, size, effect, bold }): void
background(rgb: string): void         // 'r,g,b'
setBorder({ left, top, right, bottom, round }): void
isEnabled(): boolean
isReadOnly(): boolean
getElement(): HTMLElement | null
```

사용:

```tsx
const grid = useRef<GridHandle>(null);
<Grid ref={grid} … />
grid.current?.exportXlsx("users.xlsx");

// ScreenProvider + id 를 쓰는 경우 (SpiderGen/AFC 화면 로직 규약)
this.userGrid.getSelectedRows();
```

## 8. 내부 구조 (`_lib/`)

| 파일 | 역할 |
| --- | --- |
| `components/DataGrid.tsx` | 그리드 본체 — 헤더/본문/푸터 렌더, 가상 스크롤, 리사이즈, 선택, 정렬, 병합, 명령형 API 노출 |
| `components/cells.tsx` | 셀 타입별 렌더 (`text`/`number`/`checkbox`/`radio`/`select`/`button`) |
| `utils/headers.ts` | `buildHeaderModel` — columns(그룹 중첩)/headerCells → 헤더 격자 모델, `applyColumnDefaults`, `buildFooterCells` |
| `utils/sort.ts` | `cycleSort`(asc→desc→해제), `sortRows` (다중 정렬 · comparator 지원) |
| `utils/virtual.ts` | `buildOffsets`, `findRowAtOffset` — 가변 행 높이 가상 스크롤 |
| `utils/aggregate.ts` | `aggregate`, `formatAggregate` — 푸터 집계 |
| `export/xlsx.ts` | XLSX 직접 생성 (SpreadsheetML + zip) |
| `export/zip.ts` | 의존성 없는 ZIP(deflate-store) 구현 |
| `export/csv.ts` | CSV 생성 (BOM 포함) |
| `styles.css` | 그리드 격자/헤더/셀/스크롤 스타일 (전역 클래스) |
| `Grid.module.css` | 래퍼 스타일 (CSS Module) |
| `_lib/types.ts` | `Row`, `Column`, `LeafColumn`, `GroupColumn`, `FooterDef`, `CellType`, `SortState`, `SelectionMode`, `GridApi` … |

**외부 런타임 의존성 없음** — 엑셀/CSV/ZIP 모두 자체 구현입니다.

## 9. 래퍼(Grid.tsx)가 추가로 하는 일

1. `header` → `title` 별칭 정규화 (그룹 컬럼은 `children` 재귀) — `normalizeColumns`
2. `hiddenColumns` 적용 — 컬럼 제거 + `headerCells.colSpan`/위치 재계산 + `bodyMerge` 축소 — `applyHiddenColumns`
3. 자동 높이 계산 — `headerDepth`, `anyFooter`, `pxNumber`
4. `CommonProps` → style/handle 병합 (`useCommonComponent`) 및 `useInstance(id, …)`로 인스턴스 등록
5. `GridApi`(내부) → `GridHandle`(공통 규약) 어댑팅
