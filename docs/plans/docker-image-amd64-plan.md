# Docker Hub 映像發佈（linux/amd64）

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-10-29
**狀態**: 🟢 完成
**優先級**: Medium

## 背景與目標

目前 `.github/workflows/build.yml` 只有 `workflow_dispatch` 觸發，產出各平台 zip 並在 `publish=true` 時建立 GitHub Release。
倉庫已有一個 `Dockerfile`，但它是 **musl 編譯器容器**（`rust:1.90.0-alpine`），不是可直接執行的服務映像。

本次目標：

1. 新增可直接執行的 **linux/amd64** runtime 映像（靜態 musl 二進位 + `alpine`，內嵌模型）。
2. 修改現有 `.github/workflows/build.yml`，新增 **push tag `v*`** 觸發的 job，把映像 push 到 Docker Hub `mmhk/ddddocr`。
3. 不動既有 12 個 build job 與 `release` job 的行為。

### 已確認的決策

| 項目 | 決策 |
|------|------|
| Docker Hub repo | `mmhk/ddddocr` |
| 觸發方式 | `push` tag `v*`（`workflow_dispatch` 保留原樣，不推映像） |
| runtime base | `alpine` + musl 靜態二進位 |
| 模型 | 使用預設 feature `inline-model`（模型內嵌，映像不依賴 CWD 下的 `model/`） |
| 平台 | 只建 `linux/amd64`（不建 multi-arch） |

## 需要使用者先準備的設定

在 GitHub repo → Settings → Secrets and variables → Actions 新增：

- `DOCKERHUB_USERNAME`：Docker Hub 帳號（`mmhk`）
- `DOCKERHUB_TOKEN`：Docker Hub Access Token（需 Read & Write 權限）

缺這兩個 secret 時，`docker-image` job 會在 login 步驟失敗。

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 新增 `Dockerfile.runtime`（多階段：`rust:1.90.0-alpine` builder → `alpine` runtime），編 `x86_64-unknown-linux-musl` 靜態二進位，runtime 安裝 `ca-certificates tzdata libgcc libstdc++`，`EXPOSE 8000`，`ENTRYPOINT ddddocr` + 預設 `--ocr --det --slide --mcp` | ✅ 完成 | general | 沿用既有 `Dockerfile` 的 apk 依賴清單；另加 `mime-infer` pin、非 root `USER`、`HEALTHCHECK`、`strip --strip-debug` |
| 2 | 修改 `.github/workflows/build.yml`：新增 `on.push.tags: ['v*']`，新增 `docker-image` job（checkout → setup-buildx → login → metadata-action → build-push `linux/amd64`，tags = `latest` + semver），並加冒煙測試 | ✅ 完成 | general | Review 後改為 pull → `--help` → 起容器輪詢 `/status`；14 個既有 build job 加 `if: github.event_name == 'workflow_dispatch'`；兩個 musl job 補 `mime-infer` pin |
| 3 | 新增 `.dockerignore`（排除 `target/`、`image/`、`docs/`、`.git/`、`output*.jpg` 等），避免把測試素材送進 build context | ✅ 完成 | general | build context 只保留 `src/ model/ Cargo.toml initialize.json list.json` |
| 4 | 文件同步：`README.md` / `README_EN.md` 增加 Docker 使用段（pull/run/port、可用 CLI 參數、tag 規則），`AGENTS.md` §2/§5 補 `Dockerfile.runtime` 與新觸發方式 | ✅ 完成 | general | AGENTS.md §9 要求 build/feature 行為同步 |
| 5 | Review：`code-reviewer` 對照本計畫與 AGENTS.md §10 檢查（未改推論流程、未加 crate、未動 `model/`） | ✅ 完成 | code-reviewer | 第一輪 Request changes（4 阻斷項）→ 修正後第二輪 Approved |
| 6 | 實際驗證（需 Docker 本機環境）：`docker build -f Dockerfile.runtime -t mmhk/ddddocr:test .`，`docker run --rm --entrypoint /usr/local/bin/ddddocr mmhk/ddddocr:test --help`，起服務後 `curl /status` | ✅ 完成 | general | 見下方「驗證結果」 |

狀態圖示：⬜ 待處理 / 🔄 進行中 / ✅ 完成 / 🔴 阻塞 / ⏭️ 跳過（附原因）

## 預期產出（供 Review 對照）

`Dockerfile.runtime` 骨架：

```dockerfile
# syntax=docker/dockerfile:1
FROM rust:1.90.0-alpine AS builder
RUN apk add --no-cache build-base musl-dev perl make cmake linux-headers git \
    openssl-dev openssl-libs-static pkgconfig
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
COPY model ./model
COPY initialize.json list.json ./
RUN cargo build --release --target x86_64-unknown-linux-musl \
 && strip target/x86_64-unknown-linux-musl/release/ddddocr

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata libgcc libstdc++
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/ddddocr /usr/local/bin/ddddocr
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/ddddocr"]
CMD ["--ocr", "--det", "--slide", "--mcp"]
```

`build.yml` 新增內容（摘要）：

```yaml
on:
  workflow_dispatch: { ...既有 inputs 不動... }
  push:
    tags: ['v*']

jobs:
  docker-image:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: mmhk/ddddocr
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest
      - id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile.runtime
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Smoke test
        run: docker run --rm --entrypoint /usr/local/bin/ddddocr mmhk/ddddocr:${{ steps.meta.outputs.version }} --help
```

## 驗證結果（2026-10-29 本機 Docker）

| 驗證 | 結果 |
|------|------|
| `.github/workflows/build.yml` YAML 解析 | ✅ 合法；16 個 job |
| 14 個既有 build job 均有 `if: github.event_name == 'workflow_dispatch'` | ✅ |
| `docker-image` if 為 `startsWith(github.ref, 'refs/tags/v')`；`release.needs` 仍 14 項且不含 `docker-image` | ✅ |
| `docker build -f Dockerfile.runtime -t ddddocr:test2 .` | ✅ 成功，映像 242MB（builder ~10 分鐘） |
| `docker run --rm ddddocr:test2 --help` | ✅ 正常輸出 |
| 起容器 + `curl http://127.0.0.1:8001/status` | ✅ 200，`enabled_features` = ocr/det/slide/mcp |
| 非 root 執行 | ✅ `uid=10001(ddddocr)` |
| HEALTHCHECK | ✅ 存在且容器狀態 `healthy` |
| 未在 CI 驗證的部分 | tag push 觸發語意、Docker Hub 推送、secrets 設定，需實際推一次 tag 確認 |

## 風險與注意事項

1. **musl 靜態連結 + onnxruntime**：`ort` 在 musl 下靜態連結 onnxruntime（CI 已有的 `build-linux-musl`、`build-linux-musl-inline` 兩 job 同樣做法）。runtime 階段仍安裝 `libgcc`/`libstdc++` 以防殘留動態相依（實測可正常啟動，屬保險）。本機 build 已驗證可行，因此不啟用備援方案。
2. **映像大小**：inline-model 內嵌 4 個 onnx（約 84 MB），實測解壓後 **242MB**（原估 150MB，低估）。若在意大小可改非 inline 並只帶必要模型。
3. **無 `Cargo.lock`**：builder 內需重新解析依賴；最新解析的 `mime-infer 4.1.0` 要求 rustc 1.95 > 基底 1.90，因此 `Dockerfile.runtime` 與兩個既有 musl job 都先 `cargo update -p mime-infer --precise 4.0.1` 釘回相容版本。若日後基底 Rust 升級或提交 `Cargo.lock`，可移除這些 pin。
4. **既有 workflow 不受影響**：`release` job 的 `needs` 不加入 `docker-image`；tag push 時 14 個 build job 因 `if` 守衛被 skip，不會浪費 CI 時間。
5. **先發佈後驗證**：`push: true` 在冒煙測試之前，若測試失敗，映像已帶 `latest` 上架。要嚴格可拆成 build(`load`) → test → push 三段，本次不做。
6. **未處理的既有問題**：`release` job 的 `if: ${{ github.event.inputs.publish }}` 在 boolean input 下是字串比較，`"false"` 為 truthy，手動觸發且 `publish=false` 時仍會執行並失敗。屬既有 bug，建議另開任務。
7. **不新增 crate、不改 `src/`、不動 `model/`**：本次只改 CI、新增 Dockerfile/.dockerignore 與文件。

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-29 | ⏳ 等待 Review | Docker Hub repo/觸發方式/base 已由使用者確認 |
| 2026-10-29 | ✅ 已批准 | 使用者回覆「批准，開始實作」 |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-29 | code-reviewer | B-1：既有兩個 musl job 會因 `mime-infer 4.1.0`（需 rustc 1.95）失敗 | 兩個 musl job 的 `sh -c` 加上 `cargo update -p mime-infer --precise 4.0.1 &&` |
| 2026-10-29 | code-reviewer | B-2：冒煙測試只驗 `--help` 且依賴隱式 pull，驗不到執行期 | 改為 `docker pull` → `--help` → 起容器輪詢 `/status`（失敗即 step 失敗） |
| 2026-10-29 | code-reviewer | B-3：計畫任務狀態與 Review 日誌未更新（違反 §10） | 本節與任務列表已更新 |
| 2026-10-29 | code-reviewer | B-4：tag push 會空跑全部 14 個既有 build job | 14 個 build job 加 `if: github.event_name == 'workflow_dispatch'` |
| 2026-10-29 | code-reviewer | S-1/S-2/S-3/S-6：root 執行、缺 HEALTHCHECK、`strip` 砍符號表、dockerignore 列舉過窄 | 改為非 root（uid 10001）、新增 HEALTHCHECK、改 `strip --strip-debug`、改用 glob |
| 2026-10-29 | code-reviewer | 第二輪複審 | ✅ 通過（Approved）；僅提醒「先發佈後驗證」的固有取捨，已記入風險 5 |

## 備註

- 使用者已確認：repo = `mmhk/ddddocr`、以 tag push 觸發、alpine + musl 靜態。
- 是否需要同時推 GHCR 未確認，本計畫預設**只推 Docker Hub**。
