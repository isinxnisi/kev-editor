// Kev API の呼び出しだけをまとめたファイル。
// 画面（app.js）とは切り離してあるので、Kev の使い方はこのファイルを読めば分かる。
//
// Kev は文章を生成しない「判断専用」モデル。
//   入力: state（判断材料のテキスト） + questions（型付きの質問）
//   出力: 質問ごとの確率付きの答え
//
// 質問の型は 3 種類:
//   noul   … Yes / No。criteria は省略可。{ "true": "Yes の意味", "false": "No の意味" } で補足できる
//   choice … 選択肢から 1 つ。criteria は { "選択肢名": "説明 または null", ... }
//   score  … 段階評価。criteria は [ "レベル0の説明", "レベル1の説明", ... ]（低い順）

const BASE = "/kev/v1"; // nginx が Kev コンテナ（kev:8008）へ中継する

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new KevError(res.status, data);
  return data;
}

export class KevError extends Error {
  constructor(status, data) {
    const detail = data && data.detail;
    super(typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${status}`);
    this.status = status;
  }
}

// 判定リクエストを作る。
//   state     … 判断材料のテキスト
//   questions … { 質問ID: { type, instructions, criteria } }
export function buildRequest(state, questions) {
  return { model: "kev-latest", state, questions };
}

// 通常の判定。すべての質問を 1 回の推論でまとめて答える。
//
// レスポンス例:
// {
//   "answers": {
//     "escalate":   { "type": "noul",   "noul": 0.93 },
//     "department": { "type": "choice", "choice": "returns", "confidence": 0.21,
//                     "probabilities": { "returns": 0.47, "shipping": 0.28, "billing": 0.25 } },
//     "frustration":{ "type": "score",  "score": 1.44, "confidence": 0.34,
//                     "legend": { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
//                     "probabilities": { "0": 0.00, "1": 0.56, "2": 0.44 } }
//   },
//   "usage": { "input_tokens": 101, "output_tokens": 161 },
//   "latency_ms": 495
// }
export function decide(request) {
  return post("/systemone", request);
}

// 質問を 1 つずつ別々に推論する（質問どうしが影響し合うかの比較用）。レスポンス形式は decide と同じ。
export function decideSeparately(request) {
  return post("/systemone/separate", request);
}

// choice 質問の選択肢の並び順を変えて n 回判定し、答えが順序に左右されないかを見る。
// レスポンス: { runs: [{ order, probabilities, choice }], argmax_stable: true/false, spread: { 選択肢: 確率の振れ幅 } }
export function permute(request, questionId, n = 6) {
  return post("/systemone/permute", { request, question: questionId, n_perm: n });
}

// ---------------------------------------------------------------- Kev の内部で起きていること
//
// Kev にはシステムプロンプトも、出力形式の指示もない。サーバー（kev/api.py・kev/model.py）は次のことだけをする。
//
// 1. JSON をテキストに平らにする（render）。オブジェクトは「キー: 値」、配列は「- 値」の行になる
// 2. 区切り用の特殊トークンで 1 本のトークン列にする（encode）
//      <state> 判断材料
//      <q> 質問文 <opt> 選択肢1 </opt> <opt> 選択肢2 </opt> … <decide>   ← 質問ごとに 1 ブロック
//    選択肢のテキスト: choice は「名前: 説明」、noul は「no: false の説明」「yes: true の説明」、score は各レベルの説明
//    各質問のブロックは判断材料と自分自身しか見えない（質問どうしは互いを見ない）
//    特殊トークンの実体は Qwen の使われていないトークン（<|fim_prefix|> など）。入力の文字列から偽装はできない
// 3. 文章は生成しない。<decide> の位置と、各 </opt> の位置の内部表現の内積を、選択肢ごとの点数にする（pointer head）
//    点数を温度（/v1/models の temperature、校正済み）で割り、softmax で確率にする
// 4. 確率から JSON を Python のコードで組み立てる（to_answers）。だから出力形式は必ず同じになる

// サーバーの render（kev/api.py）と同じ規則で JSON をテキストにする。
// 数値の書式など細かいところは Python 版と違うことがある（例: Python は true を "True" と書く）。
export function render(v, indent = 0) {
  const pad = "  ".repeat(indent);
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) return v.map((x) => `${pad}- ${render(x, indent + 1).trimStart()}`).join("\n");
  return Object.entries(v).map(([k, x]) =>
    x !== null && typeof x === "object" ? `${pad}${k}:\n${render(x, indent + 1)}` : `${pad}${k}: ${render(x)}`).join("\n");
}

function optionText(name, desc) {
  return desc === null || desc === undefined || desc === "" ? name : `${name}: ${render(desc)}`;
}

// 1 つの質問の選択肢テキスト（モデルが読む順）と、確率を返すときのキー
export function questionOptions(q) {
  if (q.type === "noul") {
    const c = q.criteria || {};
    return { keys: ["false", "true"], options: [optionText("no", c.false), optionText("yes", c.true)] };
  }
  if (q.type === "choice") {
    return { keys: Object.keys(q.criteria), options: Object.entries(q.criteria).map(([k, v]) => optionText(k, v)) };
  }
  return { keys: q.criteria.map((_, i) => String(i)), options: q.criteria.map((x) => render(x)) };
}

// リクエストを、モデルが実際に読むトークン列の形（特殊トークンを <state> などの名前で表記）にする。
// サーバーで KEV_DATE_FACTS=1 のときは、判断材料の末尾に日付の差の文が追加される（ここには反映しない）。
export function modelInput(request) {
  const lines = [`<state>${render(request.state)}`];
  Object.entries(request.questions).forEach(([id, q], i) => {
    lines.push("", `── 質問 ${i + 1}: ${id}（<state> と、このブロックだけを見る）`);
    lines.push(`<q>${render(q.instructions)}`);
    for (const o of questionOptions(q).options) lines.push(`<opt>${o}</opt>`);
    lines.push("<decide>");
  });
  return lines.join("\n");
}

// 確率から各値を計算する式（kev/api.py の to_answers と同じ計算）を、実際の数値で書き出す。
const fmt = (x) => Number(x).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");

// モデルの生の出力: 質問ごとに、<opt> の並び順の確率の配列（これ以外は何も出さない）。
// API はこの配列をそのまま返さないので、レスポンスから並び順どおりに戻す（4 桁に丸めた値）。
// noul は yes の確率しか返らないが、2 択の softmax なので no = 1 − yes。
function rawProbs(q, a) {
  if (a.type === "noul") return [1 - a.noul, a.noul];
  return questionOptions(q).keys.map((k) => a.probabilities[k]);
}

export function rawOutput(request, response) {
  const entries = Object.entries(response.answers || {});
  const w = Math.max(...entries.map(([id]) => id.length));
  return entries.map(([id, a]) => {
    const q = request.questions[id];
    const labels = a.type === "noul" ? ["no", "yes"] : a.type === "choice" ? Object.keys(q.criteria) : q.criteria.map((_, i) => `レベル${i}`);
    return `${id.padEnd(w)}  [${rawProbs(q, a).map(fmt).join(", ")}]   ← ${labels.join(" / ")} の順`;
  }).join("\n");
}

// 生の出力（確率の配列）からレスポンスの JSON を作る、サーバーのプログラム（kev/api.py の to_answers）の処理を、
// 実際の数値で書き出す。ここはモデルではなく普通のコード。
export function explainAnswers(request, response) {
  const f = fmt;
  const out = [];
  for (const [id, a] of Object.entries(response.answers || {})) {
    const q = request.questions[id];
    const p = rawProbs(q, a);
    out.push(`■ ${id}（${a.type}）  入力 [${p.map(f).join(", ")}]`);
    if (a.type === "noul") {
      out.push(`  "noul": 配列の 2 番目（yes）をそのまま入れる → ${f(a.noul)}`);
    } else if (a.type === "choice") {
      const K = p.length, max = Math.max(...p);
      out.push(`  "probabilities": 配列に選択肢名をキーとして付ける`);
      out.push(`  "choice": 最大の値を持つ選択肢名 → ${a.choice}`);
      out.push(K === 1 ? `  "confidence": 選択肢が 1 つなので 1`
        : `  "confidence": (最大値 − 1/K) ÷ (1 − 1/K) = (${f(max)} − 1/${K}) ÷ (1 − 1/${K}) → ${f(a.confidence)}`);
    } else {
      out.push(`  "probabilities": 配列に "0","1",… をキーとして付ける`);
      out.push(`  "legend": criteria の文言に "0","1",… を付ける（モデルとは無関係）`);
      out.push(`  "score": Σ レベル × 値 = ${p.map((v, i) => `${i}×${f(v)}`).join(" + ")} → ${f(a.score)}`);
      out.push(`  "confidence": 1 − (最頻レベルからの平均のずれ ÷ 一様分布のときのずれ)、0 未満は 0 → ${f(a.confidence)}`);
    }
    out.push("");
  }
  if (response.usage) out.push(`"usage.input_tokens": 上のトークン列の長さ → ${response.usage.input_tokens}`, `"usage.output_tokens": 組み立てた answers の JSON をトークン数で数えただけ（課金の目安。生成はしていない）`, `"latency_ms": モデルの計算にかかった時間`);
  return out.join("\n");
}

// 読み込み中のモデル情報（起動確認にも使う）
export async function models() {
  const res = await fetch(BASE + "/models");
  if (!res.ok) throw new KevError(res.status, null);
  return (await res.json()).models[0];
}
