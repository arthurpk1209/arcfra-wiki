/**
 * 判斷一行文字是不是 Markdown 標題行(# ~ ######),回傳 {hashes, rest} 或 null。
 */
function parseHeadingLine(line) {
  const m = line.match(/^(#{1,6})(\s+.*)$/);
  if (!m) return null;
  return {hashes: m[1], rest: m[2]};
}

/**
 * 把 markdown 內文裡的標題層級整體往下降一級(# -> ##,最深到 ###### 為止)。
 *
 * 為什麼需要這個:Notion 很多人習慣所有段落標題都打「Heading 1」,轉成 Markdown 後
 * 全部變成 `#`。如果文件本身的標題(檔案標題)也是 `#`,內文段落標題會跟文件標題
 * 撞在同一個層級,而且會落在 Docusaurus 右側「本頁目錄」預設只顯示 H2~H3 的範圍之外,
 * 導致目錄整個是空的。把內文標題整體降一級,可以讓段落標題自然落進 H2~H3(或更深)。
 *
 * skipFirstHeading: 設成 true 時,文件裡第一個標題(通常就是文件本身的標題)會被跳過、
 * 不降級,只降它後面的內容標題。用在「標題和正文寫在同一個檔案裡」的情況
 * (例如 Notion 官方匯出的 .md,檔案第一行的 # 就是頁面標題本身)。
 *
 * 會跳過 fenced code block(``` 或 ~~~ 包起來的區塊)裡的內容,避免誤判程式碼裡
 * 剛好用 # 開頭的註解(Python/YAML/Shell 等)。
 */
function demoteHeadings(markdown, {skipFirstHeading = false} = {}) {
  const lines = markdown.split('\n');
  let inFence = false;
  let skippedFirst = !skipFirstHeading;

  return lines
    .map((line) => {
      if (/^(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      const heading = parseHeadingLine(line);
      if (!heading) return line;

      if (!skippedFirst) {
        skippedFirst = true;
        return line; // 保留第一個標題不降級(通常是文件標題本身)
      }
      if (heading.hashes.length >= 6) return line; // 已經是最深的 H6,不能再降
      return `#${heading.hashes}${heading.rest}`;
    })
    .join('\n');
}

module.exports = {demoteHeadings};
