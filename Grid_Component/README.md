# Grid Component — 이식 패키지

Winway Visual Editor에서 **Grid 하나에만 관련된 모든 코드**를 모아 놓은 폴더입니다.
다른 프로젝트에 Grid를 옮길 때, 이 폴더를 그대로 주고 "이걸 우리 프로젝트에 병합해줘"라고
요청하면 되도록 구성했습니다.

Grid는 **런타임(React 컴포넌트)** 과 **에디터 통합(비주얼 에디터에서 Grid를 편집하는 UI)**
두 층으로 되어 있습니다. 이식 대상이 그냥 React 앱이면 `runtime/`만 필요하고,
비주얼 에디터(VS Code 확장)까지 옮기려면 `editor/`도 함께 필요합니다.

```
Grid_Component/
├── README.md                      ← 이 파일 (이식 가이드)
├── docs/
│   ├── GRID-API.md                ← props · 메서드 · 이벤트 · 타입 전체 명세
│   ├── EDITOR-INTEGRATION.md      ← 에디터(확장) 측 통합 방법 · 메시지 프로토콜
│   └── FILE-MAP.md                ← 이 폴더 파일 ↔ 원본 경로 대응표
├── runtime/                       ← ① React 런타임 (그대로 복사해서 쓰는 코드)
│   ├── index.ts                   ← Grid만 export하는 배럴
│   ├── css-modules.d.ts
│   ├── components/Grid/**         ← Grid 본체 + winGrid(_lib) 전체
│   ├── core/**                    ← Grid가 의존하는 공통 레이어 8개 파일
│   └── tokens/tokens.css          ← 디자인 토큰(CSS 변수)
└── editor/                        ← ② 비주얼 에디터 통합
    ├── extension/                 ← 확장(Node) 측
    │   ├── palette.grid.ts        ← 팔레트 항목(드래그 소스 + 삽입 스니펫)
    │   ├── methods.grid.ts        ← "메서드" 탭 문서
    │   ├── events.grid.ts         ← "이벤트" 섹션 목록
    │   ├── dataBinding.ts         ← 파일에서 JSON 소스 스캔 (데이터 바인딩 백엔드)
    │   ├── mutate.grid.ts         ← setProp/setProps → 소스 텍스트 편집
    │   ├── panel.grid-handlers.ts ← 웹뷰 ↔ 확장 메시지 핸들러
    │   └── ast.ts                 ← props 값 모델(leaf/array/object) 생성기
    └── webview/                   ← 웹뷰(UI) 측
        ├── webview.grid.js        ← 우클릭 메뉴 · Data Binding · Properties · 병합설정 · 컬럼숨기기
        └── webview.grid.css       ← 위 UI 스타일 전체
```

---

## ① 런타임만 이식하는 경우 (일반 React 앱)

### 1. 파일 복사

`runtime/` 안의 내용을 대상 프로젝트의 컴포넌트 라이브러리 위치로 복사합니다.
원본 프로젝트에서의 위치는 이랬습니다:

| 이 폴더 | 원본 위치 |
| --- | --- |
| `runtime/components/Grid/` | `packages/components/src/components/Grid/` |
| `runtime/core/` | `packages/components/src/core/` |
| `runtime/tokens/tokens.css` | `packages/components/src/tokens/tokens.css` |
| `runtime/index.ts` | `packages/components/src/index.ts` (Grid만 남긴 버전) |

대상 프로젝트에 이미 `core/`에 해당하는 공통 레이어가 있으면, `runtime/core/`를 덮어쓰지 말고
아래 "core 의존성" 표를 보며 필요한 것만 병합하세요.

### 2. 요구사항

- React 18 이상 (`react`, `react-dom` — peerDependencies)
- CSS Modules (`*.module.css`) 를 처리하는 번들러 (Vite / webpack 등)
- 일반 CSS import (`import "./_lib/styles.css"`) 지원
- TypeScript를 쓰면 `css-modules.d.ts`를 `include` 대상에 넣어야 함
  (없으면 `Cannot find module './Grid.module.css'` 에러)

**외부 런타임 의존성은 0개입니다.** XLSX 내보내기까지 직접 구현되어 있어
(`_lib/export/xlsx.ts` + `zip.ts`) `xlsx`, `exceljs`, `jszip` 같은 패키지가 필요 없습니다.

### 3. 사용

```tsx
import { Grid, type GridHandle } from "<복사한 위치>";

const columns = [
  { key: "name", title: "이름", width: 140 },
  { key: "dept", title: "부서" },
  { key: "amount", title: "금액", type: "number", align: "right",
    footer: { agg: "sum" } },
];

export default function Screen() {
  const grid = useRef<GridHandle>(null);
  return (
    <>
      <Grid ref={grid} id="userGrid" columns={columns} rows={rows}
            selection="checkbox" height={360} />
      <button onClick={() => grid.current?.exportXlsx("users.xlsx")}>엑셀</button>
    </>
  );
}
```

`ScreenProvider`로 감싸면 `id`로 인스턴스 접근이 가능합니다
(`win.userGrid.exportXlsx()` 형태 — `core/screen.tsx` 참고).

### 4. core 의존성 (Grid가 실제로 쓰는 것만)

| 파일 | 역할 | Grid에서의 쓰임 |
| --- | --- | --- |
| `core/types.ts` | `CommonProps` / `CommonHandle` / `FontSpec` / `BorderSpec` | Grid props·handle의 상위 인터페이스 |
| `core/useCommonComponent.ts` | 공통 props → style + 명령형 handle 생성 | `useCommonComponent(common, elRef)` |
| `core/screen.tsx` | `ScreenProvider` / `useInstance` (id 기반 인스턴스 레지스트리) | `useInstance(id, …)` |
| `core/styleUtils.ts` | font/border/color 해석 | useCommonComponent 내부 |
| `core/styleRegistry.ts` | named style (`styleName`) 조회 | useCommonComponent 내부 |
| `core/mask.ts` | 표시값 마스크 (`mask` prop / `MaskType`) | types.ts가 참조 |
| `core/cx.ts` | className 병합 | `cx(styles.grid, className)` |
| `core/domEvents.ts` | DOM 이벤트 전달 유틸 | 공통 레이어 유지용(다른 컴포넌트와 공유) |

---

## ② 비주얼 에디터 통합까지 이식하는 경우

`editor/`는 "코드 안의 `<Grid …/>` JSX를 GUI로 편집"하는 층입니다. 구조는
**웹뷰(UI) → 메시지 → 확장(Node) → Babel로 소스 텍스트 편집 → 저장 → 미리보기 재빌드** 입니다.

에디터 측 Grid 기능은 4개입니다.

1. **팔레트** — 좌측 목록에서 Grid를 드래그해 미리보기에 드롭 → 기본 스니펫 삽입 (`palette.grid.ts`)
2. **Grid Properties** (미리보기에서 Grid 우클릭 → Properties)
   - 열 추가/삭제, 필드(key)·헤더명·타입·너비 편집
   - 헤더 행 추가/삭제, 직사각형(가로+세로) 헤더 병합, 본문 열 병합 (`병합설정`)
   - 컬럼 숨기기(비파괴적), 정렬 on/off, 행 선택 체크박스
   - → `columns` / `headerCells` / `headerRows` / `bodyMerge` / `hiddenColumns` /
     `selection` / `sortable` prop으로 코드에 기록
3. **Data Binding** (우클릭 → Data Binding)
   - 현재 파일에서 JSON 변수(배열-of-객체 / 객체 / `useState` 초기값 / `fetch(URL)`)를 스캔
   - JSON 필드 ↔ 그리드 열 매핑(수동/Auto Mapping)
   - → `rows={소스.map((r) => ({ 열: r["필드"], … }))}` 표현식 생성
4. **메서드 / 이벤트 탭** — Grid가 노출하는 메서드·이벤트 문서 (`methods.grid.ts`, `events.grid.ts`)

자세한 연결 방법(어느 함수를 어디에 붙이는지, 메시지 이름, 데이터 계약)은
**`docs/EDITOR-INTEGRATION.md`** 에 정리했습니다.

`editor/` 코드는 원본 파일에서 Grid 관련 부분을 **원문 그대로** 발췌한 것입니다.
`webview.grid.js`는 단독 실행 파일이 아니라 대상 웹뷰의 IIFE 안에 섹션별로 붙여넣는
스니펫 모음이고(파일 상단에 원본 행 번호 표기), `extension/*.ts`는 그대로 컴파일됩니다
(`mutate.grid.ts`는 `@babel/parser`, `@babel/traverse`, `@babel/types` 필요).

---

## 검증 상태

- `runtime/` 전체 — `tsc --strict --jsx react-jsx` 통과 (css-modules.d.ts 포함 시)
- `editor/extension/*.ts` — `tsc --strict` 통과
- `editor/webview/*` — 원본 발췌(문법 무변경). 붙여넣을 위치는 파일 상단 주석 참고

## 병합 요청 예시 프롬프트

> 이 `Grid_Component/` 폴더는 다른 프로젝트에서 쓰던 Grid 컴포넌트 전체다.
> `README.md`와 `docs/`를 먼저 읽고, 우리 프로젝트의 컴포넌트 라이브러리 구조에 맞게
> `runtime/`을 병합해줘. `core/`는 우리 쪽에 이미 있는 것과 겹치면 필요한 것만 합치고,
> 없는 건 새로 만들어. (에디터도 옮길 거면) `editor/`는
> `docs/EDITOR-INTEGRATION.md`를 따라 우리 확장/웹뷰에 붙여줘.
