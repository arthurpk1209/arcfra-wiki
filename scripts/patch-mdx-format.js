/**
 * 一次性修補腳本: 幫「已經同步好、但格式還是舊版腳本產生的」.md 檔案做兩件事,
 * 不需要重新整個 npm run notion:sync 一次:
 *   1. 補上正確的 `mdx:\n  format: md` frontmatter(舊版腳本可能完全沒加、或誤植成
 *      頂層 `format: md`,Docusaurus 3.10 實際要求的是巢狀的 mdx.format)
 *   2. 把檔案第一個標題(文件本身的標題)之後的內文標題整體降一級,讓 Notion 常見的
 *      「全部打 Heading 1」內容能被右側「本頁目錄」收錄(不然目錄會整個是空的)
 *
 * 這支腳本是「冪等」的(重複執行安全):每個檔案處理完會在 frontmatter 加一個
 * `notion_headings_demoted: true` 標記,已經有這個標記的檔案不會被再降一次標題級數,
 * 避免同一個檔案跑兩次腳本導致標題被重複降級。
 *
 * 用法:
 *   node scripts/patch-mdx-format.js [目標目錄,預設 arcfra-wiki/notion]
 *   例如同步內容現在放在 guide/ 底下: node scripts/patch-mdx-format.js arcfra-wiki/guide
 */

const fs = require('fs');
const path = require('path');
const {demoteHeadings} = require('./lib/markdown');

const targetDir = process.argv[2] || path.join(__dirname, '..', 'arcfra-wiki', 'notion');

if (!fs.existsSync(targetDir)) {
  console.error(`找不到目錄: ${targetDir}`);
  process.exit(1);
}

function patchFile(mdPath) {
  const original = fs.readFileSync(mdPath, 'utf8');
  const notes = [];

  if (!original.startsWith('---')) {
    // 完全沒有 frontmatter:兩件事一起補
    const body = demoteHeadings(original, {skipFirstHeading: true});
    const newContent = `---\nmdx:\n  format: md\nnotion_headings_demoted: true\n---\n\n${body}`;
    fs.writeFileSync(mdPath, newContent);
    return 'added frontmatter + demoted headings';
  }

  const closingIndex = original.indexOf('\n---', 3);
  if (closingIndex === -1) return 'skipped(frontmatter 格式異常)';

  let frontmatterBody = original.slice(3, closingIndex);
  let bodyContent = original.slice(closingIndex + 4); // 跳過 '\n---'

  const hasMdxFormat =
    /^\s*mdx\s*:\s*$/m.test(frontmatterBody) || /^\s*mdx\s*:.*format/m.test(frontmatterBody);
  if (!hasMdxFormat) {
    // 舊版誤植的頂層 `format: md` 先移除,換成正確的巢狀寫法
    frontmatterBody = frontmatterBody.replace(/^\s*format\s*:\s*md\s*$/m, '').trimEnd();
    frontmatterBody += '\nmdx:\n  format: md';
    notes.push('mdx.format');
  }

  const alreadyDemoted = /^\s*notion_headings_demoted\s*:\s*true\s*$/m.test(frontmatterBody);
  if (!alreadyDemoted) {
    bodyContent = demoteHeadings(bodyContent, {skipFirstHeading: true});
    frontmatterBody += '\nnotion_headings_demoted: true';
    notes.push('headings');
  }

  if (notes.length === 0) return 'skipped(已是最新格式)';

  fs.writeFileSync(mdPath, `---${frontmatterBody}\n---${bodyContent}`);
  return `patched(${notes.join(', ')})`;
}

function walk(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += walk(p);
    } else if (entry.name.endsWith('.md')) {
      const result = patchFile(p);
      console.log(`${result.padEnd(36)} ${p}`);
      if (result.startsWith('patched') || result.startsWith('added')) count += 1;
    }
  }
  return count;
}

console.log(`掃描 ${targetDir} ...`);
const patched = walk(targetDir);
console.log(`完成 ✅  共修補 ${patched} 個檔案`);
