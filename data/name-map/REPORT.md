# 中英對照表產生報告

> 由 `scripts/build-name-map.mjs` 產生（2026-06-18）。資料源：官方 trade data 端點快照（台服 + 國際版）。

## 通貨（currency，trade/data/static）
- 以逐筆 `id` 對齊（語言無關，**高信心**）。
- 對到：**1421** 筆；只台服：0；只國際：0。

## 詞綴（stats，trade/data/stats）
- 以逐筆 `id` 對齊（語言無關，**高信心**）。
- 對到：**14902** 筆；只台服：27；只國際：365。

## 裝備（items，trade/data/items）
- 以分類 `id` 分組，再把每分類拆 **base / unique** 兩子序列各自位置對齊。
- 子序列筆數一致且 `disc` 不衝突 → `high`；否則 `low`（位置對齊可能錯位，**需 POEDB 佐證**）。
- 對到合計：**5667** 筆，其中 **高信心 = 4042** 筆。
- 注意：整體筆數相同 ≠ 對齊正確（base/unique 各差一筆會互相抵銷）。本表已用拆分避免此陷阱。
- **POEDB 佐證已套用**：以 `poedb-dict.json` 的 zh→en 覆寫，**3185** 筆經 POEDB 驗證（其中修正位置錯位 1942 筆、low→high 升級 2852 筆；字典 base 1891/unique 1167，名稱衝突 4）。逐筆 `source` 標 `poedb` 或 `positional`。

| 分類 id | 繁中 | 英文 | base(tw/en) | unique(tw/en) | 狀態 | 已對映 |
|---|---|---|---|---|---|---|
| accessory | 飾品 | Accessories | 102/102 | 279/280 | diff | 381 |
| armour | 護甲 | Armour | 487/496 | 535/540 | diff | 1022 |
| currency | 通貨 | Currency | 659/640 | 26/26 | diff | 666 |
| gem | 技能寶石 | Gems | 861/860 | 0/0 | diff | 860 |
| leaguestone | 聯盟石 | Leaguestones | 17/16 | 0/0 | diff | 16 |
| map | 地圖 | Maps | 581/583 | 32/32 | diff | 613 |
| monster | 物品化怪物 | Itemised Monsters | 544/358 | 0/0 | diff | 358 |
| sanctum | 聖域 | Sanctum | 11/12 | 10/10 | diff | 21 |
| weapon | 武器 | Weapons | 358/359 | 353/352 | diff | 710 |
| card | 命運卡 | Cards | 464/464 | 0/0 | eq | 464 |
| corpse | 物品化屍體 | Itemised Corpse | 102/102 | 0/0 | eq | 102 |
| flask | 藥劑 | Flasks | 48/48 | 38/38 | eq | 86 |
| graft | 接肢 | Graft | 17/17 | 0/0 | eq | 17 |
| heistequipment | 劫盜裝備 | Heist Equipment | 56/56 | 0/0 | eq | 56 |
| heistmission | 劫盜任務 | Heist Mission | 23/23 | 5/5 | eq | 28 |
| idol | 魔偶 | Idol | 6/6 | 39/39 | eq | 45 |
| jewel | 珠寶 | Jewels | 12/12 | 189/189 | eq | 201 |
| logbook | 探險日誌 | Expedition Logbooks | 1/1 | 0/0 | eq | 1 |
| tincture | 萃取物 | Tincture | 10/10 | 5/5 | eq | 15 |
| wombgift | 胎贈 | Wombgift | 5/5 | 0/0 | eq | 5 |
| memoryline | 輿圖記憶 | - | 4/0 | 0/0 | only-tw | 0 |
| sentinel | 護衛 | - | 26/0 | 17/0 | only-tw | 0 |

### 後續（diff 分類）
建議用 POEDB（https://poedb.tw，雙語 + 內部 metadata id）逐一核對 `diff` 分類（優先 armour / accessory / gem / map），
或改以 POEDB / GGPK 解包作為 items 的主來源。currency 與 stats 已是高信心，無需處理。

## Google/POEDB 補強（apply-google.mjs）

- 由 `scripts/apply-google.mjs` 在 build 之後執行：用 POEDB 字典補現役缺漏、套用 `.work/google_results.jsonl` 的 Google 驗證結果。
- **新增缺漏**：POEDB 直接補 9、Google 補 79。**low 修正升 high**：58。
- **來源分布**：poedb 3194、google 137、positional 2424。
- **有效對照**（排除 581 筆 legacy 地圖 base）：5174 筆，其中 high 4177（80.7%）。
- **剩餘 low 性質**：currency 冗餘（用 `currency.json`）、monster 圖鑑（filter 不用）、legacy 舊地圖（excluded）。真實未解 = 1 筆（標 `unresolved`，多為 race/移除限定）。
- **EN-only legacy**（國際版有、現役台服無、無對應中文）：見 `.work/legacy_en_only.json`，屬已移除內容，非缺口。
