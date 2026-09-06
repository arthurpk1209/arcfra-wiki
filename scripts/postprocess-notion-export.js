/**
 * 备用方案: 处理 Notion 自带的「Export as Markdown & CSV」导出结果
 * ------------------------------------------------------------------
 * 适用场景: 不想创建 Notion Integration / API 权限比较麻烦时,
 * 直接在 Notion 网页版用 “···” -> Export -> Markdown & CSV
 * (记得勾选 "Include subpages" 和 "Include content")导出一个 zip。
 *
 * Notion 导出的文件/文件夹名会带一串 32 位十六进制 ID 后缀,例如:
 *   安装说明 3f9a1b2c4d5e6f7a8b9c0d1e2f3a4b5c.md
 * 本脚本会:
 *   1. 递归去掉所有文件 / 文件夹名里的这串 ID
 *   2. 同步修正 Markdown 内的相对链接和图片路径,使其在改名后依然有效
 *   3. 对「同名文件夹」结构(Notion: Section.md + Section/ 文件夹)自动生成
 *      Docusaurus 的 _category_.json,并把 Section.md 变成 Section/index.md
 *
 * 用法:
 *   1. 解压 Notion 导出的 zip 到项目外的某个临时目录,例如 ~/Downloads/notion-export
 *   2. NOTION_EXPORT_DIR=~/Downloads/notion-export npm run notion:clean
 *   3. 处理结果会写入 docs/notion/,检查无误后按需移动 / 合并到 docs/ 下的合适位置
 */

const fs = require('fs');
const path = require('path');
const {toAsciiSlug} = require('./lib/slugify');

const SRC = process.env.NOTION_EXPORT_DIR;
const DEST = process.env.NOTION_OUT_DIR || path.join(__dirname, '..', 'arcfra-wiki', 'notion');

if (!SRC || !fs.existsSync(SRC)) {
  console.error('请设置 NOTION_EXPORT_DIR 指向解压后的 Notion 导出文件夹');
  process.exit(1);
}

const HEX_ID = /[ _-]?[0-9a-f]{32}$/i;

/** 去掉 Notion 附加的 32 位 ID 后缀,并把(可能是中文的)标题转成拼音 ASCII slug */
function cleanName(name, usedNames) {
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  const originalTitle = base.replace(HEX_ID, '').trim();
  const slug = toAsciiSlug(originalTitle, 'untitled');

  // 避免两个不同的中文标题转成拼音后重名
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
 * 第一步: 复制整棵树到 DEST,文件/文件夹名转成英文 slug,
 * 同时记录 旧名->新名(用于修正链接) 和 新名->原始标题(用于分类标签)。
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

/** 第二步: 修正 markdown 里引用旧文件名的链接 / 图片路径 */
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

/** 第三步: 把 "Section.md + Section/" 这种同名结构规整成 Docusaurus 分类 */
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
        // 同名文件夹存在 -> 该 md 是这个分类的落地页
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
  if (content.startsWith('---')) return; // 已经有 frontmatter
  fs.writeFileSync(mdPath, `---\nsidebar_position: ${position}\n---\n\n${content}`);
}

function main() {
  fs.rmSync(DEST, {recursive: true, force: true});
  const nameMap = new Map();
  const titleMap = new Map();

  console.log('第 1 步: 复制文件,文件名转成英文 slug...');
  copyAndRename(SRC, DEST, nameMap, titleMap);

  console.log('第 2 步: 修正内部链接...');
  fixLinks(DEST, nameMap);

  console.log('第 3 步: 生成 Docusaurus 分类结构(分类标签保留原始中文标题)...');
  normalizeCategories(DEST, titleMap);

  console.log('处理完成 ✅  结果在', DEST);
  console.log('建议人工检查一遍图片、表格、以及 Notion 数据库(转出来是普通表格,无法保留视图/筛选)。');
}

main();
