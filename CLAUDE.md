# 即時健身操動作比對系統

使用者把手機架在 2–3 公尺外、全身入鏡，跟著健身操（第一版：國軍操）做動作。
畫面左邊是標準動作，右邊是使用者鏡頭加骨架；系統一次只進行一個步驟，做對了才進下一步，最後產生報告。
網頁應用程式（Vite + TypeScript + MediaPipe Pose Landmarker），iPhone / Android 瀏覽器可用，資料只存在瀏覽器本機。

---

## 給 Claude 的工作規則（每次都要遵守）

使用者是運動科學研究所碩士生，程式基礎不強，會頻繁要求修改動作與參數。
**第一優先是「容易修改、改了不容易壞」**，比功能多寡更重要。

1. **逐階段進行**：每完成一個開發階段或一次修改就停下，用下面的格式回報，等使用者確認。
2. **回報格式**（控制在一個畫面內，用白話，少用術語）：
   1. 完成了什麼：一到三句話
   2. 工作流程：一行箭頭圖，標出本次新增或修改的環節，例如 `鏡頭 → 姿態估計 → 【步驟判定（本次新增）】 → 畫面`
   3. 改了哪些檔案：路徑＋一句用途
   4. 怎麼測試：要執行的指令與預期結果
   5. 已知問題與下一步
3. **動作與參數一律寫在 `config/`**，不寫死在程式裡。程式裡不要藏預設值，預設值都放 `config/settings.json`。
4. **每次修改後執行 `npm run check`**（型別檢查＋測試），全部通過才算完成。
5. **用 git 管理**：每完成一個階段或一次修改就 commit，訊息用中文寫清楚改了什麼；同時更新 `CHANGELOG.md`。
6. **架構有變動時同步更新這份 CLAUDE.md**。
7. 需求不清楚或有更好的做法時，先問，不要自行假設。
8. 介面文字一律繁體中文。

---

## 開發進度

| 階段 | 內容 | 狀態 |
|---|---|---|
| 0 | 環境檢查、專案骨架、設定檔與格式檢查、測試框架 | ✅ 完成 |
| 1 | 鏡頭與骨架（電腦＋手機區網 HTTPS），影片檔取代鏡頭 | ✅ 完成 |
| 2 | 標準動作建置工具（`tools/reference.html`） | ✅ 完成 |
| 3 | 步驟判定引擎、差異比較呈現、除錯面板 | ✅ 完成 |
| 4 | 練習流程與畫面、錄製與重播 | 🟡 練習畫面已完成；個人資料、錄製與重播未做 |
| 5 | 報告、MET 熱量估算、歷史紀錄 | 未開始 |
| 6 | 部署到免費靜態網站 | 未開始 |

心率帶：等系統完整後再加入，**現在不要預先實作任何心率相關功能**。

---

## 資料夾結構與各模組職責

標 ⏳ 的是之後階段才會建立的。

```
fitness_coach/
├── CLAUDE.md               這份說明
├── CHANGELOG.md            更新紀錄
├── index.html              主程式網頁
├── tools/reference.html    標準動作建置工具（只在開發時使用）
├── config/                 ★ 人寫的設定檔（可以用 // 註解）
│   ├── settings.json       全域預設值：容許角度、維持時間、逾時、MET、模型、鏡像模式…
│   ├── angles.json         角度定義：每個可檢查的角度用哪些關鍵點計算
│   └── routine.json        健身操步驟清單：每一步檢查哪些角度、容許值、提示文字
├── generated/              ★ 程式產生的資料，不要手改
│   └── reference-poses.json  標準影片逐幀骨架（建置工具產生；目標角度在載入時即時計算）
├── assets/reference/       標準示範影片（不進 git）；_test-user.mp4 = 測試用的使用者影片
├── scripts/
│   └── setup-mediapipe.mjs 自動準備 MediaPipe 執行檔與模型（dev/build 前自動執行）
├── public/                 （自動產生，不進 git）mediapipe/wasm 執行檔、models/ 三種姿態模型
├── src/
│   ├── main.ts             進入點：載入設定 → 有錯顯示錯誤清單，沒錯進主畫面
│   ├── style.css           顏色與字級
│   ├── config/             設定檔的讀取與檢查
│   │   ├── schema.ts       三個設定檔的格式規格（zod）
│   │   ├── messages.ts     中文錯誤訊息、欄位中文名稱、打錯字建議
│   │   ├── load.ts         解析 → 檢查 → 跨檔檢查 → 套用預設值，產生 AppConfig（純函式）
│   │   └── bundled.ts      把 config/*.json 打包進網頁並呼叫 load.ts
│   ├── pose/               姿態估計
│   │   ├── landmarks.ts    MediaPipe 33 個關鍵點名稱、中文名、虛擬點（兩肩／兩髖中點）
│   │   ├── types.ts        PoseFrame：全專案共用的姿態資料格式
│   │   ├── estimator.ts    包裝 MediaPipe（GPU 失敗自動改 CPU）；只有這裡直接用 MediaPipe
│   │   └── pipeline.ts     影像 → 姿態估計 → 平滑 → PoseFrame；同模型只載入一次
│   ├── input/
│   │   └── video-source.ts 鏡頭／影片檔輸入、逐幀回呼（⏳ 重播 JSON：階段 4）
│   ├── filter/
│   │   └── one-euro.ts     One Euro 平滑濾波（單一數值＋整個姿態）
│   ├── angles/
│   │   └── compute.ts      角度計算（joint／segment）、角度差、左右鏡射
│   ├── reference/
│   │   └── reference-data.ts  讀取標準骨架、檢查是否過期、依 routine.json 時間點算目標角度
│   ├── engine/
│   │   └── step-engine.ts  步驟判定狀態機（靜態維持、動態檢查點、遲滯、逾時、跳過、放寬）＋整套 Session
│   │                       ——不依賴畫面程式碼，可單獨測試
│   ├── feedback/
│   │   └── feedback.ts     最需要修正的 1～2 項、修正方向箭頭、使用者骨架對齊到標準骨架
│   ├── tools/
│   │   └── reference-tool.ts  建置工具的程式（擷取骨架、看時間與角度、目標角度表）
│   ├── report/             ⏳ 報告與熱量估算（階段 5）
│   ├── storage/            ⏳ 本機儲存：個人資料、歷史紀錄、錄製檔（階段 4、5）
│   └── ui/                 畫面
│       ├── dom.ts          建立畫面元素的小工具（文字一律當純文字放入）
│       ├── config-error-view.ts    設定檔錯誤清單畫面
│       ├── config-summary.ts       設定檔摘要（首頁下方）
│       ├── home-view.ts    首頁：開始練習（鏡頭／影片檔）、步驟一覽、設定摘要
│       ├── practice/       練習畫面
│       │   ├── practice-view.ts  接線＋顯示：標準畫面、使用者畫面、提示列、跳過／放寬、通過提示
│       │   ├── draw.ts / segments.ts  依達標狀態上色、箭頭；角度 ↔ 肢段對應
│       │   ├── ring.ts / debug-panel.ts  進度圓環、除錯面板（快捷鍵 D）
│       │   ├── finish-view.ts  結束後的成績表
│       │   └── practice.css   練習畫面樣式（橫放左右、直放上下）
│       ├── live-view.ts    即時骨架畫面（全螢幕、FPS、每幀處理時間）
│       ├── skeleton.ts     在 canvas 上畫骨架（可個別指定肢段顏色）
│       └── perf-meter.ts   FPS 與每幀處理時間量測
└── tests/                  自動化測試（Vitest）
    ├── config.test.ts      設定檔載入與中文錯誤訊息（用 fixtures/ 的固定設定檔）；也會檢查真正的設定檔
    ├── one-euro.test.ts    平滑濾波
    ├── angles.test.ts      角度計算與鏡射
    ├── step-engine.test.ts 判定狀態機
    ├── feedback.test.ts    差異提示
    └── reference-integration.test.ts  用示範者自己的動作跑每一步，確認都能通過（時間點／容許角度的健康檢查）
```

模組之間只透過明確的型別溝通（例如 `AppConfig`、`ResolvedStep`），下游程式拿到的是已套用預設值的設定，不用再處理「沒填」的情況。

---

## 資料流程

```
config/*.json → 設定檢查（src/config）→ AppConfig ─┐
                                                  ↓
鏡頭／影片 → 姿態估計 → 平滑 → 角度計算 → 步驟判定 → 畫面／差異提示 → 報告 → 本機儲存
                                          ↑
標準影片 → 建置工具 → generated/（目標角度）┘
```

目前做到：上面整條流程到「畫面／差異提示」，報告是簡易版，本機儲存尚未做。
目標角度不存檔，而是每次載入時用 `generated/reference-poses.json` ＋ `routine.json` 的時間點即時計算，所以改時間點後不需要重新產生。

---

## 重要約定

- **左右一律指「練習者自己的」左右。** 例如 `rightElbow` 就是練習者的右手肘，提示文字「右手再抬高」也是指練習者的右手。
  - `mirrorMode: "mirror"`（照畫面跟做）：程式會先把示範者的骨架左右鏡射（x 翻轉＋左右標籤對調），再算目標角度。
  - `mirrorMode: "sameSide"`（依口令同側）：直接用示範者的骨架。
  - 畫面上使用者自己的影像以自拍鏡像方式顯示（`selfieView`），只影響顯示，不影響計算。
- **角度類型**（`config/angles.json`）：
  - `joint`：三點夾角，在第 2 點量 0–180°（180 = 打直）
  - `segment`：第 1 點指向第 2 點的方向，相對「直立朝上」的角度，往練習者自己右側傾為正（-180～180）
  - 第一版用 2D 影像座標計算；程式結構保留之後改用 3D world landmarks 的空間。
- **設定檔可以寫 `//` 註解，最後一項多逗號也沒關係。** 格式錯誤會在網頁上用中文指出「哪個檔案、第幾步、哪個欄位、哪裡錯」，不會白屏。
- **設定檔欄位打錯字會被抓出來**（不允許多餘欄位），並提示「是不是要打 xxx？」。
- `enabled: false` 可暫時停用某一步，不用刪掉。
- **PoseFrame 的 x、y 是 0～1 的相對座標**，算角度前要乘回影像寬高（`width`、`height`），否則直式影片的角度會變形。
- 標準影片若有多位示範者，用 `routine.json` 的 `reference.area` 指定要用的範圍（擷取時只看這個範圍）。
- 2D 正面拍攝下，左右膝等角度可能因站位角度而不對稱（例如深蹲目標左膝 119°、右膝 93°），容許角度要留寬一點。
- 開發測試：瀏覽器分頁看不到時影片不會播放；開發模式可在主控台用 `__practiceTick()` 手動推進一幀。
- `<video>` 必須先放進畫面再播放（`playVideo()`），否則瀏覽器可能為了省電暫停它。

---

## 常用指令

都在 `fitness_coach/` 資料夾內執行。

| 指令 | 用途 |
|---|---|
| `npm run dev` | 電腦開發預覽，開 http://localhost:5173 。改設定檔存檔後網頁自動重新載入 |
| `npm test` | 執行自動化測試 |
| `npm run check` | 型別檢查＋測試（**每次修改後都要跑**） |
| `npm run build` | 產生正式版網站到 `dist/` |
| `npm run dev:phone` | 手機測試：開 HTTPS 伺服器，終端機會印出區網網址與 QR code |
| `npm run setup` | 重新準備 MediaPipe 檔案（通常不用手動跑，dev/build 會自動執行） |
| 開 http://localhost:5173/tools/reference.html | 標準動作建置工具：擷取骨架、找時間點、看目標角度 |
| ⏳ 部署 | 階段 6 建立 |

### 手機測試的步驟與常見問題

1. 手機和 Mac 連**同一個 Wi-Fi**，在 Mac 執行 `npm run dev:phone`。
2. 用手機相機掃終端機上的 QR code（或手動輸入 `https://192.168.x.x:5173`）。
3. 出現「連線不是私人連線」警告：iPhone Safari 點「顯示詳細資訊 → 瀏覽此網站」；Android Chrome 點「進階 → 繼續前往」。這是因為開發用憑證是自己簽的，正常現象。
4. 按「開啟鏡頭」，瀏覽器詢問時按「允許」。
- 手機連不上：Mac 若跳出「是否允許 node 接受連入連線」請按允許；學校或公司 Wi-Fi 可能禁止裝置互連，可改用手機熱點讓 Mac 連上。
- 畫面很卡：把 `config/settings.json` 的 `camera.width/height` 改成 640 × 480。

---

## 操作步驟說明

### 新增或修改一個動作

1. 確認要檢查的角度在 `config/angles.json` 有定義；沒有就照現有的格式新增一個（見「新增一種判定類型 A」）。
2. 在 `config/routine.json` 的 `steps` 裡新增一步（最簡單是複製現有的一步再改）：
   - `id` 用小寫英文、數字和 `-`，不能和其他步驟重複
   - 靜態動作 `type: "static"`，填 `time`（影片秒數）
   - 動態動作 `type: "dynamic"`，填 `checkpoints`（至少 2 個，時間依序變大）與 `reps`
   - `angles` 列出要檢查的角度代號，可另外設定 `tolerance`、`hintLow`、`hintHigh`
3. 用建置工具（`/tools/reference.html`）播放影片、逐幀找出時間點，填回 `routine.json`。工具下方會立刻列出新的目標角度。
4. 執行 `npm run check`：`reference-integration.test.ts` 會用示範者自己的動作檢查這一步能不能通過，過不了代表時間點或容許角度要調。

### 調整容許範圍

- **全部動作一起調**：改 `config/settings.json` 的 `judge.toleranceDeg`。
- **只調某一步的某個角度**：在 `config/routine.json` 那一步的 `angles` 裡，給該角度加上 `"tolerance": 數字`。
- 相關參數：`judge.holdMs`（靜態維持時間）、`judge.hysteresisDeg`（防閃爍緩衝）、`giveUp.*`（逾時與放寬）。

### 更換標準影片

1. 把新影片放到 `assets/reference/`（檔名建議只用英文、數字、`-`）。
2. 把 `config/routine.json` 的 `referenceVideo` 改成新檔名。
3. 若影片中示範者的位置不同，調整 `reference.area`。
4. 開建置工具，按「擷取整支影片的骨架」（4 分鐘的影片約 1 分鐘），結果自動存到 `generated/reference-poses.json`。
5. 重新找出每一步的時間點，填回 `routine.json`。

### 新增一種判定類型

**A. 新的角度類型**（例如未來改用 3D 角度）
1. `src/config/schema.ts`：在 `angleDefSchema` 加一種新的 `type` 與欄位規格。
2. ⏳ `src/angles/`：加上對應的計算函式。
3. `tests/`：加測試。
4. `config/angles.json` 開頭的註解補上新類型的說明，並更新本文件「重要約定」。

**B. 新的步驟類型**（例如「限時內完成次數」）
1. `src/config/schema.ts`：在 `stepSchema` 加一種新的 `type` 與欄位規格。
2. `src/config/load.ts`：在 `resolve()` 補上預設值套用，並在 `ResolvedStep` 加上新型別。
3. `src/engine/step-engine.ts`：在 `StepEngine.update()` 加上新類型的判定，並在 `tests/step-engine.test.ts` 寫測試。
4. `src/reference/reference-data.ts` 的 `computeTargets()`：決定新類型要取哪些時間點的目標角度。
5. 畫面（`ui/practice/practice-view.ts` 的進度圓環與提示、`ui/home-view.ts`）補上顯示文字；`config/routine.json` 註解補說明。

### 新增一個設定欄位

1. `src/config/schema.ts` 加規格。
2. `src/config/messages.ts` 的 `FIELD_LABELS` 加中文名稱（錯誤訊息會用到）。
3. `config/settings.json` 加上值與註解。
4. 使用這個值的程式從 `AppConfig` 讀取，不要在程式裡另外寫預設值。
