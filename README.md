# Arcfra知識庫

基於 [Docusaurus](https://docusaurus.io/) 搭建的知識庫,風格參考 `kvm.6p7p.com`:左側文件導覽、中間正文、右側本頁目錄、全文搜尋、暗色模式。

## 目錄結構

```
arcfra-wiki/
├── arcfra-wiki/            # 所有知識庫內容(Markdown),資料夾結構即左側導覽結構
│   ├── intro.md
│   └── getting-started/
│       └── _category_.json
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

> **關於 MDX 建置失敗**:Notion 內容常出現 `<UEFI>`、`<username>` 這類尖括號文字,Docusaurus 預設把 `.md` 當 MDX 解析,會把這些誤判成沒閉合的 JSX 標籤導致 `docusaurus build` 失敗。兩支遷移腳本產生的每個檔案都會自動帶上 `mdx:\n  format: md` 這組 frontmatter,強制該檔案用純 Markdown(CommonMark)解析來避開這個問題。

> **關於右側「本頁目錄」是空的**:Docusaurus 右側目錄預設只收 H2~H3 的標題(網站設定已放寬到 H2~H4)。Notion 很多人習慣所有段落標題都打「Heading 1」,轉成 Markdown 後全部是 `#`,會跟文件本身的標題撞在同一層級、也落在目錄預設範圍之外。兩支遷移腳本都會自動把內文標題整體降一級來避開這個問題。

> 如果你在套用上面兩個修正**之前**就已經同步過內容,不想整個重新同步一次,可以只補丁既有檔案(同時修 frontmatter 跟標題層級,重複執行也安全,不會重複降級):
>
> ```bash
> npm run notion:patch-mdx                          # 預設掃 arcfra-wiki/notion
> node scripts/patch-mdx-format.js arcfra-wiki/guide # 或指定其他目錄,例如現在實際在用的 guide/
> ```

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

- 每篇文件底下預設**不會**顯示「編輯此頁」連結(`docusaurus.config.js` 裡的 `editUrl` 沒設定)。如果想開放讀者直接跳到 GitHub 編輯原始檔,把 `docs.editUrl` 那行取消註解、換成你實際的倉庫地址即可;`organizationName` / `projectName` 也記得同步換成你實際的倉庫路徑。

---

## 一鍵更新(update.sh)

把「Notion 同步 → 補丁格式 → 重新建置 Docker」包成一個指令:

```bash
cp .env.example .env     # 第一次使用: 複製範本
nano .env                # 填入你的 NOTION_TOKEN 與 NOTION_ROOT_PAGE_ID
./update.sh              # 同步 Notion;內容有變化(或容器沒在跑)才重新建置
./update.sh --force      # 同步後一律重新建置
./update.sh --no-sync    # 不抓 Notion,直接重新建置
```

`.env` 與 `.last-build-hash` 都已列在 `.gitignore` 與 `.dockerignore`,不會被推上 GitHub,也不會被打包進 Docker 映像。

### GitHub 有新版本時自動更新

`update.sh` 一開始會先執行 `git pull --ff-only`,把 GitHub 上最新的程式與文件拉下來,再同步 Notion、判斷要不要重建。因此:在 GitHub 推上新版本,下一次 cron 執行時虛擬機就會自動套用。

- 伺服器上的資料夾必須是用 `git clone` 取得的(才有 `.git` 和 `origin`)
- 只允許 fast-forward;伺服器上有未提交的修改而造成衝突時,腳本會中止並在 log 留下訊息,不會硬蓋掉
- 不想 pull 時用 `./update.sh --no-git`
- Notion 同步產生的 `notion-*.md` 與 `static/img/notion/` 已列在 `.gitignore`,只存在於伺服器上,不會進 git

### Notion 更新後自動執行(cron)

`update.sh` 每次同步後會計算內容指紋(文件 + 圖片),和上次成功建置的指紋比對:**沒變就不重建 Docker**,所以可以放心高頻率排程。腳本內建鎖,上一次還沒跑完時不會重複執行。

```bash
crontab -e
```

加入(路徑改成你的專案位置;cron 的 PATH 很精簡,要把 node、docker 所在目錄補進去):

```cron
PATH=/usr/local/bin:/usr/bin:/bin
*/30 * * * * cd /home/arcfra/arcfra-wiki && ./update.sh >> /var/log/arcfra-update.log 2>&1
```

- 看紀錄: `tail -f /var/log/arcfra-update.log`
- 若 node 是用 nvm 安裝,PATH 需包含該版本的 bin 目錄(例如 `~/.nvm/versions/node/v24.21.0/bin`)
- 執行 cron 的使用者需要能使用 docker(在 `docker` 群組內)
- 寫入 `/var/log` 若權限不足,改成 `~/arcfra-update.log`

---

## 從 Notion 遷移文件

提供兩種方式,任選其一。

### 方案 A:Notion API 自動同步(推薦,可重複執行,依 Tag 分類寫入對應資料夾)

優點是可以隨時重新執行、保持增量更新,適合長期從 Notion 作為「編輯源」、Docusaurus 作為「發布站點」的場景。**這個方案是設計給「資料庫 + Tag」用的**:根目錄必須是一個 Notion 資料庫,資料庫裡每一列靠 Tag(select / multi_select 屬性)決定要被同步到哪個分類資料夾——不再有一個什麼都收的 `notion/` 大雜燴資料夾。

1. 打開 [notion.so/my-integrations](https://www.notion.so/my-integrations),建立一個 Internal Integration,複製 `Internal Integration Token`
2. 回到 Notion,打開作為知識庫的那個資料庫 → 右上角 `···` → `Connections` → 把第 1 步建立的 integration 加進去
3. 複製該資料庫的 URL,取最後一段 32 位字元作為 `NOTION_ROOT_PAGE_ID`(去掉中間的連字符)
4. 在資料庫的 Tag 欄位裡,對想發布的每一列打上標籤(例如「安裝部署」「管理操作」),沒打標籤的列不會被同步
5. 執行:

   ```bash
   npm install
   NOTION_TOKEN=secret_xxx NOTION_ROOT_PAGE_ID=xxxxxxxxxxxx npm run notion:sync
   ```

6. 依照預設的分類對照表,「安裝部署」標籤的列會寫進 `arcfra-wiki/guide/installation-deployment/`,「管理操作」寫進 `arcfra-wiki/guide/management/`,檔案/資料夾一律加 `notion-` 前綴,跟你手寫的 `overview.md`、`_category_.json` 分開存放、不會互相覆蓋。圖片自動下載到 `static/img/notion/`
7. 之後每次重跑 `npm run notion:sync`,只會清掉並重新生成上次同步留下的 `notion-*` 內容,你手寫的頁面完全不受影響

**想自訂分類對照表**(例如再加一個「常見問題」分類):

```bash
NOTION_CATEGORY_MAP='{"安裝部署":"guide/installation-deployment","管理操作":"guide/management","常見問題":"guide/faq"}' \
NOTION_TOKEN=secret_xxx NOTION_ROOT_PAGE_ID=xxxxxxxxxxxx npm run notion:sync
```

key 是 Notion 裡的標籤文字,value 是相對於 `arcfra-wiki/` 的目的地資料夾路徑(記得該資料夾要先有 `_category_.json` 才會在側邊欄顯示分類名稱)。

**局限**:
- 根目錄一定要是資料庫,不能是一般頁面(一般頁面沒有 Tag 屬性可以判斷分類,腳本會印警告然後不同步任何內容)
- 如果一個資料庫底下手動建立了多個 data source(2025 年 9 月起 Notion 支援多資料來源資料庫),腳本預設只同步第一個,其餘的會在終端機印出警告,需要另外處理
- 資料庫裡的 relation、rollup、formula 等進階欄位不會被還原成文字內容(Notion API 本身對這些欄位的還原就有限),同步區塊等複雜結構也一樣,建議同步後人工過一遍
- 一列如果同時打了多個符合分類對照表的標籤,會採用對照表 key 順序中第一個符合的分類(不會同時寫進多個資料夾)

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

> **關於資料庫**:Notion 手動匯出時,資料庫會被匯出成一個資料夾(裡面每一筆資料是一個 `.md`)加上一個 `.csv` 檔。資料夾的部分會被本腳本正常處理成分類;多出來的 `.csv` 只是原始資料的另一份備份,不會影響網站,可以留著或自行刪除。

**局限**:同方案 A,資料庫檢視/篩選、部分嵌入內容不會被完整保留。

### 兩種方案怎麼選

| | 方案 A(API) | 方案 B(手動匯出) |
|---|---|---|
| 需要建 Notion Integration | 需要 | 不需要 |
| 能否重複執行 / 增量同步 | 可以 | 每次都要重新匯出 |
| 適合場景 | 長期用 Notion 編輯、定期發布 | 一次性搬家,以後就在 Docusaurus 裡直接改 |
