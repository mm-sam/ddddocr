# Web UI 擴充：Rspack v2 + Vue 3 首頁與 OCR 互動介面

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-10-30
**狀態**: 🟢 完成（已批准）
**優先級**: Medium

## 背景與目標

目前首頁是單一 `static/index.html`，只能靜態瀏覽，無法直接試用 API。

本次擴充目標：

1. 引入前端工程化：`webui/` 原始碼目錄，使用 **Rspack v2 + Vue 3** 建置。
2. 建置產物輸出到 `dist/` 靜態目錄，由 Salvo 直接 serve（不 embed）。
3. 首頁保留原有介紹與 API 說明，並新增 **OCR 互動區**：
   - 拖放 / 點擊上傳驗證碼圖片
   - 從剪貼簿貼上（Ctrl+V）
   - 即時預覽
   - 一鍵呼叫 `POST /ocr` 顯示識別結果（可選顯示機率）
4. 維持「第三方庫用 CDN」的既有約定：TailwindCSS v4、Remix Icon、Google Fonts 仍走 CDN；Vue 由 Rspack 打包。

## 技術決策（待確認）

| 項目 | 建議 | 說明 |
|------|------|------|
| 原始碼目錄 | `webui/` | 新增頂層目錄，需你批准（AGENTS.md §2） |
| 建置輸出 | `static/` | ✅ 已確認：輸出到既有 `static/`（取代 `dist/` 方案），docker-compose 掛載不變 |
| static 產物是否提交 | **是** | runtime 鏡像與 Docker 均為 Rust/靜態，不裝 Node；不提交就無法部署 |
| Tailwind | 維持 CDN（`@tailwindcss/browser@4`） | 與現況一致；若要離線自包含可改 PostCSS 建置 |
| Rspack 版本 | `@rspack/core` / `@rspack/cli` 2.3.x | 已確認 npm latest 為 2.3.0 |
| Vue | 3.5.x | 已確認 npm latest 為 3.5.44 |
| `.vue` loader | `rspack-vue-loader` 17.7.x | 需 `experimentalInlineMatchResource: true` |

## 目標結構

```
webui/
├── package.json
├── rspack.config.mjs        # 輸出 ../static/，dev server proxy → 127.0.0.1:8000
├── index.html               # HtmlRspackPlugin 模板（CDN 引入樣式）
└── src/
    ├── main.js
    ├── App.vue
    ├── styles.css
    └── components/
        ├── SiteHeader.vue
        ├── HeroSection.vue
        ├── FeaturesSection.vue
        ├── OcrPlayground.vue   # 互動核心
        ├── ApiDocs.vue
        └── SiteFooter.vue

static/                      # 建置產物（提交；由 webui 產生）
├── index.html
└── assets/*.js|*.css
```

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 建立 `webui/` 腳手架（package.json、rspack.config、index.html、入口） | ✅ 完成 | general | Yarn 4（node-modules linker） |
| 2 | 移植現有首頁內容為 Vue 元件（Header/Hero/Features/ApiDocs/Footer） | ✅ 完成 | general | 視覺與文案保持一致 |
| 3 | 實作 `OcrPlayground.vue` 互動 UI（拖放/點擊/貼上、預覽、呼叫 `/ocr`） | ✅ 完成 | general | base64、loading、錯誤處理、競態防護 |
| 4 | 設定建置輸出至 `static/`，提交建置產物 | ✅ 完成 | general | 供 Docker/部署直接使用 |
| 5 | 修改 `src/main.rs`：`/` serve `static/index.html`，`/{**path}` serve `StaticDir` | ✅ 完成 | general | Salvo 0.85 使用大括號語法 |
| 6 | `docker-compose.yml` 掛載維持 `./static:/static:ro` | ✅ 無需變更 | — | 輸出改回 static 後原設定即正確 |
| 7 | 舊 `static/index.html` 由建置產物取代 | ✅ 完成 | general | 內容已移植進 Vue |
| 8 | 更新文件（README.md、README_EN.md、AGENTS.md、.gitignore/.dockerignore） | ✅ 完成 | general | 建置指令、目錄結構、同步規則 |
| 9 | 驗證：前端建置、Rust 建置、serve、貼圖識別實測 | ✅ 完成 | general | dev container 實測通過 |

> 可選（預設跳過）：在 `Dockerfile.dev` 加入 Node，讓 dev container 也能建置前端。若你需要在容器內跑 `npm`，再開啟此項。

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-30 | ✅ 已批准 | 輸出改為 `static/`，其餘照建議 |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-30 | code-reviewer | blocker：`/<**path>` 是錯誤語法，Salvo 0.85 只認 `{**path}`，assets 路由永遠不匹配 | 查 `salvo_core 0.85.0` 原始碼確認，改為 `/{**path}` |
| 2026-10-30 | code-reviewer | `.dockerignore` 未排除 `webui`，node_modules 會進入 build context | 新增 `webui`、`node_modules` 排除 |
| 2026-10-30 | code-reviewer | README 未說明 webui 建置與 assets 路由 | 已補 README.md / README_EN.md / AGENTS.md §5 |
| 2026-10-30 | general | dev container 實測：`/`、`/assets/*.js/css`、`/status`、`/docs.json`、`POST /ocr`、`--only-mcp` 下 `/` 與 `/mcp` 全部通過；目錄穿越回 404/400 | 驗證通過 |

## 備註

- `static/` 由 `webui` 的 `yarn build` 產生；提交是為了讓 Rust/Docker 部署不依賴 Node。
- 前端套件管理一律使用 yarn（禁止 npm），`webui/.yarnrc.yml` 設 `nodeLinker: node-modules`。
- 開發時可用 `webui` 的 dev server（proxy 到 8000）或先 build 再跑 Rust server。
- 互動 UI 只呼叫既有 `POST /ocr`，不新增後端路由。
- `index.html` 由 Rspack 產生，仍以 CDN 引入 Tailwind/Remix Icon/Google Fonts。
