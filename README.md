# Arcfra知识库

基于 [Docusaurus](https://docusaurus.io/) 搭建的知识库,风格参考 `kvm.6p7p.com`:左侧文档导航、中间正文、右侧本页目录、全文搜索、暗色模式。

## 目录结构

```
arcfra-wiki/
├── arcfra-wiki/            # 所有知识库内容(Markdown),文件夹结构即左侧导航结构
│   ├── intro.md
│   └── getting-started/
│       ├── _category_.json
│       └── installation.md
├── src/
│   ├── css/custom.css      # 主题配色(蓝色系,贴近参考站点)
│   └── pages/about.js      # "关于我们" 独立页面
├── scripts/
│   ├── lib/slugify.js                # 中文标题 -> 拼音英文 slug 的共用小工具
│   ├── notion-to-md.js               # 方案 A: Notion API 自动同步
│   └── postprocess-notion-export.js  # 方案 B: 清洗 Notion 手动导出的 zip
├── .github/workflows/
│   ├── build.yml            # 每次 push/PR 自动跑一次构建,构建失败会在 GitHub 上标红
│   └── docker-publish.yml   # push 到 main 时自动把镜像发布到 GitHub Container Registry
├── docusaurus.config.js
├── sidebars.js
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

> **命名规则**:所有文件夹 / 文件名一律用英文(拼音或语义化英文单词),内容本身(标题、正文)可以照常用中文。这样在 Git / URL / 命令行下都不会有编码或跨平台踩坑问题。上面两个迁移脚本都已经处理成「文件名转拼音,正文内容保留中文原文」。

## 本地开发(不用 Docker)

```bash
npm install
npm run start        # http://localhost:3000,改文档热更新
```

## 用 Docker 部署(生产)

```bash
docker compose up -d --build
```

访问 `http://<服务器IP>:8080` 即可。容器内部是「Node 构建静态文件 → Nginx 提供服务」的两段式镜像,运行时不依赖 Node,体积小、启动快。

如果只想改端口,编辑 `docker-compose.yml` 里的 `ports: - "8080:80"`。

### 用 Docker 做开发预览(带热更新)

```bash
docker compose --profile dev up arcfra-wiki-dev
```

访问 `http://localhost:3000`。

## 新增 / 编辑文档

在 `arcfra-wiki/` 下新建 `.md` 文件或子文件夹即可(**文件夹/文件名请用英文**,标题和正文照常写中文),左侧导航自动生成,无需手动改配置。子文件夹里放一个 `_category_.json` 可以自定义分类标题和排序:

```json
{
  "label": "运维",
  "position": 3
}
```

---

## 用 Git / GitHub 管理与备份

项目已经初始化好本地 git 仓库(第一次 commit 已包含在压缩包里)。接下来只需要把它接到你的 GitHub 仓库:

1. 在 GitHub 上新建一个**空**仓库(不要勾选自动生成 README/.gitignore,避免冲突),例如 `arcfra/arcfra-wiki`
2. 在项目目录下执行:

   ```bash
   git remote add origin git@github.com:<你的账号>/arcfra-wiki.git
   git branch -M main
   git push -u origin main
   ```

3. 之后每次改完文档,正常走 git 流程即可:

   ```bash
   git add .
   git commit -m "docs: 更新xxx说明"
   git push
   ```

   这样 GitHub 上就有完整的历史版本记录,相当于自动备份 + 可回溯的修改历史。

### 已经内建的两个 GitHub Actions

- **`.github/workflows/build.yml`**:每次 `push` / `PR` 自动 `npm install && npm run build`,构建失败会直接在 GitHub 上标红提醒,防止把改坏的文档合并进去
- **`.github/workflows/docker-publish.yml`**:每次 push 到 `main` 会自动把 Docker 镜像构建好并发布到 GitHub Container Registry(`ghcr.io/<你的账号>/arcfra-wiki`),之后在服务器上就可以直接:

  ```bash
  docker pull ghcr.io/<你的账号>/arcfra-wiki:latest
  docker run -d -p 8080:80 ghcr.io/<你的账号>/arcfra-wiki:latest
  ```

  不需要在服务器上重新 `npm install` / `npm run build`,更新只需要重新 `pull` + 重启容器。

  > 注意:GHCR 发布的镜像默认是私有的,如果服务器要 `docker pull`,需要先在服务器上 `docker login ghcr.io`(用你的 GitHub 用户名 + [Personal Access Token](https://github.com/settings/tokens)),或者去仓库的 Packages 设置里把镜像改成 public。

- 如果想让 `editUrl`(文档页面右上角「编辑此页」跳转链接)生效,记得把 `docusaurus.config.js` 里的 `https://github.com/arcfra/arcfra-wiki` 换成你实际的仓库地址,`organizationName` / `projectName` 同理。

---

## 从 Notion 迁移文档

提供两种方式,任选其一。

### 方案 A:Notion API 自动同步(推荐,可重复执行)

优点是可以随时重新运行、保持增量更新,适合长期从 Notion 作为「编辑源」、Docusaurus 作为「发布站点」的场景。

1. 打开 [notion.so/my-integrations](https://www.notion.so/my-integrations),创建一个 Internal Integration,复制 `Internal Integration Token`
2. 回到 Notion,打开作为知识库根目录的那个页面 → 右上角 `···` → `Connections` → 把第 1 步创建的 integration 加进去。Notion 的授权会**级联到所有子页面**,所以只需要在最顶层根页面操作一次
3. 复制该根页面的 URL,取最后一段 32 位字符作为 `NOTION_ROOT_PAGE_ID`(去掉中间的横杠)
4. 执行:

   ```bash
   npm install
   NOTION_TOKEN=secret_xxx NOTION_ROOT_PAGE_ID=xxxxxxxxxxxx npm run notion:sync
   ```

5. 内容会写入 `docs/notion/`,页面层级自动转换成文件夹分类,图片自动下载到 `static/img/notion/`
6. 检查一遍效果后,把 `docs/notion/` 挪到你想要的位置,或者直接保留在这个子目录下即可,侧边栏会自动识别

**局限**:Notion 数据库(带筛选/视图的表)、同步块等复杂结构还原有限,建议同步后人工过一遍。

### 方案 B:手动导出 + 清洗脚本(不需要建 Integration,一次性迁移更简单)

1. 在 Notion 网页版,打开根页面 → `···` → `Export` → 格式选 `Markdown & CSV`,勾选 `Include subpages`,导出 zip
2. 解压到项目**外面**的任意目录,比如 `~/Downloads/notion-export`
3. 执行:

   ```bash
   NOTION_EXPORT_DIR=~/Downloads/notion-export npm run notion:clean
   ```

4. 脚本会自动:
   - 去掉 Notion 导出文件/文件夹名里那串 32 位 ID 后缀
   - 修正因为改名而失效的内部链接、图片路径
   - 把 `章节.md` + `章节/` 这种同名结构规整成 Docusaurus 的分类(自动生成 `_category_.json`,原 `章节.md` 变成 `章节/index.md`)
5. 结果在 `docs/notion/`,检查无误后按需搬到 `docs/` 下合适的位置

**局限**:同方案 A,数据库视图/筛选、部分嵌入内容不会被完整保留。

### 两种方案怎么选

| | 方案 A(API) | 方案 B(手动导出) |
|---|---|---|
| 需要建 Notion Integration | 需要 | 不需要 |
| 能否重复执行 / 增量同步 | 可以 | 每次都要重新导出 |
| 适合场景 | 长期用 Notion 编辑、定期发布 | 一次性搬家,以后就在 Docusaurus 里直接改 |
