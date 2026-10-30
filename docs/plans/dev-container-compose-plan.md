# dev container 設定檔化（Dockerfile.dev + docker-compose.dev.yml）

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-10-30
**狀態**: 🟢 完成
**優先級**: Medium

## 背景與目標

上一輪把 `ddddocr-dev` 容器的 `target/` 移到 named volume（`docs/plans/dev-container-build-speedup-plan.md`），開發內循環由 84 s 降到 3 s。但那個容器是**手工 `docker run` 建的**：

- repo 裡沒有任何 dev container 設定檔（`docker-compose.yml` 是**執行期服務**，`image: mmhk/ddddocr:latest`，與開發無關）；
- `AGENTS.md` §2 目錄樹、§5 建置矩陣完全沒提 dev container；
- 重建容器時會遺失手工安裝的 `g++`／`pkg-config`／`procps`（`-lstdc++` 連結必需），上一輪就因此讓 release 連結失敗一次。

目標：把 dev container 變成**可重現的設定檔**，並同步 `AGENTS.md` 與兩份 README。

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 新增 `Dockerfile.dev`：`FROM rust:1.95-slim-bookworm`，`apt-get install -y g++ pkg-config procps`（`g++` 提供 `-lstdc++`，ort/onnxruntime 靜態連結必需） | ✅ 完成 | general | |
| 2 | 新增 `docker-compose.dev.yml`：`container_name: ddddocr-dev`、`build: {dockerfile: Dockerfile.dev}`、`working_dir: /app`、`command: sleep infinity`、`CARGO_INCREMENTAL: "0"`、掛載 `.:/app` 與三個 volume | ✅ 完成 | general | volume 用 `name:` 明確命名為 `ddddocr-target`／`ddddocr-cargo-registry`／`ddddocr-ort-cache`，沿用現有 4.3 GB target |
| 3 | 驗證：`docker compose -f docker-compose.dev.yml up -d --build`，容器內 `cargo check`（冷／暖／無改動）、`cargo build --release`、起服務測 `/status`；並確認 `docker compose up`（執行期服務）不受影響 | ✅ 完成 | general | 見「驗證結果」 |
| 4 | 把手上的 ad-hoc 容器換成 compose 管理（先 `docker rm -f ddddocr-dev`，再 `up -d`） | ✅ 完成 | general | 驗證 volume 有被沿用（不要重新編譯 514 個依賴） |
| 5 | 文件同步：`AGENTS.md` §2 目錄樹 / §5 建置矩陣 / §9 表格；`README.md`／`README_EN.md` 各加一小節「開發容器（可選）」 | ✅ 完成 | general | README.md 用簡體中文（與其餘章節一致）；TOC 已補新章節連結 |

狀態圖示：⬜ 待處理 / 🔄 進行中 / ✅ 完成 / 🔴 阻塞 / ⏭️ 跳過（附原因）

## 驗證結果（2026-10-30）

| 項目 | 結果 |
|------|------|
| `docker compose -f docker-compose.dev.yml config` | `name: ddddocr-dev`、`container_name: ddddocr-dev`、`image: ddddocr-dev:latest`、3 volume 用明確 `name:`（無前綴） |
| `up -d --build` | 無 orphan 警告；`ddddocr-dev_default` 網路建立 |
| 容器內工具 | `g++ 12.2.0`、`cargo 1.95.0`、`pgrep` 可用 |
| `cargo check` 暖機 | 0.34–0.46 s（target volume 沿用） |
| `cargo build --release` | 成功（證明 `-lstdc++` 就緒），二進位 125 MB |
| 服務冒煙 | `--ocr --det --slide --mcp` + `/status` 回 200，`["ocr","det","slide","mcp"]` |
| 執行期服務 | `ddddocr`（`mmhk/ddddocr:latest`）全程 healthy，未受影響 |
| `down` 後 | 只移除 dev 容器與 `ddddocr-dev_default` 網路；執行期容器仍在 |
| 映像名稱 | 固定為 `ddddocr-dev:latest`（無 `ddddocr-dev-dev` 殘留） |

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-30 | ✅ 已批准 | 使用者選擇「選 A 並批准」（Dockerfile.dev + compose + 文件同步） |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-30 | 主 agent（inline review） | README.md 新章節用繁體中文，與其餘簡體不一致；TOC 缺新章節連結 | 章節改簡體、TOC 補連結 |
| 2026-10-30 | 主 agent（inline review） | compose 專案名衝突風險：`up -d` 會把執行期容器視為 orphan | 加 `name: ddddocr-dev` 專案隔離 |
| 2026-10-30 | 主 agent（inline review） | compose 預設映像名 `ddddocr-dev-dev:latest` 不直觀 | 加 `image: ddddocr-dev:latest` 固定 |
| 2026-10-30 | 主 agent（inline review） | `CARGO_HOME/git` 未掛 volume，每次重建容器會重抓 ort git 依賴（5–7 秒） | 記錄為可選後續優化，本次不處理 |

## 備註

- 現有 `docker-compose.yml`（執行期服務）**不動**；dev 用 `-f docker-compose.dev.yml` 單獨啟用。
- 兩個 compose 檔的 `container_name` / port 不衝突（dev 不映射 8000）。
- 可選後續：掛 `ddddocr-cargo-git:/usr/local/cargo/git` 避免每次重抓 ort git 依賴。
