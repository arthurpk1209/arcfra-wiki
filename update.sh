#!/usr/bin/env bash
# 一鍵更新知識庫: 從 Notion 同步 -> 補丁格式 -> (內容有變才)重新建置並啟動 Docker
#
# 用法:
#   ./update.sh              # 同步 Notion;內容有變化(或容器沒在跑)才重新建置
#   ./update.sh --force      # 同步後不管有沒有變化,一律重新建置
#   ./update.sh --no-sync    # 不同步 Notion,直接重新建置(例如只改了專案檔案)
#   ./update.sh --no-git     # 不先 git pull(預設會先把 GitHub 最新版本拉下來)
#   ./update.sh --help
#
# Notion 的 Token 和資料庫 ID 放在同目錄的 .env 檔(見 .env.example)。
# .env 與 .last-build-hash 都已列在 .gitignore / .dockerignore,不會被推上 GitHub 或打進映像。
#
# 適合直接放進 cron 定期執行,例如每 30 分鐘:
#   */30 * * * * cd /path/to/arcfra-wiki && ./update.sh >> /var/log/arcfra-update.log 2>&1

set -euo pipefail

cd "$(dirname "$0")"

SERVICE="arcfra-wiki"
HASH_FILE=".last-build-hash"

log() { echo "[$(date '+%F %T')] $*"; }

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
}

FORCE=0
SKIP_SYNC=0
SKIP_GIT=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --no-sync) SKIP_SYNC=1 ;;
    --no-git) SKIP_GIT=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "未知參數: $arg(可用: --force, --no-sync, --no-git, --help)" >&2
      exit 1
      ;;
  esac
done

# 防止同一時間跑兩份(例如上一次 cron 還沒跑完,下一次又開始)
if command -v flock >/dev/null 2>&1; then
  exec 9>"${TMPDIR:-/tmp}/arcfra-wiki-update.lock"
  if ! flock -n 9; then
    log "已有另一個 update.sh 正在執行,本次略過"
    exit 0
  fi
fi

# 先把 GitHub 上的最新程式與文件拉下來(只允許 fast-forward,有衝突就停下來,不會硬蓋)
if [ "$SKIP_GIT" -eq 0 ] && [ -d .git ] && git remote get-url origin >/dev/null 2>&1; then
  log "[0/3] 從 GitHub 拉取最新版本 (git pull --ff-only)..."
  if ! git pull --ff-only --quiet; then
    echo "git pull 失敗(本機可能有未提交的修改或分支已分叉),請手動處理後再執行。" >&2
    exit 1
  fi
fi

# 內容指紋: git 版本 + 所有文件 + 同步下來的圖片檔案內容的雜湊(程式碼或設定有更新也會觸發重建)
content_hash() {
  local head="nogit"
  [ -d .git ] && head="$(git rev-parse HEAD 2>/dev/null || echo nogit)"
  local dirs=()
  [ -d arcfra-wiki ] && dirs+=(arcfra-wiki)
  [ -d static/img/notion ] && dirs+=(static/img/notion)
  {
    echo "$head"
    if [ "${#dirs[@]}" -gt 0 ]; then
      find "${dirs[@]}" -type f -print0 | sort -z | xargs -0 sha256sum
    fi
  } | sha256sum | cut -d' ' -f1
}

container_running() {
  [ -n "$(docker compose ps --status running -q "$SERVICE" 2>/dev/null || true)" ]
}

if [ "$SKIP_SYNC" -eq 0 ]; then
  if [ ! -f .env ]; then
    echo "找不到 .env,請先複製範本並填入你的 Notion 資訊:" >&2
    echo "  cp .env.example .env && nano .env" >&2
    exit 1
  fi

  # 載入 .env(自動 export 裡面的變數)
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a

  if [ -z "${NOTION_TOKEN:-}" ] || [ -z "${NOTION_ROOT_PAGE_ID:-}" ]; then
    echo ".env 裡缺少 NOTION_TOKEN 或 NOTION_ROOT_PAGE_ID" >&2
    exit 1
  fi

  # 同步腳本在主機上執行,需要先有套件
  if [ ! -d node_modules ]; then
    log "第一次執行,先安裝套件 (npm install)..."
    npm install
  fi

  log "[1/3] 從 Notion 同步內容..."
  npm run notion:sync

  log "[2/3] 補丁 frontmatter / 標題層級(重複執行安全)..."
  node scripts/patch-mdx-format.js arcfra-wiki/guide
else
  log "略過 Notion 同步(--no-sync),直接重新建置"
  FORCE=1
fi

NEW_HASH="$(content_hash)"
OLD_HASH=""
[ -f "$HASH_FILE" ] && OLD_HASH="$(cat "$HASH_FILE")"

if [ "$FORCE" -eq 0 ] && [ "$NEW_HASH" = "$OLD_HASH" ] && container_running; then
  log "內容沒有變化且網站正在運行,略過重新建置 ✅"
  exit 0
fi

if [ "$FORCE" -eq 1 ]; then
  log "[3/3] 強制重新建置並啟動 Docker..."
elif [ "$NEW_HASH" != "$OLD_HASH" ]; then
  log "[3/3] 偵測到內容變化,重新建置並啟動 Docker..."
else
  log "[3/3] 網站容器沒有在運行,重新建置並啟動 Docker..."
fi

docker compose up -d --build

# 建置成功才記錄指紋,失敗的話下次會再試一次
echo "$NEW_HASH" > "$HASH_FILE"
log "完成 ✅  網站已更新"
