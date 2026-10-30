# OCR 使用說明 Guideline 建立

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-10-30
**狀態**: 🟢 完成
**優先級**: Medium

## 背景與目標

使用者已在 Docker 上啟動服務並驗證 `/ocr` API（含 `length=5` 可達 14/14 準確率）。需求：在 `/docs` 目錄下建立一份 OCR 使用說明 Guideline，作為 API 呼叫的實務指南。

目標產出：`docs/ocr-guideline.md`（繁體中文），內容涵蓋：
- `/ocr` endpoint 基本用法與請求/回應格式
- 各選填參數（`color_filter`、`charset_range`、`length`）的用途與建議
- `length` 參數的實務效益（搭配驗證碼固定長度可顯著提升準確率）
- 附上實際範例（curl / Node.js）與 docs/example 測試數據
- 疑難雜症與最佳實務

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 建立 `docs/ocr-guideline.md`（繁體中文 OCR 使用指南） | ✅ 完成 | general | 含 API 格式、參數、範例、測試數據 |
| 2 | `code-reviewer` 依 plan 與 §10 checklist Review | ✅ 完成 | code-reviewer | 0 個 H/M，3 個 L 級備註，結論可通過 |

## 驗收標準

- `docs/ocr-guideline.md` 存在，內容與 `.agent/skills/ddddocr/references/api.md`、`README.md` 一致（field 名稱、回應格式）。
- 參數說明精確反映實際行為（`length` 為 Phase 2 新增、僅影響官方行模型分支）。
- 包含可執行範例與 docs/example 實測準確率數據。

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-30 | ✅ 已批准 | 核准建立 `docs/ocr-guideline.md` |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-30 | code-reviewer | L1：`color_filter`「預設為…」措辭易誤讀為預設套用過濾 | 改為「未指定時不過濾；預設色供單一/組合過濾用」 |
| 2026-10-30 | code-reviewer | L2：`docs/example/` 目前 untracked（既有未決項目 M4） | 備註級，不在本文件範圍 |
| 2026-10-30 | code-reviewer | L3：與 §9 README 集中原則稍有出入 | 使用者明確要求 + plan 已載明，屬合理例外 |

## 備註

- 依 §2，`docs/` 為既有目錄（`example/`、`plans/`），新增 `docs/ocr-guideline.md` 屬既有目錄內新增檔案，非新增頂層目錄。
- 依 §9，此為使用說明文件；不改動 API 因此不需同步 `list.json` / `test_api.py` / `README*`。
