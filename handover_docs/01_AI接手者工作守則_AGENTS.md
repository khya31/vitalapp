# 文檔一：AI 接手者工作守則 (AGENTS.md)

> **文檔定位**：每次對話優先注入之工作原則與安全邊界，規範 AI 助手與開發者修改代碼的唯一準則。

---

## 1. 真理來源優先序 (Hierarchy of Truth)
1. **最高生產真理**：
   - 後端：`dist/<core|chat|progression>/Code.gs` 與各微服務之 `Bridge.html`。
   - 前端：`src/frontend/html/`（包含靜態圖資目錄 `avatar-female/`, `avatar-male/`, `Chest_Assets/`, `Cute_Icons/`, `UI/`）。
2. **測試轉接層**：`src/backend/` 為單元測試樁與適配層，專供 `tests/` 執行離線驗證。
3. **架構規範**：`docs/` 為系統設計意圖與契約規範。
4. **衝突裁決原則**：當文件與程式碼衝突，**永遠以程式碼為準**，並主動提示使用者更新過期文檔。

---

## 2. 程式碼修改鐵律

### 2.1 後端代碼修改 SOP
1. **修改標的**：直接修改 `dist/<服務>/Code.gs`（若涉及跨域通信需同步確認 `Bridge.html`）。
2. **同步測試樁**：若修改涉及領域業務模型，必須同步鏡像至 `src/backend/modules/`。
3. **執行驗證**：必須執行 `agy-node tests/run-all.js` 確保全案 21 個套件、589 項測試案例（基準 589/589 PASS）全數 100% PASS。
4. **⚠️ 絕對禁止行為與危險腳本**：
   - 嚴禁執行 `scripts/archive/legacy_build_tools/generate_three_microservices.js`（會以早期殘缺模板覆蓋摧毀生產代碼）。
   - 嚴禁執行 `scripts/archive/` 內任何歷史一次性遷移腳本。
   - 嚴禁修改已廢棄之舊管理員目錄 `archive/deprecated_admin/`。
   - ⚠️ **嚴禁將個人獎勵寫入 Col 2 年份鍵**：個人里程碑、成就寶箱、個人特殊獎勵，必須直接累加至 `PlayerProgress` Col 5 (`settledTotalScore`)，嚴禁寫入 `PlayerProgress` Col 2 `historySummary` 當前年份鍵（如 `"2026"`）。Col 2 僅保存往年歷史封存與底線開頭之系統控制標記。
   - ⚠️ **嚴禁覆蓋或污染 Col 6 入組基準分**：`PlayerProgress` Col 6 `joinBaseScore` 嚴格受物理隔離保護。持久化寫入必須限定為 Col 2~5（矩陣寬度 4），除正式入退組事件外，任何常態結算與獎勵發放嚴禁異動 Col 6。
   - ⚠️ **嚴禁在常態排程夾帶一次性遷移邏輯**：日常夜間結算排程（`executeDailySettlement`）必須維持零歷史遷移雜訊；2026 歷史個人獎勵一次性遷移已在線上執行完畢並自生產代碼徹底清理，嚴禁再次引入過渡性遷移代碼。

### 2.2 前端代碼修改與發布 SOP
1. **修改標的**：一律修改 `src/frontend/html/`。
2. **雙軌快取版本同步遞增**：
   - 修改 `src/frontend/html/sw.js` 遞增 `CACHE_NAME`（**目前為 `vital-cache-v104`**）。
   - 同步修改 `index.html` 內引用之 CSS/JS 查詢標籤（如 `?v=20261014-v104`）。
3. **Git 倉庫目錄原則**：
   - **專案根目錄非 Git 倉庫**！Git 倉庫位於 `src/frontend/`。
   - 必須於 `src/frontend/` 目錄下執行 Git 操作，或使用 `git -C src/frontend ...`。
4. **雙遠端發布用途**：
   - **`origin`**：使用者測試專案 (`https://hsnu125739.github.io/vitalapp/`)。
   - **`khya`**：正式對外上線專案 (`https://khya31.github.io/vitalapp/`)。
5. **⚠️ 嚴禁漏更雙軌快取版本**：修改前端 JS/CSS/HTML 時，必須同步遞增 `sw.js` (`CACHE_NAME`) 與 `index.html` 引用之查詢標籤，嚴禁只更新單一處。

---

## 3. 五大不可違背之架構不變量 (Invariants)
1. **最小包圍區間批次讀取 (Bounding-Box Batch Seam)**：
   - GAS 試算表存取嚴禁在迴圈內呼叫 `getRange()` 或 `getValue()`；離散成員必須單次讀取二維矩陣於記憶體運算。
2. **防禦性參數沙盒 (Defensive Parameter Sandbox)**：
   - 成就判定與條件解析必須以 `try-catch` 包裹，單條自訂規則語法錯誤記錄 `AdminLogs` 並略過，絕不可中斷結算排程。
3. **跨午夜邊界保護、離線戳記與動態時鐘 (Cross-Midnight Invariants)**：
   - 嚴格以台灣時區 (GMT+08:00) 錨定日期天，前端嚴禁以靜態變數快取 `currentDate`，必須使用動態 Getter/Setter；離線佇列強制攜帶 `targetDate` 戳記，跨午夜補送時後端追溯判定。
4. **細粒度權威狀態對齊 (Fine-Grained Authoritative State Alignment)**：
   - 前端以細粒度 Set (`dailyMutations`, `meetingMutations`) 追蹤未同步欄位，在途狀態 Latest-Wins，隊列清空後以伺服器權威為準，杜絕打卡幽靈復活。
5. **點數守恆與雙軌記帳分流三大戒律 (Point Conservation & Ledger Invariants)** ★ **核心不變量**：
   - **Col 2 與 Col 5 欄位職責分工**：
     - **個人獎勵直通 Col 5**：個人里程碑、成就寶箱、個人特殊獎勵，直接累加至 `PlayerProgress` Col 5 (`settledTotalScore`)，Col 2 (`historySummary`) 僅保留往年封存與排程控制標記（`_lastSettledDate`, `_settledWeekKey`, `_settledMeetings`），嚴禁出現當前年份鍵。
     - **小組獎勵沉澱 Col 2**：小組篇章解鎖、小組特殊獎勵、退組成員貢獻分，維持沉澱至 `GroupProgress` Col 2 (`historySummary`)。
   - **點數守恆三大戒律**：
     1. **入組前不回溯**：未入組聖徒之操練與獎勵分，加入小組時自動以當時結算分錨定 `joinBaseScore` (Col 6)，入組瞬間個人貢獻分 $\max(0, \text{settledTotalScore} - \text{joinBaseScore}) = 0$，物理排除入組前點數，絕不回溯灌水給新組。
     2. **入組後同心累積**：在籍期間之個人操練與個人獎勵直接推升 Col 5 結算分，個人貢獻分與小組總分同步增長；夜間排程同晚即時連動小組篇章評估，實現同晚獲獎即時突破門檻解鎖小組新篇章。
     3. **退組自動沉澱**：組員離隊時，其在籍個人貢獻分全額沉澱至舊組 `GroupProgress` Col 2，舊組總分嚴格守恆不失分；轉入新組時重新錨定新 `joinBaseScore`，新組貢獻重新從 0 起算，全召會點數不憑空增減。

---

## 4. 操作權限邊界
1. **可自主執行**：本地代碼修改、測試執行（確保 21 套件 100% 綠燈）、程式碼審查（遵循 Ponytail 原則消除過度設計與死代碼）、diff 與驗證紀錄產生。
2. **需使用者指示**：
   - 將代碼手動複製貼上至 Google Apps Script 網頁編輯器並發布新版本。
   - 執行 `git push origin main` 或 `git push khya main` 推送至遠端倉庫。
