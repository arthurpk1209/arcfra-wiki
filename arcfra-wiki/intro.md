---
slug: /
sidebar_position: 1
---

# Arcfra知识库

欢迎使用 Arcfra 知识库。这是一个基于 [Docusaurus](https://docusaurus.io/) 搭建的团队文档中心,内容以 Markdown 管理,支持全文搜索、多级目录、暗色模式。

## 开始使用

- 左侧「文档导航」按目录结构自动生成
- 右侧「本页目录」自动提取当前页面的标题层级
- 右上角搜索框支持 `Ctrl + K` 快捷唤起全文检索

## 目录结构约定

```text
docs/
  intro.md              # 本页,固定为首页 (slug: /)
  开始/
    _category_.json     # 分类标题、排序
    安装说明.md
  运维/
    _category_.json
    部署指南.md
```

新增文档时,只需要在 `docs/` 下新建 Markdown 文件或子文件夹,左侧导航会自动更新,无需手动维护配置。
