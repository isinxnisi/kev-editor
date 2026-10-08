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

その他の API:

- `GET /v1/models`: 読み込み中のモデルの情報
- `POST /v1/systemone/separate`: 質問を 1 つずつ別々に判定する
- `POST /v1/systemone/permute`: 選択肢の並び順を変えて何度か判定し、答えが安定するかを見る

## 注意

- Kev-0.8B は主に英語のデータで学習されています。日本語でも動きますが、精度は英語より下がる可能性があります
- Kev-0.8B で精度を確認済みの長さは 8,192 トークンまでです。それより長い判断材料も受け付けますが、精度の保証はありません
- 取り込む Kev のバージョンは `kev/Dockerfile` の `KEV_COMMIT` で固定しています
