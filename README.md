# winway_visual_editor

## Grid_Component — Grid 이식 패키지

Winway Visual Editor의 **Grid 컴포넌트에만 관련된 모든 코드**를 모아 둔 폴더입니다.
다른 프로젝트로 Grid를 옮길 때 이 폴더를 그대로 넘겨 병합 요청하는 용도입니다.

- [`Grid_Component/README.md`](Grid_Component/README.md) — 이식 가이드 (런타임만 / 에디터까지)
- [`Grid_Component/docs/GRID-API.md`](Grid_Component/docs/GRID-API.md) — props · 메서드 · 이벤트 · 타입 전체 명세
- [`Grid_Component/docs/EDITOR-INTEGRATION.md`](Grid_Component/docs/EDITOR-INTEGRATION.md) — 비주얼 에디터 통합 · 메시지 프로토콜
- [`Grid_Component/docs/FILE-MAP.md`](Grid_Component/docs/FILE-MAP.md) — 원본 경로 대응표

구성

| 경로 | 내용 |
| --- | --- |
| `Grid_Component/runtime/` | React 런타임 — Grid 본체(`components/Grid/**`) + core 의존성 + 디자인 토큰. 외부 런타임 의존성 없음 (XLSX/CSV/ZIP 자체 구현) |
| `Grid_Component/editor/extension/` | 확장(Node) 측 — 팔레트 / 메서드 / 이벤트 / 데이터바인딩 스캔 / prop 편집(Babel) / 메시지 핸들러 |
| `Grid_Component/editor/webview/` | 웹뷰 측 — 우클릭 메뉴 · Data Binding · Grid Properties · 병합설정 · 컬럼 숨기기 UI + 스타일 |
