# SyncSticky Ultimate

SyncSticky Ultimate 是一個 Chrome 擴充功能，用來在網頁上建立同步便利貼，並透過 Dashboard 管理工作、分頁、欄位、提醒與邊條提示。

目前版本：`5.2`

## 主要功能

- 在任意網頁新增 sticky note。
- Sticky note 可拖曳、調整大小、改變顏色、最小化與刪除。
- Dashboard 集中管理所有工作卡。
- Dashboard 支援自訂分頁，例如 Office、Person。
- 每個分頁可獨立設定 dashboard 欄位，例如 Discussion、WAITING、DOING、DONE。
- 每個欄位可自訂名稱、顏色、寬度與高度。
- 欄位可自動換行，欄位較多時會產生第二列空間。
- 工作卡可在不同分頁與欄位之間移動。
- 工作卡可設定 Edge reminder。
- 其他網頁會顯示邊條提醒，依分頁與 dashboard 欄位統計 Edge reminder 數量。
- 工作卡可設定時間提醒，並透過 Chrome notification 提醒。
- 支援 Chrome sync storage，同步 notes 與 dashboard 設定。

## 安裝方式

1. 開啟 Chrome。
2. 前往 `chrome://extensions/`。
3. 開啟右上角的 Developer mode。
4. 點選 Load unpacked。
5. 選擇本專案資料夾：

```text
SyncSticky
```

載入後，點擊擴充功能圖示即可開啟 Dashboard。

## 使用方式

### 在網頁新增便利貼

1. 開啟任意網頁。
2. 點擊頁面右下角的 `+` 浮動按鈕。
3. 輸入內容後會自動同步儲存。
4. 可拖曳便利貼位置、調整大小、改變顏色。
5. 可將便利貼最小化，或刪除便利貼。

### 使用 Dashboard

1. 點擊 Chrome 擴充功能圖示開啟 Dashboard。
2. 點擊 `Add Note` 新增 dashboard 工作卡。
3. 點擊 `Board` 展開分頁與欄位設定。
4. 可新增、改名或刪除分頁。
5. 可在每個分頁內新增、改名或刪除欄位。
6. 可調整欄位顏色。
7. 拖曳欄位右下角可調整欄位寬度與高度。
8. 拖曳工作卡可移動到不同欄位。

### Edge reminder

Dashboard 工作卡上有 `Edge` 開關。

開啟後，其他網頁會顯示邊條提醒。邊條統計方式如下：

```text
分頁 / dashboard欄位
```

例如：

```text
Office / Waiting: 3
Office / Discussion: 1
Person / Doing: 4
Person / Discussion: 3
```

邊條畫面上只顯示分頁名稱，例如 `Office` 或 `Person`；滑鼠移到項目上可看到完整分頁與欄位資訊。邊條顏色使用對應 dashboard 欄位的顏色。

邊條可拖曳位置，也可調整透明度。

### 時間提醒

Dashboard 工作卡右上角有提醒按鈕：

- `A`：未設定提醒。
- `A!`：已設定提醒。

點擊按鈕可展開時間設定面板。設定時間後，Chrome 會在提醒時間發出 notification。

網頁 sticky note 內也保留時間提醒欄位。

## 同步行為

SyncSticky 使用兩種 Chrome storage：

- `chrome.storage.sync`：同步 notes、dashboard 分頁、欄位、工作狀態、Edge reminder 與時間提醒資料。
- `chrome.storage.local`：儲存只屬於本機的 UI 設定，例如背景圖片、浮動按鈕位置、邊條位置與透明度。

時間提醒的 reminder 資料會同步到其他裝置。擴充功能會在安裝、Chrome 啟動，以及 notes 同步變更時重建 reminder alarms，讓不同裝置能依同步資料建立提醒排程。

## 檔案結構

```text
background.js    Chrome extension background service worker
content.js       注入網頁的 sticky note 與 Edge reminder 邏輯
dashboard.html   Dashboard 頁面結構與樣式
dashboard.js     Dashboard 資料管理、分頁、欄位、工作卡與提醒邏輯
style.css        網頁 sticky note 共用樣式
manifest.json    Chrome extension manifest
icon.png         Extension icon
CHANGELOG.md     版本變更紀錄
```

## 開發

修改程式後，建議先執行語法檢查：

```powershell
node --check background.js
node --check content.js
node --check dashboard.js
git diff --check
```

若已在 Chrome 載入 unpacked extension，修改後請到 `chrome://extensions/` 重新載入 SyncSticky。

## 版本控制

本專案使用 Git 版本控制。

常用流程：

```powershell
git status
git add .
git commit -m "Describe the change"
git push
```

`commit` 是將變更存到本機 Git 歷史；`push` 是將本機 commit 上傳到 GitHub。
