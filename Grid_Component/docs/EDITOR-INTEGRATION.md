# 에디터(비주얼 에디터) 통합 가이드 — Grid

Grid를 "코드 안의 `<Grid …/>` JSX를 GUI로 편집"하는 층까지 이식할 때의 설명입니다.
런타임만 필요하면 이 문서는 무시해도 됩니다.

## 0. 전체 흐름

```
[웹뷰]  미리보기에서 Grid 우클릭
          → Properties / Data Binding 팝업에서 편집
          → "적용"
          → vscode.postMessage({ type: "setProps", targetStart, targetEnd, props })
[확장]  computeSetProps(source, msg)      (mutate.grid.ts, Babel로 JSX attribute upsert)
          → TextEdit[]
          → applyEdits(): WorkspaceEdit 적용 → document.save()
          → refreshNow(): 소스 재파싱(ast.ts) + 번들 재빌드
[웹뷰]  갱신된 tree 수신 → 미리보기·트리·인스펙터 재렌더
```

Grid 노드를 특정하는 값은 **소스 오프셋** 입니다. 웹뷰의 `node.id`가 `"start-end"`
문자열이고, `nodeRange(node)`가 이를 `{start, end}`로 파싱해서 메시지에 실어 보냅니다.

## 1. 확장(Node) 측

### 1-1. 파일별 역할

| 파일 | 원본 | 붙이는 곳 |
| --- | --- | --- |
| `palette.grid.ts` | `src/palette.ts` | 팔레트 배열에 `GRID_PALETTE_ITEM` 추가 |
| `methods.grid.ts` | `src/methods.ts` | `COMPONENT_METHODS`에 `Grid: GRID` 등록 |
| `events.grid.ts` | `src/events.ts` | `COMPONENT_EVENTS`에 `Grid: GRID_EVENTS` 등록 |
| `dataBinding.ts` | `src/dataBinding.ts` (원문 전체) | 그대로 추가 |
| `mutate.grid.ts` | `src/mutate.ts` 발췌 | 대상에 `computeSetProps`가 이미 있으면 그걸 쓰고, 없으면 이 파일 사용 |
| `panel.grid-handlers.ts` | `src/panel.ts` 발췌 | 패널 클래스의 메시지 `switch`에 case 추가 |
| `ast.ts` | `src/ast.ts` (원문 전체) | props 값 모델 생성기. 대상에 동등한 것이 없으면 필수 |

### 1-2. `importSource` 교체

`palette.grid.ts`의 `importSource: "@rve/components"` 를 대상 프로젝트의 컴포넌트
패키지 이름으로 바꿔야 합니다. 드롭 시 이 값으로 `import { Grid } from "…"`가 자동 삽입됩니다.

### 1-3. props 값 모델 (가장 중요한 계약)

웹뷰의 Grid Properties/Data Binding은 `node.props[].value`가 아래 모양이라고 가정합니다
(`ast.ts`의 `RveValue`).

```ts
{ kind: "leaf",   text: "col1" }                          // 문자열/숫자/불린 리터럴
{ kind: "array",  items: RveValue[] }                     // [ … ]
{ kind: "object", entries: [{ key, value: RveValue }] }    // { key: … }
{ kind: "raw",    text: "…" }                             // 그 외 표현식 원문
```

Grid 팝업은 이 모델로 `columns` / `headerCells` / `bodyMerge` / `hiddenColumns` / `rows`를
읽고(`gridColumnsOf`, `gridRowsSample`, `readRowsBinding`), 문자열 표현식으로 되돌려
`setProps`로 보냅니다(`gridColumnsExpr`, `gridHeaderCellsExpr`, `gridBodyMergeExpr`).
대상 프로젝트의 AST 모델이 다르면 **이 어댑터 부분만** 고치면 됩니다.

### 1-4. 메시지 프로토콜 (Grid가 쓰는 것 전부)

| 방향 | type | payload | 처리 |
| --- | --- | --- | --- |
| 웹뷰 → 확장 | `setProps` | `{ targetStart, targetEnd, props: [{ name, expr? , value? }] }` | `computeSetProps` → 편집 적용. `expr`는 `name={expr}`, `value`는 `name="value"`, 둘 다 비면 **prop 제거** |
| 웹뷰 → 확장 | `setProp` | `{ targetStart, targetEnd, name, expr }` | 단일 prop 버전 |
| 웹뷰 → 확장 | `scanJson` | `{}` | 현재 문서 텍스트를 `scanJsonSources()`로 스캔 |
| 확장 → 웹뷰 | `jsonSources` | `{ sources: JsonSource[] }` | 웹뷰가 목록 표시 (대기 중이면 팝업 오픈) |
| 웹뷰 → 확장 | `fetchJson` | `{ name, url }` | 확장이 실제 GET (상대경로면 vite 포트 5173~5177 후보, localhost↔127.0.0.1 스왑) |
| 확장 → 웹뷰 | `jsonKeys` | `{ name, keys, count }` 또는 `{ name, error }` | 해당 소스의 key 채움 |

`JsonSource`:

```ts
interface JsonSource {
  name: string;    // 변수명
  kind: string;    // "배열(JSON)" | "객체(JSON)" | "… · useState" | "REST API (GET)"
  keys: string[];  // JSON key 목록 (REST는 호출 전엔 빈 배열)
  count: number;   // 행 수
  url?: string;    // REST인 경우
}
```

### 1-5. `scanJsonSources`가 인식하는 패턴

- `const rows = [{ … }, … ]` — 배열-of-객체
- `const one = { … }` — 객체 리터럴
- `const [rows, setRows] = useState([{ … }])` — useState 초기값
- `fetch("URL")` — 같은 문장에서 쓰인 setter로 state 변수명을 역추적, 없으면 URL 마지막 세그먼트를 이름으로

## 2. 웹뷰 측

`webview/webview.grid.js`는 원본 `media/webview.js`에서 Grid 관련 코드를 원문 그대로
발췌해 섹션 A~E로 묶은 파일입니다(각 섹션 주석에 원본 행 번호 표기). 단독 실행 파일이
아니라 대상 웹뷰의 IIFE 안에 붙여넣는 스니펫 모음입니다.

| 섹션 | 내용 |
| --- | --- |
| A | 상태 변수 (`dbGridNode`, `gpNode`, `gpCols`, `gpHeadCells`, `msRect` …) |
| B | 확장 → 웹뷰 메시지 수신 (`jsonSources`, `jsonKeys`) |
| C | Grid 코드가 쓰는 공용 헬퍼 (`rveLog`, `nodeAt`, `findPathById`, `nodeRange`, `getPropValue`) |
| D | 인스펙터에서 Grid만 raw props 목록을 숨기는 처리 |
| E | Grid 본체 — 우클릭 메뉴 / Data Binding / Grid Properties / 병합설정 / 컬럼 숨기기 (원본 2925-4102행 전체) |

웹뷰 쪽 외부 의존:

- `vscode = acquireVsCodeApi()`
- `tree` (확장이 보낸 노드 트리), `$preview` (미리보기 컨테이너 DOM)
- `renderDataBinding()`이 재진입 렌더 방식이라 팝업은 매번 새로 그립니다(상태는 A의 전역 변수).

스타일은 `webview/webview.grid.css`(원본 `media/webview.css` 1290-1557행)를 함께 넣으세요.
클래스 접두어: `.rve-ctxmenu`(우클릭) `.rve-db-*`(Data Binding·공용 팝업 껍데기)
`.rve-gp-*`(Grid Properties) `.rve-ms-*`(병합설정) `.rve-hc-*`(컬럼 숨기기).
`--rve-border`, `--rve-primary`, `--t-blue` 변수는 없으면 fallback 값이 쓰입니다.

## 3. Grid Properties가 만들어내는 코드

"적용"을 누르면 아래 prop들을 한 번의 `setProps`로 기록합니다
(`webview.grid.js` 섹션 E 마지막 `apply` 핸들러).

| prop | 언제 | 형태 |
| --- | --- | --- |
| `columns` | 항상 | `[{ key: "col1", title: "이름", type: "number", width: 120 }, …]` (`type`은 text가 아닐 때만, `width`는 숫자일 때만) |
| `selection` | 체크박스 on | `selection="checkbox"` / off면 prop 제거 |
| `bodyMerge` | 본문 병합 있을 때 | `[["id","dept"]]` / 없으면 제거 |
| `headerCells` | 헤더 2행 이상이거나 병합이 있을 때 | `[{ r:0, c:0, colSpan:2, title:"기본정보", key:"name" }, …]` / 아니면 제거 |
| `headerRows` | `headerCells`와 함께 | `headerRows={2}` |
| `sortable` | 정렬 off | `sortable={false}` / on이면 제거(기본 true) |
| `hiddenColumns` | 숨긴 열 있을 때 | `["dept"]` / 없으면 제거 |
| `headerMerge` | – | 항상 제거 (`headerCells`로 대체된 레거시 prop) |

Data Binding "적용"은 `rows` 하나만 기록합니다.

```jsx
rows={userList.map((r) => ({ col1: r["name"], col2: r["dept"], col3: "" }))}
```

매핑되지 않은 열도 `""`로 남겨 열이 사라지지 않게 합니다. 팝업을 다시 열면
`readRowsBinding()`이 이 식을 정규식으로 파싱해 소스명·열↔필드 매핑을 복원합니다.

## 4. 헤더 2D 모델 (병합설정의 핵심)

헤더는 `H(행) × N(열)` 격자를 **완전히 타일링하는** 셀 배열로 관리합니다.

```js
gpHeadCells = [{ r, c, rs, cs, text }, …]   // rs=rowSpan, cs=colSpan
gpHeadRows  = H
```

- `parseHeaderFromColumns(columns)` — 그룹 중첩 columns → `{ leaves, cells, rows }`
  (런타임 `buildHeaderModel`과 같은 결과를 웹뷰에서 재현)
- `headerCells` prop이 있으면 그걸 그대로 타일로 사용
- `doHeadMerge(r0,c0,r1,c1)` / `doHeadSplit(idx)` — 직사각형 병합/해제
- `expandRect()` — 선택 직사각형이 기존 병합 셀을 걸치면 유효 범위로 자동 확장
- `addHeaderRowTop()` / `delHeaderRowTop()` — 헤더 행 추가/삭제
- `headSyncAddColumn()` / `headSyncRemoveColumn()` — 컬럼 추가·삭제 시 타일 동기화
- 본문 병합은 헤더와 독립: 리프 컬럼의 `merge` 플래그 런(run) → `bodyMerge` 그룹으로 직렬화
- 맨 아래 행의 단일열(`cs===1`) 셀 텍스트는 해당 컬럼 `title`과 양방향 동기화

병합설정 팝업은 실제 컬럼 폭(`width` 또는 기본 110px)으로 WYSIWYG 격자를 그리고,
클릭 / shift+클릭으로 직사각형 범위를 선택합니다(`msArea`가 `"HEAD"`면 헤더, `"DATA"`면 본문).

## 5. 컬럼 숨기기

웹뷰의 `hiddenApplied()`는 숨김 적용 결과(열 제거 + 헤더 `colSpan` 축소)를 **미리보기용**으로
계산하고, 실제 런타임 축소는 `Grid.tsx`의 `applyHiddenColumns()`가 합니다. 즉 코드에는
`hiddenColumns={["dept"]}`만 남고 `columns`/`headerCells`는 손상되지 않습니다(비파괴적).

## 6. 이식 체크리스트

- [ ] `palette.grid.ts`의 `importSource`를 대상 패키지명으로 교체
- [ ] `methods` / `events` 맵에 `Grid` 등록 → "메서드"·"이벤트" 탭 동작 확인
- [ ] `ast.ts` 값 모델(leaf/array/object)이 대상과 호환되는지 확인, 다르면 `gridColumnsOf` 등 어댑터 수정
- [ ] `setProps` / `scanJson` / `fetchJson` case를 패널 메시지 switch에 추가
- [ ] `webview.grid.js` 섹션 A~E를 웹뷰 IIFE 안에 배치 (C의 헬퍼가 이미 있으면 중복 제거)
- [ ] `webview.grid.css` 추가
- [ ] 미리보기에서 Grid 우클릭 → Properties / Data Binding 이 열리는지 확인
