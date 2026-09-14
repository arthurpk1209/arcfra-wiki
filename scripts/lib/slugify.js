const pinyin = require('pinyin');

/**
 * 把任意標題(可能含中文)轉成純 ASCII 的英文 slug,用於檔案名/目錄名。
 * 頁面正文、frontmatter 裡的中文標題不受影響,只影響檔案系統命名。
 */
function toAsciiSlug(input, fallback = 'page') {
  const str = String(input || '').trim();
  if (!str) return fallback;

  const romanized = pinyin(str, {style: pinyin.STYLE_NORMAL})
    .map((arr) => arr[0])
    .join(' ');

  const slug = romanized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

module.exports = {toAsciiSlug};
