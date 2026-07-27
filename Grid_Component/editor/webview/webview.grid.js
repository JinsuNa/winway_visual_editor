// =============================================================================
// Grid — 에디터 웹뷰(Webview) 측 코드 전체
//   출처: media/webview.js (Winway Visual Editor)
//   이 파일은 media/webview.js 에서 "Grid에만 관련된 코드"를 원문 그대로(verbatim)
//   모아 놓은 것입니다. 그대로 실행되는 단일 파일이 아니라, 이식 대상 웹뷰의
//   IIFE 안에 섹션별로 붙여넣는 용도입니다.
//
//   구성
//     A. 상태 변수                (원본 11-29행)
//     B. 확장 → 웹뷰 메시지 수신   (원본 375-398행: jsonSources / jsonKeys)
//     C. 공용 헬퍼(Grid가 의존)    (원본 104-107, 546-566, 1525-1529, 2235-2241행)
//     D. 인스펙터의 Grid 예외 처리 (원본 2174-2200행)
//     E. Grid 본체 — 우클릭 메뉴 / Data Binding / Grid Properties /
//        병합설정 / 컬럼 숨기기    (원본 2925-4102행 전체)
//
//   외부 의존: vscode(acquireVsCodeApi), tree, $preview, renderTree 등
//   확장 측 계약: node.props[].value 는 src/ast.ts 가 만든 값 모델
//     { kind: "leaf", text } | { kind: "array", items[] } | { kind: "object", entries[{key,value}] }
//     node.id 는 "start-end" (소스 오프셋) → nodeRange()로 파싱
// =============================================================================

// ---------------------------------------------------------------------------
// A. 상태 변수 (webview.js 11-29행)
// ---------------------------------------------------------------------------
  let jsonSources = []; // 데이터 바인딩: 현재 파일에서 스캔한 JSON 변수들
  let dbPendingOpen = false; // scanJson 응답 오면 팝업 열기
  let dbSelected = null; // 선택한 JSON 소스
  let dbMapping = []; // 매핑표 행 [{ colKey, colTitle, width, field, type }]
  let dbWantSource = null; // 재진입 시 자동 선택할 소스 이름(기존 rows 바인딩)
  let dbGridNode = null; // Data Binding/Properties 대상 Grid 노드
  let gpNode = null; // Grid Properties 대상
  let gpCols = []; // 리프 컬럼 [{key, title, type, width, merge}] (merge=본문 병합 플래그)
  let gpSel = "none"; // 행 선택 모드
  let gpRowH = ""; // 행 높이
  let gpSortable = true; // 그리드 정렬 on/off
  let gpHidden = []; // 숨긴 컬럼 key 목록
  let gpHeadRows = 1; // 헤더 행 수
  let gpHeadCells = []; // 헤더 타일 [{r,c,rs,cs,text}] (H×N 완전 타일링)
  // 병합설정 선택 상태
  let msArea = null; // "HEAD" | "DATA"
  let msRect = null; // HEAD: {r0,c0,r1,c1}
  let msCols = null; // DATA: {a,b}
  let msAnchorCell = null; // {r,c} shift 기준

// ---------------------------------------------------------------------------
// B. 확장 → 웹뷰 메시지 수신 (webview.js 375-397행)
//    window.addEventListener("message", (e) => { const m = e.data; ... }) 안쪽
// ---------------------------------------------------------------------------
    if (m.type === "jsonSources") {
      jsonSources = m.sources || [];
      if (dbPendingOpen) {
        dbPendingOpen = false;
        openDataBindingPopup();
      }
      return;
    }
    if (m.type === "jsonKeys") {
      const s = jsonSources.find((x) => x.name === m.name);
      if (s) {
        s.__fetching = false;
        if (m.error) {
          s.__error = m.error;
        } else {
          s.keys = m.keys || [];
          s.count = m.count || 0;
          s.__error = null;
        }
        if (document.getElementById("rve-db-overlay")) renderDataBinding();
      }
      return;
    }

// ---------------------------------------------------------------------------
// C. Grid 코드가 쓰는 공용 헬퍼 (webview.js 104-107, 546-566, 1525-1529, 2236-2241행)
// ---------------------------------------------------------------------------
  function rveLog(text) {
    rveLogLines.push(text);
    renderLog();
  }

  function nodeAt(path) {
    if (!path) return null;
    let list = tree;
    let node = null;
    for (const i of path) {
      node = list[i];
      if (!node) return null;
      list = node.children;
    }
    return node;
  }

  function findPathById(list, id, prefix) {
    for (let i = 0; i < list.length; i++) {
      const p = prefix.concat(i);
      if (list[i].id === id) return p;
      const found = findPathById(list[i].children, id, p);
      if (found) return found;
    }
    return null;
  }

  function nodeRange(node) {
    const p = String(node.id).split("-").map(Number);
    return { start: p[0], end: p[1] };
  }
  function sendSetAttr(node, name, value) {

  function getPropValue(node, name) {
    const p = (node.props || []).find((x) => x.name === name);
    if (!p) return undefined;
    return p.value != null ? p.value : p.text;
  }


// ---------------------------------------------------------------------------
// D. 속성 인스펙터에서 Grid만 raw props 목록을 숨기는 처리 (webview.js 2174-2200행)
//    renderPropsTab(node, body) 내부 발췌
// ---------------------------------------------------------------------------
    // 나머지 props — Grid는 raw props 목록을 숨김(우클릭 Properties에서 편집, 너무 복잡)
    if (node.name !== "Grid") {
      const props = document.createElement("div");
      props.className = "rve-insp-section";
      props.appendChild(sectionTitle("props"));
      if (!node.props.length) {
        const p = document.createElement("p");
        p.className = "rve-hint rve-mini";
        p.textContent = "편집 가능한 props가 없습니다";
        props.appendChild(p);
      }
      node.props.forEach((prop, pi) => {
        props.appendChild(buildPropRow(prop, nodeKey + "|" + prop.name + "#" + pi));
      });
      props.appendChild(
        addForm("+ 속성 추가", ["속성명", "값"], nodeKey + "|addProp", (name, val) => {
          vscode.postMessage({ type: "addProp", at: node.attrInsertPos, name, value: val });
        })
      );
      body.appendChild(props);
    } else {
      const hintP = document.createElement("p");
      hintP.className = "rve-hint rve-mini rve-insp-section";
      hintP.textContent = "Grid 속성(컬럼·헤더·병합·정렬 등)은 미리보기에서 Grid 우클릭 → Properties에서 편집하세요.";
      body.appendChild(hintP);
    }
  }

// ---------------------------------------------------------------------------
// E. Grid 본체 (webview.js 2925-4102행 전체, 원문 그대로)
//    · 우클릭 컨텍스트 메뉴 (Grid 전용)
//    · Data Binding 팝업 (JSON 소스 ↔ 그리드 열 매핑 → rows prop 생성)
//    · Grid Properties 팝업 (열/헤더/타입/너비/정렬/행선택)
//    · 병합설정 팝업 (헤더 직사각형 병합 + 본문 열 병합)
//    · 컬럼 숨기기 팝업 (hiddenColumns)
// ---------------------------------------------------------------------------
  // ---------- 데이터 바인딩: 우클릭 컨텍스트 메뉴 + 팝업 ----------
  function removeCtxMenu() {
    const m = document.getElementById("rve-ctxmenu");
    if (m) m.remove();
    document.removeEventListener("mousedown", onCtxDocDown);
  }
  function onCtxDocDown(e) {
    const m = document.getElementById("rve-ctxmenu");
    if (m && !m.contains(e.target)) removeCtxMenu();
  }
  function showCtxMenu(x, y, node) {
    removeCtxMenu();
    const menu = document.createElement("div");
    menu.id = "rve-ctxmenu";
    menu.className = "rve-ctxmenu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    const mkItem = (label, onClick) => {
      const it = document.createElement("div");
      it.className = "rve-ctx-item";
      it.textContent = label;
      it.addEventListener("click", () => {
        removeCtxMenu();
        onClick();
      });
      menu.appendChild(it);
    };
    mkItem("Data Binding", () => {
      dbGridNode = node;
      dbPendingOpen = true;
      vscode.postMessage({ type: "scanJson" }); // 확장이 현재 파일 JSON 스캔 → jsonSources
    });
    mkItem("Properties", () => openGridProps(node));
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener("mousedown", onCtxDocDown), 0);
  }
  if ($preview) {
    // Grid를 우클릭했을 때만 컨텍스트 메뉴 표시
    $preview.addEventListener("contextmenu", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-rve-loc]") : null;
      const node = el ? nodeAt(findPathById(tree, el.getAttribute("data-rve-loc"), [])) : null;
      if (node && node.name === "Grid") {
        e.preventDefault();
        showCtxMenu(e.clientX, e.clientY, node);
      }
    });
  }

  const TYPE_OPTS = ["text", "number", "checkbox", "radio", "select", "button"];

  function closeDataBinding() {
    const ov = document.getElementById("rve-db-overlay");
    if (ov) ov.remove();
  }

  // 소스 선택(REST면 GET 트리거)
  function selectDbSource(s) {
    dbSelected = s;
    if (s && s.url && (!s.keys || !s.keys.length) && !s.__fetching) {
      s.__fetching = true;
      s.__error = null;
      vscode.postMessage({ type: "fetchJson", name: s.name, url: s.url });
    }
  }
  // 기존 rows 바인딩(`src.map((r)=>({col: r["field"]}))`) 읽어 소스명 + 열→필드 복원
  function readRowsBinding(node) {
    const out = { source: null, fieldByCol: {} };
    const rp = node && (node.props || []).find((x) => x.name === "rows");
    const raw = rp && rp.value ? rp.value.text || rp.value.raw || "" : "";
    if (!raw) return out;
    const sm = raw.match(/([A-Za-z_$][\w$]*)\s*\.\s*map/);
    if (sm) out.source = sm[1];
    const re = /["']?([\w$]+)["']?\s*:\s*r(?:ow)?\s*\[\s*["']([^"']+)["']\s*\]/g;
    let m;
    while ((m = re.exec(raw))) out.fieldByCol[m[1]] = m[2];
    return out;
  }
  function openDataBindingPopup() {
    dbSelected = null;
    const gcols = dbGridNode ? gridColumnsOf(dbGridNode).cols : [];
    const bound = readRowsBinding(dbGridNode); // 기존 바인딩 복원 → 초기화 방지
    dbWantSource = bound.source;
    dbMapping = gcols.map((c) => ({
      colKey: c.key,
      colTitle: c.title || c.key,
      width: c.width,
      field: bound.fieldByCol[c.key] || "",
      type: c.type || "text",
    }));
    renderDataBinding();
  }

  function renderDataBinding() {
    closeDataBinding();
    // 기존 바인딩 소스 자동 선택 (스캔 결과가 온 뒤)
    if (!dbSelected && dbWantSource && jsonSources.length) {
      const found = jsonSources.find((s) => s.name === dbWantSource);
      if (found) { dbWantSource = null; selectDbSource(found); }
    }
    const overlay = document.createElement("div");
    overlay.id = "rve-db-overlay";
    overlay.className = "rve-db-overlay";
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeDataBinding();
    });

    const box = document.createElement("div");
    box.className = "rve-db-box";

    // 헤더
    const head = document.createElement("div");
    head.className = "rve-db-head";
    head.innerHTML = "<span>🗔 Data Binding</span>";
    const x = document.createElement("button");
    x.className = "rve-db-x";
    x.textContent = "✕";
    x.addEventListener("click", closeDataBinding);
    head.appendChild(x);
    box.appendChild(head);

    const body = document.createElement("div");
    body.className = "rve-db-body";

    // ── 좌: All Json ──
    const left = document.createElement("div");
    left.className = "rve-db-col";
    left.appendChild(dbPanelTitle("All Json"));
    const search = document.createElement("input");
    search.className = "rve-db-search";
    search.placeholder = "🔍 Search Json";
    const listWrap = document.createElement("div");
    listWrap.className = "rve-db-list";
    const renderSourceList = () => {
      listWrap.innerHTML = "";
      const q = search.value.trim().toLowerCase();
      jsonSources
        .filter((s) => !q || s.name.toLowerCase().includes(q))
        .forEach((s) => {
          const row = document.createElement("div");
          row.className = "rve-db-item" + (dbSelected && dbSelected.name === s.name ? " on" : "");
          const meta = s.url
            ? s.kind + (s.keys && s.keys.length ? " · " + s.count + "행" : " · " + s.url)
            : s.kind + " · " + s.count + "행";
          row.innerHTML =
            '<span class="rve-db-jname">' + s.name + "</span>" +
            '<span class="rve-db-jmeta">' + meta + "</span>";
          row.addEventListener("click", () => { selectDbSource(s); renderDataBinding(); });
          listWrap.appendChild(row);
        });
      if (!jsonSources.length) {
        listWrap.innerHTML = '<div class="rve-db-empty">이 파일에서 JSON 변수를 찾지 못했습니다.</div>';
      }
    };
    search.addEventListener("input", renderSourceList);
    left.appendChild(search);
    left.appendChild(listWrap);
    renderSourceList();
    body.appendChild(left);

    // ── 중: 선택 JSON + key(Block) ──
    const mid = document.createElement("div");
    mid.className = "rve-db-col";
    mid.appendChild(dbPanelTitle(dbSelected ? "Json: " + dbSelected.name : "Json (좌측에서 선택)"));
    const keySearch = document.createElement("input");
    keySearch.className = "rve-db-search";
    keySearch.placeholder = "🔍 Search key";
    const keyList = document.createElement("div");
    keyList.className = "rve-db-list";
    const mappedFields = () => new Set(dbMapping.map((m) => m.field).filter(Boolean));
    const renderKeys = () => {
      keyList.innerHTML = "";
      if (!dbSelected) {
        keyList.innerHTML = '<div class="rve-db-empty">JSON을 선택하면 key가 보입니다.</div>';
        return;
      }
      if (dbSelected.__error) {
        keyList.innerHTML = '<div class="rve-db-empty">API 호출 실패: ' + dbSelected.__error + "</div>";
        return;
      }
      if (dbSelected.__fetching && (!dbSelected.keys || !dbSelected.keys.length)) {
        keyList.innerHTML = '<div class="rve-db-empty">API 호출 중… (' + (dbSelected.url || "") + ")</div>";
        return;
      }
      const q = keySearch.value.trim().toLowerCase();
      const used = mappedFields();
      dbSelected.keys
        .filter((k) => !q || k.toLowerCase().includes(q))
        .forEach((k) => {
          const row = document.createElement("div");
          row.className = "rve-db-key" + (used.has(k) ? " used" : "");
          const nm = document.createElement("span");
          nm.textContent = k;
          const add = document.createElement("button");
          add.className = "rve-db-add";
          add.textContent = "›";
          add.title = "비어있는 다음 그리드 열에 이 필드 매핑";
          add.disabled = used.has(k) || !dbMapping.some((m) => !m.field);
          add.addEventListener("click", () => {
            if (used.has(k)) return;
            const target = dbMapping.find((m) => !m.field);
            if (target) {
              target.field = k;
              renderDataBinding();
            }
          });
          row.appendChild(nm);
          row.appendChild(add);
          keyList.appendChild(row);
        });
    };
    keySearch.addEventListener("input", renderKeys);
    mid.appendChild(keySearch);
    mid.appendChild(keyList);
    // Auto Mapping / User Field
    const midBtns = document.createElement("div");
    midBtns.className = "rve-db-midbtns";
    const auto = document.createElement("button");
    auto.className = "rve-db-btn";
    auto.textContent = "Auto Mapping";
    auto.disabled = !dbSelected;
    auto.title = "이름이 같은 JSON 필드를 각 그리드 열에 자동 매핑";
    auto.addEventListener("click", () => {
      if (!dbSelected) return;
      const keys = dbSelected.keys || [];
      const lower = keys.map((k) => k.toLowerCase());
      dbMapping.forEach((m) => {
        if (m.field) return;
        // colKey → colTitle 순으로 이름 일치(대소문자 무시) 탐색
        let hit = keys.find((k) => k === m.colKey) || keys.find((k) => k === m.colTitle);
        if (!hit) {
          const li = lower.indexOf(String(m.colKey || "").toLowerCase());
          if (li >= 0) hit = keys[li];
        }
        if (hit && !mappedFields().has(hit)) m.field = hit;
      });
      renderDataBinding();
    });
    midBtns.appendChild(auto);
    mid.appendChild(midBtns);
    renderKeys();
    body.appendChild(mid);

    // ── 우: 매핑표 (그리드 열 → JSON 필드) ──
    const right = document.createElement("div");
    right.className = "rve-db-col rve-db-mapcol";
    right.appendChild(dbPanelTitle("열 매핑 (그리드 열 → JSON 필드 / 자료형)"));
    const table = document.createElement("div");
    table.className = "rve-db-table rve-db-maptable";
    const thead = document.createElement("div");
    thead.className = "rve-db-tr rve-db-thead rve-db-maptr";
    ["그리드 열", "JSON 필드", "자료형", ""].forEach((h) => {
      const c = document.createElement("div");
      c.className = "rve-db-th";
      c.textContent = h;
      thead.appendChild(c);
    });
    table.appendChild(thead);
    const keys = dbSelected && dbSelected.keys ? dbSelected.keys : [];
    dbMapping.forEach((row) => {
      const tr = document.createElement("div");
      tr.className = "rve-db-tr rve-db-maptr";
      // 그리드 열 (헤더명 + key)
      const col = document.createElement("div");
      col.className = "rve-db-td rve-db-gcol";
      col.innerHTML =
        '<span class="rve-db-gtitle">' + (row.colTitle || row.colKey) + "</span>" +
        '<span class="rve-db-gkey">' + row.colKey + "</span>";
      // JSON 필드 선택
      const field = document.createElement("select");
      field.className = "rve-db-td rve-db-typesel rve-db-fieldsel" + (row.field ? "" : " empty");
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "(없음)";
      field.appendChild(none);
      keys.forEach((k) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = k;
        if (row.field === k) o.selected = true;
        field.appendChild(o);
      });
      // 현재 선택값이 목록에 없으면(소스 변경 등) 유지 표시
      if (row.field && keys.indexOf(row.field) < 0) {
        const o = document.createElement("option");
        o.value = row.field;
        o.textContent = row.field + " (미검출)";
        o.selected = true;
        field.appendChild(o);
      }
      field.addEventListener("change", () => {
        row.field = field.value;
        renderDataBinding();
      });
      const type = document.createElement("select");
      type.className = "rve-db-td rve-db-typesel";
      TYPE_OPTS.forEach((t) => {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        if (row.type === t) o.selected = true;
        type.appendChild(o);
      });
      type.addEventListener("change", () => (row.type = type.value));
      const rm = document.createElement("button");
      rm.className = "rve-db-td rve-db-rm";
      rm.textContent = "⨯";
      rm.title = "이 열의 매핑 지우기";
      rm.disabled = !row.field;
      rm.addEventListener("click", () => {
        row.field = "";
        renderDataBinding();
      });
      tr.appendChild(col);
      tr.appendChild(field);
      tr.appendChild(type);
      tr.appendChild(rm);
      table.appendChild(tr);
    });
    if (!dbMapping.length) {
      const e = document.createElement("div");
      e.className = "rve-db-empty";
      e.textContent = "이 그리드에 열이 없습니다. Properties에서 열을 추가한 뒤 다시 여세요.";
      table.appendChild(e);
    }
    right.appendChild(table);
    body.appendChild(right);

    box.appendChild(body);

    // 푸터
    const foot = document.createElement("div");
    foot.className = "rve-db-foot";
    const apply = document.createElement("button");
    apply.className = "rve-db-btn rve-db-apply";
    apply.textContent = "적용";
    apply.addEventListener("click", () => {
      if (!dbSelected) { rveLog("먼저 좌측에서 JSON 소스를 선택하세요."); return; }
      const mapped = dbMapping.filter((m) => m.field);
      if (!mapped.length) { rveLog("매핑된 열이 없습니다. JSON 필드를 골라주세요."); return; }
      // rows = <소스>.map((r) => ({ 매핑열: r["필드"], 미매핑열: "" , ... }))
      //  → 매핑 안 된 기본 열도 사라지지 않고 '빈 값'으로 유지
      const objBody = dbMapping
        .map((m) => JSON.stringify(m.colKey) + ": " + (m.field ? "r[" + JSON.stringify(m.field) + "]" : '""'))
        .join(", ");
      const rowsExpr = dbSelected.name + ".map((r) => ({ " + objBody + " }))";
      sendSetProps(dbGridNode, [{ name: "rows", expr: rowsExpr }]);
      rveLog("▶ Data Binding 적용: rows=" + rowsExpr);
      closeDataBinding();
    });
    const close = document.createElement("button");
    close.className = "rve-db-btn";
    close.textContent = "닫기";
    close.addEventListener("click", closeDataBinding);
    foot.appendChild(apply);
    foot.appendChild(close);
    box.appendChild(foot);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function dbPanelTitle(text) {
    const t = document.createElement("div");
    t.className = "rve-db-ptitle";
    t.textContent = text;
    return t;
  }

  // ---------- Grid Properties 팝업 ----------
  // ── 2D 헤더 모델 (명시적 headerCells: 가로+세로 직사각형 병합) ──
  function _lt(v) { return v && v.kind === "leaf" ? v.text : ""; }
  function _ev(o, key) { const e = ((o && o.entries) || []).find((x) => x.key === key); return e ? e.value : undefined; }
  // columns(그룹 중첩 가능) → { leaves, cells, rows } (buildHeaderModel 재현)
  function parseHeaderFromColumns(items) {
    const leaves = [];
    const cells = [];
    const childrenOf = (o) => { const v = _ev(o, "children"); return v && v.kind === "array" ? v.items : null; };
    const titleOf = (o) => _lt(_ev(o, "title")) || _lt(_ev(o, "header"));
    const depthOf = (o) => { const ch = childrenOf(o); return ch && ch.length ? 1 + Math.max.apply(null, ch.map(depthOf)) : 1; };
    const D = items.length ? Math.max.apply(null, items.map(depthOf)) : 1;
    let col = 0;
    const walk = (o, rowStart) => {
      if (!o || o.kind !== "object") { col++; return { c0: col - 1, c1: col - 1 }; }
      const ch = childrenOf(o);
      if (!ch) {
        const c = col;
        cells.push({ r: rowStart, c: c, rs: D - rowStart, cs: 1, text: titleOf(o) });
        leaves.push({ key: _lt(_ev(o, "key")), title: titleOf(o), type: _lt(_ev(o, "type")), width: _lt(_ev(o, "width")), merge: false });
        col++;
        return { c0: c, c1: c };
      }
      const c0 = col; let c1 = c0;
      ch.forEach((k) => { const rr = walk(k, rowStart + 1); c1 = rr.c1; });
      cells.push({ r: rowStart, c: c0, rs: 1, cs: c1 - c0 + 1, text: titleOf(o) });
      return { c0: c0, c1: c1 };
    };
    items.forEach((o) => walk(o, 0));
    return { leaves: leaves, cells: cells, rows: D };
  }
  function gridColumnsOf(node) {
    const p = (node.props || []).find((x) => x.name === "columns");
    if (!p || !p.value || p.value.kind !== "array") return { cols: [], headRows: 1, headCells: [] };
    const parsed = parseHeaderFromColumns(p.value.items || []);
    const cols = parsed.leaves;
    let headRows = parsed.rows;
    let headCells = parsed.cells;
    const hc = (node.props || []).find((x) => x.name === "headerCells");
    if (hc && hc.value && hc.value.kind === "array") {
      headCells = (hc.value.items || []).map((o) => ({
        r: parseInt(_lt(_ev(o, "r")) || "0", 10),
        c: parseInt(_lt(_ev(o, "c")) || "0", 10),
        rs: parseInt(_lt(_ev(o, "rowSpan")) || "1", 10),
        cs: parseInt(_lt(_ev(o, "colSpan")) || "1", 10),
        text: _lt(_ev(o, "title")),
      }));
      headRows = headCells.reduce((m, c) => Math.max(m, c.r + c.rs), 1);
    }
    // bodyMerge → merge 플래그
    const keyIndex = {};
    cols.forEach((c, i) => { keyIndex[c.key] = i; });
    const bm = (node.props || []).find((x) => x.name === "bodyMerge");
    if (bm && bm.value && bm.value.kind === "array") {
      (bm.value.items || []).forEach((grp) => {
        if (!grp || grp.kind !== "array") return;
        const keys = (grp.items || []).map((it) => _lt(it)).filter(Boolean);
        keys.forEach((k, i2) => { if (i2 > 0 && keyIndex[k] != null) cols[keyIndex[k]].merge = true; });
      });
    }
    return { cols: cols, headRows: headRows, headCells: headCells };
  }
  // 직렬화
  function gridColumnsExpr(cols) {
    return "[" + cols.map((c) => {
      const p = ["key: " + JSON.stringify(c.key), "title: " + JSON.stringify(c.title || c.key)];
      if (c.type && c.type !== "text") p.push("type: " + JSON.stringify(c.type));
      if (c.width && /^\d+$/.test(String(c.width).trim())) p.push("width: " + parseInt(c.width, 10));
      return "{ " + p.join(", ") + " }";
    }).join(", ") + "]";
  }
  function gridHeaderCellsExpr(cells, rows, cols) {
    const anyMerge = cells.some((c) => (c.rs || 1) > 1 || (c.cs || 1) > 1);
    if (rows <= 1 && !anyMerge) return ""; // 기본 헤더 → columns.title로 충분
    const parts = cells.map((cell) => {
      const rs = cell.rs || 1, cs = cell.cs || 1;
      const p = ["r: " + cell.r, "c: " + cell.c];
      if (rs > 1) p.push("rowSpan: " + rs);
      if (cs > 1) p.push("colSpan: " + cs);
      p.push("title: " + JSON.stringify(cell.text || ""));
      // 단일 열(cs=1) 헤더 셀이면 그 컬럼과 연결 → 클릭 정렬 가능(맨 아래가 아니어도)
      if (cs === 1 && cols[cell.c]) p.push("key: " + JSON.stringify(cols[cell.c].key));
      return "{ " + p.join(", ") + " }";
    });
    return "[" + parts.join(", ") + "]";
  }
  function gridBodyMergeExpr(cols) {
    const groups = [];
    let i = 0;
    while (i < cols.length) {
      const run = [cols[i].key];
      let j = i + 1;
      while (j < cols.length && cols[j].merge) { run.push(cols[j].key); j++; }
      if (run.length > 1) groups.push("[" + run.map((k) => JSON.stringify(k)).join(", ") + "]");
      i = j;
    }
    return groups.length ? "[" + groups.join(", ") + "]" : "";
  }
  // 헤더 병합 연산 (gpHeadCells 타일 조작)
  function headCellIndexAt(r, c) {
    return gpHeadCells.findIndex((cell) => r >= cell.r && r < cell.r + (cell.rs || 1) && c >= cell.c && c < cell.c + (cell.cs || 1));
  }
  function doHeadMerge(r0, c0, r1, c1) {
    let text = "";
    const kept = [];
    gpHeadCells.forEach((cell) => {
      const rs = cell.rs || 1, cs = cell.cs || 1;
      const inside = cell.r >= r0 && cell.r + rs - 1 <= r1 && cell.c >= c0 && cell.c + cs - 1 <= c1;
      if (inside) { if (!text && cell.text) text = cell.text; }
      else kept.push(cell);
    });
    kept.push({ r: r0, c: c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1, text: text });
    kept.sort((a, b) => a.r - b.r || a.c - b.c);
    gpHeadCells = kept;
  }
  function doHeadSplit(idx) {
    const cell = gpHeadCells[idx];
    const out = gpHeadCells.filter((_, i) => i !== idx);
    for (let r = cell.r; r < cell.r + (cell.rs || 1); r++)
      for (let c = cell.c; c < cell.c + (cell.cs || 1); c++)
        out.push({ r: r, c: c, rs: 1, cs: 1, text: r === cell.r && c === cell.c ? cell.text : "" });
    out.sort((a, b) => a.r - b.r || a.c - b.c);
    gpHeadCells = out;
  }
  function addHeaderRowTop() {
    gpHeadCells.forEach((cell) => { cell.r += 1; });
    for (let c = 0; c < gpCols.length; c++) gpHeadCells.push({ r: 0, c: c, rs: 1, cs: 1, text: "" });
    gpHeadRows += 1;
    gpHeadCells.sort((a, b) => a.r - b.r || a.c - b.c);
  }
  function delHeaderRowTop() {
    if (gpHeadRows <= 1) return;
    // 맨 위(r=0) 행 제거: r=0 시작 셀 삭제, 나머지 r-=1, r=0 걸친 셀은 rs-=1
    const kept = [];
    gpHeadCells.forEach((cell) => {
      if (cell.r === 0 && (cell.rs || 1) === 1) return; // 삭제
      const nc = Object.assign({}, cell);
      if (nc.r === 0) { nc.rs = (nc.rs || 1) - 1; nc.r = 0; }
      else nc.r -= 1;
      kept.push(nc);
    });
    gpHeadRows -= 1;
    gpHeadCells = kept;
    gpHeadCells.sort((a, b) => a.r - b.r || a.c - b.c);
  }
  // 컬럼 추가/삭제 시 헤더 타일 동기화
  // 추가: 새 컬럼 헤더는 각 헤더 행마다 1×1 개별 칸(병합 해제 상태). 맨 아래만 제목, 위쪽은 빈 칸
  function headSyncAddColumn(cIndex, title) {
    for (let r = 0; r < gpHeadRows; r++) {
      gpHeadCells.push({ r: r, c: cIndex, rs: 1, cs: 1, text: r === gpHeadRows - 1 ? title : "" });
    }
    gpHeadCells.sort((a, b) => a.r - b.r || a.c - b.c);
  }
  function headSyncRemoveColumn(cIndex) {
    // cIndex 열에 걸친 셀 제거/축소, 그 뒤 열 c-=1
    const kept = [];
    gpHeadCells.forEach((cell) => {
      const cs = cell.cs || 1;
      const covers = cIndex >= cell.c && cIndex < cell.c + cs;
      if (covers) {
        if (cs === 1) return; // 제거
        cell.cs = cs - 1; // 축소
      }
      if (cell.c > cIndex) cell.c -= 1;
      kept.push(cell);
    });
    gpHeadCells = kept;
    gpHeadCells.sort((a, b) => a.r - b.r || a.c - b.c);
  }
  function sendSetProps(node, props) {
    const r = nodeRange(node);
    vscode.postMessage({ type: "setProps", targetStart: r.start, targetEnd: r.end, props: props });
  }

  function openGridProps(node) {
    gpNode = node;
    const parsed = gridColumnsOf(node);
    gpCols = parsed.cols;
    gpHeadRows = parsed.headRows;
    gpHeadCells = parsed.headCells;
    gpSel = getPropValue(node, "selection") || "none";
    gpRowH = getPropValue(node, "rowHeight") || "";
    gpSortable = getPropValue(node, "sortable") !== "false"; // 기본 true
    const hp = (node.props || []).find((x) => x.name === "hiddenColumns");
    gpHidden = hp && hp.value && hp.value.kind === "array"
      ? (hp.value.items || []).map((it) => (it && it.kind === "leaf" ? it.text : "")).filter(Boolean)
      : [];
    renderGridProps();
  }
  function closeGridProps() {
    const ov = document.getElementById("rve-gp-overlay");
    if (ov) ov.remove();
  }

  // ── 병합설정 팝업 ──────────────────────────────────────────
  // 본문(bodyMerge) 유닛: merge 플래그 런
  function gridMergeUnits() {
    const units = [];
    let i = 0;
    while (i < gpCols.length) {
      const start = i;
      const keys = [gpCols[i].key];
      let j = i + 1;
      while (j < gpCols.length && gpCols[j].merge) { keys.push(gpCols[j].key); j++; }
      units.push({ start: start, end: j - 1, title: gpCols[start].title || gpCols[start].key, keys: keys });
      i = j;
    }
    return units;
  }
  // rows(prop)에서 표시용 샘플 행 몇 개 추출
  function gridRowsSample(node, max) {
    const out = [];
    const p = (node.props || []).find((x) => x.name === "rows");
    if (!p || !p.value || p.value.kind !== "array") return out;
    (p.value.items || []).slice(0, max).forEach((obj) => {
      if (obj && obj.kind === "object") {
        const r = {};
        (obj.entries || []).forEach((e) => {
          if (e.value && e.value.kind === "leaf") r[e.key] = e.value.text;
        });
        out.push(r);
      }
    });
    return out;
  }
  // 편집 가능한 헤더 구조 미리보기 (2D: 행×열, 직사각형 병합 반영, 셀 텍스트 입력)
  function buildHeaderPreview() {
    const wrap = document.createElement("div");
    wrap.className = "rve-gp-pv";
    if (!gpCols.length) {
      wrap.innerHTML = '<div class="rve-gp-pvempty">열이 없습니다.</div>';
      return wrap;
    }
    const N = gpCols.length, H = gpHeadRows;
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "repeat(" + N + ", minmax(40px, 1fr))";
    wrap.style.gridTemplateRows = "repeat(" + H + ", 30px)";
    gpHeadCells.forEach((cell) => {
      const bottom = cell.r + (cell.rs || 1) === H;
      const el = document.createElement("input");
      el.className = "rve-gp-pvcell rve-gp-pvedit" + (bottom ? " rve-gp-pvbase" : "");
      el.style.gridColumn = (cell.c + 1) + " / span " + (cell.cs || 1);
      el.style.gridRow = (cell.r + 1) + " / span " + (cell.rs || 1);
      el.value = cell.text || "";
      el.placeholder = "(헤더명)";
      el.addEventListener("input", () => {
        cell.text = el.value;
        // 맨 아래·단일열 셀이면 컬럼 title 동기화
        if (bottom && (cell.cs || 1) === 1 && gpCols[cell.c]) gpCols[cell.c].title = el.value;
      });
      wrap.appendChild(el);
    });
    return wrap;
  }
  function openMergeSetup() {
    msArea = null; msRect = null; msCols = null; msAnchorCell = null;
    renderMergeSetup();
  }
  function closeMergeSetup() {
    const ov = document.getElementById("rve-ms-overlay");
    if (ov) ov.remove();
  }
  // 직사각형을 걸치는 셀들을 모두 포함하도록 확장(유효한 병합 범위)
  function expandRect(r0, c0, r1, c1) {
    let changed = true;
    while (changed) {
      changed = false;
      gpHeadCells.forEach((cell) => {
        const cr1 = cell.r + (cell.rs || 1) - 1, cc1 = cell.c + (cell.cs || 1) - 1;
        const hit = cell.r <= r1 && cr1 >= r0 && cell.c <= c1 && cc1 >= c0;
        if (hit) {
          if (cell.r < r0) { r0 = cell.r; changed = true; }
          if (cr1 > r1) { r1 = cr1; changed = true; }
          if (cell.c < c0) { c0 = cell.c; changed = true; }
          if (cc1 > c1) { c1 = cc1; changed = true; }
        }
      });
    }
    return { r0: r0, c0: c0, r1: r1, c1: c1 };
  }
  function renderMergeSetup() {
    closeMergeSetup();
    const N = gpCols.length, H = gpHeadRows;
    const sample = gridRowsSample(gpNode, 5);
    const overlay = document.createElement("div");
    overlay.id = "rve-ms-overlay";
    overlay.className = "rve-db-overlay";
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeMergeSetup(); });
    const box = document.createElement("div");
    box.className = "rve-db-box rve-ms-box";
    const head = document.createElement("div");
    head.className = "rve-db-head";
    head.innerHTML = "<span>⛶ 병합 설정</span>";
    const x = document.createElement("button");
    x.className = "rve-db-x";
    x.textContent = "✕";
    x.addEventListener("click", closeMergeSetup);
    head.appendChild(x);
    box.appendChild(head);

    const body = document.createElement("div");
    body.className = "rve-db-body rve-ms-body";
    const hint = document.createElement("p");
    hint.className = "rve-hint rve-mini";
    hint.style.cssText = "color:#b8bcc2;margin:0 0 8px";
    hint.textContent =
      "실제 그리드와 같은 모양입니다. 헤더 칸을 클릭·shift+클릭으로 직사각형(가로+세로) 범위를 골라 [병합]. 데이터 칸은 본문 열끼리 병합(헤더와 독립). 병합 칸 선택 후 [해제].";
    body.appendChild(hint);

    // 실제 그리드와 같은 컬럼 폭 (WYSIWYG)
    const colW = (c) => (c.width && /^\d+$/.test(String(c.width).trim()) ? parseInt(c.width, 10) : 110);
    const tmpl = gpCols.map((c) => colW(c) + "px").join(" ");
    const totalW = gpCols.reduce((s, c) => s + colW(c), 0);
    const HROW = 34, DROW = 34;
    const headCellEls = []; // {cell, el}
    const dataCellEls = []; // {u, el}
    let updateBtns = () => {};
    const cellInRect = (cell, R) =>
      cell.r >= R.r0 && cell.r + (cell.rs || 1) - 1 <= R.r1 && cell.c >= R.c0 && cell.c + (cell.cs || 1) - 1 <= R.c1;
    const refreshSel = () => {
      headCellEls.forEach((x) => x.el.classList.toggle("sel", msArea === "HEAD" && msRect && cellInRect(x.cell, msRect)));
      dataCellEls.forEach((x) => x.el.classList.toggle("sel", msArea === "DATA" && msCols && x.u.start >= msCols.a && x.u.end <= msCols.b));
      updateBtns();
    };
    const selectHead = (cell, shift) => {
      const r0 = cell.r, c0 = cell.c, r1 = cell.r + (cell.rs || 1) - 1, c1 = cell.c + (cell.cs || 1) - 1;
      if (shift && msArea === "HEAD" && msAnchorCell) {
        const a = msAnchorCell;
        msRect = expandRect(Math.min(a.r0, r0), Math.min(a.c0, c0), Math.max(a.r1, r1), Math.max(a.c1, c1));
      } else {
        msArea = "HEAD"; msAnchorCell = { r0: r0, c0: c0, r1: r1, c1: c1 }; msRect = { r0: r0, c0: c0, r1: r1, c1: c1 };
      }
      refreshSel();
    };
    const selectData = (u, shift) => {
      if (shift && msArea === "DATA" && msAnchorCell) {
        msCols = { a: Math.min(msAnchorCell.a, u.start), b: Math.max(msAnchorCell.b, u.end) };
      } else {
        msArea = "DATA"; msAnchorCell = { a: u.start, b: u.end }; msCols = { a: u.start, b: u.end };
      }
      refreshSel();
    };

    // 실제 그리드처럼: 헤더 + 데이터를 한 스크롤 컨테이너에 (가로 스크롤)
    const scroll = document.createElement("div");
    scroll.className = "rve-ms-scroll";
    const gridWrap = document.createElement("div");
    gridWrap.className = "rve-ms-wysiwyg";
    gridWrap.style.width = totalW + "px";

    // 헤더 그리드 (2D)
    const hgrid = document.createElement("div");
    hgrid.className = "rve-ms-hgrid";
    hgrid.style.display = "grid";
    hgrid.style.gridTemplateColumns = tmpl;
    hgrid.style.gridTemplateRows = "repeat(" + H + ", " + HROW + "px)";
    gpHeadCells.forEach((cell) => {
      const el = document.createElement("div");
      el.className = "rve-ms-cell rve-ms-hcell rve-ms-selcell";
      el.style.gridColumn = (cell.c + 1) + " / span " + (cell.cs || 1);
      el.style.gridRow = (cell.r + 1) + " / span " + (cell.rs || 1);
      el.textContent = cell.text || "";
      el.addEventListener("mousedown", (e) => { if (e.shiftKey) { e.preventDefault(); selectHead(cell, true); } });
      el.addEventListener("click", (e) => { if (!e.shiftKey) selectHead(cell, false); });
      headCellEls.push({ cell: cell, el: el });
      hgrid.appendChild(el);
    });
    gridWrap.appendChild(hgrid);

    // 데이터 그리드 (본문 병합) — 실제 데이터처럼
    const dgrid = document.createElement("div");
    dgrid.className = "rve-ms-dgrid";
    if (!sample.length) {
      const note = document.createElement("div");
      note.className = "rve-ms-cell rve-ms-datacell";
      note.style.height = DROW + "px";
      note.textContent = "(데이터 없음)";
      dgrid.appendChild(note);
    }
    sample.forEach((row, ri) => {
      const drow = document.createElement("div");
      drow.className = "rve-ms-drow" + (ri % 2 ? " alt" : "");
      drow.style.display = "grid";
      drow.style.gridTemplateColumns = tmpl;
      drow.style.height = DROW + "px";
      gridMergeUnits().forEach((u) => {
        const val = u.keys.map((k) => (row[k] == null ? "" : row[k])).filter((s) => s !== "").join(" ");
        const el = document.createElement("div");
        el.className = "rve-ms-cell rve-ms-datacell rve-ms-selcell";
        el.style.gridColumn = (u.start + 1) + " / span " + u.keys.length;
        el.textContent = val;
        el.addEventListener("mousedown", (e) => { if (e.shiftKey) { e.preventDefault(); selectData(u, true); } });
        el.addEventListener("click", (e) => { if (!e.shiftKey) selectData(u, false); });
        dataCellEls.push({ u: u, el: el });
        drow.appendChild(el);
      });
      dgrid.appendChild(drow);
    });
    gridWrap.appendChild(dgrid);
    scroll.appendChild(gridWrap);
    body.appendChild(scroll);
    box.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "rve-db-foot";
    const selInfo = document.createElement("span");
    selInfo.className = "rve-ms-selinfo";
    const doMerge = document.createElement("button");
    doMerge.className = "rve-db-btn rve-db-apply";
    doMerge.textContent = "병합";
    doMerge.addEventListener("click", () => {
      if (msArea === "HEAD" && msRect && (msRect.r1 > msRect.r0 || msRect.c1 > msRect.c0)) {
        doHeadMerge(msRect.r0, msRect.c0, msRect.r1, msRect.c1);
        msArea = null; msRect = null; msAnchorCell = null;
      } else if (msArea === "DATA" && msCols && msCols.b > msCols.a) {
        gpCols[msCols.a].merge = false;
        for (let k = msCols.a + 1; k <= msCols.b; k++) gpCols[k].merge = true;
      }
      renderMergeSetup();
    });
    const undoMerge = document.createElement("button");
    undoMerge.className = "rve-db-btn";
    undoMerge.textContent = "해제";
    undoMerge.addEventListener("click", () => {
      if (msArea === "HEAD" && msRect) {
        // 범위 안 병합 셀들을 분해
        let idx;
        while ((idx = gpHeadCells.findIndex((cell) => ((cell.rs || 1) > 1 || (cell.cs || 1) > 1) && cellInRect(cell, msRect))) >= 0) {
          doHeadSplit(idx);
        }
        msArea = null; msRect = null; msAnchorCell = null;
      } else if (msArea === "DATA" && msCols) {
        for (let k = msCols.a; k <= msCols.b; k++) gpCols[k].merge = false;
      }
      renderMergeSetup();
    });
    const done = document.createElement("button");
    done.className = "rve-db-btn";
    done.textContent = "완료";
    done.addEventListener("click", closeMergeSetup);
    updateBtns = () => {
      if (msArea === "HEAD" && msRect) {
        const big = msRect.r1 > msRect.r0 || msRect.c1 > msRect.c0;
        doMerge.disabled = !big;
        undoMerge.disabled = !gpHeadCells.some((cell) => ((cell.rs || 1) > 1 || (cell.cs || 1) > 1) && cellInRect(cell, msRect));
        selInfo.textContent = "헤더 " + (msRect.r1 - msRect.r0 + 1) + "×" + (msRect.c1 - msRect.c0 + 1);
      } else if (msArea === "DATA" && msCols) {
        const big = msCols.b > msCols.a;
        doMerge.disabled = !big;
        undoMerge.disabled = !gpCols.slice(msCols.a, msCols.b + 1).some((c) => c.merge) && !big;
        selInfo.textContent = "본문 " + (msCols.b - msCols.a + 1) + "칸";
      } else {
        doMerge.disabled = true; undoMerge.disabled = true; selInfo.textContent = "선택 없음";
      }
    };
    updateBtns();
    foot.appendChild(selInfo);
    foot.appendChild(doMerge);
    foot.appendChild(undoMerge);
    foot.appendChild(done);
    box.appendChild(foot);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ── 컬럼 숨기기 팝업 ──────────────────────────────────────────
  // gpHidden(숨긴 key) 적용: 숨긴 열 제거 + 헤더 셀 colSpan 축소 → 미리보기용
  function hiddenApplied() {
    const hset = {};
    gpHidden.forEach((k) => (hset[k] = true));
    const visible = gpCols.map((c) => !hset[c.key]);
    const visCols = gpCols.filter((_, i) => visible[i]);
    const before = (oldC) => { let n = 0; for (let k = 0; k < oldC; k++) if (visible[k]) n++; return n; };
    const inRange = (c0, cs) => { let n = 0; for (let k = c0; k < c0 + cs; k++) if (visible[k]) n++; return n; };
    const cells = [];
    gpHeadCells.forEach((cell) => {
      const cs = cell.cs || 1;
      const nc = inRange(cell.c, cs);
      if (nc <= 0) return;
      cells.push({ r: cell.r, c: before(cell.c), rs: cell.rs || 1, cs: nc, text: cell.text });
    });
    return { cols: visCols, cells: cells };
  }
  function openHideColumns() { renderHideColumns(); }
  function closeHideColumns() { const ov = document.getElementById("rve-hc-overlay"); if (ov) ov.remove(); }
  function renderHideColumns() {
    closeHideColumns();
    const overlay = document.createElement("div");
    overlay.id = "rve-hc-overlay";
    overlay.className = "rve-db-overlay";
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeHideColumns(); });
    const box = document.createElement("div");
    box.className = "rve-db-box rve-ms-box";
    const head = document.createElement("div");
    head.className = "rve-db-head";
    head.innerHTML = "<span>◫ 컬럼 숨기기</span>";
    const x = document.createElement("button");
    x.className = "rve-db-x";
    x.textContent = "✕";
    x.addEventListener("click", closeHideColumns);
    head.appendChild(x);
    box.appendChild(head);

    const body = document.createElement("div");
    body.className = "rve-db-body rve-ms-body";
    const hint = document.createElement("p");
    hint.className = "rve-hint rve-mini";
    hint.style.cssText = "color:#b8bcc2;margin:0 0 10px";
    hint.textContent = "열 머리를 클릭해 숨김/보이기. 병합 헤더는 숨긴 열만큼 폭이 자동으로 줄어듭니다(비파괴적 — 다시 보이기 가능).";
    body.appendChild(hint);

    // 열 토글 (실제 폭)
    const colW = (c) => (c.width && /^\d+$/.test(String(c.width).trim()) ? parseInt(c.width, 10) : 110);
    const trow = document.createElement("div");
    trow.className = "rve-hc-toggles";
    gpCols.forEach((col) => {
      const hidden = gpHidden.indexOf(col.key) >= 0;
      const chip = document.createElement("button");
      chip.className = "rve-hc-chip" + (hidden ? " hidden" : "");
      chip.style.width = colW(col) + "px";
      chip.innerHTML = "<span class='rve-hc-t'>" + (col.title || col.key) + "</span><span class='rve-hc-k'>" + col.key + "</span>";
      chip.title = hidden ? "다시 보이기" : "숨기기";
      chip.addEventListener("click", () => {
        const i = gpHidden.indexOf(col.key);
        if (i >= 0) gpHidden.splice(i, 1); else gpHidden.push(col.key);
        renderHideColumns();
      });
      trow.appendChild(chip);
    });
    body.appendChild(trow);

    // 결과 미리보기 (숨김 적용된 헤더, colSpan 축소 반영)
    const plabel = document.createElement("div");
    plabel.className = "rve-ms-dlabel";
    plabel.textContent = "결과 미리보기";
    body.appendChild(plabel);
    const applied = hiddenApplied();
    const scroll = document.createElement("div");
    scroll.className = "rve-ms-scroll";
    if (!applied.cols.length) {
      const e = document.createElement("div");
      e.className = "rve-db-empty";
      e.textContent = "모든 열이 숨겨졌습니다.";
      scroll.appendChild(e);
    } else {
      const H = gpHeadRows;
      const tmpl = applied.cols.map((c) => colW(c) + "px").join(" ");
      const gw = document.createElement("div");
      gw.className = "rve-ms-wysiwyg";
      const hg = document.createElement("div");
      hg.className = "rve-ms-hgrid";
      hg.style.display = "grid";
      hg.style.gridTemplateColumns = tmpl;
      hg.style.gridTemplateRows = "repeat(" + H + ", 30px)";
      applied.cells.forEach((cell) => {
        const el = document.createElement("div");
        el.className = "rve-ms-cell rve-ms-hcell";
        el.style.gridColumn = (cell.c + 1) + " / span " + (cell.cs || 1);
        el.style.gridRow = (cell.r + 1) + " / span " + (cell.rs || 1);
        el.textContent = cell.text || "";
        hg.appendChild(el);
      });
      gw.appendChild(hg);
      scroll.appendChild(gw);
    }
    body.appendChild(scroll);
    box.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "rve-db-foot";
    const info = document.createElement("span");
    info.className = "rve-ms-selinfo";
    info.textContent = gpHidden.length ? "숨긴 열: " + gpHidden.join(", ") : "숨긴 열 없음";
    const done = document.createElement("button");
    done.className = "rve-db-btn rve-db-apply";
    done.textContent = "완료";
    done.addEventListener("click", () => { closeHideColumns(); });
    foot.appendChild(info);
    foot.appendChild(done);
    box.appendChild(foot);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function renderGridProps() {
    closeGridProps();
    const overlay = document.createElement("div");
    overlay.id = "rve-gp-overlay";
    overlay.className = "rve-db-overlay";
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeGridProps();
    });
    const box = document.createElement("div");
    box.className = "rve-db-box rve-gp-box";

    const head = document.createElement("div");
    head.className = "rve-db-head";
    head.innerHTML = "<span>⚙ Grid Properties</span>";
    const x = document.createElement("button");
    x.className = "rve-db-x";
    x.textContent = "✕";
    x.addEventListener("click", closeGridProps);
    head.appendChild(x);
    box.appendChild(head);

    const body = document.createElement("div");
    body.className = "rve-gp-body";

    // ── 섹션 1: 헤더 구조 (미리보기 + 헤더추가/병합설정) ──
    const sec1 = document.createElement("div");
    sec1.className = "rve-gp-section";
    const sec1h = document.createElement("div");
    sec1h.className = "rve-gp-sechead";
    const sec1t = document.createElement("span");
    sec1t.className = "rve-gp-sectitle";
    sec1t.textContent = "헤더 구조";
    const addRowBtn = document.createElement("button");
    addRowBtn.className = "rve-db-btn";
    addRowBtn.textContent = "＋ 헤더행";
    addRowBtn.title = "헤더 행을 위에 한 줄 추가";
    addRowBtn.addEventListener("click", () => { addHeaderRowTop(); renderGridProps(); });
    const delRowBtn = document.createElement("button");
    delRowBtn.className = "rve-db-btn";
    delRowBtn.textContent = "－ 헤더행";
    delRowBtn.title = "맨 위 헤더 행 삭제";
    delRowBtn.disabled = gpHeadRows <= 1;
    delRowBtn.addEventListener("click", () => { delHeaderRowTop(); renderGridProps(); });
    const mergeBtn = document.createElement("button");
    mergeBtn.className = "rve-db-btn rve-gp-mergebtn";
    mergeBtn.textContent = "⛶ 병합설정";
    mergeBtn.title = "실제 그리드 모양에서 직사각형(가로+세로) 헤더 병합·본문 병합";
    mergeBtn.addEventListener("click", () => openMergeSetup());
    const hideBtn = document.createElement("button");
    hideBtn.className = "rve-db-btn rve-gp-hidebtn";
    hideBtn.textContent = "◫ 컬럼 숨기기";
    hideBtn.title = "열 머리를 눌러 숨김/보이기 (비파괴적)";
    hideBtn.addEventListener("click", () => openHideColumns());
    const btnWrap = document.createElement("div");
    btnWrap.className = "rve-gp-btnwrap";
    btnWrap.appendChild(addRowBtn);
    btnWrap.appendChild(delRowBtn);
    btnWrap.appendChild(mergeBtn);
    btnWrap.appendChild(hideBtn);
    sec1h.appendChild(sec1t);
    sec1h.appendChild(btnWrap);
    sec1.appendChild(sec1h);
    sec1.appendChild(buildHeaderPreview());
    const phint = document.createElement("p");
    phint.className = "rve-gp-shint";
    phint.textContent =
      "미리보기 칸에 헤더명을 바로 입력할 수 있습니다. 헤더행 추가·직사각형(가로+세로) 병합·본문 병합은 ⛶병합설정에서.";
    sec1.appendChild(phint);
    body.appendChild(sec1);

    // ── 섹션 2: 열 (헤더명/타입/너비) ──
    const sec2 = document.createElement("div");
    sec2.className = "rve-gp-section";
    const sec2h = document.createElement("div");
    sec2h.className = "rve-gp-sechead";
    const sec2t = document.createElement("span");
    sec2t.className = "rve-gp-sectitle";
    sec2t.textContent = "열";
    const selLbl = document.createElement("label");
    selLbl.className = "rve-gp-ctrl";
    const selChk = document.createElement("input");
    selChk.type = "checkbox";
    selChk.checked = gpSel !== "none";
    selChk.addEventListener("change", () => {
      gpSel = selChk.checked ? (gpSel === "radio" ? "radio" : "checkbox") : "none";
    });
    selLbl.appendChild(selChk);
    selLbl.appendChild(document.createTextNode(" 행 선택 체크박스"));
    const sortLbl = document.createElement("label");
    sortLbl.className = "rve-gp-ctrl";
    const sortChk = document.createElement("input");
    sortChk.type = "checkbox";
    sortChk.checked = gpSortable;
    sortChk.addEventListener("change", () => { gpSortable = sortChk.checked; });
    sortLbl.appendChild(sortChk);
    sortLbl.appendChild(document.createTextNode(" 정렬(sort)"));
    const ctrlWrap = document.createElement("div");
    ctrlWrap.className = "rve-gp-ctrlwrap";
    ctrlWrap.appendChild(selLbl);
    ctrlWrap.appendChild(sortLbl);
    sec2h.appendChild(sec2t);
    sec2h.appendChild(ctrlWrap);
    sec2.appendChild(sec2h);

    // 그리드 템플릿: 필드 | 헤더명 | 타입 | 너비 | ✕  (헤더행·병합은 병합설정 팝업에서 편집)
    const tmpl = "1fr 1.1fr 88px 58px 24px";

    const table = document.createElement("div");
    table.className = "rve-db-table rve-gp-table";
    const thead = document.createElement("div");
    thead.className = "rve-db-tr rve-db-thead";
    thead.style.display = "grid";
    thead.style.gridTemplateColumns = tmpl;
    ["필드(key)", "헤더명", "타입", "너비", ""].forEach((h) => {
      const c = document.createElement("div");
      c.className = "rve-db-th";
      c.textContent = h;
      thead.appendChild(c);
    });
    table.appendChild(thead);

    gpCols.forEach((col, i) => {
      const tr = document.createElement("div");
      tr.className = "rve-db-tr";
      tr.style.display = "grid";
      tr.style.gridTemplateColumns = tmpl;
      const keyCell = document.createElement("div");
      keyCell.className = "rve-db-td rve-db-fieldcell";
      keyCell.textContent = col.key;
      tr.appendChild(keyCell);
      const titleIn = document.createElement("input");
      titleIn.className = "rve-db-td rve-db-cell";
      titleIn.value = col.title;
      titleIn.addEventListener("input", () => {
        col.title = titleIn.value;
        // 헤더 맨 아래 단일열 셀 텍스트 동기화
        const hi = gpHeadCells.findIndex((hc) => hc.c === i && hc.r + (hc.rs || 1) === gpHeadRows && (hc.cs || 1) === 1);
        if (hi >= 0) gpHeadCells[hi].text = titleIn.value;
      });
      const typeSel = document.createElement("select");
      typeSel.className = "rve-db-td rve-db-typesel";
      TYPE_OPTS.forEach((t) => {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        if ((col.type || "text") === t) o.selected = true;
        typeSel.appendChild(o);
      });
      typeSel.addEventListener("change", () => (col.type = typeSel.value));
      const widthIn = document.createElement("input");
      widthIn.className = "rve-db-td rve-db-cell";
      widthIn.type = "number";
      widthIn.placeholder = "auto";
      widthIn.value = col.width;
      widthIn.addEventListener("input", () => (col.width = widthIn.value));
      const rm = document.createElement("button");
      rm.className = "rve-db-td rve-db-rm";
      rm.textContent = "✕";
      rm.title = "컬럼 제거";
      rm.addEventListener("click", () => {
        gpCols.splice(i, 1);
        headSyncRemoveColumn(i);
        renderGridProps();
      });
      tr.appendChild(titleIn);
      tr.appendChild(typeSel);
      tr.appendChild(widthIn);
      tr.appendChild(rm);
      table.appendChild(tr);
    });
    if (!gpCols.length) {
      const e = document.createElement("div");
      e.className = "rve-db-empty";
      e.textContent = "컬럼이 없습니다. 추가하세요.";
      table.appendChild(e);
    }
    sec2.appendChild(table);

    const addBtn = document.createElement("button");
    addBtn.className = "rve-db-btn";
    addBtn.textContent = "＋ 컬럼 추가";
    addBtn.addEventListener("click", () => {
      const title = "새 컬럼";
      gpCols.push({ key: "field" + (gpCols.length + 1), title: title, type: "text", width: "", merge: false });
      headSyncAddColumn(gpCols.length - 1, title);
      renderGridProps();
    });
    sec2.appendChild(addBtn);
    body.appendChild(sec2);
    box.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "rve-db-foot";
    const apply = document.createElement("button");
    apply.className = "rve-db-btn rve-db-apply";
    apply.textContent = "적용";
    apply.addEventListener("click", () => {
      const bmExpr = gridBodyMergeExpr(gpCols);
      const hcExpr = gridHeaderCellsExpr(gpHeadCells, gpHeadRows, gpCols);
      sendSetProps(gpNode, [
        { name: "columns", expr: gridColumnsExpr(gpCols) },
        { name: "selection", value: gpSel === "none" ? "" : gpSel },
        bmExpr ? { name: "bodyMerge", expr: bmExpr } : { name: "bodyMerge", value: "" },
        hcExpr ? { name: "headerCells", expr: hcExpr } : { name: "headerCells", value: "" },
        hcExpr ? { name: "headerRows", expr: String(gpHeadRows) } : { name: "headerRows", value: "" },
        gpSortable ? { name: "sortable", value: "" } : { name: "sortable", expr: "false" },
        gpHidden.length
          ? { name: "hiddenColumns", expr: "[" + gpHidden.map((k) => JSON.stringify(k)).join(", ") + "]" }
          : { name: "hiddenColumns", value: "" },
        { name: "headerMerge", value: "" },
      ]);
      closeGridProps();
    });
    const close = document.createElement("button");
    close.className = "rve-db-btn";
    close.textContent = "닫기";
    close.addEventListener("click", closeGridProps);
    foot.appendChild(apply);
    foot.appendChild(close);
    box.appendChild(foot);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
