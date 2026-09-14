/**
 * Notion -> Docusaurus 自動同步腳本
 * ------------------------------------------------
 * 用法:
 *   1. 在 https://www.notion.so/my-integrations 建立一個 Internal Integration,拿到 NOTION_TOKEN
 *   2. 打開你 Notion 裡作為知識庫根目錄的那個頁面 -> 右上角 ··· -> Connections -> 把剛才建立的
 *      integration 加進去("Add connections")。Notion 的分享權限會向下級聯到所有子頁面,
 *      所以只需要在最頂層的根頁面授權一次即可。
 *   3. 複製該根頁面的 URL,取出 32 位 page id(URL 最後一段的連字符去掉即可)
 *   4. 執行:
 *        NOTION_TOKEN=secret_xxx NOTION_ROOT_PAGE_ID=xxxxxxxx npm run notion:sync
 *
 * 行為:
 *   - 根頁面下的每一個子頁面(child_page)會被拉取為一篇文件
 *   - 如果某個子頁面自己還有子頁面,會被轉成一個「分類資料夾」(帶 _category_.json),
 *     該頁面本身的正文會存成該資料夾下的 index.md,子頁面遞迴放入同一資料夾
 *   - 頁面中引用的圖片會被下載到 static/img/notion/ 並把連結改寫為本地路徑
 *
 * 注意:
 *   - 這是「覆蓋式」同步:每次執行會重新生成 arcfra-wiki/ 下由本腳本管理的內容,
 *     建議單獨用一個子目錄(預設 arcfra-wiki/notion/)存放同步內容,避免和手寫文件混在一起衝突
 *   - Notion API 對複雜 block(資料庫檢視、同步區塊等)的還原有限,建議同步後人工檢查一遍
 */

const fs = require('fs');
const path = require('path');
const {Client} = require('@notionhq/client');
const {NotionToMarkdown} = require('notion-to-md');
const fetch = require('node-fetch');
const {toAsciiSlug} = require('./lib/slugify');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ROOT_PAGE_ID = process.env.NOTION_ROOT_PAGE_ID;
const OUT_DIR = process.env.NOTION_OUT_DIR || path.join(__dirname, '..', 'arcfra-wiki', 'notion');
const IMG_DIR = path.join(__dirname, '..', 'static', 'img', 'notion');

if (!NOTION_TOKEN || !ROOT_PAGE_ID) {
  console.error('缺少環境變數: 請設定 NOTION_TOKEN 和 NOTION_ROOT_PAGE_ID');
  process.exit(1);
}

const notion = new Client({auth: NOTION_TOKEN});
const n2m = new NotionToMarkdown({notionClient: notion});

// child_page 會在正文裡單獨處理(遞迴匯出),避免在 markdown 正文裡重複出現一行連結
n2m.setCustomTransformer('child_page', async () => '');

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

async function listChildPages(blockId) {
  const children = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of res.results) {
      if (block.type === 'child_page') {
        children.push({id: block.id, title: block.child_page.title});
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return children;
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

async function processPage(pageId, dirPath, position) {
  const page = await notion.pages.retrieve({page_id: pageId});
  const title = getPageTitle(page);
  // 標題可能是中文,檔案名一律轉成拼音 ASCII slug;標題本身仍會寫進正文/frontmatter
  const slug = toAsciiSlug(title, `page-${pageId.replace(/-/g, '').slice(0, 8)}`);

  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const {parent: rawMarkdown} = n2m.toMarkdownString(mdBlocks);
  const markdown = await rewriteImages(rawMarkdown || '', slug);

  const childPages = await listChildPages(pageId);

  fs.mkdirSync(dirPath, {recursive: true});

  const frontmatter = ['---', `sidebar_position: ${position}`, '---', ''].join('\n');

  if (childPages.length === 0) {
    const filePath = path.join(dirPath, `${slug}.md`);
    fs.writeFileSync(filePath, `${frontmatter}# ${title}\n\n${markdown}\n`);
    console.log(`文件: ${filePath}`);
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
    console.log(`分類: ${subDir}`);
    let childPos = 1;
    for (const child of childPages) {
      await processPage(child.id, subDir, childPos);
      childPos += 1;
    }
  }
}

async function main() {
  console.log('開始從 Notion 同步...');
  fs.rmSync(OUT_DIR, {recursive: true, force: true});
  fs.mkdirSync(OUT_DIR, {recursive: true});

  const topLevel = await listChildPages(ROOT_PAGE_ID);
  if (topLevel.length === 0) {
    console.warn('根頁面下沒有找到任何子頁面,請確認 integration 是否已被授權存取該頁面。');
    return;
  }

  let pos = 1;
  for (const child of topLevel) {
    await processPage(child.id, OUT_DIR, pos);
    pos += 1;
  }
  console.log('同步完成 ✅  內容已寫入', OUT_DIR);
}

main().catch((err) => {
  console.error('同步失敗:', err);
  process.exit(1);
});
