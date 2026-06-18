# 繁中 PoE 物品過濾器編輯器 — 分析與規劃文件（ANALYSIS）

> 對標 FilterBlade.xyz，做給**繁體中文（台服 PoE1）玩家**的 loot filter 編輯／自訂工具，產出**可直接在遊戲內載入、相容 GGG 官方格式的合法 `.filter`**。
>
> 本階段只做**研究與規劃**，不寫功能程式碼。文件最後集中列出需要你拍板的開放問題。
>
> 已確認前提：**PoE1** ・ **台服（Hotcool）客戶端** ・ 與既有 `poe-coco-Treasurer`（Electron + TS + Vite）**共用技術棧、以新頁籤整合**，倉庫頁要能勾選「是否套用物品過濾器」。
>
> 文件日期：2026-06-18

---

## 0. 結論摘要（TL;DR）

| # | 結論 | 信心 | 影響 |
|---|------|------|------|
| 1 | **台服客戶端的 filter 引擎「英文與繁中字串都接受」**（`BaseType`/`Class` 用英文或繁中都能匹配）。玩家慣用中文只是為了**閱讀**，不是引擎只認中文。 | 高（你的實測，2026-06 更正先前依 2.0 舊論壇的誤判） | 中文化是**顯示/閱讀層**需求，非匹配需求 → 產出 `.filter` 可維持**英文**（全相容），對照表角色變為 UI 顯示 + 可選中文輸出 |
| 2 | 因為英文在台服可用 → **可直接重用 MIT 的 NeverSink filter（英文）**，原樣載入即正確匹配。 | 高 | 原本「NeverSink 匯入需 en→zh 才能匹配」的衝突**解除**；對照表不再是 MVP 阻塞項，降為顯示層加值 |
| 3 | 你現有專案的物品資料**全是繁中、無英文欄位**；台服 trade API（`pathofexile.tw/.../data/items`、`/data/static`）回的也是繁中。對照表英文側已用 POEDB（slug join）補齊（見 `data/name-map/`）。 | 高（已盤點＋已建表） | 顯示層中英互轉的基建已就緒 |
| 4 | `NeverSink-Filter`（PoE1 成品 `.filter`）是 **MIT**，可合法重用；但 precursor 編譯管線（`Filter-Precursors`/`FilterPolishZ`/`Filter-ItemEconomyAspects`）**無授權或已下架**，不可重用。 | 高（gh API 查證） | 架構應「站在 MIT 成品上」，不要重建 precursor→編譯鏈 |
| 5 | poe.ninja 估價資料底層受 GGG「個人、非商業」條款約束，**商用/公開發布有風險**。 | 中高 | 若工具要公開發布或商用，估價層需走自有 trade API（你已有）或謹慎處理來源 |
| 6 | 技術棧整合無痛：vanilla SPA + hash router，新頁籤 = 新增一個 `views/*.ts` + `router.ts` NAV 一列。 | 高（已盤點） | 共用是對的；倉庫頁 checkbox 落在 panel-bar 或 settings |

**一句話建議的 MVP 路線（依 2026-06 語言更正調整）**：因台服接受英文 filter，MVP 可直接做「**匯入 MIT 的 NeverSink filter（英文）→ 繁中 UI 顯示/編輯每條規則 → 匯出英文（或可選繁中）`.filter`**」。filter 內容用英文確保全相容；`data/name-map/` 負責把英文 base/class 顯示成中文供閱讀。詳見 §5、§6、§7。

---

## 1. 最關鍵結論：語言匹配機制（已查證）

**問題**：台服 PoE1 客戶端裡，filter 引擎是用**英文**還是**繁中** base type / class 字串比對？

**結論（2026-06 依你的實測更正）：台服「英文與繁中都能比對」。** 英文 filter（含原樣的 NeverSink）在台服可正確載入並匹配；繁中字串也能匹配。玩家普遍用繁中，是為了**閱讀**而非引擎限制。因此「中文化」是**顯示/閱讀層**問題，不是匹配層問題 → 產出 `.filter` 可維持英文以求全相容。

### 證據與來源

- **你的實測（最高權威，現役台服玩家）**：台服可以用英文 filter；玩家用中文只是需要閱讀中文。→ 推翻下方舊論壇的「必須中文」說法。
- ~~巴哈姆特〈2.0 台版物品過濾器〉：稱台版需把 `BaseType`/`Class` 改成中文~~ — **此為 2.0（約 2015）舊資訊，已過時**；GGG 後續讓台服客戶端同時接受英文。保留作歷史註記。
  來源：<https://forum.gamer.com.tw/C.php?bsn=18966&snA=82713>
- **本專案佐證（仍成立）**：台服 trade API 回傳 `baseType`/`mods` 為繁中、無英文欄位 → 影響的是「顯示層要把英文 filter 對應成中文給玩家讀」，這由 `data/name-map/` 處理。

### 信心與建議驗證

- **信心：高**（你的第一手實測）。仍建議實作初期用一條 throwaway 規則在遊戲內**雙向確認**：
  - `Show BaseType "Mirror of Kalandra"` → 確認魔鏡被高亮（英文可用 ✅，預期成立）。
  - `Show BaseType "卡蘭德的魔鏡"` → 確認也被高亮（中文亦可用）。
- **對未來國際服**：英文輸出本就與國際版相容 → 「日後接國際服」幾乎零成本（同一份英文 filter 通用）。`data/name-map/` 仍用於各語言客戶端的中文顯示。

### 字串匹配規則（兩服通用，已查證官方）

- **大小寫敏感**：`Show` 正確、`show` 為非法。
- **`BaseType` 是「部分包含」比對**（substring，預設）；加雙引號可限定完整片語，配 `==` 可要求**精確相等**。例：`BaseType "斧"` 會命中所有含「斧」的基底；`BaseType == "戰爭法杖"` 只命中該基底。繁中也同理 → UI 需讓使用者明確選「精確 / 包含」。
- 字串含空白或多單字時要用雙引號包起來（繁中通常單一詞，但仍建議一律加引號以策安全）。
- 來源：<https://www.pathofexile.com/item-filter/about>、<https://www.poewiki.net/wiki/Guide:Item_filter_guide>

### 檔案存放與編碼

- 路徑（國際版）：`%USERPROFILE%/Documents/My Games/Path of Exile/`，副檔名 `.filter`。
- **台服（Hotcool）路徑可能不同**（獨立安裝目錄），**待你確認實際資料夾**（見 §9）。
- **編碼必須 UTF-8**（繁中字串）。建議實測 UTF-8 **含 BOM** 與不含 BOM 何者較穩。
- 已知 GGG bug：若**檔案路徑**含非 ASCII 字元（例：中文 Windows 使用者名）會載入失敗——你的使用者名為 `kwang`（純 ASCII），無此問題；但這條要寫進文件提醒未來使用者。
  來源：<https://www.pathofexile.com/forum/view-thread/3364115>

---

## 2. `.filter` DSL 規格（PoE1）與 PoE2 差異

> 來源：官方 <https://www.pathofexile.com/item-filter/about>、PoE Wiki <https://www.poewiki.net/wiki/Guide:Item_filter_guide>。下表為 PoE1。

### 2.1 區塊（Blocks）

| 關鍵字 | 說明 |
|--------|------|
| `Show` | 顯示符合條件的物品 |
| `Hide` | 隱藏符合條件的物品 |
| `Minimal` | （Ruthless 模式）最小化標籤、透明背景 |
| `Continue` | 命中後**繼續**往下比對後續區塊（可疊加樣式）|
| `Import "x.filter" [Optional]` | 匯入其他 filter 檔 |

- 區塊由上而下讀取，**先命中者優先**。空條件區塊匹配所有物品（所以檔尾一個空 `Hide` 等於隱藏其餘一切）。

### 2.2 條件（Conditions，PoE1，約 100+ 關鍵字）

- **物品屬性**：`BaseType`、`Class`、`Rarity`、`ItemLevel`、`DropLevel`、`Quality`、`AreaLevel`、`Height`、`Width`、`Identified`、`Corrupted`、`CorruptedMods`、`Mirrored`、`Scourged`、`FracturedItem`、`SynthesisedItem`、`TwiceCorrupted`、`BaseArmour`、`BaseEnergyShield`、`BaseEvasion`、`BaseWard`、`BaseDefencePercentile`、`AlternateQuality`、`AnyEnchantment`、`AlwaysShow`
- **寶石**：`GemLevel`、`GemQualityType`（Superior/Divergent/Anomalous/Phantasmal）、`TransfiguredGem`、`Imbued`
- **插槽/連線**：`Sockets`（R/G/B/A/D/W 記法）、`LinkedSockets`、`SocketGroup`
- **影響力/特殊**：`Rarity`、`HasInfluence`（Shaper/Elder/Crusader/Hunter/Redeemer/Warlord/None）、`ElderItem`、`ShaperItem`、`HasExplicitMod`、`HasImplicitMod`、`HasEnchantment`、`HasEaterOfWorldsImplicit`、`HasSearingExarchImplicit`、`HasCruciblePassiveTree`、`HasVaalUniqueMod`、`Replica`、`IsVaalUnique`
- **地圖**：`MapTier`、`BlightedMap`、`UberBlightedMap`、`ShapedMap`、`ElderMap`、`ZanaMemory`、`ArchnemesisMod`、`EnchantmentPassiveNode`、`EnchantmentPassiveNum`
- **堆疊**：`StackSize`

### 2.3 動作（Actions / Style）

| 類別 | 關鍵字（值範圍） |
|------|------|
| 文字/邊框/背景 | `SetTextColor` `SetBorderColor` `SetBackgroundColor`（R G B [A]，各 0–255）|
| 字體 | `SetFontSize`（1–45）|
| 音效 | `PlayAlertSound` `PlayAlertSoundPositional`（內建 ID 1–16，音量 0–300）、`CustomAlertSound` `CustomAlertSoundOptional`（自訂檔）、`DisableDropSound` `EnableDropSound` `DisableDropSoundIfAlertSound` `EnableDropSoundIfAlertSound` |
| 小地圖 | `MinimapIcon`（大小 0–2；顏色 Red/Green/Blue/Brown/White/Yellow/Cyan/Grey/Orange/Pink/Purple；形狀 Circle/Diamond/Hexagon/Square/Star/Triangle/Cross/Moon/Raindrop/Kite/Pentagon/UpsideDownHouse）|
| 光束 | `PlayEffect`（顏色 + 可選 `Temp`）|

### 2.4 運算子

`=`（等於）、`==`（精確相等）、`!` / `!=`（不等）、`>` `<` `>=` `<=`。`BaseType`/`Class` 預設「包含」比對，`==` 為精確。

### 2.5 PoE1 vs PoE2 差異（重點）

> 你玩 PoE1，以下僅為「日後若想支援 PoE2」的提醒，**非 MVP 範圍**。

- PoE2 語法仍在演進、官方文件較少；NeverSink 另有獨立 repo `NeverSink-Filter-for-PoE2`（MIT）。
- 已知差異方向：PoE2 物品/職業命名、稀有度、`WaystoneTier`（取代 MapTier 概念）、`UnidentifiedItemTier` 等新條件；部分 PoE1 條件（如 Sextant/Scourge/Synthesis 等聯盟機制）不存在。**支援 PoE2 等同第二套 schema + 第二份資料**，工作量近乎翻倍。
- 來源：<https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2>
- **建議**：DSL 模型用「以版本參數化的 schema」設計（同一引擎、不同 capability 表），即使 MVP 只實作 PoE1，也預留 PoE2 不需重寫核心。

---

## 3. FilterBlade / NeverSink 怎麼運作（含授權盤點）

### 3.1 運作架構

- **precursor DSL（原始碼）**：`Filter-Precursors` 是 NeverSink filter 的「原始碼」，用自製領域語言撰寫。
- **編譯管線**：原以 `FilterPolishZ`（C# 專案）把 precursor 編譯成各 strictness / 各配色的成品 `.filter`。**`FilterPolishZ` 目前在 NeverSinkDev 帳號下已查無（gh API 404，疑下架/私有化）**。
- **經濟更新**：每隔數小時用 poe.ninja 經濟資料 + ML/規則後處理，重新生成 tierlist 與成品 filter。
- **`.option` 領域語言**：FilterBlade.xyz 前端靠一份 `.option` DSL 檔來生成總覽、自訂與 loot 模擬畫面（即 tierlist 結構、strictness 分級、配色選項）。其語法有官方 VS Code 擴充支援。
- **strictness 分級**：NeverSink 提供約 7 級嚴格度（Soft → Regular → Semi-strict → Strict → Very Strict → Uber Strict → Uber-Plus Strict）＋多套配色風格。
- **`Filter-ItemEconomyAspects`**：提供 unique / 命運卡 / 各 tierlist 的 meta 資訊（如 anchored / nondrop / handled 等 aspect 概念），驅動經濟分級。

來源：
- <https://github.com/NeverSinkDev/Filter-Precursors>
- <https://github.com/NeverSinkDev/Filter-ItemEconomyAspects>
- <https://www.filterblade.xyz/>
- <https://github.com/NeverSinkDev/NeverSink-Filter>

### 3.2 授權盤點（gh API 實查，2026-06）

| Repo | 授權 | 內容 | 對本專案可用性 |
|------|------|------|----------------|
| `NeverSinkDev/NeverSink-Filter` | **MIT** ✅ | PoE1 成品 `.filter`（7 strictness + 多配色） | **可重用**：作為「匯入既有 filter」的範本來源、或對照樣式 |
| `NeverSinkDev/NeverSink-Filter-for-PoE2` | **MIT** ✅ | PoE2 成品 `.filter` | 可重用（PoE2，非 MVP）|
| `NeverSinkDev/FilterBlade-Public-Assets` | **MIT** ✅ | public custom 檔（hover 說明等）| 可重用 |
| `NeverSinkDev/VS-Code-FilterBlade-Markup-Extension` | **MIT** ✅ | `.option` DSL 的 grammar / 高亮 | 可借（理解 `.option` 結構、做編輯器語法高亮）|
| `NeverSinkDev/VS-Code-PoE-Filter-Markup-Extension` | **MIT** ✅ | `.filter` 語法高亮 | 可借（編輯器內語法高亮 / 驗證的參考文法）|
| `NeverSinkDev/NotepadPP-PoE-Filter-Markup-Language` | **MIT** ✅ | Notepad++ filter markup | 可借（文法參考）|
| `NeverSinkDev/Filter-Precursors` | **無 LICENSE** ⚠️ | precursor 原始碼 DSL | **不可重用**（無授權 = 保留所有權利）|
| `NeverSinkDev/Filter-ItemEconomyAspects` | **無 LICENSE** ⚠️ | aspects / 經濟 meta | **不可重用** |
| `NeverSinkDev/FilterPolishZ` | **查無（404）** ❌ | 編譯器 | 公開不可得，無法重用 |

**結論**：可乾淨重用的是「**MIT 成品 `.filter`** ＋ **MIT 的語法/高亮文法**」。**precursor→編譯鏈與經濟 aspect 資料不可重用**（授權缺失）。因此「重建 FilterBlade 編譯管線」這條路在法律與工程上都不划算（§5）。

---

## 4. 資料來源盤點

### 4.1 物品基底 / 職業 / unique 清單與**繁中名稱**

| 來源 | 繁中 | 英文 | 完整度 | 可靠度 / 取得方式 | 備註 |
|------|------|------|--------|---------|------|
| **台服 trade API**（`pathofexile.tw/api/trade/data/{items,static,stats}`）| ✅ | ❌ | 高（trade 可搜尋之物品/通貨/詞綴）| 高；**本專案已有串接管線**（`src/api/staticData.ts`，檔案待初始化）| **MVP 首選**：繁中側權威、與 filter 比對同語言、已在技術棧內 |
| **poedb.tw** | ✅ | ✅ | 很高（base/class/unique/mods，跨語言對照）| 高；網站為主，無官方 API（需爬或匯出）| **en↔zh 對照表首選來源**；以台服 GGPK 為基底，雙語對齊 |
| **RePoE / repoe-fork**（GitHub）| ❌（多為英文 + id）| ✅ | 高（`base_items.json` 含 class/tags/需求等）| 高；JSON 直接可下載；工具 MIT，**資料屬 GGG** | 英文側 + 穩定 id 的權威；可作對照表英文錨點 |
| **GGPK 直接解包**（PyPoE）| ✅（含各語言 .dat）| ✅ | 最完整 | 中（需自行解包、隨版本更新）| 終極來源；對單人開發太重，建議優先用 poedb/RePoE |
| **poe.ninja** | 部分 | ✅ | unique/經濟導向 | 授權受限（見 §4.2）| 估價/分級用，不適合當名稱主檔 |

**對照表（en↔zh-TW）取得策略建議（優先序）**：
1. **MVP（純台服繁中）**：只需要**繁中側** → 直接用台服 trade API `data/items`、`data/static`，以及你倉庫資料裡實際出現的 `baseType`。**完全不需要英文**。
2. **要支援 NeverSink 匯入 / 國際服**：需 en↔zh **join**。最乾淨作法是 **poedb.tw 的雙語表**，或 **「台服 trade `data/items`（繁中）」⨝「國際版 trade `data/items`（英文）」以穩定鍵 join**（通貨 `static` 有語言無關 `id`；一般基底是否有穩定鍵需驗證，見 §9）。RePoE 提供英文 + id 作錨點。

### 4.2 估價 / 分級資料

- **poe.ninja API**：底層使用 GGG public stash / ladder API，受 GGG「個人、非商業用途」條款約束（<https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy>）。poe.ninja 本身免費、靠廣告/捐款；**對「商用或公開發布」存在授權風險**。來源：<https://poe.ninja/faq>。
- **你已有的自有 trade API 估價層**（`src/api/tradePrice.ts`，走台服官方 trade `search`/`fetch`/`exchange`，去離群取中位數）——**這是較安全的估價來源**，且已在技術棧內。
- **建議**：filter 編輯器若需要「依價值自動分 tier」，**優先重用你自有的 trade 估價層**；poe.ninja 僅作可選輔助，且若工具公開發布要明確標註資料來源與非商業性質。

---

## 5. 架構選項與取捨（三條路）

> 共同前提（你已定）：整合進 `poe-coco-Treasurer`、新頁籤、共用技術棧；**產出 `.filter` 必須繁中**（§1）。

### 路線 A — 從零自製編輯器（繁中原生）
- **做法**：自訂內部規則模型（rule model）→ 用台服繁中物品資料填 UI 選單 → 直接序列化成繁中 `.filter`。匯入既有 `.filter` 為「解析 → 規則模型 → 編輯」。
- **工作量**：中（DSL 序列化/反序列化 + 規則 UI + 物品資料接線）。
- **風險**：低-中。要自己維護 DSL schema 與遊戲版本同步；無現成 tierlist。
- **相容性**：高——**輸出原生就是繁中**，與台服匹配一致。
- **授權**：乾淨（不依賴無授權 repo）。
- **評語**：**與你的資料現況最契合**（資料本就繁中），MVP 最務實。

### 路線 B — 站在 FilterBlade 的 `.option` 格式上
- **做法**：解析 NeverSink `.option`（MIT 文法可參考）重建 tierlist/strictness/配色體驗。
- **工作量**：高。`.option` 是為 FilterBlade 設計、與其 precursor/編譯鏈耦合；而**編譯鏈（FilterPolishZ）已不可得、precursor 無授權**。
- **風險**：高。等於逆向一套你無法合法重用的管線，且仍要解決「英文→繁中」翻譯。
- **相容性**：需自建「英文 tierlist → 繁中 `.filter`」翻譯層。
- **授權**：**踩線**（precursor/aspects 無授權）。
- **評語**：**不建議**作為主路線。

### 路線 C — 最輕量：匯入既有 NeverSink filter → 中文 UI 顯示/編輯 → 匯出（★推薦 MVP）
- **做法**：讀 MIT 的 NeverSink 成品 `.filter`（英文）→ 解析為規則 → 繁中 UI 顯示/編輯 → 匯出（英文，或可選繁中）。
- **工作量**：低-中（解析 + 編輯 UI）。
- **前提（2026-06 更正）**：因台服**接受英文** `BaseType`/`Class`，NeverSink 原樣即可在台服匹配 → **匯出維持英文即可，不需為了能匹配而翻譯**。`data/name-map/` 僅用於 UI 把英文顯示成中文供閱讀（漏譯只影響「顯示」、不影響「匹配」，故無靜默失效風險）。
- **風險**：低（英文輸出全相容；僅需追蹤 NeverSink 改版）。
- **授權**：filter 成品 MIT，乾淨；對照表已用 POEDB 建好。
- **評語**：直接享用 NeverSink 的策展，且因語言更正而成為**風險最低、最划算的 MVP 路線**。

### 推薦組合（更新）
- **MVP 走路線 C**（匯入 NeverSink 英文 → 繁中 UI 顯示/編輯 → 匯出英文）：風險最低、最快有可用成品。
- 路線 A（從零建規則）可作為「自訂新規則」功能疊加在 C 之上。
- 英文輸出本就與國際版相容 → 「日後接國際服」幾乎零成本。
- **不走路線 B**。

---

## 6. i18n 架構建議：顯示層 vs 產出層徹底分離

核心原則：**「畫面上給人看的字」與「寫進 `.filter` 的字」是兩件事，中間隔一層對照。**

```
[ 物品資料模型 ItemData ]
   stableKey  : 語言無關鍵（trade id / RePoE id / poedb 鍵）  ← 內部運算與規則儲存都用它
   zhTW       : 繁中名（顯示 + 台服 .filter 輸出）
   en         : 英文名（顯示可選 + 國際服 .filter 輸出 / NeverSink 匯入比對）
   class, tags, ...

[ 規則模型 FilterRule ]  ← 一律存 stableKey，不直接存某語言字串
   conditions: [{ field:'BaseType', op:'==', values:[stableKey, ...] }, ...]
   actions:    [...]

[ 顯示層 Renderer ]      讀 zhTW（必要時英文）渲染 UI
[ 產出層 Serializer ]    依「目標客戶端」決定輸出語言：
                          - 台服  → 輸出 zhTW 字串
                          - 國際服 → 輸出 en 字串（待 §9 國際服匹配行為確認）
```

要點：
- **規則內部一律以 `stableKey` 儲存**，序列化時才查表轉成目標語言字串 → 同一份規則可同時輸出台服繁中版與國際英文版（一鍵雙輸出，正中你「日後接國際服」需求）。
- UI 文案（按鈕、標籤）沿用你現有「硬編碼繁中」風格即可，**不需要**引入 i18next；真正需要 i18n 機制的是**物品名稱資料**，不是介面字串。
- 若某基底缺英文（或缺繁中）對照 → 序列化時明確報「未對照」警告，**絕不靜默輸出可能不匹配的字串**（避免規則無聲失效）。

---

## 7. MVP 範圍

**MVP 一句話**：在 `poe-coco-Treasurer` 新增「物品過濾器」頁籤，能**用繁中介面從零（或從本機繁中物品資料）建規則、預覽、匯出一份在台服可直接載入並正確生效的 `.filter`**。

### MVP **包含**
- 新頁籤（`src/pages/app/views/filter.ts` + `router.ts` NAV 新增一列）。
- 規則模型 + 繁中 `.filter` 序列化（`Show`/`Hide`/`Continue`、§2 的常用條件與動作子集）。
- **條件 UI**：`Class`、`BaseType`（含「精確/包含」切換）、`Rarity`、`ItemLevel`、`Quality`、`Sockets`、`LinkedSockets`、`StackSize`、`AreaLevel`。
- **動作 UI**：`SetTextColor`/`SetBorderColor`/`SetBackgroundColor`（取色器）、`SetFontSize`、`PlayAlertSound`（內建音效下拉）、`MinimapIcon`、`PlayEffect`。
- **物品選單資料**：用台服 trade API `data/items`（class/base，繁中）＋ `data/static`（通貨）填下拉/搜尋（先把目前空的 `mock/trade-data/*.json` 初始化）。
- **匯入既有 `.filter`**：解析（含繁中）→ 規則模型 → 可編輯（讓你能讀懂/改現有台服 filter）。
- **匯出**：合法繁中 `.filter`，UTF-8，存到正確資料夾（路徑待 §9 確認）。
- 倉庫頁 **「套用物品過濾器」checkbox**：勾選後依目前規則在倉庫頁高亮/淡化物品（純顯示層套用，與遊戲內無關）。規則狀態存 `store.ts` 的 `AppState`。

### MVP **不包含**（明確排除）
- ❌ **匯入英文 NeverSink filter**（需 en→zh 翻譯層，列第二階段）。
- ❌ en↔zh 對照表 / 國際服雙輸出（第二階段；國際服匹配行為待驗證）。
- ❌ poe.ninja 經濟自動分 tier / strictness 自動生成（第二階段，且有授權考量）。
- ❌ PoE2 支援（schema 預留即可）。
- ❌ loot 模擬畫面（FilterBlade 的 lootsimulator）。
- ❌ 自訂音效檔（`CustomAlertSound`）管理 UI（可先只支援內建音效）。

### 建議的第二階段
1. 建 en↔zh 對照表（poedb/RePoE 或台服⨝國際版 trade join）。
2. 路線 C：NeverSink（MIT）匯入 + en→zh 翻譯輸出。
3. 國際服雙輸出（待 §9 國際服匹配行為釘死後）。
4. 重用自有 trade 估價層做「依價值分 tier」。

---

## 8. 與 `poe-coco-Treasurer` 整合方案（你已決定共用）

> 依本機盤點（vanilla SPA + hash router + in-memory store + CSS 設計系統）。

- **新頁籤**：在 `src/pages/app/views/` 新增 `filter.ts`，匯出 `View` interface（`render()` / `mount()`），與現有 5 頁同形。
- **路由**：`src/pages/app/router.ts` 的 `NAV` 陣列加一列 `{ route: 'filter', label: '過濾器' }`，並擴充 `Route` 型別與 `routes` record。
- **狀態**：規則存 `src/pages/app/store.ts` 的 `AppState`（例：`filterRules?: FilterRule[]`、`filterApplied?: boolean`），localStorage 持久化（沿用現有模式）。
- **物品資料**：初始化 `mock/trade-data/{items,static,stats}.json`（目前為空），由 `src/api/staticData.ts` 既有邏輯讀取；新增物品/職業查表函式於 `src/api/`，經 `preload.ts` 的 contextBridge 暴露給 renderer。
- **倉庫頁 checkbox**：放在 `views/overview.ts` 的 panel-bar（分頁籤旁），或 settings 頁；勾選時讀 `store.filterRules` 對 `STASH_ITEMS` 做顯示層套用（高亮/淡化），**不影響遊戲內**。
- **樣式**：沿用 `theme.css` 的 CSS 變數，維持博物館風格一致。
- **檔案寫出**：`.filter` 寫入本機資料夾屬主進程能力 → 在 `src/main.ts` 加 IPC handler（例 `filter:export`），經 preload 暴露。

**綜效**：物品名稱/通貨資料、trade 估價層、速率限制、設計系統、打包（Electron Forge）全部共用，**確實值得共用而非獨立專案**。唯一要留意：filter 編輯器的物品資料需求（**全量** base/class 清單）比現有「倉庫內出現過的物品」更廣，需把 `data/items` 完整初始化。

---

## 9. 風險與開放問題（請你拍板 / 待查證）

> 集中列此，一次回覆即可。標 **【需你決策】** 者影響範圍劃定；標 **【待查證】** 者我會在實作初期實測釘死。

1. ~~**MVP 要不要含「匯入 NeverSink」？**~~ **【已解決，2026-06】** 因台服接受英文 filter，NeverSink 可直接匯入並匹配 → MVP 採**路線 C（匯入 NeverSink → 繁中 UI 顯示/編輯 → 匯出英文）**，對照表只負責顯示層，非阻塞項。原本的衝突不存在。

2. **【需你決策】「套用物品過濾器」checkbox 的語義？**
   - 我預設是「**在你的倉庫頁顯示層**套用規則高亮/淡化」（純 app 內預覽，與遊戲無關）。
   - 或者你的意思其實是「一鍵把目前規則**匯出成遊戲 `.filter` 檔**並提示去遊戲內套用」？兩者 UI 差很多，請確認。

3. **【需你決策】checkbox 位置**：倉庫頁 panel-bar（分頁籤旁）vs 設定頁？（我傾向 panel-bar，操作就近。）

4. **【待查證】台服 `.filter` 實際存放資料夾與編碼**：Hotcool 客戶端可能不是 `Documents/My Games/Path of Exile/`。請你提供你目前台服 filter 檔的實際路徑（或我實作時請你 `! ` 跑一行列出）。編碼 UTF-8 含/不含 BOM 何者穩，會實測。

5. ~~**國際版比對英文還是繁中？**~~ **【已大幅降級，2026-06】** 既然 MVP 已決定輸出**英文** filter，且英文在台服與國際版皆相容 → 「接國際服」幾乎零成本，此題不再影響架構。

6. **【待查證】台服 trade `data/items` 是否提供語言無關的穩定鍵**（供日後與國際版 join 建對照表）。若無，對照表改以 poedb.tw 雙語表為主來源。

7. **【需你決策】公開發布 / 商用意圖？** 影響 poe.ninja 資料能否使用、是否需在 UI 標註資料來源與「非 GGG 官方、個人非商業」聲明。若純自用，限制大幅放寬。

8. **【需你決策】是否預留 PoE2？** 我建議 schema 以版本參數化（不影響 MVP），但若你完全不碰 PoE2，可省掉這層抽象。

9. **【提醒】NeverSink 改版追蹤**（若採路線 C）：NeverSink 每聯盟更新，匯入流程要能容忍版本差異與新條件。

---

## 附錄：引用來源

- 官方 filter 語法：<https://www.pathofexile.com/item-filter/about>
- PoE Wiki filter 指南：<https://www.poewiki.net/wiki/Guide:Item_filter_guide>
- 台版過濾器（語言匹配佐證）：<https://forum.gamer.com.tw/C.php?bsn=18966&snA=82713>
- 台服社群過濾器範例：<https://home.gamer.com.tw/creationDetail.php?sn=5777161>
- 中文路徑載入 bug：<https://www.pathofexile.com/forum/view-thread/3364115>
- NeverSink-Filter（MIT）：<https://github.com/NeverSinkDev/NeverSink-Filter>
- NeverSink PoE2（MIT）：<https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2>
- Filter-Precursors（無授權）：<https://github.com/NeverSinkDev/Filter-Precursors>
- Filter-ItemEconomyAspects（無授權）：<https://github.com/NeverSinkDev/Filter-ItemEconomyAspects>
- FilterBlade：<https://www.filterblade.xyz/>
- RePoE：<https://github.com/brather1ng/RePoE> ／ <https://github.com/repoe-fork/repoe>
- poe.ninja FAQ / 條款：<https://poe.ninja/faq> ／ <https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy>
- poedb（繁中資料庫）：<https://poedb.tw/tw/>

> 本機專案盤點（技術棧、資料現況、整合點）詳見本文件 §3、§4.1、§8，依 `poe-coco-Treasurer` 原始碼實查。
