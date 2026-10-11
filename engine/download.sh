#!/usr/bin/env bash
# 重新下载 GardensOfKadesh(HomeworldSDL)WebAssembly 游戏包
# 用法: bash web/engine/download.sh
set -e
BASE=https://gardens-of-kadesh.gitlab.io/gardens-of-kadesh
cd "$(dirname "$0")"
for f in index.html favicon.png coi-serviceworker.min.js homeworld.js homeworld.wasm homeworld.worker.js homeworld.data; do
  echo "下载 $f ..."
  curl -sL --fail -o "$f" "$BASE/$f"
done
echo "完成。文件清单:"
wc -c index.html favicon.png coi-serviceworker.min.js homeworld.js homeworld.wasm homeworld.worker.js homeworld.data
