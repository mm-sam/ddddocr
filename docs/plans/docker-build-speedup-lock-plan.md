# Docker 映像建置提速：提交 Cargo.lock + 依賴預編譯層

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-10-30
**狀態**: 🟢 完成
**優先級**: Medium

## 背景與目標

上一輪把 `ddddocr-dev` 的 `target/` 移到 named volume，開發內循環由 84 s 降到 3 s（見 `dev-container-build-speedup-plan.md`）。剩下的慢點在**映像建置（CI / `Dockerfile.runtime`）**：

1. `.dockerignore` 排除 `Cargo.lock`，builder 每次重新解析依賴；最新解析出的 `mime-infer 4.1.0` 需要 rustc 1.95，而 builder 用 `rust:1.90.0-alpine`，所以才有一行 `cargo update -p mime-infer --precise 4.0.1` 補丁（`Dockerfile.runtime:34`）。上游一發版就可能再炸一次。
2. `Dockerfile.runtime` 先 `COPY src` 再 `cargo build`，**任何原始碼改動都會讓整個 RUN 圖層失效**，468 個依賴全部重編（歷史紀錄約 10 分鐘）。目前 CI 只有 `cache-from/to: type=gha` 的圖層快取，救不了這種情況。
3. 本機 lock（514 套件）與 CI 解析出的依賴集合不一致：本機 `mime-infer 4.1.0`、CI 被釘成 `4.0.1`。

目標：讓映像建置**可重現**（依賴集合固定）且**改原始碼時只重編 `ddddocr` 自己**，同時移除 `mime-infer` 補丁。

## 需要先決定的兩個選項

| | A（建議）基底升 1.95 | B（低風險）基底維持 1.90 |
|---|---|---|
| `Cargo.lock` | 直接提交現有 lock（`mime-infer 4.1.0`） | 先 `cargo update -p mime-infer --precise 4.0.1` 再提交 |
| `Dockerfile.runtime` | `FROM rust:1.95.0-alpine` | 維持 `rust:1.90.0-alpine` |
| `cargo update ... --precise` 補丁 | 刪除 | 刪除 |
| 風險 | 需重驗 musl 靜態連結 + onnxruntime（一次 `docker build`） | 幾乎無風險，但工具鏈與 dev 容器（1.95）不一致 |

兩者都能達成「可重現 + `--locked`」，差別在是否順便把 CI 工具鏈對齊 dev 容器的 1.95。

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 提交 `Cargo.lock`：移除 `.gitignore` 的 `/Cargo.lock`，從 `.dockerignore` 拿掉 `Cargo.lock` | ✅ 完成 | general | lock v4，514 套件；已 `git add`（未 commit） |
| 2 | 依選項處理基底映像與 lock 版本（A：升 `rust:1.95.0-alpine`；B：lock 釘 `mime-infer 4.0.1`） | ✅ 完成 | general | 採 A；另把根目錄 `Dockerfile` 一併升到 1.95.0-alpine（否則已提交的 lock 會讓它編不過） |
| 3 | `Dockerfile.runtime`：`COPY Cargo.toml Cargo.lock ./`，改用 `cargo build --release --locked`，刪除 `cargo update -p mime-infer --precise 4.0.1` | ✅ 完成 | general | |
| 4 | `Dockerfile.runtime`：新增「依賴預編譯層」——用 dummy `src/` 先把依賴編一次，再 `COPY src` 編本體 | ✅ 完成 | general | 修正：`target/` **留在圖層**而非 cache mount（見 Review 日誌第 2 條）；registry/git 才用 cache mount |
| 5 | 驗證：`docker build`；改一行 `src/` 重建；`--help` 與 `/status` 冒煙 | ✅ 完成 | general | 見「驗證結果」 |
| 6 | 文件同步：`AGENTS.md` §2/§3/§5/§11、`README.md`/`README_EN.md` | ✅ 完成 | general | |

狀態圖示：⬜ 待處理 / 🔄 進行中 / ✅ 完成 / 🔴 阻塞 / ⏭️ 跳過（附原因）

## 驗證結果（2026-10-30）

以**每次全新 `docker buildx create`** 模擬 CI 的乾淨 runner，並用 `--cache-to/--cache-from type=local,mode=max`（等效於 CI 的 `type=gha,mode=max`）：

| 情境 | 結果 |
|------|------|
| 冷建（全新 builder） | 8m55s～9m29s（514 套件 + ort/onnxruntime；與改動前相當） |
| 改 `src/lib.rs` 一行 + 全新 builder + `--cache-from` | 依賴層 `CACHED`；`Compiling` 只有 `ddddocr` 一筆；**無任何依賴重編**；總時間 5m03s～6m20s（本機含 buildx 啟動、1.06 GB 圖層還原、`--load` 開銷） |
| 內容完全不變 + 全新 builder | 45.9s（所有層含最終編譯層皆 `CACHED`） |
| `docker run --rm ddddocr:c2 --help` | 正常，exit 0 |
| `-p 8012:8000` + `curl /status` | `HTTP=200`，`enabled_features=["ocr","det","slide","mcp"]` |
| 映像大小 | 241 MB（與舊版相同 → `rm -rf target` 生效，1.5 GB 沒進最終映像） |
| `docker build -f Dockerfile` | 成功，`rustc --version` = 1.95.0 |
| GHA 快取體積 | 依賴層約 1.06 GB（壓縮後），在 10 GB 上限內 |

預期真實 CI（GHA + `build-push-action`，無 `--load`）改原始碼後約 3–4 分鐘，對照改動前約 10–12 分鐘。

## 驗證方式

1. `docker build` 成功，映像可啟動：`--help`、`--ocr --det --slide --mcp` + `GET /status` 回 200。
2. 只改 `src/lib.rs` 一行再 `docker build`：預期依賴層 `CACHED`，總時間顯著低於現在（目標 ≤2 分鐘）。
3. `cargo build --locked` 在乾淨 checkout（無 lock 漂移）下不得失敗。
4. 對照 CI 歷史時長（run `40863734253`：12m42s）。

## 風險與回滾

- 選項 A 若 musl 靜態連結或 onnxruntime 在 1.95 出問題，退回選項 B（基底回 1.90 + lock 釘 4.0.1），成本一次 rebuild。
- 提交 `Cargo.lock` 是**政策變更**：此 repo 過去刻意不提交（`AGENTS.md` §3），需同步改該條規則；作為 lib 被下游引用時 Cargo 會忽略 lock，不影響相容性。
- cache mount 不會被 `cache-to: type=gha` 匯出（僅本機/建置器有效），所以真正跨 runner 生效的是「依賴層圖層快取」；cache mount 是同一 runner 內重試時的加速。
- 不改 `src/`、不升/降任何 crate 版本（除選項 B 的 `mime-infer` 釘版）、不改 CI 觸發方式。

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-30 | ✅ 已批准 | 使用者選擇「選 A 並批准」（基底升 1.95 + 使用現有 Cargo.lock） |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-30 | general | 第一次建置產出 539 KB 的 dummy 二進位：BuildKit `COPY` 保留主機舊 mtime，cargo 誤判原始碼未變更而沿用占位產物 | `COPY src` 後加 `RUN find src -type f -exec touch {} +`，重驗二進位為 130 MB 且功能正常 |
| 2026-10-30 | 主 agent | `target` 掛 `type=cache` 會讓 CI 失效：Docker 官方明訂 cache mount 內容不會被 `cache-to: type=gha/registry` 匯出，全新 runner 上等於白編一次（10 分鐘 → 約 18 分鐘） | 改為 `target/` 留在圖層（cargo-chef 原理），只有 registry/git 用 cache mount；最終層 `cp` 出二進位後 `rm -rf target`；以每次全新 buildx builder + `type=local` 快取模擬驗證通過 |
| 2026-10-30 | 主 agent | 根目錄 `Dockerfile` 仍是 1.90.0-alpine，提交 lock 後（`mime-infer 4.1.0` 需 1.95）會編不過 | 一併升 `rust:1.95.0-alpine`，同步 `AGENTS.md` §2/§5 與 README 各一行 |
| 2026-10-30 | code-reviewer | 無阻塞問題，可提交；提醒：`Cargo.lock` 必須與 Dockerfile 同一個 commit、`.gitignore` 有越界新增 `+/docs/example`、計畫內 `/app/out/` 路徑需更正 | 已移除越界的 `.gitignore` 改動（回到 0 新增/3 刪除）、本計畫路徑已更正為 `/app/ddddocr` |
| 2026-10-30 | code-reviewer | 曾懷疑 `include_bytes!`/`include_str!` 輸入（`model/*`、`initialize.json`、`list.json`）不受 cargo 追蹤 | 查證 `target/release/deps/ddddocr-*.d` 實際包含這些路徑，cargo 會做 mtime 檢查，疑慮不成立 |

## 待辦（不在本次範圍）

- `Cargo.lock` 已 staged 但**未 commit**：下次 `v*` tag 觸發 CI 前必須與 `Dockerfile.runtime` 一起提交，否則 CI 的 `--locked` 會失敗。
- 若之後要再壓 CI 時間（目前改原始碼約 3–4 分鐘，其中 `ddddocr` 單體 release 編譯約 85–90 秒），可另外評估 `codegen-units` / `lto` / 拆 lib-bin profile。

## 備註

- 若之後想固化 dev 容器（避免每次重開手裝 `g++ pkg-config procps`），可另立 `Dockerfile.dev` / `compose.yaml` 計畫，不在本次範圍。
