/**
 * Grid — 확장(VS Code) 측 메시지 핸들러 (출처: src/panel.ts, 원문 그대로 발췌)
 *
 * 웹뷰의 Grid Properties / Data Binding 팝업과 주고받는 메시지 4종:
 *   웹뷰 → 확장 : "setProp"   { targetStart, targetEnd, name, expr }
 *                 "setProps"  { targetStart, targetEnd, props: [{name, expr?|value?}] }
 *                 "scanJson"  {}                       ← 현재 파일의 JSON 변수 스캔
 *                 "fetchJson" { name, url }            ← REST API GET (확장이 대신 호출)
 *   확장 → 웹뷰 : "jsonSources" { sources: JsonSource[] }
 *                 "jsonKeys"   { name, keys, count } | { name, error }
 *
 * 아래 코드는 GridPanel 클래스의 onMessage(msg) switch 문 안에 그대로 들어가는 조각이다.
 * (this.document = 편집 중 TextDocument, this.panel = vscode.WebviewPanel, this.log = 디버그 로그)
 *
 * import 필요:
 *   import { computeSetProp, computeSetProps, TextEdit } from "./mutate.grid";
 *   import { scanJsonSources } from "./dataBinding";
 */

// ===========================================================================
// 1) prop 반영 (Grid Properties / Data Binding "적용") — panel.ts 364-386행
// ===========================================================================
      case "setProp": {
        this.log("recv setProp " + msg.name);
        const { edits, error } = computeSetProp(this.document.getText(), msg);
        if (error) {
          this.log("setProp 실패: " + error);
          vscode.window.showWarningMessage("Winway Visual Editor: " + error);
          break;
        }
        await this.applyEdits(edits, "setProp");
        break;
      }

      case "setProps": {
        this.log("recv setProps " + (msg.props || []).map((p: any) => p.name).join(","));
        const { edits, error } = computeSetProps(this.document.getText(), msg);
        if (error) {
          this.log("setProps 실패: " + error);
          vscode.window.showWarningMessage("Winway Visual Editor: " + error);
          break;
        }
        await this.applyEdits(edits, "setProps");
        break;
      }

// ===========================================================================
// 2) 데이터 바인딩 — panel.ts 412-477행 (주석 "---- 데이터 바인딩(그리드) ----" 포함)
// ===========================================================================
      // ---- 데이터 바인딩(그리드) ----
      case "scanJson": {
        try {
          this.panel.webview.postMessage({
            type: "jsonSources",
            sources: scanJsonSources(this.document.getText()),
          });
        } catch (e: any) {
          this.log("scanJson 실패: " + String(e?.message ?? e));
        }
        break;
      }

      case "fetchJson": {
        // 확장(Node)이 REST API를 실제로 GET → 응답 JSON에서 key 추출
        try {
          const tryFetch = async (u: string) => {
            const r = await fetch(u);
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r;
          };
          // 후보 URL 목록: 상대경로(/api/*)면 vite dev 서버(일반 포트들) 기준으로,
          // 절대경로면 localhost↔127.0.0.1 스왑까지 시도
          let candidates: string[];
          if (/^\//.test(msg.url)) {
            candidates = [5173, 5174, 5175, 5176, 5177].map((p) => "http://localhost:" + p + msg.url);
          } else {
            candidates = [msg.url];
            if (/localhost/.test(msg.url)) candidates.push(msg.url.replace("localhost", "127.0.0.1"));
            else if (/127\.0\.0\.1/.test(msg.url)) candidates.push(msg.url.replace("127.0.0.1", "localhost"));
          }
          let res: Response | null = null;
          let lastErr: any = null;
          for (const u of candidates) {
            try { res = await tryFetch(u); break; } catch (e) { lastErr = e; }
          }
          if (!res) throw lastErr ?? new Error("fetch failed");
          const data: any = await res.json();
          let keys: string[] = [];
          let count = 0;
          if (Array.isArray(data)) {
            count = data.length;
            const first = data.find((x) => x && typeof x === "object" && !Array.isArray(x));
            if (first) keys = Object.keys(first);
          } else if (data && typeof data === "object") {
            keys = Object.keys(data);
            count = 1;
          }
          this.log("fetchJson " + msg.url + " → key " + keys.length + "개");
          this.panel.webview.postMessage({
            type: "jsonKeys",
            name: msg.name,
            keys,
            count,
          });
        } catch (e: any) {
          let msgTxt = String(e?.message ?? e);
          if (/fetch failed|ECONNREFUSED|failed to fetch/i.test(msgTxt)) {
            msgTxt += /^\//.test(msg.url)
              ? " — vite dev 서버(npm run dev)가 켜져 있는지 확인하세요 (기본 포트 5173)."
              : " — 서버가 켜져 있는지 확인하세요.";
          }
          this.panel.webview.postMessage({ type: "jsonKeys", name: msg.name, error: msgTxt });
        }
        break;
      }

// ===========================================================================
// 3) 편집 반영 공통 루틴 — panel.ts 587-609행
//    computeSetProps 가 만든 TextEdit[] 을 문서에 적용하고 저장 → 미리보기 갱신
// ===========================================================================
  private async applyEdits(edits: TextEdit[], label = "edit") {
    if (!edits.length) {
      this.log(label + ": 편집 없음");
      return;
    }
    try {
      const we = new vscode.WorkspaceEdit();
      for (const e of edits) {
        we.replace(
          this.document.uri,
          new vscode.Range(this.document.positionAt(e.start), this.document.positionAt(e.end)),
          e.newText
        );
      }
      const ok = await vscode.workspace.applyEdit(we);
      await this.document.save();
      await this.refreshNow();
      this.log(label + ": " + edits.length + " edit → applyEdit=" + ok);
    } catch (err: any) {
      this.log(label + ": 예외 " + String(err?.message ?? err));
      vscode.window.showErrorMessage("Winway Visual Editor: " + String(err?.message ?? err));
    }
  }
