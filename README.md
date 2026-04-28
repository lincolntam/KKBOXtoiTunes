# iTunes Music Tag Helper

一個簡單的網頁工具，用於從 KKBOX 抓取歌曲標籤（Metadata）及完整歌詞，方便手動更新 iTunes 離線音樂。

## 如何使用
1. 將 `index.html` 上傳到你的 GitHub 儲存庫並開啟 GitHub Pages。
2. 部署一個 Cloudflare Worker (代碼見之前的對話)。
3. 在 `index.html` 第 99 行將 `WORKER_URL` 更改為你的 Worker 網址。

## 功能
- 自動抓取歌名、歌手、作曲、作詞。
- 獲取完整歌詞。
- 一鍵複製符合 iTunes 整理習慣的格式。
