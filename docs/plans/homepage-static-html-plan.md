# 首頁靜態 HTML 實作計畫

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-01-XX
**狀態**: 🟢 完成
**優先級**: Medium

## 背景與目標

目前 REST API server 沒有首頁，使用者訪問根路徑 `/` 會得到 404。需要新增一個靜態 HTML 首頁，提供專案介紹和 API 使用範例。

**目標**：
- 在根路徑 `/` 提供一個簡潔明亮的中文首頁
- 使用 TailwindCSS v4、Remix Icon、Google Fonts（CDN 引入）
- 包含 ddddocr 專案介紹和 OCR endpoint 使用範例
- Salvo 直接 serve 靜態 HTML 檔案，不使用 embed

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 新增 `salvo-serve-static` 依賴到 Cargo.toml | ✅ 完成 | general | |
| 2 | 建立 `static/index.html` 靜態首頁 | ✅ 完成 | general | TailwindCSS v4 + Remix Icon + Google Fonts |
| 3 | 修改 `src/main.rs` 掛載靜態檔案路由 | ✅ 完成 | general | 在 `/` 路徑 serve `static/index.html` |
| 4 | 更新文件（README.md、README_EN.md、AGENTS.md） | ✅ 完成 | general | 同步首頁路由資訊 |
| 5 | 測試驗證 | ⬜ 待處理 | — | 需要 `cargo build` 確認編譯通過 |

## 實作細節

### 1. 依賴新增

```toml
# Cargo.toml
salvo-serve-static = "0.85"
```

### 2. 靜態 HTML 結構

**檔案位置**：`static/index.html`

**CDN 資源**：
- TailwindCSS v4: `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`
- Remix Icon: `https://cdn.jsdelivr.net/npm/remixicon@4.x/remixicon.css`
- Google Fonts: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap`

**頁面內容**：
1. **Header**
   - Logo / 專案名稱
   - GitHub 連結
   
2. **Hero Section**
   - 專案簡介：通用驗證碼識別 Rust 庫
   - 特色標籤：不依賴 OpenCV、跨平台、REST API + MCP
   
3. **Features Section**
   - OCR 識別
   - 目標檢測
   - 滑塊匹配
   - MCP 協議支援
   
4. **API Quick Start Section**
   - OCR endpoint 使用範例（curl）
   - 參數說明表格
   
5. **Footer**
   - 文件連結（Swagger UI、OpenAPI JSON）
   - GitHub 連結

**設計風格**：
- 簡潔明亮
- 使用 Tailwind 預設配色（blue/gray）
- 響應式設計
- 程式碼區塊使用深色背景

### 3. 路由修改

```rust
// src/main.rs
use salvo::serve_static::StaticDir;

// 在 router 設定中
let router = router
    .push(Router::with_path("/").get(StaticDir::new(["static"], true).fallback("index.html")))
    // ... 其他路由
```

### 4. 文件更新

需要更新：
- `README.md`：新增首頁說明
- `README_EN.md`：新增首頁說明（英文版）
- `AGENTS.md`：更新目錄結構說明

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-01-XX | ✅ 已批准 | 開始實作 |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| | | | |

## 備註

- `static/` 目錄需要相對於執行目錄（repo root）
- 不 embed 靜態檔案，方便後續修改
- 首頁內容純靜態，不依賴後端 API 資料
