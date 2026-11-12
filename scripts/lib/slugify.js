const pinyinModule = require('pinyin');

// pinyin v4 是 TypeScript 重寫、同時輸出 ESM/CJS,在純 Node `require()` 下(沒有 babel/ts
// 的 esModuleInterop 幫忙)拿到的可能是 `{ default: fn, ... }` 而不是函式本身,
// 這裡做防呆,不論裝到哪個版本 / 哪種模組形態都能正確取到可呼叫的函式。
const pinyinFn =
  typeof pinyinModule === 'function'
    ? pinyinModule
    : pinyinModule.default || pinyinModule.pinyin || pinyinModule;

if (typeof pinyinFn !== 'function') {
  throw new Error(
    '無法從 "pinyin" 套件取得可呼叫的轉換函式,請確認 pinyin 套件已正確安裝(npm ls pinyin)。',
  );
}

/**
 * 把任意標題(可能含中文)轉成純 ASCII 的英文 slug,用於檔案名/目錄名。
 * 頁面正文、frontmatter 裡的中文標題不受影響,只影響檔案系統命名。
 */
function toAsciiSlug(input, fallback = 'page') {
  const str = String(input || '').trim();
  if (!str) return fallback;

  // 'normal' 是字串型式的風格值(v4 起支援,v2/v3 用 pinyin.STYLE_NORMAL 常數,
  // 這裡用字串是為了避免依賴常數可能取不到的問題),代表「不帶聲調的拼音」。
  const romanized = pinyinFn(str, {style: 'normal'})
    .map((arr) => arr[0])
    .join(' ');

  const slug = romanized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

module.exports = {toAsciiSlug};
