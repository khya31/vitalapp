# 📡 文檔十二：API 端點契約書 (Endpoints Contract Specification)

> **目的**：定義全系統三微服務（Core、Progression、Chat）48 個 Action 的完整通訊協議、請求參數、回傳負載、IDOR 安全契約、首頁雙點數面板接收契約與全域錯誤代碼。  
> **關聯文件**：[09_前端架構書.md](file:///d:/Antigravity%20workspaces/高雄青職專案/docs/handover_docs/09_前端架構書.md)、[10_成就與履約系統架構書.md](file:///d:/Antigravity%20workspaces/高雄青職專案/docs/handover_docs/10_成就與履約系統架構書.md)、[14_命名規範與編碼慣例.md](file:///d:/Antigravity%20workspaces/高雄青職專案/docs/handover_docs/14_命名規範與編碼慣例.md)


---

## 1. 通用通訊協議與信封標準

### 1.1 HTTP POST 標準請求信封 (`CanonicalPostRequest`)
透過 HTTP POST 發送至 GAS Web App `doPost(e)` 的 JSON 請求必須符合以下結構：

```typescript
interface CanonicalPostRequest<T = Record<string, any>> {
  /** 欲調用之微服務 Action 名稱（小駝峰，必填） */
  action: string;

  /** 使用者會話簽名權杖（需鑑權 Action 必填；公開端點為選填或空字串） */
  token?: string;

  /** 前端產生之追蹤 ID，用於日誌排查（格式：REQ_<timestamp>_<uuid4>） */
  requestId?: string;

  /** 
   * 業務參數容器物件（必填，禁止在根物件平鋪業務欄位）
   * 若無業務參數，必須提供空物件 {}
   */
  data: T;
}
```

* **入站參數正規化相容 (`normalizeInboundParams`)**：
  * 後端入口統一透過 `normalizeInboundParams(payload)` 進行解包。
  * 優先提取標準 `payload.data` 容器，若前端傳入頂層扁平屬性亦自動無感融合，保證跨呼叫管道（HTTP POST、Iframe RPC、單元測試適配器）參數解析零歧義。

---

### 1.2 成功回應標準信封 (`CanonicalSuccessEnvelope`)
```typescript
interface CanonicalSuccessEnvelope<T = Record<string, any>> {
  /** 呼叫成功狀態（固定為 true） */
  success: true;

  /** 狀態代碼（"OK" 或 "NOT_MODIFIED"） */
  code: 'OK' | 'NOT_MODIFIED';

  /** 人類可讀之成功提示訊息（選填） */
  message?: string;

  /** 唯一合法的領域業務資料容器 */
  data: T;

  /** 標記本次回應是否命中 ScriptCache 快取 */
  fromCache?: boolean;

  /** HTTP 語意狀態碼（如 200 或 304） */
  status?: number;

  /** 伺服端完成時間戳（ISO-8601 GMT+8 字串） */
  respondedAt: string;
}
```

---

### 1.3 失敗回應標準信封 (`CanonicalErrorEnvelope`)
```typescript
interface CanonicalErrorEnvelope {
  /** 呼叫失敗狀態（固定為 false） */
  success: false;

  /** 全域標準錯誤代碼（全大寫蛇形） */
  code: string;

  /** 人類可讀之繁體中文錯誤描述 */
  error: string;

  /** 結構化除錯資訊或欄位明細（選填） */
  details?: Record<string, any> | null;

  /** 伺服端發生錯誤時間戳（ISO-8601 GMT+8 字串） */
  respondedAt: string;
}
```

---

### 1.4 Iframe Bridge 無包裹穿透標準 (Zero Double-Wrapping)
`Bridge.html` 作為透明 RPC 通訊通道，**不得對已經標準化的後端回傳信封再次進行包裝**：
* 前端 `apiClient` 無論透過 `postMessage` 或是 `fetch`，接收到的回應資料結構 100% 等價，嚴禁出現 `res.data.data.data` 洋蔥包裹。

---

## 2. 全域標準錯誤代碼分類表

| 分類 | 錯誤代碼 (Code) | HTTP 語意 | 說明 |
| :--- | :--- | :---: | :--- |
| **系統層** | `OK` | 200 | 操作成功 |
| | `NOT_MODIFIED` | 304 | 資料無異動（交流板增量輪詢未有新留言） |
| | `INTERNAL_SERVER_ERROR` | 500 | 伺服器內部未捕捉例外 |
| | `SERVICE_UNAVAILABLE` | 503 | 微服務暫時無法連線或維護中 |
| | `SPREADSHEET_IO_ERROR` | 500 | 試算表存取逾時或配額超限 |
| | `LOCK_TIMEOUT` | 408 | 併發寫入鎖定逾時 |
| | `RATE_LIMITED` / `TOO_MANY_REQUESTS` | 429 | 請求過於頻繁或密碼錯誤次數超限鎖定 |
| | `INVALID_ACTION` | 400 | 未知或不支援的 Action 名稱 |
| **認證層** | `UNAUTHORIZED` | 401 | 尚未登入或 Token 缺失 |
| | `TOKEN_EXPIRED` | 401 | 登入憑證已過期（效期 7 天） |
| | `TOKEN_INVALID` | 401 | 登入憑證簽名不符 |
| | `FORBIDDEN` | 403 | 權限不足拒絕存取 |
| | `INVALID_CREDENTIALS` | 401 | 帳號或密碼錯誤 |
| | `ACCOUNT_LOCKED` | 423 | 連續登入失敗 5 次，帳號暫時鎖定 15 分鐘 |
| **校驗層** | `BAD_REQUEST` / `INVALID_ARGUMENT`| 400 | 參數型別或格式錯誤 |
| | `MISSING_REQUIRED_FIELD` | 400 | 缺少必填欄位 |
| **領域層** | `PLAYER_ALREADY_EXISTS` | 409 | 帳號已被註冊（大小寫不敏感） |
| | `PLAYER_NOT_FOUND` | 404 | 查無此使用者 |
| | `GROUP_FULL` | 400 | 小組已達 5 人上限 |
| | `ALREADY_IN_GROUP` | 400 | 聖徒已在小組中，必須先退組才能加入新組 |
| | `NOT_IN_GROUP` | 400 | 聖徒尚未加入任何活力組 |
| | `NOT_GROUP_LEADER` | 403 | 非組長無權執行此操作 |
| | `CANNOT_LEAVE_AS_LEADER` | 400 | 組長退出前必須先轉讓組長職責 |
| | `INVALID_INVITE_CODE` | 404 | 邀請碼不存在或無效 |
| | `TARGET_NOT_GROUP_MEMBER` | 400 | 指定目標不屬於該小組成員 |

---

## 3. 安全防禦與座標提示契約

### 3.1 IDOR 雙向校驗契約 (`resolveAuthenticatedPlayerRow_`)
在所有涉及玩家個資與名冊異動的端點（如 `joinGroup`, `leaveGroup`, `transferGroupLeader`, `updateAvatar`, `updatePassword`）中：
* 客戶端傳入的 `matrixColIndex` 僅作為**效能優化提示 (Hint)**。
* **Fast-Path ($O(1)$)**：後端僅讀取該行第 1 欄 `playerId` 進行校驗，相符時直接放行。
* **Fallback**：若校驗不符，後端強制降級為全表搜尋該認證使用者的真實行號，**嚴禁盲目以客戶端行號進行寫入**。

### 3.2 密碼安全與防暴力破解
* `login` 連續失敗 5 次鎖定 15 分鐘。
* 密碼全面強制 SHA-256 加鹽雜湊，後端雙向相容 64 碼 Hex 與 44 碼 Base64。

---

## 4. 微服務 Action 請求與回傳詳細契約 (48 端點)

### 4.1 Core 核心微服務 (24 端點)

#### 1. `register` (PUBLIC)
* **請求 `data`**：
  * `playerId` (`string`, 必填, 3~20 碼英數小寫)
  * `password` (`string`, 必填, 長度 $\ge 6$)
  * `name` (`string`, 必填, 1~20 字元)
  * `gender` (`'BROTHER' | 'SISTER'`, 必填)
  * `district` (`string`, 必填, 如 `'東'`)
  * `area` (`string`, 必填, 如 `'昌裕'`)
  * `avatarUrl` (`string`, 必填)
  * `realName` (`string`, 選填, 預設 `""`)
  * `birthYear` (`number`, 選填, 1900~今年)
  * `phone` (`string`, 選填)
* **回傳 `data`**：
  ```typescript
  interface RegisterData {
    playerId: string;
    name: string;
    token: string;
    matrixColIndex: number;
    avatarUrl: string;
  }
  ```

#### 2. `login` (PUBLIC)
* **請求 `data`**：`{ playerId: string, password: string }`
* **回傳 `data`**：
  ```typescript
  interface LoginData {
    playerId: string;
    name: string;
    token: string;
    avatarUrl: string;
    groupId: string;
    matrixColIndex: number;
  }
  ```

#### 3. `getBootstrap` (PROTECTED)
* **定位**：使用者登入後一站式全域水合核心資料，消除多重瀑布流查詢。
* **請求 `data`**：`{}`（由 Token 識別）
* **回傳 `data`**：
  ```typescript
  interface BootstrapData {
    player: ProfileData;
    profile: ProfileData;
    group: GroupSummary | null;
    systemEnv: {
      systemVersion: string;
      maxGroupMembers: number;
      maintenanceMode: boolean;
      announcementTicker: string;
    };
    latestAnnouncements: AnnouncementItem[];
    announcements: AnnouncementItem[];
    dailyRecords: Record<string, any>;
    meetingRecords: Record<string, any>;
  }
  ```

#### 4. `getProfile` (PROTECTED)
* **請求 `data`**：`{}`（由 Token 識別）
* **回傳 `data`**：`ProfileData`（含姓名、真名、性別、出生年、頭像、照顧區、大區、組別 ID、矩陣欄號、入組時間、帳號狀態）。

#### 5. `updateAvatar` (PROTECTED)
* **請求 `data`**：`{ avatarUrl: string, name?: string }`（支援單一 RPC 同時更新頭像與名稱）
* **回傳 `data`**：`{ playerId: string, avatarUrl: string, name?: string }`

#### 6. `updatePassword` (PROTECTED)
* **請求 `data`**：`{ oldPassword: string, newPassword: string }`
* **回傳 `data`**：`{ updated: true }`

#### 7. `submitDailyPractice` (PROTECTED)
* **請求 `data`**：
  ```typescript
  interface SubmitDailyPracticeRequest {
    date: string; // YYYY-MM-DD
    morningRevival?: boolean;
    bibleReading?: boolean;
    prayer?: boolean;
    bookPursuit?: boolean;
    packedValue?: number; // Base-100 直寫支援
  }
  ```
* **回傳 `data`**：
  ```typescript
  interface SubmitDailyPracticeData {
    date: string;
    packedValue: number;
    morningRevival: boolean;
    bibleReading: boolean;
    prayer: boolean;
    bookPursuit: boolean;
    record: {
      morningRevival: boolean;
      bibleReading: boolean;
      prayer: boolean;
      bookPursuit: boolean;
    };
  }
  ```
  > [!NOTE]
  > **不變量規範**：Core 微服務打卡**絕不回傳點數**。點數計算與 Core 打卡已徹底解耦，由 Progression 微服務於午夜排程非同步結算，或由前端本地樂觀試算。

#### 8. `submitMeetingPractice` (PROTECTED)
* **請求 `data`**：
  ```typescript
  interface SubmitMeetingPracticeRequest {
    weekKey?: string; // YYYY-Www
    groupMeeting?: boolean;
    prayerMeeting?: boolean;
    lordsDayMeeting?: boolean;
    outreachVisit?: boolean;
    packedValue?: number; // Base-100 直寫支援
  }
  ```
* **回傳 `data`**：
  ```typescript
  interface SubmitMeetingPracticeData {
    weekKey: string;
    packedValue: number;
    groupMeeting: boolean;
    prayerMeeting: boolean;
    lordsDayMeeting: boolean;
    outreachVisit: boolean;
    record: {
      groupMeeting: boolean;
      prayerMeeting: boolean;
      lordsDayMeeting: boolean;
      outreachVisit: boolean;
      mutualPursuit: boolean;
    };
  }
  ```
  > [!IMPORTANT]
  > **後端固化鎖定**：若該週聚會已由午夜排程結算入帳（存在於 `ProgressionGateway.getPlayerSolidifiedMeetings`），後端強制保留已入帳項目（Bitwise OR 鎖定），拒絕客戶端取消打卡。

#### 9. `getPractice` (PROTECTED)
* **請求 `data`**：`{ weekKey: string, targetPlayerId?: string }`
* **回傳 `data`**：包含指定週次的 `daily` 字典（7 天操練）與 `meeting` 聚會打卡記錄。

#### 10. `getFootprints` (PROTECTED)
* **請求 `data`**：`{ weekKey?: string }`
* **回傳 `data`**：包含當前組員最近操練完成天數與聚會到會次數統計。

#### 11. `getGroupProfile` / `getGroupDashboard` (PROTECTED)
* **Action 別名相容**：`getGroupProfile`、`getGroupDashboard`、`getGroupMembers`、`getGroupMemberProfile`。
* **請求 `data`**：`{ groupId?: string, matrixColIndex?: number, activeMembers?: Record<string, number> }`（若未指定 `groupId`，後端自動由認證會話之 Profile 取得所屬小組）。
* **回傳 `data`**：
  ```typescript
  interface GroupDashboardData {
    hasGroup: boolean;
    groupId: string;
    groupName: string;
    inviteCode: string;
    leaderPlayerId: string;
    isLeader: boolean;
    memberCount: number;
    members: Array<{
      playerId: string;
      name: string;
      gender: string;
      avatarKey: string;
      district: string;
      area: string;
      isLeader: boolean;
      matrixColIndex: number;
    }>;
    activeMembers: Record<string, number>;
    totalScore: number;       // 小組當前累積總分 (= groupTotalPoints)
    groupTotalPoints: number; // 正確包含小組歷史沉澱分與所有在籍成員貢獻分 (含個人操練與個人獎勵) 加總
    pinnedPost: PinnedAnnouncement | null;
    postsColIndex: number | null;
  }
  ```
* **核心數值契約**：
  * **小組總分連動**：`totalScore` / `groupTotalPoints` 完整加總所有現役在籍組員的貢獻分（$\sum_{m \in \text{ActiveMembers}} \text{contributionPoints}_m$）與小組歷史沉澱分。
  * **個人獎勵貢獻化**：每位組員之貢獻分 $\text{contributionPoints} = \max(0, \text{settledTotalScore} - \text{joinBaseScore})$，其中 `settledTotalScore`（`PlayerProgress` Col 5）已包含個人常態操練與個人特殊獎勵，組員個人的獲獎點數會即時反映至小組儀表板與總分中。
  * **首頁點數面板消費**：回傳之 `totalScore` / `groupTotalPoints` 與 Progression 之 `groupTotalPoints` 口徑完全一致，作為前端首頁右上角雙卡點數面板上半部（`.hero-group-score`）小組累積總點數之資料來源之一。

#### 12. `createGroup` (PROTECTED)
* **請求 `data`**：`{ groupName: string }`
* **回傳 `data`**：`{ groupId, groupName, inviteCode, leaderPlayerId, memberCount: 1 }`

#### 13. `joinGroup` (PROTECTED)
* **請求 `data`**：`{ inviteCode: string }`
* **前置防禦**：若聖徒已在組內，回傳 `ALREADY_IN_GROUP` 錯誤。
* **回傳 `data`**：`{ groupId, groupName, leaderPlayerId, memberCount }`

#### 14. `transferGroupLeader` (PROTECTED)
* **請求 `data`**：`{ leaderPlayerId: string }`（別名支援 `targetPlayerId` / `newLeaderId`）
* **回傳 `data`**：`{ groupId, leaderPlayerId }`

#### 15. `leaveGroup` (PROTECTED)
* **請求 `data`**：`{}`
* **回傳 `data`**：`{ groupId, wasDisbanded: boolean }`

#### 16. `getAnnouncements` (PROTECTED)
* **請求 `data`**：`{ limit?: number, currentDate?: string }`
* **回傳 `data`**：`{ announcements: AnnouncementItem[] }`
  ```typescript
  interface AnnouncementItem {
    announcementId: string;
    title: string;
    content: string;
    startDate: string;  // YYYY-MM-DD
    endDate: string;    // YYYY-MM-DD
    isPinned: boolean;
    status: 'ACTIVE' | 'INACTIVE';
  }
  ```
* **排序契約**：依據 2026-10-14 重構規範，公告分頁徹底廢除歷史 Col H `createdAt`。排序依據採穩定排序：置頂公告（`isPinned: true`）排在最前，其餘一般公告完全維持 Google Sheets 試算表由上而下的實體列順序（Row Order）。

#### 17. `createAnnouncement` (ADMIN)
* **請求 `data`**：`{ title: string, content: string, startDate?: string, endDate?: string, isPinned?: boolean }`
* **回傳 `data`**：`{ announcement: AnnouncementItem }`（向 Core DB 寫入 7 欄標準資料）

#### 18. `clearSystemCache` (ADMIN)
* **請求 `data`**：`{}` | **回傳 `data`**：`{ cleared: true, clearedKeyCount: number }`

#### 19. `getRegistrationAreaOptions` (PUBLIC)
* **請求 `data`**：`{}` | **回傳 `data`**：`{ districts: string[], areaMap: Record<string, string[]> }`

#### 20. `getSystemEnvConfig` (PUBLIC)
* **請求 `data`**：`{}` | **回傳 `data`**：系統版本、每組人數上限 (5)、維護模式標記。

#### 21. `adminLogin` (PUBLIC)
* **請求 `data`**：`{ adminPassword: string }` | **回傳 `data`**：`{ adminToken: string, role: 'ADMIN' }`

#### 22. `updateAdminPassword` (ADMIN)
* **請求 `data`**：`{ adminPassword: string, newPassword: string }` | **回傳 `data`**：`{ updated: true }`

#### 23. `clearAreaOptionsCache` (ADMIN)
* **請求 `data`**：`{}` | **回傳 `data`**：`{ cleared: true }`

#### 24. `ping` (PUBLIC)
* **請求 `data`**：`{}` | **回傳 `data`**：`{ service: 'CORE', status: 'ONLINE', respondedAt }`

---

### 4.2 Progression 成就履約微服務 (18 端點)

#### 1. `getProgressBundle` (PROTECTED)
* **定位**：前端登入後一站式水合聖徒個人點數、在組貢獻、小組進度與已解鎖篇章／成就，消除多次重複 RPC。
* **請求 `data`**：`{ playerId?: string, groupId?: string, activeMembers?: Record<string, number>, hintRow?: number, skipConfigs?: boolean }`
* **回傳 `data`**：
  ```typescript
  interface ProgressBundleData {
    /** 聖徒代碼 */
    playerId: string;

    /** 個人歷史總積分 = settledTotalScore + sumHistoryPoints(historySummary) (Col 5 + Col 2) */
    personalPoints: number;

    /** 當前年度已結算總分 (= settledTotalScore，Col 5，已包含個人操練與個人獎勵點數) */
    currentYearPoints: number;

    /** 入組基準分 (= joinBaseScore，Col 6，入組時凍結之個人總分) */
    joinBasePoints: number;

    /** 在組貢獻分 = max(0, settledTotalScore - joinBaseScore)，個人獎勵點數已正確反映於此 */
    contributionPoints: number;

    /** 小組累積總分 = 小組離隊沉澱分 + Σ 在籍組員貢獻分 (包含個人獎勵貢獻) */
    groupTotalPoints: number;

    /** 共同活力分 = max(0, groupTotalPoints - allMembersContribution) */
    cooperativePoints: number;

    /** 已解鎖之篇章代碼陣列 (如 ["CHP_01", "CHP_02"]) */
    unlockedChapters: string[];

    /** 個人已達成之里程碑與寶箱清單 */
    milestones: MilestoneRecord[];

    /** 近期領取憑證清單 */
    recentClaims: Array<{ taskId: string; deltaPoints: number; claimedAt: string }>;

    /** 個人進度鏡像物件 (供巢狀解包與相容水合使用) */
    playerProgress?: {
      playerId: string;
      personalPoints: number;
      contributionPoints: number;
      historyPoints: number;
      currentYearPoints: number;
      historySummary: Record<string, any>;
      milestones: MilestoneRecord[];
      updatedAt: string;
    } | null;

    /** 小組進度鏡像物件 (供巢狀解包與相容水合使用，未入組為 null) */
    groupProgress?: {
      groupId: string;
      groupTotalPoints: number;
      cooperativePoints: number;
      memberContribution: Record<string, number>;
      milestones: MilestoneRecord[];
      historySummary: Record<string, any>;
      updatedAt: string;
    } | null;

    /** 靜態領域規則配置 (當 skipConfigs 未啟用時批次附帶) */
    pointsConfig?: PointsConfigItem[];
    chapters?: ChapterConfigItem[];
    achievements?: AchievementConfigItem[];
    tasks?: TaskConfigItem[];
    milestonesConfig?: MilestoneConfigItem[];
  }
  ```
* **核心數值契約與首頁水合連動**：
  * **雙層點數面板直驅**：前端登入後透過 `getProgressBundle` 一次性水合，其回傳之 `personalPoints` 直接供給首頁右上方雙卡點數面板下半部「個人」卡片（`.hero-personal-score`）；其 `groupTotalPoints`（或 `groupProgress.groupTotalPoints`）供給上半部「小組」卡片（`.hero-group-score`）。
  * **個人在籍貢獻分相容更新**：`contributionPoints` 持續同步反映至首頁隱藏之 `#homeContributionText` 節點，保障既有測試套件與向後相容。


#### 2. `getPlayerProgress` (PROTECTED)
* **定位**：取得單一聖徒最新結算總分、個人歷史、入組基準與小組貢獻度。
* **請求 `data`**：`{ playerId?: string, groupId?: string }`（由 Token 識別或指定聖徒）
* **回傳 `data`**：
  ```typescript
  interface PlayerProgressData {
    playerId: string;

    /** 個人歷史總分 = settledTotalScore + sumHistoryPoints(historySummary) */
    personalPoints: number;

    /** 當年度已結算總分 (= settledTotalScore，已包含個人每日操練、每週聚會及個人特殊獎勵) */
    currentYearPoints: number;

    /** 入組基準分 (= joinBaseScore，Col 6，入組時凍結之當時結算分，入組後不變) */
    joinBasePoints: number;

    /** 在組貢獻分 = max(0, settledTotalScore - joinBaseScore)，個人獎勵點數已正確反映於此 */
    contributionPoints: number;

    /** 個人已達成之里程碑與寶箱陣列 */
    milestones: MilestoneRecord[];
  }
  ```
* **核心數值契約**：
  * **`settledTotalScore` 權威定義**：對齊試算表 `PlayerProgress` **Col 5**，由午夜排程及即時獎勵發放更新。已完整包含個人常態操練打卡結算分與個人里程碑、成就寶箱、特殊任務及管理員發放之個人特殊獎勵點數。
  * **`contributionPoints` 守恆公式**：嚴格依循 $\text{contributionPoints} = \max(0, \text{settledTotalScore} - \text{joinBaseScore})$。個人獎勵直接累加至 Col 5，自然帶動組內貢獻分增長；而入組前獲得之獎勵因已被 Col 6 `joinBaseScore` 錨定截斷，絕不灌水給新組。
  * **歷史帳本 Col 2 純淨**：個人 `historySummary` 僅保留往年封存分數與排程控制標記（如 `_lastSettledDate`），不再記錄當前年份鍵（如 `"2026"`），杜絕重複加分或跨年污染。

#### 3. `getGroupProgress` / `getMyGroupContributionSummary` (PROTECTED)
* **請求 `data`**：`{ groupId?: string, activeMembers?: Record<string, number> | string[], hintRow?: number }`
* **回傳 `data`**：
  ```typescript
  interface GroupProgressData {
    groupId: string;

    /** 小組當前累積總分 = sumHistoryPoints(GroupProgress Col 2) + Σ 在籍組員 contributionPoints */
    groupTotalPoints: number;

    /** 共同活力分 = max(0, groupTotalPoints - allMembersContribution) */
    cooperativePoints: number;

    /** 所有在籍組員貢獻分總和 */
    allMembersContribution: number;

    /** 有效在籍組員人數 */
    memberCount: number;

    /** 各在籍組員個人貢獻分字典 { [playerId]: contributionPoints } */
    memberContribution: Record<string, number>;

    /** 呼叫者本人在組內的個人貢獻分 (若有帶入 playerId) */
    individualPoints: number;

    /** 呼叫者本人貢獻佔比字串 (例如 "35%") */
    contributionPercent: string;

    /** 已解鎖篇章代碼陣列 (如 ["CHP_01", "CHP_02"]) */
    unlockedChapters: string[];

    /** 小組歷程與已獲篇章陣列 */
    milestones: MilestoneRecord[];

    /** 小組歷史沉澱分字典 */
    historySummary: Record<string, any>;

    /** 最後更新時間戳 (ISO-8601) */
    updatedAt: string;
  }
  ```
* **核心數值契約**：
  * **小組總分結構**：`groupTotalPoints` 完整加總所有現役在籍組員的貢獻分（$\sum_{m \in \text{ActiveMembers}} \text{contributionPoints}_m$）與小組歷史沉澱分（離隊成員沉澱分）。
  * **即時感知個人獎勵**：由於在籍成員的個人獎勵已計入 Col 5，`calculateActiveMembersScore` 計算成員貢獻時即刻反映最新總額，使組員個人卓越轉化為小組整體榮譽。

#### 4. `getGroupJourney` (PROTECTED)
* **請求 `data`**：`{ groupId?: string, playerId?: string, activeMembers?: Record<string, number> | string[] }`
* **回傳 `data`**：
  ```typescript
  interface GroupJourneyData {
    groupId: string;
    hasGroup: boolean;

    /** 當前已達成之最高篇章代碼 (如 "CHP_02")，起步未達標為空字串 */
    currentChapterId: string;

    /** 當前篇章階梯序號 (1~8，未達第一篇章為 0) */
    chapterNumber: number;

    /** 當前區間進度百分比 (0~100) */
    progressPercentage: number;

    /** 小組累積篇章點數 (= groupTotalPoints，已包含在籍成員個人操練與個人獎勵) */
    journeyPoints: number;

    /** 小組當前累積總分 (= journeyPoints) */
    groupTotalPoints: number;

    /** 距離下一篇章門檻差額 = max(0, nextTargetPoint - groupTotalPoints) */
    gapPoints: number;

    /** 當前篇章設定物件 */
    currentChapter: { title: string; index: number; targetPoints: number };

    /** 下一目標篇章設定物件 (若已達第 8 篇章愛篇則為 null) */
    nextMilestone: object | null;

    /** 篇章通關歷史清單 */
    chapterHistory: Array<{ chapterId: string; name: string; unlockedAt: string }>;

    /** 完整旅程推導核心物件 */
    journey: object;
  }
  ```
* **核心數值契約**：
  * **篇章門檻權威基準**：`journeyPoints` 與 `groupTotalPoints` 保持一致，忠實反映小組沉澱分與現役組員個人貢獻分（含個人操練與個人獎勵）之總和。
  * **首頁小組英雄卡鏡像讀取**：前端首頁右上角點數面板上半部（`.hero-group-score`）之小組累積總點數，在接收旅程資料時採用優先序：`journeyData.groupTotalPoints !== undefined ? journeyData.groupTotalPoints : journeyData.journeyPoints`。後端保證兩欄位數值 100% 等價鏡像，提供前端最穩健的容錯讀取。
  * **同晚跨篇章即時連動**：在夜間排程結算 (`runDailyMilestoneSettlement`) 中，若組員達成個人里程碑／寶箱獲獎，`groupScoreMap` 即時累加該點數，緊接著的小組篇章判定立即感知新總分；若剛好跨過門檻，當晚直接晉級並頒發小組新篇章憑證，無須等待隔日。

#### 5. `getGroupJourneyList` (PROTECTED)
* **請求 `data`**：`{ district?: string, limit?: number }`
* **回傳 `data`**：全召會各活躍小組排名與篇章進度清單。

#### 6. `getAppConfigs` (PUBLIC)
* **定位**：前端登入水合時一站式批次取得所有靜態領域配置，消除 5 次連續 RPC 發送。
* **請求 `data`**：`{}`
* **回傳 `data`**：
  ```typescript
  interface AppConfigsData {
    pointsConfig: PointsConfigItem[];
    chapters: ChapterConfigItem[];
    achievements: AchievementConfigItem[];
    tasks: TaskConfigItem[];
    milestonesConfig: MilestoneConfigItem[];
  }
  ```

#### 7~11. 單項配置查詢端點 (PUBLIC)
* `getPointsConfig`：計分規則與權重
* `getMilestonesConfig`：里程碑規則表
* `getChapterConfigs`：8 大篇章彼得八步梯門檻設定（空表回傳 `[]`）
* `getAchievementConfigs`：10 階成就寶箱設定（空表回傳 `[]`）
* `getTaskConfigs`：任務設定清單

#### 12. `syncGroupMembership` (SYSTEM)
* **請求 `data`**：`{ groupId: string, operation: 'MEMBER_JOIN' | 'MEMBER_LEAVE' | 'GROUP_DISBAND', memberPlayerId: string }`
* **回傳 `data`**：`{ synced: true, groupId: string, memberCount: number }`

#### 13. `settleMemberDeparture` (SYSTEM)
* **請求 `data`**：`{ groupId: string, memberPlayerId: string }`
* **回傳 `data`**：`{ settled: true, departedPoints: number }`

#### 14. `grantTargetedReward` (ADMIN / SYSTEM)
* **定位**：管理員或系統針對個人聖徒或特定小組發放特殊同行獎勵點數。
* **請求 `data`**：
  ```typescript
  interface GrantTargetedRewardRequest {
    /** 受獎類型（必填，大寫：'PLAYER' 或 'GROUP'） */
    targetType: 'PLAYER' | 'GROUP';

    /** 單一受獎對象 ID（聖徒 playerId 或小組 groupId，與 targetIds 二擇一） */
    targetId?: string;

    /** 批次受獎對象 ID 陣列（支援多對象同時發放） */
    targetIds?: string[];

    /** 獎勵點數（必填，必須為 > 0 之正整數） */
    deltaPoints: number;

    /** 發放原因備註（選填，預設 "管理者發放特殊同行獎勵"） */
    reason?: string;

    /** 操作之管理員代碼（選填，預設 "ADMIN_SUPER"） */
    adminPlayerId?: string;

    /** 獎勵任務或自訂憑證代碼（選填，預設 "SPECIAL_BONUS_<timestamp>"） */
    taskId?: string;
  }
  ```
* **實體落盤與點數流向契約（核心變更）**：
  * **個人獎勵 (`targetType === 'PLAYER'`)**：
    * **實體寫入**：累加並寫入 `PlayerProgress` **Col 5** (`settledTotalScore = settledTotalScore + deltaPoints`)。
    * **物理防護**：寫入範圍嚴格限定為 **Col 2~5**（欄寬 4），**Col 6 (`joinBaseScore`) 絕對不受影響**，維持入組時基準分不變。
    * **歷程純淨**：**Col 2 (`historySummary`) 不再灌入年份鍵**（如 `"2026"`），杜絕歷年帳本污染與重複加分問題。
    * **連動效應**：透過 $\text{contributionPoints} = \max(0, \text{settledTotalScore} - \text{joinBaseScore})$，個人獎勵即時反映為個人小組貢獻分，並帶動小組總分 `groupTotalPoints` 與篇章進度同步提升！
  * **小組獎勵 (`targetType === 'GROUP'`)**：
    * **實體寫入**：寫入 `GroupProgress` **Col 2** (`historySummary` 當前年份鍵累加，寫入欄寬為 3：Col 2~4)。
    * **影響範圍**：直接進入小組歷程總分，不影響任何組員的個人 Col 5 結算分或個人小組貢獻分。
  * **憑證與審計日誌**：
    * 批次寫入 `TaskClaims` 憑證表（`claimKey = targetEntityId + '_' + taskId`，防止重複發放與作為審計核帳憑據）。
    * 寫入 Core DB 的 `AdminLogs` 表（`action = 'GRANT_TARGETED_REWARD'`）。
* **回傳 `data`**：
  ```typescript
  interface GrantTargetedRewardResponse {
    granted: true;
    targetId: string;
    deltaPoints: number;
    grantedCount: number;
    grantedPlayerIds: string[];
    taskId: string;
    targetType: 'PLAYER' | 'GROUP';
    personalPoints?: number;   // targetType === 'PLAYER' 時回傳最新個人總分 (settledTotalScore + historyPoints)
    groupTotalPoints?: number; // targetType === 'GROUP' 時回傳最新小組總分
  }
  ```

#### 15. `evaluateTargetMilestones` (SYSTEM)
* **請求 `data`**：`{ targetType: 'PLAYER' | 'GROUP', targetId: string, triggerEvent?: string }`
* **回傳 `data`**：`{ newlyUnlockedMilestones: MilestoneRecord[] }`

#### 16. `runDailyMilestoneSettlement` (SYSTEM)
* **唯一午夜排程進入點**：執行昨日操練結算、聚會增量差集結算與里程碑判定（具備多日斷層安全追溯迴圈）。
* **排程職責純淨保證**：日常排程專注於常態操練、聚會增量與里程碑判定，**不夾帶任何歷史資料補償或自動遷移邏輯**，確保排程穩定性與零多餘開銷。
* **回傳 `data`**：`{ settledDate: string, processedPlayerCount: number, processedGroupCount: number }`

#### 17. `archiveAnnualGroupProgress` (ADMIN)
* **請求 `data`**：`{ targetYear?: number }` | **回傳 `data`**：`{ archived: true }`

#### 18. `clearProgressionConfigCache` (ADMIN)
* **請求 `data`**：`{}` | **回傳 `data`**：`{ cleared: true }`

#### 19. `ping` (PUBLIC)
* **請求 `data`**：`{}` | **回傳 `data`**：`{ service: 'PROGRESSION', status: 'ONLINE', respondedAt }`

> [!NOTE]
> ### 資料庫歷史遷移作業與生命週期說明 (Database Migration Lifecycle Note)
> * **歷史獎勵一次性遷移任務 (`runMigratePlayer2026Rewards`) 執行完成與下線紀錄**：
>   * **變更背景**：在歷史舊制架構下，組員獲得之個人獎勵曾誤存於 `PlayerProgress` Col 2 的 `historySummary["2026"]` 年份鍵中，未納入 Col 5 結算分，導致無法帶動個人小組貢獻分。
>   * **遷移執行**：透過獨立一次性遷移函數 `runMigratePlayer2026Rewards()` / `migrateLegacyPlayer2026Rewards_()`，已於生產環境一次性將所有聖徒的 2026 歷史獎勵點數安全移轉至 Col 5 `settledTotalScore`，並自 Col 2 徹底刪除 `"2026"` 鍵（往年封存與排程控制鍵 100% 完好保留）。
>   * **全鏈路驗收與下線 (Cleanup Complete)**：遷移作業與全鏈路對帳已全數驗收完成。為落實專案 `/ponytail` 極簡主義與零 Dead Code 原則，**`runMigratePlayer2026Rewards` 進入點已自生產端程式碼與公開 API 中徹底移除**，不屬於對外公開端點或常態排程的一部分。
>   * **職責純淨原則**：所有歷史數據補償一律採獨立一次性作業實作與驗收，日常業務 API 與排程引擎維持零過渡代碼狀態。

---

### 4.3 Chat 小組交流微服務 (7 端點)

#### 1. `getMessages` (PROTECTED)
* **請求 `data`**：
  * `groupId` (`string`, 必填)
  * `postsColIndex` (`number`, 選填, 直欄提示 $\ge 2$)
  * `sinceTimeMs` (`number`, 選填, 增量時間戳)
  * `limit` (`number`, 選填, 預設 50，最大 100)
* **回傳 `data`**：
  ```typescript
  interface GetMessagesData {
    groupId: string;
    pinnedAnnouncement: { content: string; authorName: string; updatedAt: string } | null;
    messages: Array<{ postId: string; authorPlayerId: string; authorName: string; content: string; timestamp: number }>;
    totalCount: number;
    postsColIndex: number;
    hasUpdate?: boolean; // 304 未修改時為 false
  }
  ```

#### 2. `postMessage` (PROTECTED)
* **請求 `data`**：`{ groupId: string, content: string, authorName?: string, postsColIndex?: number }`
* **回傳 `data`**：`{ posted: true, postId: string, timestamp: number }`

#### 3. `setGroupAnnouncement` (PROTECTED)
* **請求 `data`**：`{ groupId: string, content: string, authorName?: string, postsColIndex?: number }`
* **回傳 `data`**：`{ pinned: true, updatedAt: string }`

#### 4. `clearGroupAnnouncement` (PROTECTED)
* **請求 `data`**：`{ groupId: string, postsColIndex?: number }`
* **回傳 `data`**：`{ cleared: true }`

#### 5. `deleteMessage` (PROTECTED)
* **請求 `data`**：`{ groupId: string, postId: string, postsColIndex?: number }`
* **回傳 `data`**：`{ deleted: true }`

#### 6. `clearGroupChat` (ADMIN / 組長權限)
* **請求 `data`**：`{ groupId: string, postsColIndex?: number }`
* **回傳 `data`**：`{ cleared: true }`

#### 7. `ping` (PUBLIC)
* **請求 `data`**：`{}` | **回傳 `data`**：`{ service: 'CHAT', version: '2.0.0', status: 'ONLINE', cachedGroupCount: number, respondedAt }`


