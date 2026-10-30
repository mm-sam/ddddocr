# ddddocr `/ocr` 使用指南

> 本文檔說明 ddddocr 的 `/ocr` OCR 辨識 endpoint 的用法，包含 API 呼叫格式、參數說明、實務範例與準確率實測結果。

**建立日期**: 2026-10-30

---

## 1. 概述

`/ocr` 是 ddddocr 服務提供的文字辨識（OCR）endpoint。它接收一張以 Base64 編碼的圖片，透過內建的官方行模型進行光學字元辨識，回傳辨識出的文字內容。

**適用場景：**
- 驗證碼（captcha）自動辨識
- 純文字、純數字或混合字元圖片的內容抽取
- 需要批量、透過 HTTP API 進行辨識的情境（例如爬蟲自動化、表單自動填寫）
- 需要指定字元範圍（`charset_range`）、色彩過濾（`color_filter`）或期望長度（`length`）以提升準確率的場景

`/ocr` 使用官方行模型（CTC 解碼）。若未指定任何參數，即套用預設行為。

---

## 2. API 說明

### Endpoint

- **路徑**：`/ocr`
- **方法**：`POST`
- **Content-Type**：`application/json`
- **Base URL**：`http://127.0.0.1:8000`（預設）

### 請求格式

Body 為 JSON，至少需帶 `image` 欄位：

```json
{
  "image": "<base64_encoded_image>"
}
```

### 回應格式

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "text": "355fx",
    "probability": null
  }
}
```

**辨識結果位於 `data.text`。** `probability` 欄位在未開啟機率輸出時為 `null`。

---

## 3. 參數說明表

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `image` | string | 是 | Base64 編碼的圖片資料。 |
| `color_filter` | string / array | 否 | 色彩過濾。未指定時不過濾；可指定單一或多個預設色（`red, blue, green, yellow, orange, purple, cyan, black, white, gray`），或自訂 HSV range，例如 `[(min_h, min_s, min_v), (max_h, max_s, max_v)]`。 |
| `charset_range` | string / number | 否 | 字元範圍。值 `0`–`7` 為內建範圍，或自訂字串（例如 `"0123456789+-x/="`）。 |
| `length` | number | 否 | 期望字元數。結果超過此長度時，丟棄峰值機率最低的片段。不帶則維持預設行為。**僅影響官方行模型分支。** |

### 內建字元範圍（`charset_range` 值 0–7）

| 值 | 說明 |
|----|------|
| 0 | 純數字 0-9 |
| 1 | 純小寫字母 a-z |
| 2 | 純大寫字母 A-Z |
| 3 | 小寫 a-z + 大寫 A-Z |
| 4 | 小寫 a-z + 數字 0-9 |
| 5 | 大寫 A-Z + 數字 0-9 |
| 6 | 小寫 a-z + 大寫 A-Z + 0-9 |
| 7 | 預設字元集（不含空白） |

### 色彩過濾預設

`red`, `blue`, `green`, `yellow`, `orange`, `purple`, `cyan`, `black`, `white`, `gray`

HSV range 亦可指定為 tuple 陣列：`[(min_h, min_s, min_v), (max_h, max_s, max_v)]`

---

## 4. 實務範例

### 4.1 curl 範例

**基本呼叫：**

```bash
curl -X POST "http://127.0.0.1:8000/ocr" \
     -H "Content-Type: application/json" \
     -d '{"image": "<base64_encoded_image>"}'
```

**帶 `length=5`（固定 5 字元驗證碼）：**

```bash
curl -X POST "http://127.0.0.1:8000/ocr" \
     -H "Content-Type: application/json" \
     -d '{"image": "<base64_encoded_image>", "length": 5}'
```

**帶 `color_filter`（綠色前景）：**

```bash
curl -X POST "http://127.0.0.1:8000/ocr" \
     -H "Content-Type: application/json" \
     -d '{"image": "<base64_encoded_image>", "color_filter": "green"}'
```

### 4.2 Node.js (fetch) 範例

**基本呼叫：**

```javascript
const image = fs.readFileSync("355fx.png").toString("base64");

const res = await fetch("http://127.0.0.1:8000/ocr", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image }),
});

const json = await res.json();
console.log(json.data.text); // 辨識結果
```

**帶 `length=5`（固定 5 字元驗證碼）：**

```javascript
const image = fs.readFileSync("355fx.png").toString("base64");

const res = await fetch("http://127.0.0.1:8000/ocr", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image, length: 5 }),
});

const json = await res.json();
console.log(json.data.text); // 辨識結果
```

---

## 5. 準確率實測

以 `docs/example/` 下 14 張 5 字元驗證碼實測（檔案命名即預期答案，例如 `355fx.png` → `355fx`）：

| 設定 | 準確率 |
|------|--------|
| 不帶 `length` | **12/14** |
| 帶 `length=5` | **14/14** |

**兩張誤判說明（不帶 `length` 時）：**

- **`45g46`**：首字元多判，模型在左側帶殘缺筆畫處多輸出一個字元，導致結果多出一個字元。
- **`g2n8g`**：同樣首字元多判，因左側帶殘缺筆畫，未指定 `length` 時多出一個字元。

這批驗證碼固定為 5 字元，使用 `length=5` 後，模型會按峰值機率丟棄多餘片段，使兩張皆正確辨識，準確率提升至 **14/14**。

---

## 6. 最佳實務與疑難雜症

- **固定長度驗證碼務必使用 `length`**：若驗證碼長度固定，明確指定 `length`（如 `length=5`）可顯著提升準確率。實測中準確率由 12/14 提升至 14/14。
- **`length` 僅影響官方行模型分支**：官方行模型使用 CTC 解碼，只有帶 `length` 時才會按峰值機率丟棄多餘片段。若不帶則維持預設 CTC 行為（相鄰相同字元只在連續時合併，空白會中斷重複）。
- **首字元多判的常見原因**：圖片左側帶殘缺筆畫（如 `45g46`、`g2n8g`）時，未指定 `length` 會多輸出一個字元。指定正確字數即可消除。
- **辨識結果欄位是 `data.text`**：回應的 JSON 結構為 `{code, msg, data}`，文字結果位於 `data.text`。解析時請取 `data.text`，而非整個 `data`。
- **`probability` 可能為 `null`**：未開啟機率輸出時 `probability` 欄位為 `null`，勿依賴其數值。
- **用 `color_filter` 強化前景**：若驗證碼前景為特定單色，指定對應的 `color_filter` 可過濾雜訊背景，提升辨識穩定度。
- **用 `charset_range` 限定字元**：若驗證碼只含特定字元（如純數字、或 `0123456789+-x/=`），指定 `charset_range` 可縮小搜尋範圍，避免將符號誤判為字母。
- **Base64 編碼**：`image` 欄位需為 Base64 編碼的圖片原始資料（不帶 data URI prefix 亦可，視實際請求而定）。
