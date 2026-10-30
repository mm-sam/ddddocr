# 多候選解碼 + 打分擇優策略（依 docs/example 重建）

> **⚠️ AI 生成聲明**：本文件由 AI 輔助生成，僅供參考。所有內容必須經過**人類 Review + 確認**後才能進入實施階段。未經確認前，不得開始任何開發工作。

**建立日期**: 2026-10-29
**狀態**: 🟢 完成（M4 目錄歸屬待人類決定）
**優先級**: High

## 背景與目標

以 `ddddocr:test`（2026-10-29 建置）對 `docs/example/` 14 張驗證碼做 `/ocr` 測試，filename 為人類識別答案，結果只有 **9/14 = 64.3%**。

把每張圖的原始機率矩陣 dump 出來（`probability: true`，T=25 rows × 8210 classes）後發現：**模型本身認字幾乎全對，錯誤全部發生在「逐列 argmax → 字串」這一步的兩套不一致的解碼實作**：

| 路徑 | 行為 | 問題 |
|------|------|------|
| `classification`（`src/lib.rs` ~1783-1795） | argmax → 濾掉 blank(0) → `v != last_item`（last_item 只在輸出時更新） | blank 不會重置 last_item，**跨 blank 的相同字元被吞掉**：`355fx→35fx`、`y33g3→y3g3`、`yyfe8→yfe8` |
| `classification_probability` → `CharacterProbability::get_text`（~411-427） | argmax → 直接串接，不去重 | **相鄰重複列不去重**：`enw78→ennw78` |

同一張圖換一條路徑答案就不同（`355fx` vs `35fx`），本身就是 bug。

原始逐列序列（`_` = blank）證實模型輸出近似 CTC，正確解碼是「只在連續相同列之間去重，blank 會中斷連續性」：

```
355fx: _ _ _ _ _ _ 3 _ _ 5 _ _ _ 5 _ f _ _ x _ _ _ _ _
yyfe8: _ _ _ _ _ y _ _ _ y _ _ f _ _ _ e _ _ 8 _ _ _ _ _
y33g3: _ _ _ _ _ y _ _ _ 3 _ _ 3 _ _ _ g _ _ _ 3 _ _ _ _
enw78: _ _ _ _ _ e _ _ n n _ _ _ w _ _ 7 _ _ _ 8 _ _ _ _
45g46: _ _ _ r _ 4 _ _ _ 5 _ _ g _ _ _ 4 _ _ _ 6 _ _ _ _
g2n8g: _ _ i _ _ g _ _ _ 2 _ _ _ n _ _ _ 8 _ _ _ g _ _ _
```

### 目標

1. 建立單一、正確的解碼策略，讓 `classification` 與 `classification_probability` 結果一致。
2. 以「多候選 + 機率打分擇優」實作，而不是把 case 寫死。
3. 以 `docs/example` 14 張圖為驗收基準（可達成的上限見下）。

### 已確認的可達成上限（重要）

正確 CTC 去重後仍有 2 張不匹配，且**這兩張圖上真的存在筆畫**（放大 4 倍目視確認）：

| 圖 | 人類答案 | 模型 | 說明 |
|----|----------|------|------|
| `45g46.png` | 45g46 | `r45g46` | 左側多一筆像 `r` 的殘缺筆畫，p=0.998（高信心） |
| `g2n8g.png` | g2n8g | `ig2n8g` | 左側多一筆殘缺筆畫 `i`，p=0.536（低信心） |

因此：

- **不引入長度先驗**：上限 **12/14 = 85.7%**（僅修正解碼 bug，不碰模型）。
- **引入長度先驗**（這批驗證碼固定 5 字）：可到 **14/14**，作法是「產生的字串超過指定長度時，丟掉峰值機率最低的片段」。`g2n8g` 丟掉 p=0.536 的 `i`、`45g46` 丟掉 p=0.998 的 `r`（其餘皆為 1.000）。

兩者都不新增依賴、不改模型檔。

## 設計（Phase 1：核心策略，不變更公開 API）

在 `src/lib.rs` 末端（flat 檔案、不新增模組）加入一個內部解碼器，輸入為「逐列機率矩陣」與候選片段，輸出擇優結果：

1. **片段化**：對每列取 argmax，把連續相同 label 的列合併為一個「片段」（segment），記錄字元、列數、峰值機率、平均機率。blank（索引 0）自成一類並斷開片段。
2. **候選產生**（全部由同一份片段表推導，不重新推論）：
   - `ctc`：片段直接輸出（正確 CTC 去重）— 修正 3 個重複字元案例。
   - `no_collapse`：保留相鄰重複（現行 `get_text` 行為）— 作為候選，不再當唯一答案。
   - `global_dedup`：跨 blank 全局去重（現行 `classification` 行為）— 作為候選，不再當唯一答案。
   > 原設計另有 `ctc_drop_low`（丟棄低信心孤立片段），Review 實測發現會讓 legacy（`common_old`）模型掉字（`极速换新→极换新`），已移除；改由 Phase 2 的 `length` 先驗處理多餘字元。
3. **打分**：`score = Σ log(片段峰值機率) / 片段數`（長度歸一化，避免長短候選不可比），取最高分候選；**分數相同時取較早的候選（`ctc` 優先）**。
4. **一致性**：`classification*`（非 diy、非 word 分支）與 `CharacterProbability::get_text` 都改呼叫同一個解碼器，確保兩條路徑對同一張圖回傳相同字串。
5. **保留既有行為**：`diy` 模型分支、`word == true` 分支、`charset_range` 投影後取 argmax 的邏輯不動。

## 設計（Phase 2：長度先驗，需變更公開 API — 預設不啟用）

新增可選參數 `length: Option<usize>`：

- Library：`Ddddocr::classification_with_length`（另有 `classification_with_length_with_path`）／`CharacterProbability::get_text_with_length`。
- REST `/ocr` 與 MCP `ocr` 增加選填欄位 `length`。
- 行為：候選字串長度 > `length` 時，片段按峰值機率升冪丟棄多餘者；長度不足則不補。
- 未帶此參數時，行為與 Phase 1 完全相同。

> Phase 2 會觸及 `README.md` / `README_EN.md` / `test_api.py` / `list.json` / `.agent/skills/ddddocr/references/{api,mcp}.md`，屬 §9 同步範圍。

## 任務列表

| # | 任務 | 狀態 | Sub Agent | 備註 |
|---|------|------|-----------|------|
| 1 | 在 `src/lib.rs` 實作片段化 + 候選產生 + 打分擇優，取代官方行模型的兩種解碼 | ✅ 完成 | general | 待 Review |
| 2 | 讓 `classification*` 與 `CharacterProbability::get_text` 共用同一解碼器 | ✅ 完成 | general | 兩路徑答案一致（測試已驗證） |
| 3 | 在既有 `mod tests` 加入 14 張 `docs/example` fixture 的斷言測試（Phase 1 期望 12/14，2 張列為已知差異） | ✅ 完成 | general | 12/14（`45g46`、`g2n8g` 已知差異）+ legacy 模型回歸測試 |
| 4 | 重建 `ddddocr:candidate` image，用 REST 對 14 張圖重跑並輸出準確率 | ✅ 完成 | general | 不帶 length 12/14；`length=5` 14/14（127.0.0.1:18081） |
| 5 | （Phase 2）新增 `length` 參數與文件/JSON/skill 同步 | ✅ 完成 | general | `length=5` 達 14/14 |
| 6 | `code-reviewer` 依 plan 與 §10 checklist Review，記錄結果 | ✅ 完成 | code-reviewer | H1/M1/M2/L5 已修；M4 待人類決定 |

## 驗收標準

- Phase 1：14 張圖中至少 **12/14** 通過；`classification` 與 `probability: true` 兩條路徑對同一張圖輸出相同字串。
- 既有測試（`cargo test --no-default-features --features download-binaries`）不回歸。
- Phase 2（若核准）：14/14。
- `cargo fmt` 已執行，未新增 crate，未改 `model/*.onnx`。

## 人類 Review 記錄

| 日期 | 動作 | 備註 |
|------|------|------|
| 2026-10-29 | ✅ 已批准 | 核准 Phase 1 + Phase 2（新增 `length` 參數以達 14/14） |

## Review 日誌

| 日期 | Reviewer | 發現 | 處理方式 |
|------|----------|------|----------|
| 2026-10-30 | code-reviewer | H1：`ctc_drop_low` 讓 legacy 模型掉字（`image/2.png` `极速换新→极换新`） | 移除該候選，改由 `length` 先驗縮短；已加 legacy 回歸測試 |
| 2026-10-30 | code-reviewer | M1：平手 tie-break 取較長字串不穩定 | 改為取較早候選（`ctc` 優先） |
| 2026-10-30 | code-reviewer | M2：`global_dedup` 用 0 當哨兵 | 改為 `Option<usize>` |
| 2026-10-30 | code-reviewer | L5：缺 `_with_path` 兄弟方法 | 補 `classification_with_length_with_path` |
| 2026-10-30 | code-reviewer | M4：`docs/example/` 目前 untracked，AGENTS §2 未定義此目錄 | 待人類決定（納入追蹤／搬到 `image/example/`） |

## 備註

- 診斷用腳本（暫存，不進 repo）：`E:\temp\opencode\{ocr-test,dump-prob,analyze,rows-detail}.ps1`；機率矩陣 dump 於 `E:\temp\opencode\prob\*.json`。
- 測試容器：`ddddocr-test`，`127.0.0.1:18080`。
- 原 `classification` 的 `v != last_item` 去重若直接改成 CTC，屬行為變更，需在 README 疑難雜症補一行說明（§9）。
- 不建議把 14 張圖的答案寫成 case-by-case 規則；上面 2 張失敗為影像本身有殘缺筆畫，硬套只會 overfit。
