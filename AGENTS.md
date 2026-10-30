# AGENTS.md - Project Guidelines

This file is the working contract for AI agents in this repository. Rules stated here are verified against the current code; if a rule is wrong, fix the rule in the same change.

---

## 0. Project Overview

**ddddocr** is a Rust captcha/OCR toolkit and API server, usable as a library or a standalone binary. No OpenCV dependency.

### Core features
- **OCR classification** — official model, legacy model, custom dddd_trainer models
- **Object detection** — 416×416 anchor-free detector returning bounding boxes
- **Slide matching** — `slide_match` (template matching) and `slide_comparison` (pixel diff); pure `imageproc`, no neural net
- **REST API** — Salvo, Swagger at `/docs`, status at `/status`
- **MCP server** — JSON-RPC over `POST /mcp`, reuses the REST handlers in-process
- **Color filtering / charset ranges** — HSV presets or custom ranges, per request or global

### Tech stack
- Rust 2021, `ort` (ONNX Runtime from a git fork), `ndarray`, `image` + `imageproc`
- `salvo` 0.85 (HTTP/OpenAPI/ACME), `tokio`, `rmcp` 0.12, `clap`
- Models in `model/`: `common.onnx` + `common.json`, `common_old.*`, `common_det.onnx`
- CI: GitHub Actions builds and publishes only the `linux/amd64` Docker image to Docker Hub `mmhk/ddddocr` on `push` tags `v*` (no other build jobs, no binary releases)

---

## 1. Core Principles

1. **No over-engineering.** Use the simplest approach that satisfies the request. No new abstraction layers, traits, or module splits without user approval.
2. **Keep the flat layout.** `src/` intentionally contains only `lib.rs` and `main.rs`; `lib.rs` is a single ~2200-line file. Do not split it into modules or add subdirectories unless asked.
3. **Follow existing API patterns.** New public methods mirror the current naming: base method takes `I: AsRef<[u8]>`, a `*_with_path` sibling takes `P: AsRef<Path>`, and combined behavior is `*_with_options`. Inference methods take `&self`; only `set_ranges` takes `&mut self`.
4. **Don't silently change public behavior.** Preprocessing and decode order are matched to fixed model weights; see §7. Any change there needs before/after output on `image/` fixtures.

---

## 2. Directory Structure

```
.
├── src/lib.rs            # Entire library: factories, Ddddocr, inference, filters, tests
├── src/main.rs           # HTTP + MCP server binary (Salvo, clap, rmcp)
├── model/                # ONNX models + charset JSON (tracked, required for non-inline builds)
├── image/                # Test fixtures used by lib tests and test_api.py
├── initialize.json       # Static MCP initialize result (include_str!)
├── list.json             # Static MCP tools/list result (include_str!)
├── test_api.py           # Manual REST/MCP smoke script (prints curl; not pytest)
├── .agent/skills/ddddocr/ # Packaged agent skill: python scripts + API/MCP references
├── .github/workflows/build.yml # Docker-only workflow (push tags `v*`): single `docker-image` job
├── docs/plans/           # Implementation plans ONLY (see §12); no other docs here
├── Dockerfile            # musl builder image (rust:1.90.0-alpine); build-only, not a service image
├── Dockerfile.runtime    # Runnable runtime image: multi-stage builder → alpine:3.22, inline models
├── .dockerignore         # Trims the Dockerfile.runtime build context (excludes target/image/docs, etc.)
└── Cargo.toml            # Features + dependency allowlist
```

Rules:
- **Do not add new top-level directories** other than `docs/plans/` without user approval. User documentation lives in `README.md` / `README_EN.md`.
- New inference code goes at the bottom of `lib.rs`; new routes/helpers go in `main.rs`.
- `docs/plans/` is the single permitted location for plan Markdown files (`docs/plans/<task-name>-plan.md`). Do not create `doc/`, `plans/`, `docs/spec.md`, or per-task plan files anywhere else.
- `model/` and `image/` are inputs, not outputs. Never regenerate or replace them as a side effect of a code change.

---

## 3. Dependencies

### Approved crates (`Cargo.toml`)
| Crate | Purpose |
|-------|---------|
| `ort` (git `86maid/ort`) | ONNX Runtime bindings; fork, not crates.io |
| `ndarray` | Tensors |
| `image`, `imageproc` | Decoding, scaling, Canny, template matching |
| `serde`, `serde_json` | Charsets, API models, static MCP JSON |
| `anyhow` | All public error returns |
| `sha256` | Identifies official vs custom models (`is_diy`) |
| `base64` | API image decoding |
| `salvo`, `salvo_extra` | HTTP server, OpenAPI, ACME |
| `tracing`, `tracing-subscriber` | Logging, `RUST_LOG` |
| `clap` | CLI args |
| `tokio` | Async runtime |
| `lru`, `bytes`, `async-trait` | Response cache, body buffers, async plumbing |
| `lazy_static`, `enable-ansi-support` | Statics, Windows ANSI |
| `rmcp` | MCP protocol types |

### Dependency rules
- **New dependencies require explicit user approval.**
- Prefer existing crates and std before adding anything.
- Do **not** bump `ort` or its feature set casually: there is no committed `Cargo.lock`, and the fork's API may drift.
- No `Cargo.lock` is committed (gitignored); builds resolve fresh and need network/proxy access.

---

## 4. Code Style

### Errors vs panics
- Public API returns `anyhow::Result`; use `?`, `anyhow::bail!`, `anyhow::ensure!`.
- No custom error enums or layered wrappers.
- Existing code **panics** for programmer misuse: calling `classification_probability*` on a custom (`diy`) model, using a detection model where a charset is required, invalid `CharsetRange`/`Color` strings. Do not convert these to `Result` unless asked; do not add new panics for user input that can be validated.
- Server endpoints return `anyhow::Result`; `default_error_handler` wraps errors as `{code, msg, data}`.

### Conventions
- Comments, doc comments, CLI help, README: **Chinese**. Log messages: **English** (`info!("ocr enabled successfully")`). Match this split.
- JSON field names are `snake_case` and appear directly in the public API (`target_image`, `enabled_features`, `charset_range`). Don't rename without updating `list.json`, docs, and `test_api.py`.
- Route handlers in `main.rs` each have request/response structs deriving `Serialize`, `Deserialize`, `ToSchema`; keep that trio.
- Model instances are shared via `OnceLock`; per-request work that blocks (ONNX inference, image processing) **must** run inside `spawn_blocking`.
- `Ddddocr` is `Send + Sync` via `unsafe impl`; inference uses `&self` and shares one `ort::Session`. Don't add mutable session state.

### Formatting / lint
- No `rustfmt.toml`, `clippy.toml`, or lint CI. Run `cargo fmt` before finishing; keep formatting consistent with the existing file (default rustfmt).

---

## 5. Build and Feature Matrix

`default = ["inline-model", "download-binaries"]`.

| Goal | Command |
|------|---------|
| Local/standalone binary (models embedded, no `model/` needed) | `cargo build --release` |
| Model-bundled build (binary + `model/`) | `cargo build --release --no-default-features --features download-binaries` |
| Library only | `cargo build --lib` |
| Run server | `cargo run -- --ocr --det --slide --mcp` |
| Tests | `cargo test --no-default-features --features download-binaries` |
| Single test | `cargo test --no-default-features --features download-binaries classification` |
| musl (Docker only) | `docker build -t rust-musl-builder -f Dockerfile .` then `cargo build --release --target x86_64-unknown-linux-musl ...` inside it |
| Runtime image (`linux/amd64`) | `docker build -f Dockerfile.runtime -t ddddocr:local .` then `docker run --rm -p 8000:8000 ddddocr:local` |

Rules:
- `inline-model` uses `include_bytes!` for every `model/*.onnx`; `--ocr-path` / `--det-path` are ignored while it is on.
- With `--no-default-features`, models load from `model/` relative to the process CWD. Run from repo root or ship `model/` next to the binary.
- `cuda` is dynamic-only and needs CUDA + cuDNN installed (CUDA 12 → cuDNN 9.x). `load-dynamic` needs onnxruntime 1.18.x beside the binary and skips auto-download.
- onnxruntime is auto-downloaded to `%APPDATA%\ort.pyke.io`; set `ORT_LIB_LOCATION` to use local libs. Static-link failures usually mean missing MSVC 2022 (Windows), gcc/g++ 11 (Linux), or glibc ≥ 2.35 (Linux arm64).
- CI only has a `docker-image` job triggered by `push` tags `v*`; it builds the `linux/amd64` runtime image and pushes it to Docker Hub `mmhk/ddddocr`, tagged `latest` plus semver (`v1.2.3` → `1.2.3`, `1.2`). There is no manual trigger and no per-platform binary output.
- Linux musl must be built in the `Dockerfile` image; do not attempt a host musl build.
- `Dockerfile` is only a musl build environment (discarded after use); `Dockerfile.runtime` is the runnable service image (`alpine:3.22`, static musl binary, inline models, `EXPOSE 8000`, default CMD `--ocr --det --slide --mcp`). Publishing the runtime image needs repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

---

## 6. Testing

- Tests live in the `#[cfg(test)] mod tests` block at the end of `src/lib.rs`; `test_api.py` is a manual script, not a test suite.
- Tests read `image/*` via relative paths and write `output1.jpg` / `output2.jpg`, so **run from the repo root**. These outputs are untracked scratch files.
- Existing tests mostly `println!` results; they catch panics/IO/shape errors, not accuracy regressions. When changing preprocessing, compare printed output on the same fixtures before/after instead of trusting a green run.
- Add tests to the existing `mod tests`, 3–5 focused cases per change; do not create new test directories or bulk-generate suites.
- `test_api.py` requires a running server (`--ocr --det --slide --mcp`) and `requests`; it only prints curl commands for each route and does not assert.
- Quick manual API check: start the server, then `curl http://127.0.0.1:8000/status`.

---

## 7. Architecture Patterns (read before touching inference)

### 7.1 Two targets, one crate
`lib.rs` has no dependency on the server; `main.rs` is the only binary and composes Salvo + MCP. Keep the library usable without Salvo types.

### 7.2 Model factories are feature-gated
`ddddocr_classification()`, `ddddocr_classification_old()`, `ddddocr_detection()` each have `#[cfg(feature = "inline-model")]` and `#[cfg(not(...))]` variants, plus `*_cuda(device_id)` under `cuda`. Add a new variant only if the feature matrix stays buildable in all four combinations (inline/non-inline × cuda/no-cuda).

### 7.3 Official vs custom models (`is_diy`)
`is_diy` compares the model SHA-256 against the two official hashes (`lib.rs` ~line 323). Replacing/regenerating `model/common.onnx` or `common_old.onnx` without updating those hashes silently switches normalization and decode branches. Never edit model files casually; if you must, update `is_diy` and re-run fixtures.

### 7.4 Classification pipeline (order matters)
color filter → decode → resize (Lanczos3; `charset.image[0] == -1` means keep aspect and fix height) → channel selection (`1` = luma, else RGB; `png_fix` fills transparent pixels white) → normalize (official: `(x/255 - 0.5)/0.5` on channel 0; custom: ImageNet mean/std per channel) → `session.run` → decode:
- `charset.word == true` → argmax char sequence from output `[1]`
- custom model → dedupe consecutive/zero indices from output `[0]`
- official line model → argmax per row with dedupe, then strip blanks

`classification_probability*` only works on official models (panics on `diy`) and adds a softmax + charset-range projection; unknown range chars get probability `-1.0`.

### 7.5 Detection pipeline
Letterbox to 416×416 with padding `[114,114,114]`, feed **BGR** (`p[2], p[1], p[0]`), decode 3 stride grids (`8/16/32`), score = obj × cls, threshold `SCORE_THR = 0.1`, then NMS with `NMS_THR = 0.45`. Detection uses `Ddddocr::new_model*` (no charset); calling `classification*` on it panics.

### 7.6 Slide matching
`slide_match` crops the target's non-transparent bounds, Canny edges (100/200), then `CrossCorrelationNormalized` template matching. `simple_slide_match` skips cropping. `slide_comparison` requires equal dimensions and scans for the first column with ≥5 differing pixels. These are algorithmic, must stay deterministic, and should be validated against `image/hk.png`+`bg.png`, `image/a.png`+`b.png`, `image/c.jpg`+`d.jpg`.

### 7.7 Server state and concurrency
`ARGS`, `OCR`, `DET` are `OnceLock` statics; charset-range projections are cached in a 64-entry `LruCache` keyed by the request string. Inference runs in `spawn_blocking`. The global body limit is 50 MB (base64 images).

---

## 8. Routes, Flags, and MCP

### REST routes — actual behavior
- `GET /status`, `POST /ocr`, `POST /det`, `POST /slide_match`, `POST /slide_comparison`, `GET /docs`, `GET /docs.json`, `POST /mcp`.
- **Slide routes use underscores.** `README.md` and `.agent/skills/ddddocr` currently document `/slide-match` and `/slide-comparison`, which return 404. `test_api.py` and `list.json` use the correct underscore names. Treat code as truth; when editing docs, fix this.
- With no feature flags the server turns on every feature flag (ocr + old + det + slide), but **not** MCP. Note that when both `--ocr` and `--old` end up set, OCR initialization picks the official model (`if args.ocr` branch).
- Default listen address is `0.0.0.0:8000`; override with `--address`. `--acme <domain>` enables automatic HTTPS.
- `--mcp` = REST + MCP. `--only-mcp` = only `/status` and `/mcp` (other routes are not registered).
- `--ocr` and `--old` are mutually exclusive (`ArgGroup`).
- Calling an MCP tool whose feature flag is off returns "the tool exists, but the server is not enabled".
- Responses are always `{code, msg, data}`, including errors via `default_error_handler`.

### MCP registry is static JSON
`initialize.json` and `list.json` are `include_str!`'d verbatim for `initialize` and `tools/list`. Adding/changing a tool requires:
1. Edit the handler dispatch in `src/main.rs`.
2. Update `list.json` schema (names, required fields, descriptions).
3. Update `initialize.json` only if protocol version/capabilities change.
4. Update `.agent/skills/ddddocr/references/mcp.md` and `api.md`.

Tool names are `ocr`, `det`, `slide_match`, `slide_comparison` — MCP dispatch matches these strings exactly.

---

## 9. Documentation Sync (mandatory after user-facing changes)

User documentation stays in `README.md` / `README_EN.md`; implementation plans go in `docs/plans/` (see §12). Do not create any other doc files or directories. Sync these files instead:

| Change | Must update |
|--------|-------------|
| Route, request/response field, CLI flag | `README.md`, `README_EN.md`, `test_api.py`, `.agent/skills/ddddocr/references/api.md` |
| MCP tool/schema | `list.json`, `.agent/skills/ddddocr/references/mcp.md`, `README.md` |
| Library API (methods, signatures) | `README.md` code samples (they are stale in places, e.g. examples use `let mut ocr` although methods take `&self`) |
| Build/feature behavior | `README.md` "疑难杂症", `AGENTS.md` §5 |
| Docker runtime image / publish behavior | `README.md` (Docker 部署), `README_EN.md` (Docker Deployment), `AGENTS.md` §2/§5 |
| CI trigger or workflow shape (Docker-only, `push` tags `v*`) | `README.md`, `README_EN.md`, `AGENTS.md` §0/§5 |

Library doc comments are Chinese, one short block per public method; keep that style rather than adding standalone docs.

---

## 10. Pre-Output Self-Check

Before finishing any change, verify:
- No unrequested modules, directories, traits, or abstraction layers were added.
- Inference/preprocessing changes were checked against `image/` fixture output before and after.
- `model/*.onnx` was not touched without updating the `is_diy` hashes.
- Any route/schema/flag change was synced to both READMEs, `list.json`, `test_api.py`, and the skill references.
- No crate was added without approval.
- Feature-gated code was built for both `inline-model` and `--no-default-features`.
- `cargo fmt` was run.
- No generated files (`output1.jpg`, `output2.jpg`, root `*.png`/`*.jpg`) are staged.
- A plan exists in `docs/plans/<task-name>-plan.md` and was explicitly approved before implementation.
- The plan's task statuses and Review 日誌 reflect the actual final state.

If any item fails, fix it before reporting completion.

### Output format
1. State the minimal change: files touched and why.
2. List verification performed (commands, fixture outputs).
3. List docs/JSON that were synced (or explicitly state none were needed).

---

## 11. Git Rules

- **Never commit**: `target/` (already ignored), `*.exe`/`*.dll`/`*.so`/`*.dylib`, generated root `*.png`/`*.jpg`, `output1.jpg`/`output2.jpg`, `Cargo.lock` (intentionally gitignored).
- **Do commit** when relevant: `model/*.onnx` and `model/*.json` are tracked; `image/` fixtures are tracked. Do not add them to `.gitignore`.
- Commit messages in this repo are short Chinese phrases (e.g. `修复 mcp 下划线 bug`); there is no Conventional Commits history and no enforced format. Match the existing style rather than introducing a new convention.
- Check `git status` before committing; unrelated modified model/image files are a red flag.

---

## 12. Agent Orchestration & Workflow (Mandatory)

Aligned with the team agent contract: **plan → user approval → delegate → review → update → loop**.

### 12.1 Role separation
- **Main agent** — orchestrator: writes the plan, requests approval, delegates, tracks status, resolves blockers. It MUST NOT edit `src/`, `Cargo.toml`, `initialize.json`, `list.json`, `README*.md`, or `.agent/skills/` directly; delegate those edits.
- **Sub agents**:
  - `explore` — locate code/architecture before planning.
  - `general` — implementation, tests, doc/JSON sync.
  - `code-reviewer` — review against the plan and the §10 checklist.
  - `requirement-clarity` — resolve ambiguity before planning.

### 12.2 Workflow (mandatory order)
1. **PLAN** — create or update `docs/plans/<task-name>-plan.md`.
2. **USER REVIEW** — present the plan summary with the `question` tool (plan path, task list, scope, open questions) and wait for explicit approval.
3. **DELEGATE** — one sub agent per logical task; independent tasks in parallel.
4. **REVIEW** — `code-reviewer` verifies the implementation against the plan, §7/§8/§9 sync rules, and the §10 checklist.
5. **UPDATE** — mark task statuses and append the review outcome to the plan.
6. **LOOP** — take the next task, or re-delegate on failure, until every task is ✅ or explicitly ⏭️.

**Approval gate:** never delegate implementation before explicit user approval. If the user requests changes, update the plan and present it again.

### 12.3 Plan file rules
- **Location:** `docs/plans/` only; filename `<task-name>-plan.md` (kebab-case, e.g. `slide-route-doc-fix-plan.md`).
- **Language:** Traditional Chinese, matching the template below.
- Every plan starts with the AI-generated disclaimer; the human review record is mandatory.
- Plans are implementation artifacts, not product docs: API/usage documentation still goes in `README*` per §9.

```markdown
# <任務標題>

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: YYYY-MM-DD
**狀態**: 🟡 等待 Review | 🟢 完成 | 🔴 阻塞 | ⚪ 待處理
**優先級**: High | Medium | Low

## 背景與目標
簡要說明為什麼需要這個任務，以及預期達成什麼目標。

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 任務描述 | ⬜ 待處理 | — | |
| 2 | 任務描述 | 🔄 進行中 | general | |
| 3 | 任務描述 | ✅ 完成 | general | 已 Review |

狀態圖示：⬜ 待處理 / 🔄 進行中 / ✅ 完成 / 🔴 阻塞 / ⏭️ 跳過（附原因）

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| YYYY-MM-DD | ⏳ 等待 Review / ✅ 已批准 / 🔄 要求修改 / ❌ 已拒絕 | |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| YYYY-MM-DD | code-reviewer | 描述 | 修復方式 |

## 備註
額外背景、決策或阻塞問題。
```

### 12.4 Delegation rules
- Include full context in every prompt: file paths, constraints from this file, expected verification steps.
- One sub agent per logical task; do not batch unrelated changes.
- Use `explore` before `general` when the area is unfamiliar.
- Run `code-reviewer` after every implementation batch, and once more at milestones.
- Sub agents must run the §5 verification relevant to their change and report fixture output for inference changes (§7).

### 12.5 Main agent loop duties
1. Break the work into discrete tasks in the plan.
2. Execute via sub agents and verify each output.
3. Update plan statuses after every batch.
4. On failure: diagnose, adjust the prompt, re-delegate.
5. End only when every task is ✅ or ⏭️ with a reason, and the final review is recorded.

### 12.6 Forbidden main-agent actions
- Skipping the plan file, the user approval gate, or the review step.
- Editing source/config/docs directly instead of delegating.
- Marking a task ✅ without reviewer confirmation.
- Abandoning a task without setting 🔴 Blocked and a reason.
- Creating plan files anywhere outside `docs/plans/`.

