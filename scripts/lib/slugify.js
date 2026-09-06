const pinyin = require('pinyin');

/**
 * 把任意标题(可能含中文)转成纯 ASCII 的英文 slug,用于文件名/目录名。
 * 页面正文、frontmatter 里的中文标题不受影响,只影响文件系统命名。
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
