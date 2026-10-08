// 画面の制御。Kev の呼び出しそのものは kev.js にある。
import * as kev from "./kev.js";
import { SAMPLES } from "./samples.js";

const STORE_KEY = "kev-editor:v1";
const TYPE_LABEL = { noul: "Yes / No", choice: "選択", score: "スコア" };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (p) => `${(p * 100).toFixed(1)}%`;

// ---------------------------------------------------------------- 編集中の状態

let uidSeq = 0;

function newQuestion(type, src = {}) {
  return {
    uid: ++uidSeq,
    id: src.id ?? nextId(),
    type,
    text: src.text ?? "",
    // 型を切り替えても入力が消えないよう、型ごとの criteria を別々に持つ
    choice: src.choice ? src.choice.map((c) => ({ name: c.name, desc: c.desc ?? "" })) : [{ name: "", desc: "" }, { name: "", desc: "" }],
    score: src.score ? [...src.score] : ["", "", ""],
    noul: { true: src.noul?.true ?? "", false: src.noul?.false ?? "" },
    noulOpen: Boolean(src.noul?.true || src.noul?.false),
  };
}

function nextId() {
  const used = new Set((model?.questions ?? []).map((q) => q.id));
  let i = 1;
  while (used.has(`q${i}`)) i++;
  return `q${i}`;
}

let model = null;

function fromSample(sample) {
  return {
    state: sample.state,
    questions: sample.questions.map((q) => newQuestion(q.type, q)),
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && Array.isArray(saved.questions)) {
      return { state: saved.state ?? "", questions: saved.questions.map((q) => newQuestion(q.type, q)) };
    }
  } catch { /* 保存データが読めなければサンプルから始める */ }
  return fromSample(SAMPLES[0]);
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(model)); } catch { /* 保存できなくても動作は続ける */ }
  }, 300);
}

// ---------------------------------------------------------------- 質問の描画

function renderQuestions() {
  const box = $("#questions");
  box.replaceChildren(...model.questions.map(renderQuestion));
  $("#state").value = model.state;
  updateCount();
}

function renderQuestion(q) {
  const el = $("#tpl-question").content.firstElementChild.cloneNode(true);
  el.dataset.uid = q.uid;
  $$(".seg button", el).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === q.type)));
  $(".q-id", el).value = q.id;
  $(".q-text", el).value = q.text;
  $(".q-criteria", el).innerHTML = criteriaHtml(q);
  return el;
}

function criteriaHtml(q) {
  if (q.type === "noul") {
    if (!q.noulOpen) return `<button type="button" class="link" data-act="noul-open">＋ Yes / No の意味を補足する</button>`;
    return `
      <div class="crit-noul">
        <span>Yes</span><input data-field="noul-true" value="${esc(q.noul.true)}" placeholder="Yes にあたる状態（任意）">
        <span>No</span><input data-field="noul-false" value="${esc(q.noul.false)}" placeholder="No にあたる状態（任意）">
      </div>`;
  }
  if (q.type === "choice") {
    const rows = q.choice.map((c, i) => `
      <div class="crit-row choice">
        <input data-field="choice-name" data-i="${i}" value="${esc(c.name)}" placeholder="選択肢 ${i + 1}">
        <input data-field="choice-desc" data-i="${i}" value="${esc(c.desc)}" placeholder="説明（任意）">
        <button type="button" class="icon-btn" data-act="row-remove" data-i="${i}" aria-label="選択肢を削除">×</button>
      </div>`).join("");
    return `<div class="crit-list">${rows}</div>
      <div class="crit-foot"><button type="button" class="link" data-act="row-add">＋ 選択肢を追加</button></div>`;
  }
  const rows = q.score.map((s, i) => `
    <div class="crit-row">
      <span class="crit-idx">${i}</span>
      <input data-field="score" data-i="${i}" value="${esc(s)}" placeholder="レベル ${i} の説明">
      <button type="button" class="icon-btn" data-act="row-remove" data-i="${i}" aria-label="レベルを削除">×</button>
    </div>`).join("");
  return `<div class="crit-list">${rows}</div>
    <div class="crit-foot"><button type="button" class="link" data-act="row-add">＋ レベルを追加</button><span class="muted">上から低い順</span></div>`;
}

function rerenderCriteria(q) {
  const el = $(`.q[data-uid="${q.uid}"]`);
  $$(".seg button", el).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === q.type)));
  $(".q-criteria", el).innerHTML = criteriaHtml(q);
}

const findQ = (target) => model.questions.find((q) => q.uid === Number(target.closest(".q")?.dataset.uid));

function updateCount() {
  $("#state-count").textContent = `${model.state.length.toLocaleString()} 文字`;
}

// ---------------------------------------------------------------- 入力イベント

function bindEditor() {
  $("#state").addEventListener("input", (e) => { model.state = e.target.value; updateCount(); save(); });

  const box = $("#questions");
  box.addEventListener("input", (e) => {
    const q = findQ(e.target);
    if (!q) return;
    const t = e.target, i = Number(t.dataset.i);
    if (t.classList.contains("q-id")) { q.id = t.value.trim(); t.classList.remove("invalid"); }
    else if (t.classList.contains("q-text")) q.text = t.value;
    else if (t.dataset.field === "choice-name") q.choice[i].name = t.value;
    else if (t.dataset.field === "choice-desc") q.choice[i].desc = t.value;
    else if (t.dataset.field === "score") q.score[i] = t.value;
    else if (t.dataset.field === "noul-true") q.noul.true = t.value;
    else if (t.dataset.field === "noul-false") q.noul.false = t.value;
    save();
  });

  box.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    const q = btn && findQ(btn);
    if (!q) return;
    if (btn.dataset.type) {
      q.type = btn.dataset.type;
      rerenderCriteria(q);
    } else if (btn.classList.contains("q-remove")) {
      model.questions = model.questions.filter((x) => x !== q);
      btn.closest(".q").remove();
    } else if (btn.dataset.act === "noul-open") {
      q.noulOpen = true;
      rerenderCriteria(q);
      $(`.q[data-uid="${q.uid}"] input[data-field="noul-true"]`).focus();
    } else if (btn.dataset.act === "row-add") {
      if (q.type === "choice") q.choice.push({ name: "", desc: "" }); else q.score.push("");
      rerenderCriteria(q);
      const inputs = $$(`.q[data-uid="${q.uid}"] .crit-row input:first-of-type`);
      inputs.at(-1)?.focus();
    } else if (btn.dataset.act === "row-remove") {
      const list = q.type === "choice" ? q.choice : q.score;
      if (list.length > 1) list.splice(Number(btn.dataset.i), 1);
      rerenderCriteria(q);
    }
    save();
  });

  $$("[data-add]").forEach((b) => b.addEventListener("click", () => {
    const q = newQuestion(b.dataset.add);
    model.questions.push(q);
    $("#questions").append(renderQuestion(q));
    $(`.q[data-uid="${q.uid}"] .q-text`).focus();
    save();
  }));

  const sel = $("#sample-select");
  SAMPLES.forEach((s, i) => sel.add(new Option(s.name, String(i))));
  sel.addEventListener("change", () => {
    if (sel.value === "") return;
    model = fromSample(SAMPLES[Number(sel.value)]);
    sel.value = "";
    lastAnswers = {};
    renderQuestions();
    save();
  });

  const toggle = $("#settings-toggle");
  toggle.addEventListener("click", () => {
    const open = $("#settings").hidden;
    $("#settings").hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });

  $("#run").addEventListener("click", run);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
  });

  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
    $("#tab-view").hidden = t.dataset.tab !== "view";
    $("#tab-json").hidden = t.dataset.tab !== "json";
    $("#tab-inside").hidden = t.dataset.tab !== "inside";
  }));

  $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($(`#${b.dataset.copy}`).textContent);
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  }));
}

// ---------------------------------------------------------------- リクエストの組み立て

// 画面の入力を Kev の questions 形式に変換する。問題があれば errors に入れる。
function collectQuestions() {
  const questions = {};
  const errors = [];
  $$(".q-id").forEach((el) => el.classList.remove("invalid"));

  model.questions.forEach((q, n) => {
    const label = `質問 ${n + 1}`;
    const markId = () => $(`.q[data-uid="${q.uid}"] .q-id`)?.classList.add("invalid");
    if (!q.id) { errors.push(`${label}: 質問ID が空です`); markId(); return; }
    if (questions[q.id]) { errors.push(`${label}: 質問ID「${q.id}」が重複しています`); markId(); return; }

    const entry = { type: q.type, instructions: q.text.trim() || null };
    if (q.type === "noul") {
      const t = q.noul.true.trim(), f = q.noul.false.trim();
      if (t || f) entry.criteria = { true: t || null, false: f || null };
    } else if (q.type === "choice") {
      const opts = q.choice.filter((c) => c.name.trim());
      const names = opts.map((c) => c.name.trim());
      if (opts.length < 2) errors.push(`${label}: 選択肢を 2 つ以上入力してください`);
      if (new Set(names).size !== names.length) errors.push(`${label}: 選択肢の名前が重複しています`);
      entry.criteria = Object.fromEntries(opts.map((c) => [c.name.trim(), c.desc.trim() || null]));
    } else {
      const levels = q.score.map((s) => s.trim()).filter(Boolean);
      if (levels.length < 2) errors.push(`${label}: レベルを 2 つ以上入力してください`);
      entry.criteria = levels;
    }
    questions[q.id] = entry;
  });

  if (!model.state.trim()) errors.unshift("判断材料が空です");
  if (!model.questions.length) errors.push("質問を 1 つ以上追加してください");
  return { questions, errors };
}

function settings() {
  return {
    mode: $('input[name="mode"]:checked').value,
    permute: $("#permute-on").checked,
    permuteN: Math.min(12, Math.max(2, Number($("#permute-n").value) || 6)),
    showPrev: $("#show-prev").checked,
  };
}

// ---------------------------------------------------------------- 実行

let running = false;
let lastAnswers = {};   // 前回の結果（差分表示用）。質問ID → answer

async function run() {
  if (running) return;
  const { questions, errors } = collectQuestions();
  if (errors.length) { showError(errors.join("\n")); switchTab("view"); return; }

  const opts = settings();
  const request = kev.buildRequest(model.state, questions);
  showJson(request, null, opts.mode);

  running = true;
  $("#run").disabled = true;
  const started = performance.now();
  const timer = setInterval(() => {
    const el = $("#elapsed");
    if (el) el.textContent = `${((performance.now() - started) / 1000).toFixed(1)} 秒`;
  }, 100);
  $("#result").innerHTML = `<div class="empty"><div class="running"><div class="spinner"></div><span>判定中… <span id="elapsed" class="elapsed">0.0 秒</span></span></div></div>`;
  $("#meta").textContent = "";

  try {
    const response = opts.mode === "separate" ? await kev.decideSeparately(request) : await kev.decide(request);

    // 選択肢の順序チェック（詳細設定で有効なときだけ）
    const permutes = {};
    if (opts.permute) {
      for (const [id, q] of Object.entries(questions)) {
        if (q.type !== "choice") continue;
        const el = $("#elapsed")?.parentElement;
        if (el) el.firstChild.textContent = `順序チェック中（${id}）… `;
        permutes[id] = await kev.permute(request, id, opts.permuteN);
      }
    }

    const total = performance.now() - started;
    showResult(request, response, permutes, opts, total);
    showJson(request, Object.keys(permutes).length ? { systemone: response, permute: permutes } : response, opts.mode);
    lastAnswers = { ...lastAnswers, ...response.answers };
  } catch (err) {
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      showError("Kev に接続できませんでした。起動中の可能性があります。しばらく待ってから再度実行してください。");
      pollStatus();
    } else {
      showError(`判定に失敗しました${err.status ? `（HTTP ${err.status}）` : ""}\n${err.message}`);
    }
  } finally {
    clearInterval(timer);
    running = false;
    $("#run").disabled = false;
  }
}

// ---------------------------------------------------------------- 結果の描画

function showResult(request, response, permutes, opts, totalMs) {
  const prev = opts.showPrev ? lastAnswers : {};
  const cards = Object.entries(request.questions).map(([id, q]) => {
    const a = response.answers[id];
    if (!a) return "";
    const p = prev[id]?.type === a.type ? prev[id] : null;
    const body = a.type === "noul" ? noulHtml(a, p) : a.type === "choice" ? choiceHtml(a, p, permutes[id]) : scoreHtml(a, p);
    return `
      <article class="ans">
        <div class="ans-head"><span class="ans-id">${esc(id)}</span><span class="ans-type">${TYPE_LABEL[a.type]}</span></div>
        ${q.instructions ? `<div class="ans-q">${esc(q.instructions)}</div>` : ""}
        ${body}
      </article>`;
  }).join("");
  $("#result").innerHTML = `<div class="answers">${cards}</div>`;

  const parts = [`Kev ${Math.round(response.latency_ms)} ms`, `全体 ${(totalMs / 1000).toFixed(1)} 秒`];
  if (response.usage?.input_tokens != null) parts.push(`入力 ${response.usage.input_tokens} tokens`);
  if (opts.mode === "separate") parts.push("質問ごと");
  $("#meta").textContent = parts.join(" · ");
}

function deltaHtml(now, before) {
  if (before == null) return "";
  const d = (now - before) * 100;
  if (Math.abs(d) < 0.05) return `<span class="delta">前回と同じ</span>`;
  return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}pt</span>`;
}

function noulHtml(a, prev) {
  const yes = a.noul;
  const isYes = yes >= 0.5;
  return `
    <div class="ans-main">
      <span class="big">${pct(yes)}<small>Yes</small></span>
      <span class="verdict ${isYes ? "" : "no"}">${isYes ? "Yes" : "No"}</span>
      ${deltaHtml(yes, prev?.noul)}
    </div>
    <div class="split"><div class="yes" style="width:${yes * 100}%"></div></div>
    <div class="split-legend"><span>Yes ${pct(yes)}</span><span>No ${pct(1 - yes)}</span></div>`;
}

function barsHtml(entries, topKey) {
  return `<div class="bars">${entries.map(([label, p, key]) => `
    <div class="bar-row ${key === topKey ? "top" : ""}">
      <span class="bar-label" title="${esc(label)}">${esc(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${p * 100}%"></div></div>
      <span class="bar-pct">${pct(p)}</span>
    </div>`).join("")}</div>`;
}

function choiceHtml(a, prev, perm) {
  const entries = Object.entries(a.probabilities).map(([k, p]) => [k, p, k]).sort((x, y) => y[1] - x[1]);
  const changed = prev && prev.choice !== a.choice ? `<span class="delta">前回: ${esc(prev.choice)}</span>` : "";
  return `
    <div class="ans-main">
      <span class="big">${esc(a.choice)}</span>
      <span class="conf">確信度 ${pct(a.confidence)}</span>
      ${changed || deltaHtml(a.probabilities[a.choice], prev?.probabilities?.[a.choice])}
    </div>
    ${barsHtml(entries, a.choice)}
    ${perm ? permuteHtml(perm) : ""}`;
}

function permuteHtml(perm) {
  const maxSpread = Math.max(...Object.values(perm.spread));
  const choices = [...new Set(perm.runs.map((r) => r.choice))];
  return `
    <div class="perm">
      選択肢の順序を変えて ${perm.runs.length} 回：
      ${perm.argmax_stable
        ? `<b class="ok">答えは安定</b>（常に「${esc(choices[0])}」）`
        : `<b class="ng">答えが変化</b>（${choices.map(esc).join(" / ")}）`}
      ・確率の振れ幅 最大 ${(maxSpread * 100).toFixed(1)}pt
    </div>`;
}

function scoreHtml(a, prev) {
  const keys = Object.keys(a.legend);
  const levels = keys.length;
  const top = keys.reduce((m, k) => (a.probabilities[k] > a.probabilities[m] ? k : m), keys[0]);
  const pos = levels > 1 ? (a.score / (levels - 1)) * 100 : 50;
  const entries = keys.map((k) => [`${k}. ${a.legend[k]}`, a.probabilities[k], k]);
  const d = prev?.score != null ? a.score - prev.score : null;
  const delta = d == null ? "" : Math.abs(d) < 0.005
    ? `<span class="delta">前回と同じ</span>`
    : `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(2)}</span>`;
  return `
    <div class="ans-main">
      <span class="big">${a.score.toFixed(2)}<small>/ ${levels - 1}</small></span>
      <span class="verdict">${esc(a.legend[top])}</span>
      <span class="conf">確信度 ${pct(a.confidence)}</span>
      ${delta}
    </div>
    <div class="scale">
      <div class="scale-track"></div>
      <div class="scale-mark" style="left:${pos}%"></div>
      <div class="scale-ticks">${keys.map((k) => `<span>${k}</span>`).join("")}</div>
    </div>
    ${barsHtml(entries, top)}`;
}

function showError(message) {
  $("#result").innerHTML = `<div class="error-box">${esc(message)}</div>`;
  $("#meta").textContent = "";
}

function switchTab(name) {
  $(`.tab[data-tab="${name}"]`).click();
}

function showJson(request, response, mode) {
  const body = JSON.stringify(request, null, 2);
  $("#json-req").textContent = body;
  $("#json-res").textContent = response ? JSON.stringify(response, null, 2) : "—";
  const path = mode === "separate" ? "/v1/systemone/separate" : "/v1/systemone";
  const json = JSON.stringify(request).replace(/'/g, "'\\''");
  $("#json-curl").textContent = `curl -s http://localhost:8008${path} \\\n  -H 'Content-Type: application/json' \\\n  -d '${json}'`;

  // モデル入力タブ（順序チェックがあるときは通常の判定のレスポンスで計算を示す）
  $("#inside-input").textContent = kev.modelInput(request);
  const res = response && (response.systemone ?? response);
  const done = res && res.answers;
  $("#inside-raw").textContent = done ? kev.rawOutput(request, res) : "—（判定後に表示します）";
  $("#inside-calc").textContent = done ? kev.explainAnswers(request, res) : "—（判定後に表示します）";
}

let toastTimer = 0;
function toast(text) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.append(el); }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1400);
}

// ---------------------------------------------------------------- Kev の起動状態

let pollTimer = 0;
async function pollStatus() {
  clearTimeout(pollTimer);
  const box = $("#status"), text = $("#status-text");
  try {
    const m = await kev.models();
    const run = String(m.run ?? m.name).split("/").pop();
    const dtype = String(m.dtype ?? "").replace(/^torch\./, "");
    box.dataset.state = "ready";
    text.textContent = [run, m.device, dtype].filter(Boolean).join(" · ");
    box.title = m.description ?? "";
  } catch {
    box.dataset.state = "loading";
    text.textContent = "Kev 起動中…";
    box.title = "初回はモデルのダウンロードがあるため、数分以上かかることがあります";
    pollTimer = setTimeout(pollStatus, 5000);
  }
}

// ---------------------------------------------------------------- 起動

model = load();
renderQuestions();
bindEditor();
pollStatus();
