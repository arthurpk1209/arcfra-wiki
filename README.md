# Arcfra知識庫

基於 [Docusaurus](https://docusaurus.io/) 搭建的知識庫,風格參考 `kvm.6p7p.com`:左側文件導覽、中間正文、右側本頁目錄、全文搜尋、暗色模式。

## 目錄結構

```
arcfra-wiki/
├── arcfra-wiki/            # 所有知識庫內容(Markdown),資料夾結構即左側導覽結構
│   ├── intro.md
│   └── getting-started/
│       ├── _category_.json
│       └── installation.md
├── src/
│   ├── css/custom.css      # 主題配色(藍色系,貼近參考站點)
│   └── pages/about.js      # "關於我們" 獨立頁面
├── scripts/
│   ├── lib/slugify.js                # 中文標題 -> 拼音英文 slug 的共用小工具
│   ├── notion-to-md.js               # 方案 A: Notion API 自動同步
│   └── postprocess-notion-export.js  # 方案 B: 清洗 Notion 手動匯出的 zip
├── .github/workflows/
│   ├── build.yml            # 每次 push/PR 自動跑一次建置,建置失敗會在 GitHub 上標紅
│   └── docker-publish.yml   # push 到 main 時自動把映像發布到 GitHub Container Registry
├── docusaurus.config.js
├── sidebars.js
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

> **命名規則**:所有資料夾 / 檔案名一律用英文(拼音或語義化英文單詞),內容本身(標題、正文)可以照常用中文。這樣在 Git / URL / 命令列下都不會有編碼或跨平台踩坑問題。上面兩個遷移腳本都已經處理成「檔案名轉拼音,正文內容保留中文原文」。

## 本地開發(不用 Docker)

```bash
npm install
npm run start        # http://localhost:3000,改內容熱更新
```

## 用 Docker 部署(生產)

```bash
docker compose up -d --build
```

存取 `http://<伺服器IP>:8080` 即可。容器內部是「Node 建置靜態檔案 → Nginx 提供服務」的兩段式映像,執行時不依賴 Node,體積小、啟動快。

如果只想改連接埠,編輯 `docker-compose.yml` 裡的 `ports: - "8080:80"`。

### 用 Docker 做開發預覽(帶熱更新)

```bash
docker compose --profile dev up arcfra-wiki-dev
```

存取 `http://localhost:3000`。

## 新增 / 編輯文件

在 `arcfra-wiki/` 下新建 `.md` 檔案或子資料夾即可(**資料夾/檔案名請用英文**,標題和正文照常寫中文),左側導覽自動生成,無需手動改設定。子資料夾裡放一個 `_category_.json` 可以自訂分類標題和排序:

```json
{
  "label": "維運",
  "position": 3
}
```

---

## 用 Git / GitHub 管理與備份

專案已經初始化好本地 git 倉庫(第一次 commit 已包含在壓縮包裡)。接下來只需要把它接到你的 GitHub 倉庫:

1. 在 GitHub 上新建一個**空**倉庫(不要勾選自動生成 README/.gitignore,避免衝突),例如 `arcfra/arcfra-wiki`
2. 在專案目錄下執行:

   ```bash
   git remote add origin git@github.com:<你的帳號>/arcfra-wiki.git
   git branch -M main
   git push -u origin main
   ```

3. 之後每次改完文件,正常走 git 流程即可:

   ```bash
   git add .
   git commit -m "docs: 更新xxx說明"
   git push
   ```

   這樣 GitHub 上就有完整的歷史版本記錄,相當於自動備份 + 可回溯的修改歷史。

### 已經內建的兩個 GitHub Actions

- **`.github/workflows/build.yml`**:每次 `push` / `PR` 自動 `npm install && npm run build`,建置失敗會直接在 GitHub 上標紅提醒,防止把改壞的文件合併進去
- **`.github/workflows/docker-publish.yml`**:每次 push 到 `main` 會自動把 Docker 映像建置好並發布到 GitHub Container Registry(`ghcr.io/<你的帳號>/arcfra-wiki`),之後在伺服器上就可以直接:

  ```bash
  docker pull ghcr.io/<你的帳號>/arcfra-wiki:latest
  docker run -d -p 8080:80 ghcr.io/<你的帳號>/arcfra-wiki:latest
  ```

  不需要在伺服器上重新 `npm install` / `npm run build`,更新只需要重新 `pull` + 重啟容器。

  > 注意:GHCR 發布的映像預設是私有的,如果伺服器要 `docker pull`,需要先在伺服器上 `docker login ghcr.io`(用你的 GitHub 使用者名稱 + [Personal Access Token](https://github.com/settings/tokens)),或者去倉庫的 Packages 設定裡把映像改成 public。

- 如果想讓 `editUrl`(文件頁面右上角「編輯此頁」跳轉連結)生效,記得把 `docusaurus.config.js` 裡的 `https://github.com/arcfra/arcfra-wiki` 換成你實際的倉庫地址,`organizationName` / `projectName` 同理。

---

## 從 Notion 遷移文件

提供兩種方式,任選其一。

### 方案 A:Notion API 自動同步(推薦,可重複執行)

優點是可以隨時重新執行、保持增量更新,適合長期從 Notion 作為「編輯源」、Docusaurus 作為「發布站點」的場景。

1. 打開 [notion.so/my-integrations](https://www.notion.so/my-integrations),建立一個 Internal Integration,複製 `Internal Integration Token`
2. 回到 Notion,打開作為知識庫根目錄的那個頁面 → 右上角 `···` → `Connections` → 把第 1 步建立的 integration 加進去。Notion 的授權會**級聯到所有子頁面**,所以只需要在最頂層根頁面操作一次
3. 複製該根頁面的 URL,取最後一段 32 位字元作為 `NOTION_ROOT_PAGE_ID`(去掉中間的連字符)
4. 執行:

   ```bash
   npm install
   NOTION_TOKEN=secret_xxx NOTION_ROOT_PAGE_ID=xxxxxxxxxxxx npm run notion:sync
   ```

5. 內容會寫入 `arcfra-wiki/notion/`,頁面層級自動轉換成資料夾分類,圖片自動下載到 `static/img/notion/`
6. 檢查一遍效果後,把 `arcfra-wiki/notion/` 挪到你想要的位置,或者直接保留在這個子目錄下即可,側邊欄會自動識別

**局限**:Notion 資料庫(帶篩選/檢視的表)、同步區塊等複雜結構還原有限,建議同步後人工過一遍。

### 方案 B:手動匯出 + 清洗腳本(不需要建 Integration,一次性遷移更簡單)

1. 在 Notion 網頁版,打開根頁面 → `···` → `Export` → 格式選 `Markdown & CSV`,勾選 `Include subpages`,匯出 zip
2. 解壓到專案**外面**的任意目錄,比如 `~/Downloads/notion-export`
3. 執行:

   ```bash
   NOTION_EXPORT_DIR=~/Downloads/notion-export npm run notion:clean
   ```

4. 腳本會自動:
   - 去掉 Notion 匯出檔案/資料夾名裡那串 32 位 ID 後綴
   - 修正因為改名而失效的內部連結、圖片路徑
   - 把 `章節.md` + `章節/` 這種同名結構規整成 Docusaurus 的分類(自動生成 `_category_.json`,原 `章節.md` 變成 `章節/index.md`)
5. 結果在 `arcfra-wiki/notion/`,檢查無誤後按需搬到 `arcfra-wiki/` 下合適的位置

**局限**:同方案 A,資料庫檢視/篩選、部分嵌入內容不會被完整保留。

### 兩種方案怎麼選

| | 方案 A(API) | 方案 B(手動匯出) |
|---|---|---|
| 需要建 Notion Integration | 需要 | 不需要 |
| 能否重複執行 / 增量同步 | 可以 | 每次都要重新匯出 |
| 適合場景 | 長期用 Notion 編輯、定期發布 | 一次性搬家,以後就在 Docusaurus 裡直接改 |
