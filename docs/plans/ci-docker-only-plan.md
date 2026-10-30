# CI 精簡為「只建 Docker 映像」

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未確認前，不得開始任何開發工作。

**建立日期**: 2026-10-30
**狀態**: 🟢 完成（任務 5 實跑驗證待新 tag）
**優先級**: Medium

## 背景與目標

本 fork（`mm-sam/ddddocr`）的用途已收斂為 **建置並發佈 Docker 映像**（Docker Hub `mmhk/ddddocr`），不再負責產出各平台二進位。

目前 `.github/workflows/build.yml` 仍保留上游的 14 個建置 job（Windows x86/x64、Linux、macOS、aarch64、musl 等）與 `release` job，僅以 `if: github.event_name == 'workflow_dispatch'` 擋住 tag push 時執行。這些 job 在本 fork 已無意義：

- 沒有 `workflow_dispatch` 需求（使用者已確認**完全移除**手動觸發）
- `release` job 的 `publish` 判斷本身就有 boolean-as-string 的老 bug
- 保留它們只增加維護成本與誤觸發風險

目標：workflow 只保留 `docker-image` 一個 job，觸發方式只有 **push tag `v*`**。

### 已確認的決策

| 項目 | 決策 |
|------|------|
| 觸發方式 | 只保留 `push: tags: ['v*']`；**移除** `workflow_dispatch` |
| 要保留的 job | 只有 `docker-image`（buildx → Docker Hub login → metadata → build-push `linux/amd64` → 冒煙測試） |
| 要刪除的 job | 14 個 build job + `release` job（含 artifact 上傳、GitHub Release 建立） |
| README 舊描述 | 改寫成只提 Docker；不再宣稱可用 GitHub Action 產出各平台二進位 |
| 其他檔案 | `Dockerfile.runtime`、`.dockerignore`、`.gitignore` 不改 |

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 重寫 `.github/workflows/build.yml`：`name: docker`；`on` 只留 `push.tags: ['v*']`；刪除 14 個 build job、`release` job、頂層 `permissions: contents: write`；`docker-image` job 保留（job 內 `permissions: contents: read`），移除已多餘的 `if: startsWith(github.ref, 'refs/tags/v')` | ✅ 完成 | general | 418 → 54 行，只剩 6 個 step |
| 2 | 同步 `README.md` / `README_EN.md`：改寫「还可以使用配置好的 Github Action 进行构建」與目錄項目；Docker 章節的「手动触发 workflow 仍然只构建各平台二进制压缩包」改為「只在推送 `v*` 標籤時觸發，沒有手動觸發入口」；「疑难杂症」中推薦用 GitHub Action 構建的段落改成指向本 fork 的 Docker 映像 | ✅ 完成 | general | 本地 `cargo build` 章節未動 |
| 3 | 同步 `AGENTS.md`：§0 Tech stack 的 CI 描述（~14 targets）、§2 目錄結構對 `build.yml` 的說明、§5 CI 相關 Rules（`workflow_dispatch`、`publish=true`）、§9 同步表 | ✅ 完成 | general | §9 採新增「CI trigger or workflow shape」一列 |
| 4 | Review：`code-reviewer` 對照本計畫與 AGENTS.md §10 檢查 | ✅ 完成 | code-reviewer | 結論 Approved；提醒 §9 新列可加 §2、smoke test 清理可加 trap（非阻斷） |
| 5 | 驗證：YAML 解析、確認觸發器只剩 tag；因已無 `workflow_dispatch`，實際執行需等下一次 tag | 🔴 阻塞 | — | YAML/結構檢查已通過（1 job、僅 `push.tags`、無 artifact/release）；實跑需合併後推送新 tag 才能驗證 |

狀態圖示：⬜ 待處理 / 🔄 進行中 / ✅ 完成 / 🔴 阻塞 / ⏭️ 跳過（附原因）

## 預期產出的 `build.yml` 結構

```yaml
name: docker

on:
  push:
    tags:
      - 'v*'

jobs:
  docker-image:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3      # DOCKERHUB_USERNAME / DOCKERHUB_TOKEN
      - uses: docker/metadata-action@v5   # latest + semver
      - uses: docker/build-push-action@v6 # Dockerfile.runtime, linux/amd64
      - 冒煙測試（pull → --help → 起容器輪詢 /status）
```

## 風險與注意事項

1. **失去手動觸發**：改完後只能靠 push `v*` tag 觸發，無法在沒有新版本時手動重跑同一個 tag（要重跑只能刪 tag 重推，或打新 tag）。使用者已確認接受。
2. **不再產出 GitHub Release / 各平台 zip**：`release` job 與 `actions/upload-artifact`、`softprops/action-gh-release` 全部移除。二進位需求改為本地 `cargo build` 或上游 `86maid/ddddocr` releases。
3. **驗證成本**：移除 `workflow_dispatch` 後，任何 workflow 語法錯誤只能等下次 tag 才發現。因此任務 5 必須先在本機做 YAML 解析與 `gh workflow view` 檢查。
4. **mime-infer pin 一併消失**：只存在於被刪除的 musl job；`Dockerfile.runtime` 內的 pin 不受影響。
5. **不可動到的檔案**：`Dockerfile.runtime`、`.dockerignore`、`.gitignore`、`src/`、`Cargo.toml`、`model/`、`image/`。

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-30 | ⏳ 等待 Review | 觸發方式與 README 處理方式已由使用者確認 |
| 2026-10-30 | ✅ 已批准 | 使用者回覆「批准，開始實作」 |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-30 | code-reviewer | workflow 結構、secrets、semver tag、`file`/`platforms`、smoke test、權限模型全部驗證無誤；三份文件無殘留過時敘述 | ✅ 通過（Approved） |
| 2026-10-30 | code-reviewer | 建議（非阻斷）：§9 新列可補 `§2`；smoke test 可在 `curl` 失敗時加 `trap` 清理 | 未採用：§9 已涵蓋 §0/§5，§2 由既有「Docker runtime image」列覆蓋；runner 為一次性環境，殘留容器無害 |
| 2026-10-30 | code-reviewer | 提醒：工作區的 `.dockerignore`／`.gitignore` 另有使用者自行追加的規則（`*.rlib`、`__pycache__`、`.claude` 等），不在本計畫範圍 | 本次提交排除這兩個檔案，避免 commit 內容與訊息不符 |
| 2026-10-30 | code-reviewer | 提醒：移除 `workflow_dispatch` 後，實跑驗證只能等下一次 push tag | 任務 5 標記 🔴 阻塞（YAML／結構檢查已完成，實跑待新 tag） |

## 備註

- 上一輪 Docker 映像已驗證成功：run `40863734253`（tag `v1.0.0`）12m42s 綠燈，映像已推上 Docker Hub。
- 本次只做 CI 與文件精簡，不改任何執行期程式的行為。
