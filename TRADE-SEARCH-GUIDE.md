# 交易查價對照指導書（`/api/trade/search` ↔ 物品資料屬性）

給 AI 助手 / 開發者：**如何由倉庫物品（`get-stash-items` 回應）正確組出 `/api/trade/search`
的 request body**，以及為何目前查價會大量回 `400`、該怎麼修。

> TL;DR：搜尋 body 的欄位幾乎都能從物品屬性 1:1 對應。目前 `getItemPrice` 只用 `name`+`type`+`rarity`，
> 但**沒有把物品名稱正規化**——帶聯盟機制前綴（`穢生 `，對應 `mutated:true`）或**未鑑定（`name` 為空）**的
> 傳奇，會送出 trade 不認得的 `name` → `400 Invalid query`。修法見 [§5](#5-名稱正規化規則修-400)。

---

## 1. 背景：400 不是限速

對台服 `/api/trade/search` 實測（5 分鐘記錄，見 `price-queue.log` / `mode=debug`）：限速器運作正常
（依 `x-rate-limit-*` 動態校正、429 退避），但**多數查價回 `400`**。離線比對 mock 倉庫 299 種傳奇對
`mock/trade-data/items.json` 的 `(name,type)` 配對：**269 命中、30 不命中**，不命中者全是下列兩類「名稱不可查」。

---

## 2. 物品資料屬性（`get-stash-items` 的 `items[]`，已由 mock 實證）

型別見 `src/api/types.ts` 的 `StashApiItem`、`forge.env.d.ts` 的 `PoeStashItem`；
renderer 投影成 `StashItem` 在 `src/pages/app/stash.ts` 的 `rawToStashItem()`。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | string | 傳奇名；**可能為空**（未鑑定）或**帶機制前綴**（如 `穢生 索伏的愛撫`）。普通/魔法物品為空。 |
| `typeLine` / `baseType` | string | 基底名（中文，如 `城塞戰弓`）。`baseType` 為純基底；`typeLine` 可能含詞綴。 |
| `rarity` | string | `Normal` / `Magic` / `Rare` / `Unique`。 |
| `frameType` | number | 0 普通 / 1 魔法 / 2 稀有 / 3 傳奇 / 4 寶石 / 5 通貨 / 6 命運卡。 |
| `ilvl` | number | 物品等級。 |
| `sockets` | `{group,attr,sColour}[]` | 插槽；`group` 同號=同連線群，`sColour` = R/G/B/W/A/D。 |
| `properties` | `{name,values:[[text,type]],displayMode,type}[]` | 品質、武器數值、寶石等級等都在此（需依 `name`/`type` 解析）。 |
| `implicitMods`/`explicitMods` | string[] | 詞綴文字（中文）。 |
| `mutatedMods` | string[] | **穢生變體**的額外詞綴（與 `mutated:true` 同時出現）。 |
| `influences` | `{shaper?,elder?,crusader?,hunter?,redeemer?,warlord?: true}` | 勢力影響。 |
| 狀態布林 | boolean | `identified`、`corrupted`、`fractured`、`synthesised`、`duplicated`(=鏡像)、`mutated`(=穢生)、`searing`(炙熱/帝國Exarch植入)、`tangled`(糾纏/吞世者植入)、`split`、`veiled`、`scourged`。 |
| `w`/`h`/`x`/`y`/`inventoryId` | — | 版面座標（查價用不到）。 |

mock 全庫（3648 件）變體統計：`corrupted:425`、`influences:78`、`fractured:47`、`synthesised:25`、
`tangled:18`、`searing:16`、`mutated:21`、`duplicated:2`、`veiled:1`、`split:1`。

### 真實範例：穢生（`mutated`）傳奇
```jsonc
{ "name": "穢生 思動之手", "baseType": "帝國戰爪", "rarity": "Unique", "frameType": 3,
  "mutated": true, "mutatedMods": ["…"], "ilvl": 85, "identified": true, "sockets": [...] }
// 可查名稱 = "思動之手"（剝掉 "穢生 " 前綴）；base = "帝國戰爪"
```

### 真實範例：未鑑定傳奇（`name` 為空）
```jsonc
{ "name": "", "baseType": "聖化生命藥劑", "rarity": "Unique", "frameType": 3, "identified": false }
// 未鑑定 → 不知道是哪個傳奇 → 無法以名稱查價（不可送 name=base）
```

---

## 3. `/api/trade/search` request body 結構

POE1 官方格式（兩段式 search→fetch；端點見 `src/api/endpoints.ts`）。目前 `getItemPrice`
（`src/api/tradePrice.ts`）只用了標 ★ 的欄位：

```jsonc
{
  "query": {
    "status": { "option": "online" },          // ★ online / onlineleague / any
    "name":   "<傳奇名>",                        // ★ 限傳奇；普通/魔法/稀有不帶
    "type":   "<基底名>",                        // ★ = baseType
    "term":   "<自由文字>",                      // 替代 name/type 的全文搜尋（少用）
    "stats":  [ { "type": "and", "filters": [   // ★（目前送空）詞綴條件
        { "id": "explicit.stat_xxxxxxxx", "value": { "min": 0 }, "disabled": false }
    ] } ],
    "filters": {
      "type_filters":  { "filters": {
        "category": { "option": "weapon.bow" },  // 物品類別
        "rarity":   { "option": "unique" },      // ★
        "ilvl":     { "min": 0, "max": 0 }
      } },
      "trade_filters": { "filters": {
        "sale_type": { "option": "priced" },     // ★ priced=一口價（排除面議）
        "price":     { "min": 0, "max": 0 },
        "indexed":   { "option": "1day" }
      } },
      "misc_filters":   { "filters": {
        "ilvl": {}, "quality": {}, "gem_level": {},
        "corrupted":        { "option": "true" },
        "mirrored":         { "option": "false" },
        "identified":       { "option": "true" },
        "fractured_item":   { "option": "true" },
        "synthesised_item": { "option": "true" },
        "shaper_item": {}, "elder_item": {}, "crusader_item": {},
        "hunter_item": {}, "redeemer_item": {}, "warlord_item": {}
      } },
      "socket_filters": { "filters": {
        "sockets": { "r":0,"g":0,"b":0,"w":0,"min":0,"max":0 },
        "links":   { "min": 0, "max": 0 }
      } }
    }
  },
  "sort": { "price": "asc" }                      // ★
}
```

> 信心註記：`query`/`stats`/`type_filters`/`trade_filters`/`socket_filters` 結構已由本專案實證（會回 200）。
> `misc_filters` 的個別 `id`（如 `synthesised_item`、`searing_exarch_item`）為官方 API 慣用鍵；**實際鍵名與
> 詞綴 `stats[].id` 應以線上 `/api/trade/data/stats` 與一次成功的網頁查詢 payload 為準**，導入前先驗證。

---

## 4. 屬性 ↔ 篩選 對照表（高度重疊）

搜尋 body 幾乎都能從物品屬性導出。要把一件物品查成「同款」時的對應：

| 物品屬性 | → search 欄位 |
|---|---|
| `baseType` | `query.type` |
| `name`（正規化後，見 §5） | `query.name`（限傳奇） |
| `frameType==3` / `rarity` | `type_filters.filters.rarity.option = "unique"` |
| `ilvl` | `misc_filters.filters.ilvl.{min,max}` |
| `corrupted` | `misc_filters.filters.corrupted.option` |
| `duplicated` | `misc_filters.filters.mirrored.option` |
| `fractured` | `misc_filters.filters.fractured_item.option` |
| `synthesised` | `misc_filters.filters.synthesised_item.option` |
| `identified` | `misc_filters.filters.identified.option` |
| `influences.{shaper…warlord}` | `misc_filters.filters.{shaper_item…warlord_item}.option` |
| `searing` / `tangled` | Exarch/Eater 植入篩選（`searing_exarch_*` / `eater_of_worlds_*`；鍵名待線上確認） |
| `sockets[]`（依 `sColour` 計數、`group` 算連線） | `socket_filters.filters.sockets` + `links` |
| `properties` 內「品質」 | `misc_filters.filters.quality` |
| `properties` 內寶石等級 | `misc_filters.filters.gem_level` |
| `explicitMods`/`implicitMods` | `stats[].filters[].id`（須以 `/api/trade/data/stats` 反查 stat id；非純字串比對） |
| `mutated`（穢生） | **無對應 trade 篩選**；正規化名稱後以基底傳奇查（見 §5） |

> 估價只需鎖定「同一款傳奇」，所以目前用 `name`+`type`+`rarity=unique` 已足夠；上表是日後要做
> 「依當前物品精準找同規格掛單」時的完整對應。

---

## 5. 名稱正規化規則（修 400）

**唯一要改的是 `query.name` 的取得**。`type` 用 `baseType`、`rarity` 用 unique 都正確，不動。

```
canonicalUniqueName(item):
  # 1) 未鑑定 / 無名傳奇：無法以名稱查價 → 回 null（呼叫端略過，不查）
  if not item.name: return null                 # name 為空（如未鑑定傳奇藥劑）

  name = item.name

  # 2) 剝除聯盟機制顯示前綴（顯示層裝飾，非 trade 可查名稱）
  #    已實證：mutated:true ⟺ 名稱以 "穢生 " 開頭，可查名 = 去前綴
  if item.mutated and name startsWith "穢生 ": name = name without leading "穢生 "
  #    防禦性：即使旗標缺漏也剝已知前綴
  name = strip_leading("穢生 ", name)

  return name

# 查價流程：
name = canonicalUniqueName(item)
if name == null: skip（標記為「無法估價」，不要送出 request）
else: getItemPrice(league, name, item.baseType, "unique")
```

要點：
- **`穢生 ` 前綴**：21 件 `mutated` 全部適用，剝除後即為 trade 認得的傳奇名（如 `穢生 索伏的愛撫`→`索伏的愛撫`，實測 200）。
- **空名稱 / 未鑑定**：19 件 frameType-3 無 `name`。**絕不可用 `baseType` 當 `name` 送出**（這是目前 400 的另一主因）。直接略過、UI 顯示「未鑑定 / 無法估價」。
- **更穩健（可選）**：主進程握有 `mock/trade-data/items.json` 的合法傳奇名集合，查價前可比對，未命中即略過，避免任何未知前綴再次造成 400。

---

## 6. 程式落點

| 檔案 | 角色 | 建議改動 |
|---|---|---|
| `src/pages/app/stash.ts` `rawToStashItem()` | raw → `StashItem`，設定 `name`/`base` | 保留原始顯示名；**另存正規化查價名**（或在查價端轉換）。`mutated` 已投影為 `StashItem.mirrored`？否，`mutated` 尚未投影——需新增帶過。 |
| `src/pages/app/prices.ts` `loadUniquePrices()` / `priceKey()` | 詢價佇列來源 | 用 `canonicalUniqueName()`；回 `null` 者不排入佇列。 |
| `src/api/tradePrice.ts` `getItemPrice()` | 組 search body | `name` 已是正規化後的值即可；其餘不動。 |

> 注意：`StashItem` 目前**沒有**帶 `mutated` 欄位（`rawToStashItem` 未投影）。實作 §5 時，
> 若要靠旗標判斷，需在 `rawToStashItem` 多投影 `mutated`（與既有 `corrupted`/`fractured`… 同樣寫法），
> 或僅用「字串前綴」剝除（不依賴旗標，較簡單）。

---

## 7. 信心與待驗證

- ✅ 已實證（mock + 實際 API）：`mutated ⟺ 穢生 ` 前綴（21/21）、空名稱傳奇存在（19）、剝前綴後可查（手測 `索伏的愛撫`→200）、限速器運作正常。
- ⚠️ 待線上確認：`misc_filters` 各 `id` 鍵名、詞綴 `stats[].id` 對照、`searing`/`tangled` 對應的植入篩選鍵、以及「穢生變體是否與基底傳奇同價」（估價可接受以基底傳奇近似）。
- 🔁 驗證方式：`mode=debug` 重跑，看 `price-queue.log`（已會記 `name`/`type`/`detail`）確認剝前綴後 400 歸零。
