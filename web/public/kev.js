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

// 読み込み中のモデル情報（起動確認にも使う）
export async function models() {
  const res = await fetch(BASE + "/models");
  if (!res.ok) throw new KevError(res.status, null);
  return (await res.json()).models[0];
}
