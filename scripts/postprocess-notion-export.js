/**
 * 備用方案: 處理 Notion 自帶的「Export as Markdown & CSV」匯出結果
 * ------------------------------------------------------------------
 * 適用場景: 不想建立 Notion Integration / API 權限比較麻煩時,
 * 直接在 Notion 網頁版用 "···" -> Export -> Markdown & CSV
 * (記得勾選 "Include subpages" 和 "Include content")匯出一個 zip。
 *
 * Notion 匯出的檔案/資料夾名會帶一串 32 位十六進位 ID 後綴,例如:
 *   安裝說明 3f9a1b2c4d5e6f7a8b9c0d1e2f3a4b5c.md
 * 本腳本會:
 *   1. 遞迴去掉所有檔案 / 資料夾名裡的這串 ID
 *   2. 同步修正 Markdown 內的相對連結和圖片路徑,使其在改名後依然有效
 *   3. 對「同名資料夾」結構(Notion: Section.md + Section/ 資料夾)自動生成
 *      Docusaurus 的 _category_.json,並把 Section.md 變成 Section/index.md
 *
 * 用法:
 *   1. 解壓 Notion 匯出的 zip 到專案外的某個暫存目錄,例如 ~/Downloads/notion-export
 *   2. NOTION_EXPORT_DIR=~/Downloads/notion-export npm run notion:clean
 *   3. 處理結果會寫入 arcfra-wiki/notion/,檢查無誤後按需移動 / 合併到 arcfra-wiki/ 下的合適位置
 */

const fs = require('fs');
const path = require('path');
const {toAsciiSlug} = require('./lib/slugify');

const SRC = process.env.NOTION_EXPORT_DIR;
const DEST = process.env.NOTION_OUT_DIR || path.join(__dirname, '..', 'arcfra-wiki', 'notion');

if (!SRC || !fs.existsSync(SRC)) {
  console.error('請設定 NOTION_EXPORT_DIR 指向解壓後的 Notion 匯出資料夾');
  process.exit(1);
}

const HEX_ID = /[ _-]?[0-9a-f]{32}$/i;

/** 去掉 Notion 附加的 32 位 ID 後綴,並把(可能是中文的)標題轉成拼音 ASCII slug */
function cleanName(name, usedNames) {
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  const originalTitle = base.replace(HEX_ID, '').trim();
  const slug = toAsciiSlug(originalTitle, 'untitled');

  // 避免兩個不同的中文標題轉成拼音後重名
  let finalSlug = slug;
  let n = 2;
  while (usedNames.has(finalSlug)) {
    finalSlug = `${slug}-${n}`;
    n += 1;
  }
  usedNames.add(finalSlug);

  return {newName: `${finalSlug}${ext}`, originalTitle};
}

/**
 * 第一步: 複製整棵樹到 DEST,檔案/資料夾名轉成英文 slug,
 * 同時記錄 舊名->新名(用於修正連結) 和 新名->原始標題(用於分類標籤)。
 */
function copyAndRename(srcDir, destDir, nameMap, titleMap) {
  fs.mkdirSync(destDir, {recursive: true});
  const usedNames = new Set();
  for (const entry of fs.readdirSync(srcDir, {withFileTypes: true})) {
    const oldPath = path.join(srcDir, entry.name);
    const {newName, originalTitle} = cleanName(entry.name, usedNames);
    const newPath = path.join(destDir, newName);
    nameMap.set(entry.name, newName);
    titleMap.set(newName, originalTitle);

    if (entry.isDirectory()) {
      copyAndRename(oldPath, newPath, nameMap, titleMap);
    } else {
      fs.copyFileSync(oldPath, newPath);
    }
  }
}

/** 第二步: 修正 markdown 裡引用舊檔案名的連結 / 圖片路徑 */
function fixLinks(dir, nameMap) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixLinks(p, nameMap);
    } else if (entry.name.endsWith('.md')) {
      let content = fs.readFileSync(p, 'utf8');
      for (const [oldName, newName] of nameMap.entries()) {
        if (oldName === newName) continue;
        const oldEncoded = encodeURIComponent(oldName).replace(/%2F/g, '/');
        const newEncoded = encodeURIComponent(newName).replace(/%2F/g, '/');
        content = content.split(oldEncoded).join(newEncoded);
        content = content.split(oldName).join(newName);
      }
      fs.writeFileSync(p, content);
    }
  }
}

/** 第三步: 把 "Section.md + Section/" 這種同名結構規整成 Docusaurus 分類 */
function normalizeCategories(dir, titleMap, position = 1) {
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  const dirNames = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  let pos = position;

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const base = entry.name.slice(0, -3);
      const mdPath = path.join(dir, entry.name);
      const label = titleMap.get(entry.name) || base;

      if (dirNames.has(base)) {
        // 同名資料夾存在 -> 該 md 是這個分類的落地頁
        const folder = path.join(dir, base);
        fs.writeFileSync(
          path.join(folder, '_category_.json'),
          JSON.stringify({label, position: pos}, null, 2),
        );
        fs.renameSync(mdPath, path.join(folder, 'index.md'));
      } else {
        addFrontmatter(mdPath, pos);
      }
      pos += 1;
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      normalizeCategories(path.join(dir, entry.name), titleMap, 1);
    }
  }
}

function addFrontmatter(mdPath, position) {
  const content = fs.readFileSync(mdPath, 'utf8');
  if (content.startsWith('---')) return; // 已經有 frontmatter
  fs.writeFileSync(mdPath, `---\nsidebar_position: ${position}\n---\n\n${content}`);
}

function main() {
  fs.rmSync(DEST, {recursive: true, force: true});
  const nameMap = new Map();
  const titleMap = new Map();

  console.log('第 1 步: 複製檔案,檔案名轉成英文 slug...');
  copyAndRename(SRC, DEST, nameMap, titleMap);

  console.log('第 2 步: 修正內部連結...');
  fixLinks(DEST, nameMap);

  console.log('第 3 步: 生成 Docusaurus 分類結構(分類標籤保留原始中文標題)...');
  normalizeCategories(DEST, titleMap);

  console.log('處理完成 ✅  結果在', DEST);
  console.log('建議人工檢查一遍圖片、表格、以及 Notion 資料庫(轉出來是普通表格,無法保留檢視/篩選)。');
}

main();
