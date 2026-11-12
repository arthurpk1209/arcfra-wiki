/**
 * Notion -> Docusaurus 自動同步腳本(依 Tag 分類寫入對應資料夾)
 * ------------------------------------------------
 * 用法:
 *   1. 在 https://www.notion.so/my-integrations 建立一個 Internal Integration,拿到 NOTION_TOKEN
 *   2. 打開你 Notion 裡作為知識庫根目錄的那個資料庫 -> 右上角 ··· -> Connections -> 把剛才建立的
 *      integration 加進去("Add connections")
 *   3. 複製該資料庫的 URL,取出 32 位 id(URL 最後一段的連字符去掉即可)
 *   4. 在資料庫的 Tag(select / multi_select)欄位裡,對想發布的每一列打上對應標籤,
 *      標籤字串要對得上下面 CATEGORY_TAG_MAP 的 key(預設是「安裝部署」「管理操作」)
 *   5. 執行:
 *        NOTION_TOKEN=secret_xxx NOTION_ROOT_PAGE_ID=xxxxxxxx npm run notion:sync
 *
 * 行為(依 Tag 分類寫入,不再有單一的 notion/ 大雜燴資料夾):
 *   - 每一筆資料庫的列(row),依它的 Tag 屬性比對 CATEGORY_TAG_MAP,决定要寫進哪個
 *     Docusaurus 分類資料夾。例如標籤是「安裝部署」-> 寫進 arcfra-wiki/guide/installation-deployment/
 *   - 沒有標到任何已知分類標籤的列,會被略過、不同步(終端機會印出略過筆數),
 *     不會再有一個什麼標籤都收的預設資料夾
 *   - 同步進去的檔案 / 資料夾一律加 `notion-` 前綴(例如 `notion-deploy-guide.md`),
 *     跟你手寫的 `overview.md`、`_category_.json` 分開,不會互相覆蓋。每次重跑只會清掉
 *     上次同步留下的 `notion-*`,你手寫的內容完全不受影響
 *   - 如果一列自己底下還有子頁面,會在同一個目的地資料夾裡生成 `notion-<slug>/` 子資料夾
 *   - 頁面中引用的圖片會被下載到 static/img/notion/ 並把連結改寫為本地路徑
 *   - NOTION_ROOT_PAGE_ID 也可以是一般頁面(不是資料庫)。但一般頁面沒有 Tag 屬性可以分類,
 *     所以這種情況下腳本只會印出警告、不會同步任何內容——這個腳本設計上就是給「資料庫 + Tag」
 *     這種用法用的
 *
 * 分類對照表(NOTION_CATEGORY_MAP):
 *   - 預設如下,可以用 NOTION_CATEGORY_MAP 環境變數傳入 JSON 字串覆寫,例如:
 *       NOTION_CATEGORY_MAP='{"安裝部署":"guide/installation-deployment","管理操作":"guide/management","常見問題":"guide/faq"}'
 *   - key 是 Notion 裡的標籤文字(大小寫不分、比對方式是「選項名稱包含這個字」),
 *     value 是相對於 arcfra-wiki/ 的目的地資料夾路徑
 *   - 一列如果同時有多個符合的標籤,會依下面表格 key 的順序,採用第一個符合的分類
 *
 * 注意:
 *   - Notion 在 2025-09-03 版 API 引入「data source」概念,一個資料庫底下可能有多個 data
 *     source(表格/檢視變體)。本腳本預設只同步第一個 data source,如果你的資料庫有手動建立
 *     多個 data source,執行時終端機會印出警告,其餘的需要另外處理。
 *   - Notion API 對複雜 block(同步區塊、公式/rollup 等)的還原有限,建議同步後人工檢查一遍
 *   - 所有生成的文件 frontmatter 都帶巢狀的 `mdx: { format: md }`,強制 Docusaurus 用純 Markdown
 *     (而不是 MDX)解析。原因是 Notion 內容常出現 `<UEFI>`、`<username>` 這類尖括號文字,MDX 會
 *     把它們誤判成沒閉合的 JSX 標籤而建置失敗;純 Markdown 模式不會有這個問題。
 *   - 內文標題會整體降一級(Notion 的 Heading 1 -> Markdown ##,而不是 #),避免跟文件本身的
 *     `# {title}` 撞層級,也讓標題落在 Docusaurus 右側「本頁目錄」預設顯示的 H2~H3 範圍內,
 *     不然很多 Notion 頁面(習慣所有段落都打 Heading 1)同步後右側目錄會整個是空的。
 */

const fs = require('fs');
const path = require('path');
const {Client} = require('@notionhq/client');
const {NotionToMarkdown} = require('notion-to-md');
const fetchModule = require('node-fetch');
// node-fetch v3 是純 ESM 套件。Node.js 較新版本(如 v22+/v24)支援直接
// require() ESM 模組,但拿到的是「模組命名空間物件」而不是函式本身,
// 實際可呼叫的函式在 .default 底下——這裡做防呆,兩種情況都能正確取到函式。
// (跟先前 pinyin 套件遇到的 "xxx is not a function" 是同一類問題)
const fetch = typeof fetchModule === 'function' ? fetchModule : fetchModule.default;
const {toAsciiSlug} = require('./lib/slugify');
const {demoteHeadings} = require('./lib/markdown');

if (typeof fetch !== 'function') {
  throw new Error(
    '無法從 "node-fetch" 套件取得可呼叫的函式,請確認 node-fetch 套件已正確安裝(npm ls node-fetch)。',
  );
}

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ROOT_PAGE_ID = process.env.NOTION_ROOT_PAGE_ID;
const CONTENT_ROOT = path.join(__dirname, '..', 'arcfra-wiki');
const IMG_DIR = path.join(__dirname, '..', 'static', 'img', 'notion');
const GENERATED_PREFIX = 'notion-';

const DEFAULT_CATEGORY_MAP = {
  安裝部署: 'guide/installation-deployment',
  管理操作: 'guide/management',
};
let CATEGORY_MAP = DEFAULT_CATEGORY_MAP;
if (process.env.NOTION_CATEGORY_MAP) {
  try {
    CATEGORY_MAP = JSON.parse(process.env.NOTION_CATEGORY_MAP);
  } catch (err) {
    console.error('NOTION_CATEGORY_MAP 不是合法的 JSON:', err.message);
    process.exit(1);
  }
}

if (!NOTION_TOKEN || !ROOT_PAGE_ID) {
  console.error('缺少環境變數: 請設定 NOTION_TOKEN 和 NOTION_ROOT_PAGE_ID');
  process.exit(1);
}

const notion = new Client({auth: NOTION_TOKEN});
const n2m = new NotionToMarkdown({notionClient: notion});

// child_page / child_database 會在正文裡單獨處理(遞迴匯出),避免在 markdown 正文裡重複出現一行連結
n2m.setCustomTransformer('child_page', async () => '');
n2m.setCustomTransformer('child_database', async () => '');

function getPageTitle(page) {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join('');
    }
  }
  return 'Untitled';
}

/**
 * 依 CATEGORY_MAP 找出一個(資料庫列)頁面應該歸類到哪個資料夾。
 * 掃描所有 select / multi_select 屬性,比對選項名稱是否包含對照表裡的某個 key。
 * 回傳對照表 key 的順序中第一個符合的目的地路徑,都沒符合則回傳 null(代表略過此列)。
 */
function matchCategory(page, categoryMap) {
  const props = page.properties || {};
  const optionNames = [];
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'multi_select') {
      optionNames.push(...prop.multi_select.map((opt) => opt.name));
    } else if (prop.type === 'select' && prop.select) {
      optionNames.push(prop.select.name);
    }
  }
  const lowerOptionNames = optionNames.map((n) => n.toLowerCase());

  for (const tag of Object.keys(categoryMap)) {
    const needle = tag.trim().toLowerCase();
    if (lowerOptionNames.some((n) => n.includes(needle))) {
      return categoryMap[tag];
    }
  }
  return null;
}

/** 列出某個 block(頁面)底下直接的子頁面與子資料庫 */
async function listChildren(blockId) {
  const pages = [];
  const databases = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of res.results) {
      if (block.type === 'child_page') {
        pages.push({id: block.id, title: block.child_page.title});
      } else if (block.type === 'child_database') {
        databases.push({id: block.id, title: block.child_database.title});
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return {pages, databases};
}

/** 取得資料庫底下的 data source id(2025-09-03 版 API 起,查詢資料要透過 data source) */
async function getPrimaryDataSourceId(databaseId) {
  const db = await notion.databases.retrieve({database_id: databaseId});
  const sources = db.data_sources || [];
  if (sources.length === 0) {
    throw new Error(`資料庫 ${databaseId} 找不到任何 data source`);
  }
  if (sources.length > 1) {
    console.warn(
      `⚠️  資料庫 ${databaseId} 有 ${sources.length} 個 data source,` +
        `本腳本預設只同步第一個「${sources[0].name}」,其餘的需要手動處理`,
    );
  }
  return sources[0].id;
}

/** 查詢 data source 底下所有資料列,並依 Tag 分類、分組到各自的目的地資料夾 */
async function queryAndGroupByCategory(dataSourceId, categoryMap) {
  const groups = {}; // { relativeDestPath: [{id, title}] }
  let skipped = 0;
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const row of res.results) {
      const dest = matchCategory(row, categoryMap);
      if (!dest) {
        skipped += 1;
        continue;
      }
      if (!groups[dest]) groups[dest] = [];
      groups[dest].push({id: row.id, title: getPageTitle(row)});
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  if (skipped > 0) {
    console.log(`(共 ${skipped} 筆資料列沒有符合任何分類標籤,已略過)`);
  }
  return groups;
}

async function downloadImage(url, destDir, filename) {
  fs.mkdirSync(destDir, {recursive: true});
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = await res.buffer();
  const filePath = path.join(destDir, filename);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

async function rewriteImages(markdown, slug) {
  const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  let result = markdown;
  let match;
  let i = 0;
  const tasks = [];
  while ((match = imageRegex.exec(markdown)) !== null) {
    const [full, alt, url] = match;
    i += 1;
    const ext = (url.split('?')[0].split('.').pop() || 'png').slice(0, 4);
    const filename = `${slug}-${i}.${ext}`;
    tasks.push(
      downloadImage(url, IMG_DIR, filename)
        .then((filePath) => {
          if (filePath) {
            const localPath = `/img/notion/${filename}`;
            result = result.split(full).join(`![${alt}](${localPath})`);
          }
        })
        .catch((err) => console.warn(`  圖片下載失敗 ${url}:`, err.message)),
    );
  }
  await Promise.all(tasks);
  return result;
}

/** 清掉目的地資料夾裡上一次同步留下的 `notion-*` 檔案/子資料夾,手寫的內容不受影響 */
function cleanPreviousSync(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, {withFileTypes: true})) {
    if (entry.name.startsWith(GENERATED_PREFIX)) {
      fs.rmSync(path.join(dirPath, entry.name), {recursive: true, force: true});
    }
  }
}

async function processPage(pageId, dirPath, position) {
  const page = await notion.pages.retrieve({page_id: pageId});
  const title = getPageTitle(page);
  // 標題可能是中文,檔案名一律轉成拼音 ASCII slug,並加上 notion- 前綴跟手寫檔案區分
  const rawSlug = toAsciiSlug(title, `page-${pageId.replace(/-/g, '').slice(0, 8)}`);
  const slug = `${GENERATED_PREFIX}${rawSlug}`;

  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const {parent: rawMarkdown} = n2m.toMarkdownString(mdBlocks);
  // 內文標題整體降一級,避免跟文件本身的 `# {title}` 撞層級、也避免全部落在
  // Docusaurus 右側「本頁目錄」預設不顯示的 H1 層級(詳見 lib/markdown.js 的說明)
  const demoted = demoteHeadings(rawMarkdown || '');
  const markdown = await rewriteImages(demoted, slug);

  const {pages: childPages, databases: childDatabases} = await listChildren(pageId);

  fs.mkdirSync(dirPath, {recursive: true});

  // mdx.format: md -> 強制用純 Markdown(CommonMark)解析,避免內文裡的 <UEFI>、<username>
  // 這類尖括號文字被 MDX 誤判成沒閉合的 JSX 標籤(Docusaurus 3.10 起前置資料的正確欄位是
  // 巢狀的 `mdx.format`,不是頂層 `format`)
  const frontmatter = [
    '---',
    `sidebar_position: ${position}`,
    'mdx:',
    '  format: md',
    'notion_headings_demoted: true',
    '---',
    '',
  ].join('\n');

  if (childPages.length === 0 && childDatabases.length === 0) {
    const filePath = path.join(dirPath, `${slug}.md`);
    fs.writeFileSync(filePath, `${frontmatter}# ${title}\n\n${markdown}\n`);
    console.log(`  文件: ${filePath}`);
  } else {
    const subDir = path.join(dirPath, slug);
    fs.mkdirSync(subDir, {recursive: true});
    fs.writeFileSync(
      path.join(subDir, '_category_.json'),
      JSON.stringify({label: title, position}, null, 2),
    );
    fs.writeFileSync(
      path.join(subDir, 'index.md'),
      `${frontmatter}# ${title}\n\n${markdown}\n`,
    );
    console.log(`  分類: ${subDir}`);

    let childPos = 1;
    for (const child of childPages) {
      await processPage(child.id, subDir, childPos);
      childPos += 1;
    }
    // 子資料庫沿用同一顆分類對照表,遞迴時一樣依 Tag 分流(理論上少見,但保留支援)
    for (const db of childDatabases) {
      const dataSourceId = await getPrimaryDataSourceId(db.id);
      const groups = await queryAndGroupByCategory(dataSourceId, CATEGORY_MAP);
      let pos = childPos;
      for (const rows of Object.values(groups)) {
        for (const row of rows) {
          await processPage(row.id, subDir, pos);
          pos += 1;
        }
      }
      childPos = pos;
    }
  }
}

async function main() {
  console.log('開始從 Notion 同步...');
  console.log('分類對照表:', CATEGORY_MAP);

  let rootIsDatabase = false;
  try {
    await notion.pages.retrieve({page_id: ROOT_PAGE_ID});
  } catch (err) {
    rootIsDatabase = true;
  }

  if (!rootIsDatabase) {
    console.warn(
      '⚠️  根 ID 是一般頁面,不是資料庫。這支腳本是設計給「資料庫 + Tag 分類」用的,' +
        '一般頁面沒有 Tag 屬性可以判斷分類,所以不會同步任何內容。' +
        '請改用資料庫作為 NOTION_ROOT_PAGE_ID。',
    );
    return;
  }

  const dataSourceId = await getPrimaryDataSourceId(ROOT_PAGE_ID);
  const groups = await queryAndGroupByCategory(dataSourceId, CATEGORY_MAP);

  const destPaths = Object.keys(groups);
  if (destPaths.length === 0) {
    console.warn('沒有任何資料列符合分類對照表裡的標籤,沒有內容可以同步。');
    return;
  }

  for (const dest of destPaths) {
    const targetDir = path.join(CONTENT_ROOT, dest);
    console.log(`\n分類「${dest}」(共 ${groups[dest].length} 筆):`);
    cleanPreviousSync(targetDir);
    fs.mkdirSync(targetDir, {recursive: true});

    // 從 100 開始編號,跟手寫頁面常用的 1~9 錯開,避免排序衝突
    let pos = 100;
    for (const row of groups[dest]) {
      await processPage(row.id, targetDir, pos);
      pos += 1;
    }
  }

  console.log('\n同步完成 ✅');
}

main().catch((err) => {
  console.error('同步失敗:', err);
  process.exit(1);
});
