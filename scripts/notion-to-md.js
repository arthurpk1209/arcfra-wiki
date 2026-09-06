/**
 * Notion -> Docusaurus 自动同步脚本
 * ------------------------------------------------
 * 用法:
 *   1. 在 https://www.notion.so/my-integrations 创建一个 Internal Integration,拿到 NOTION_TOKEN
 *   2. 打开你 Notion 里作为知识库根目录的那个页面 -> 右上角 ··· -> Connections -> 把刚才创建的
 *      integration 加进去("Add connections")。Notion 的分享权限会向下级联到所有子页面,
 *      所以只需要在最顶层的根页面授权一次即可。
 *   3. 复制该根页面的 URL,取出 32 位 page id(URL 最后一段的连字符去掉即可)
 *   4. 执行:
 *        NOTION_TOKEN=secret_xxx NOTION_ROOT_PAGE_ID=xxxxxxxx npm run notion:sync
 *
 * 行为:
 *   - 根页面下的每一个子页面(child_page)会被拉取为一篇文档
 *   - 如果某个子页面自己还有子页面,会被转成一个「分类文件夹」(带 _category_.json),
 *     该页面本身的正文会存成该文件夹下的 index.md,子页面递归放入同一文件夹
 *   - 页面中引用的图片会被下载到 static/img/notion/ 并把链接改写为本地路径
 *
 * 注意:
 *   - 这是"覆盖式"同步:每次运行会重新生成 docs/ 下由本脚本管理的内容,
 *     建议单独用一个子目录(默认 docs/notion/)存放同步内容,避免和手写文档混在一起冲突
 *   - Notion API 对复杂 block(数据库视图、同步块等)的还原有限,建议同步后人工检查一遍
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
  console.error('缺少环境变量: 请设置 NOTION_TOKEN 和 NOTION_ROOT_PAGE_ID');
  process.exit(1);
}

const notion = new Client({auth: NOTION_TOKEN});
const n2m = new NotionToMarkdown({notionClient: notion});

// child_page 会在正文里单独处理(递归导出),避免在 markdown 正文里重复出现一行链接
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
        .catch((err) => console.warn(`  图片下载失败 ${url}:`, err.message)),
    );
  }
  await Promise.all(tasks);
  return result;
}

async function processPage(pageId, dirPath, position) {
  const page = await notion.pages.retrieve({page_id: pageId});
  const title = getPageTitle(page);
  // 标题可能是中文,文件名一律转成拼音 ASCII slug;标题本身仍会写进正文/frontmatter
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
    console.log(`文档: ${filePath}`);
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
    console.log(`分类: ${subDir}`);
    let childPos = 1;
    for (const child of childPages) {
      await processPage(child.id, subDir, childPos);
      childPos += 1;
    }
  }
}

async function main() {
  console.log('开始从 Notion 同步...');
  fs.rmSync(OUT_DIR, {recursive: true, force: true});
  fs.mkdirSync(OUT_DIR, {recursive: true});

  const topLevel = await listChildPages(ROOT_PAGE_ID);
  if (topLevel.length === 0) {
    console.warn('根页面下没有找到任何子页面,请确认 integration 是否已被授权访问该页面。');
    return;
  }

  let pos = 1;
  for (const child of topLevel) {
    await processPage(child.id, OUT_DIR, pos);
    pos += 1;
  }
  console.log('同步完成 ✅  内容已写入', OUT_DIR);
}

main().catch((err) => {
  console.error('同步失败:', err);
  process.exit(1);
});
