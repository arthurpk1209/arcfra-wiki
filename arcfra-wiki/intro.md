---
slug: /
sidebar_position: 1
---

# Arcfra知識庫

歡迎使用 Arcfra 知識庫。這是一個基於 [Docusaurus](https://docusaurus.io/) 搭建的團隊文件中心,內容以 Markdown 管理,支援全文搜尋、多級目錄、暗色模式。

## 開始使用

- 左側「文件導覽」按目錄結構自動生成
- 右側「本頁目錄」自動擷取當前頁面的標題層級
- 右上角搜尋框支援 `Ctrl + K` 快捷喚起全文檢索

## 目錄結構約定

```text
arcfra-wiki/
  intro.md               # 本頁,固定為首頁 (slug: /)
  getting-started/
    _category_.json      # 分類標題、排序
    installation.md
  ops/
    _category_.json
    deployment-guide.md
```

新增文件時,只需要在 `arcfra-wiki/` 下新建 Markdown 檔案或子資料夾,左側導覽會自動更新,無需手動維護設定。
