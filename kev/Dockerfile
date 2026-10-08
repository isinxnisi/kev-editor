# Kev 判定サーバー（CPU 版）
# https://github.com/jaredpalmer/kev の serve 機能だけを、CPU 版 PyTorch で動かす。
FROM python:3.13-slim

# 取り込む Kev のコミット（2026-10-05 時点の main）。更新するときはここを変える。
ARG KEV_REPO=https://github.com/jaredpalmer/kev.git
ARG KEV_COMMIT=5e42a7a03f28134853dd3ff77461457e921e5ec1
# Kev の要求は torch>=2.6,<2.9
ARG TORCH_VERSION=2.8.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# リポジトリは学習済みデータ等を含めて約 1GB あるため、Python パッケージ部分だけを取り出す
WORKDIR /opt/kev
RUN git init -q . \
 && git remote add origin "$KEV_REPO" \
 && git sparse-checkout set --no-cone /kev/ /pyproject.toml /README.md /LICENSE \
 && git fetch -q --depth 1 --filter=blob:none origin "$KEV_COMMIT" \
 && git checkout -q FETCH_HEAD

# GPU 用の巨大な依存を避けるため、CPU 版 torch を先に入れてから Kev を入れる
RUN pip install --no-cache-dir "torch==${TORCH_VERSION}" --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir ".[serve]"

ENV HF_HOME=/models \
    PYTHONUNBUFFERED=1
WORKDIR /srv
EXPOSE 8008

# 初回はモデル（Qwen3.5-0.8B-Base + Kev のアダプタ）をダウンロードしてから起動する
CMD ["sh", "-c", "exec python -m kev.serve --run \"$KEV_RUN\" --host 0.0.0.0 --port 8008"]
