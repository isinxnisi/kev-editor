# Kev Editor

判断専用モデル [Kev](https://github.com/jaredpalmer/kev)（0.8B）を、ブラウザから試すための簡易エディタです。
判断材料（文章）と質問を入力して「判定実行」を押すと、質問ごとの答えと確率が表示されます。

## 起動

```bash
docker compose up -d --build
```

- 画面: http://localhost:8080
- Kev API: http://localhost:8008（curl で直接試すとき用）

初回はイメージのビルド（CPU 版 PyTorch など）と、モデル（Qwen3.5-0.8B-Base と Kev のアダプタ）のダウンロードに時間がかかります。
画面左上の表示が「kev-0.8b · cpu · …」になれば準備完了です。進み具合は次のコマンドで確認できます。

```bash
docker compose logs -f kev
```

ダウンロードしたモデルは Docker ボリューム `kev-models` に保存されるので、2 回目からはすぐ起動します。

### 必要なもの

- Docker（Docker Compose v2）
- メモリ: Kev コンテナで 3GB 程度（既定の bf16 の場合。上限は `KEV_MEM_LIMIT`）
- ネットワーク: GitHub、PyPI、download.pytorch.org、Hugging Face に接続できること
- GPU は不要（CPU で動きます）

### 設定

`.env.example` を `.env` にコピーして値を変えます。`.env` がなくても既定値で動きます。

## 構成

```
kev-editor/
├── docker-compose.yml
├── kev/Dockerfile        Kev 本体（判定 API サーバー）を CPU で動かすイメージ
├── docs/finetune.md      Kev のファインチューニングの手順メモ
└── web/
    ├── nginx.conf        画面の配信と、/kev/ → Kev API の中継
    └── public/
        ├── kev.js        ★ Kev API の呼び出し（使い方を学ぶならここ）
        ├── app.js        画面の制御
        ├── samples.js    サンプルの入力例
        ├── index.html
        └── style.css
```

```
ブラウザ ──> web (nginx :8080) ──/kev/v1/...──> kev (python -m kev.serve :8008)
```

## Kev の使い方（入門）

Kev は文章を生成しません。**判断材料（state）と型付きの質問（questions）を渡すと、選択肢ごとの確率を返す**だけのモデルです。
API は TypeSafe 社の Jev（System One API）と互換です。

```bash
curl -s http://localhost:8008/v1/systemone \
  -H 'Content-Type: application/json' \
  -d '{
    "state": "朝から VPN につながらず、社内システムにログインできません。",
    "questions": {
      "urgent": { "type": "noul", "instructions": "本日中の対応が必要か？" },
      "team": {
        "type": "choice",
        "instructions": "どの担当に振り分けるか？",
        "criteria": { "アカウント": null, "ネットワーク": "VPN・Wi-Fi", "ハードウェア": null }
      },
      "impact": {
        "type": "score",
        "instructions": "業務への影響度",
        "criteria": ["影響なし", "一部の作業に支障", "業務が止まる"]
      }
    }
  }'
```

| 型 | criteria | 返ってくる値 |
|----|----------|--------------|
| `noul`（Yes/No） | 省略可。`{"true": "Yes の意味", "false": "No の意味"}` | `noul`: Yes の確率 |
| `choice`（選択） | `{"選択肢名": "説明 または null", ...}` | `choice`: 最も確率が高い選択肢、`probabilities`、`confidence` |
| `score`（段階評価） | `["レベル0", "レベル1", ...]`（低い順） | `score`: レベルの期待値（0 始まり）、`probabilities`、`confidence` |

- 1 回のリクエストで複数の質問にまとめて答えます（質問どうしは互いの答えを見ません）
- `confidence` は 0（どれとも言えない）〜 1（確信している）
- 画面の「JSON」タブで、実際に送ったリクエストとレスポンス、同じ内容の curl コマンドを確認できます
- 画面の「モデル入力」タブで、リクエストがモデルにどう入るかと、確率から値を計算する式を確認できます

その他の API:

- `GET /v1/models`: 読み込み中のモデルの情報
- `POST /v1/systemone/separate`: 質問を 1 つずつ別々に判定する
- `POST /v1/systemone/permute`: 選択肢の並び順を変えて何度か判定し、答えが安定するかを見る

## Kev の中で起きていること

Kev には**システムプロンプトも、出力形式の指示もありません**。画面の「モデル入力」タブで、実際の変換結果と計算式を確認できます。
（`KEV_COMMIT` 時点の `kev/api.py`・`kev/model.py` を確認して書いています。JS で同じ処理をしているのは `kev.js` の `modelInput` / `explainAnswers` です）

1. **JSON をテキストにする**: オブジェクトは「キー: 値」、配列は「- 値」の行になります。`state` や `instructions` には、文字列だけでなくオブジェクトも渡せます
2. **特殊トークンで区切った 1 本の列にする**
   ```
   <state>判断材料
   <q>質問文 <opt>選択肢1</opt> <opt>選択肢2</opt> … <decide>     ← 質問ごとに 1 ブロック
   ```
   - choice の選択肢は「名前: 説明」です。noul は `no: false の説明` と `yes: true の説明` の 2 択、score は各レベルの説明です
   - 各質問のブロックが見られるのは、判断材料と自分のブロックだけです（質問どうしは互いを見ません）
   - 区切りに使う特殊トークンは、入力の文字列から偽装できません
3. **文章を生成しない**: `<decide>` の位置と、各 `</opt>` の位置の内部表現から選択肢ごとの点数を出します（pointer head）。点数を校正済みの温度で割り、softmax で確率にします
   **モデルの生の出力は、質問ごとの確率の配列だけです**（例: `[0.1, 0.8, 0.1]`。並びは選択肢の順）
4. **確率の配列から JSON を組み立てるのは、サーバーの Python のコード（`kev/api.py` の `to_answers`）**: モデルは関与しないので、出力形式は必ず同じになります
   - noul = yes の確率
   - choice = 確率が最大の選択肢。confidence = (最大確率 − 1/K) ÷ (1 − 1/K)
   - score = Σ レベル × 確率

「どう判断するか」は、Kev が学習したことの中に含まれています。利用者が変えられるのは、渡すテキストだけです。

## Kev を使うとき開発者が設計するもの

| 設計対象 | 考えること |
|----------|------------|
| 判断材料（state） | 何を含め、何を除くか。**計算・閾値・日付の差は事前にコードで済ませて書き足す**（例: 「1人あたり 12,000円」）。0.8B は暗算が苦手です。日付の差は `KEV_DATE_FACTS=1` で補えます（英語の日付形式のみ） |
| 質問の分け方 | 1 つの質問で 1 つの判断にする。質問どうしは互いの答えを見ないので、依存する判断はコード側でつなぐ |
| 型の選択 | 2 値なら noul、排他的な分類なら choice、程度なら score |
| 選択肢の文言（criteria） | **モデルが比べるのは選択肢のテキストそのもの**です。名前だけより「名前: 説明」のほうが判断の手がかりになります。選択肢どうしが重ならないようにします。並び順の影響は「順序チェック」で確かめます |
| 確率の使い方 | 返ってくるのは確率で、判定は返ってきません。「noul ≥ 0.8 なら自動承認、0.2〜0.8 は人が確認」のように、閾値と、confidence が低いときの扱いを決めます |
| 評価 | 正解付きの例を集め、文言を変えたら同じ例で再判定して比べます。文言の工夫で足りないときは、その例で追加学習もできます（[docs/finetune.md](docs/finetune.md)） |

## 注意

- Kev-0.8B は主に英語のデータで学習されています。日本語でも動きますが、精度は英語より下がる可能性があります
- Kev-0.8B で精度を確認済みの長さは 8,192 トークンまでです。それより長い判断材料も受け付けますが、精度の保証はありません
- 取り込む Kev のバージョンは `kev/Dockerfile` の `KEV_COMMIT` で固定しています
