import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

/** 데이터 바인딩 다이얼로그 "All Json" 목록의 한 항목 */
export interface JsonSource {
  /** 변수명 */
  name: string;
  /** 형태 설명 (배열/객체/state/REST API 등) */
  kind: string;
  /** JSON의 key 목록 (REST API는 실제 호출 전엔 빈 배열) */
  keys: string[];
  /** 행 수(배열이면 요소 개수) */
  count: number;
  /** REST API로 받는 경우 그 URL (클릭 시 확장이 GET해서 key 추출) */
  url?: string;
}

function keysOfObject(obj: t.ObjectExpression): string[] {
  const keys: string[] = [];
  for (const p of obj.properties) {
    if (t.isObjectProperty(p) && !p.computed) {
      const k = t.isIdentifier(p.key)
        ? p.key.name
        : t.isStringLiteral(p.key)
        ? p.key.value
        : "";
      if (k) keys.push(k);
    }
  }
  return keys;
}

/** array/object/useState(...) 초기값에서 {kind, keys, count} 추출 */
function analyzeInit(init: t.Node | null | undefined): Omit<JsonSource, "name"> | null {
  if (!init) return null;

  if (t.isArrayExpression(init)) {
    const first = init.elements.find((e) => e && t.isObjectExpression(e));
    if (first && t.isObjectExpression(first)) {
      return { kind: "배열(JSON)", keys: keysOfObject(first), count: init.elements.length };
    }
    return null;
  }
  if (t.isObjectExpression(init)) {
    return { kind: "객체(JSON)", keys: keysOfObject(init), count: 1 };
  }
  // const [rows, setRows] = useState(<literal>)
  if (t.isCallExpression(init) && t.isIdentifier(init.callee) && init.callee.name === "useState") {
    const inner = analyzeInit(init.arguments[0] as t.Node);
    if (inner) return { ...inner, kind: inner.kind + " · useState" };
    return null;
  }
  return null;
}

/**
 * 소스 코드에서 JSON 데이터를 담는 변수들을 스캔한다.
 * (배열-of-객체, 객체 리터럴, useState 초기값). key가 있는 것만 반환.
 */
export function scanJsonSources(source: string): JsonSource[] {
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });
  } catch {
    return [];
  }

  const out: JsonSource[] = [];
  const seen = new Set<string>();
  const setterToVar: Record<string, string> = {};
  const add = (name: string | undefined, init: t.Node | null | undefined) => {
    if (!name || seen.has(name)) return;
    const info = analyzeInit(init);
    if (info && info.keys.length) {
      seen.add(name);
      out.push({ name, ...info });
    }
  };

  // 1) 리터럴/useState 소스 + setter→state변수 맵
  traverse(ast, {
    VariableDeclarator(p) {
      const id = p.node.id;
      if (t.isIdentifier(id)) {
        add(id.name, p.node.init); // const X = [...] / {...} / useState(...)
      } else if (t.isArrayPattern(id) && t.isCallExpression(p.node.init)) {
        // const [rows, setRows] = useState([...])
        const first = id.elements[0];
        const second = id.elements[1];
        if (t.isIdentifier(first)) {
          if (t.isIdentifier(second)) setterToVar[second.name] = first.name;
          add(first.name, p.node.init); // 초기값이 리터럴이면 그것도
        }
      }
    },
  });

  // 2) fetch("URL") 소스 (연결된 state 변수로 이름 지정)
  const urlName = (url: string) => {
    const seg = url.split("?")[0].replace(/\/+$/, "").split("/").pop();
    return seg || "api";
  };
  traverse(ast, {
    CallExpression(p) {
      const c = p.node;
      if (
        t.isIdentifier(c.callee) &&
        c.callee.name === "fetch" &&
        c.arguments[0] &&
        t.isStringLiteral(c.arguments[0])
      ) {
        const url = c.arguments[0].value;
        // 이 fetch가 속한 문장에서 setter 사용을 찾아 state 변수명 연결
        const stmt = p.getStatementParent();
        let varName: string | null = null;
        if (stmt) {
          stmt.traverse({
            Identifier(ip) {
              if (!varName && setterToVar[ip.node.name]) varName = setterToVar[ip.node.name];
            },
          });
        }
        const name = varName || urlName(url);
        if (!seen.has(name)) {
          seen.add(name);
          out.push({ name, kind: "REST API (GET)", keys: [], count: 0, url });
        }
      }
    },
  });

  return out;
}
