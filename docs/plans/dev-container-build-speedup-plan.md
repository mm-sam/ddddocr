# ddddocr-dev 容器編譯提速（僅容器層）

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-10-30
**狀態**: 🟢 完成
**優先級**: High

## 背景與目標

`ddddocr-dev` 容器（`rust:1.95-slim-bookworm`）把整個 repo 以 bind mount 掛在 `/app`，`target/` 因此落在 Windows `F:` 的 9p/virtiofs 掛載上。實測顯示編譯慢的主因是檔案系統，不是 rustc：

| 項目 | `F:` bind mount（現況） | 容器本地 FS / volume |
|------|------------------------|----------------------|
| 建 2000 個小檔 | 22.4 s | 0.35 s |
| `cargo check` 無改動 | 62 s（`CARGO_INCREMENTAL=0`：16 s） | 2 s（`=0`：0 s） |
| `cargo check` 改一行 | 84 s（91 s） | 8 s（5 s） |
| `cargo build --release` 冷編譯 | 541 s | 306 s |
| `cargo build --release` 改一行 | — | 69 s |

目標：**只調整容器設定**（不改 repo 內任何檔案），把 `target/` 移到 named volume 並關閉 incremental，讓開發內循環從 ~84 s 降到個位數秒級，並以同一組指令重測驗證。

## 範圍

- 只動 Docker 端：新增 `ddddocr-target` volume、重建 `ddddocr-dev` 容器（沿用既有 `ddddocr-cargo-registry`、`ddddocr-ort-cache`）、加 `CARGO_INCREMENTAL=0`。
- 不動 repo 檔案：`src/`、`Cargo.toml`、`Dockerfile.runtime`、`.dockerignore`、文件皆不變。
- 不改 CI / 映像發佈流程。

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 記錄基線（bind mount 上 check / release 耗時） | ✅ 完成 | — | 見「背景與目標」表格 |
| 2 | `docker volume create ddddocr-target` | ✅ 完成 | — | |
| 3 | 重建 `ddddocr-dev`：保留 `/app` bind mount、registry 與 ort 快取 volume，新增 `ddddocr-target:/app/target`，環境加 `CARGO_INCREMENTAL=0` | ✅ 完成 | — | 重建後發現舊容器曾手工安裝 `g++`，已補裝（見「風險與回滾」第 4 點） |
| 4 | 驗證一：`cargo check`（冷、暖、無改動各一次） | ✅ 完成 | — | 66 s / 3 s / 0 s |
| 5 | 驗證二：`touch src/lib.rs` 後 `cargo build --release` 暖重編 | ✅ 完成 | — | 34 s |
| 6 | 更新本計畫的驗證結果與 Review 日誌 | ✅ 完成 | — | |

狀態圖示：⬜ 待處理 / 🔄 進行中 / ✅ 完成 / 🔴 阻塞 / ⏭️ 跳過（附原因）

## 驗證結果（2026-10-30，同一台機器：8 vCPU / 9.7 GB / Docker Desktop WSL2）

容器指令（可重現）：

```powershell
docker volume create ddddocr-target
docker run -d --name ddddocr-dev -w /app -e CARGO_INCREMENTAL=0 `
  -v "F:\TestProject\rust\ddddocr:/app" `
  -v ddddocr-cargo-registry:/usr/local/cargo/registry `
  -v ddddocr-ort-cache:/root/.cache `
  -v ddddocr-target:/app/target `
  rust:1.95-slim-bookworm sleep infinity
docker exec ddddocr-dev apt-get update
docker exec ddddocr-dev apt-get install -y g++ pkg-config procps   # g++ 提供 -lstdc++（ort/onnxruntime 連結必需）
```

| 情境 | 改前（`F:` bind mount） | 改後（`ddddocr-target` volume） |
|------|------------------------|--------------------------------|
| `cargo check` 冷 | 170 s | 66 s |
| `cargo check` 無改動 | 62 s | **0 s** |
| `cargo check` 改一行 | 84 s | **3 s** |
| `cargo build`（debug）冷 | 未量測 | 47 s |
| `cargo build`（debug）無改動 | 未量測 | 1 s |
| `cargo build`（debug）改一行 | 未量測 | **11 s** |
| `cargo build --release` 冷 | 541 s | 251 s |
| `cargo build --release` 無改動 | 未量測 | 1 s |
| `cargo build --release` 改一行 | 未量測 | **34 s** |

功能驗證：

- `target/release/ddddocr --help` 正常輸出。
- `--ocr --det --slide --mcp --address 127.0.0.1:8010` 啟動後 `GET /status` 回 `HTTP/1.0 200 OK`，log 顯示 ocr/det/slide/mcp 全部 enabled。
- `target/` 目前 4.3 GB（debug + release 都在 volume 內）。

## 風險與回滾

- 重建容器會中斷目前 `sleep infinity` 的 shell；registry（331 MB）與 ort 快取（84 MB）在獨立 volume，不受影響。
- 主機 `F:\TestProject\rust\ddddocr\target`（3.3 GB）會被 volume 遮蔽而變成孤兒目錄；確認新流程可用後可自行刪除，本計畫不主動刪。
- 回滾：`docker rm -f ddddocr-dev` 後用原指令重建（去掉 `-v ddddocr-target:/app/target` 與 `CARGO_INCREMENTAL`）即可回到現狀。
- `CARGO_INCREMENTAL=0` 只影響容器內建置；主機 Windows 直接 `cargo build` 不受影響。
- **已發生並修正**：舊容器曾手工 `apt install` 過 `g++`，重建後遺失，導致 release 連結失敗（`rust-lld: error: unable to find library -lstdc++`）。已補裝 `g++ pkg-config procps`。**容器是手工建立的，重開就要重裝這三個套件**；若之後要固化，建議另立計畫新增 `Dockerfile.dev` 或 `compose.yaml`（本次範圍不做）。

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-30 | ✅ 已批准 | 使用者選擇「只改容器」，並批准照計畫執行 |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-30 | 主 agent（自我驗證） | 重建容器後 release 連結失敗：`rust-lld: error: unable to find library -lstdc++`，原因是舊容器手工裝過 `g++` | 補裝 `g++ pkg-config procps`，重跑 release 冷/暖/無改動全部成功，並以 `--ocr --det --slide --mcp` 起服務驗證 `/status` 200 |
| 2026-10-30 | 主 agent（自我驗證） | 首次「release 冷 232 s」數字無效（該次連結失敗，未產出二進位） | 以 `rm -rf target/release` 重測，正式數字為 251 s |

## 備註

- 先前量測使用的暫存 target 目錄在容器 `/tmp/tcold`、`/tmp/trelease`，重建容器後會消失，不影響主機。
- 若日後想再進一步：`CARGO_PROFILE_DEV_DEBUG=0`、sccache volume、CI 的 cargo-chef／BuildKit cache mount，另立計畫處理。
