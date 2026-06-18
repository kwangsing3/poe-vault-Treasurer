# PoE1 Item Filter Rules — Reference (English-primary)

> Path of Exile **1** item-filter DSL reference. Loadable spec for the filter editor / for generating & validating `.filter` files.
>
> **Language policy:** the filter DSL is **English-only** — all keywords, enum values, and example syntax below are the canonical English forms and are identical on every client. For `BaseType` / `Class` **values**, the **台服 (Hotcool) client accepts BOTH English and Traditional-Chinese strings** — English filters work fine on 台服; players use Chinese mainly to *read* the rules. So Chinese is a **display/readability** concern, not a matching requirement (see [§11](#11-台服-hotcool-localization)). Recommended: emit English values for maximum compatibility, and use `data/name-map/` to show Chinese in the editor (and optionally to emit Chinese values for players who prefer reading them in-file).
>
> Sources: official <https://www.pathofexile.com/item-filter/about> · PoE Wiki <https://www.poewiki.net/wiki/Guide:Item_filter_guide>. Last reviewed 2026-06-18.

---

## 1. File rules

- **Encoding:** UTF-8. Extension `.filter`.
- **Location (international):** `%USERPROFILE%/Documents/My Games/Path of Exile/`. (台服/Hotcool 路徑可能不同 — 待確認。)
- **Read order:** blocks are evaluated **top-to-bottom; the first matching block wins** (unless it uses `Continue`).
- **Case sensitivity:** keywords are **case-sensitive** — `Show` is valid, `show` is not.
- **Comments:** begin with `#` and run to end of line.
- **Empty block matches everything:** a block with no conditions matches all items (e.g. a trailing `Hide` hides everything not already shown).
- **Strings:** wrap multi-word values in double quotes (`"Two-Stone Ring"`). Single tokens may omit quotes but quoting is safest.

---

## 2. Block types

| Block | Meaning |
|---|---|
| `Show` | Display items matching the block's conditions. |
| `Hide` | Hide items matching the block's conditions. |
| `Minimal` | (Ruthless filters) minimal label, transparent background. |
| `Continue` | Flag placed inside a block: matching does **not** stop here — keep testing later blocks (lets multiple blocks stack styles). Note: an item matching a `Hide` block that `Continue`s can still be shown by a later block. |
| `Import "file.filter" [Optional]` | Include another filter file. |

```
Show
    Class "Gems"
    SetFontSize 40
    Continue          # keep matching later blocks too
```

---

## 3. Comparison operators

`=` equal · `==` exact match · `!` / `!=` not equal · `>` · `<` · `>=` · `<=`.

- Numeric conditions accept any operator.
- For `BaseType` / `Class`: default is **substring/contains** match over a list of values; `==` forces **exact** match. Example: `BaseType "Ring"` matches every ring base; `BaseType == "Ruby Ring"` matches only that base.
- Most conditions accept a **list** of values: `Class "Body Armours" "Boots" "Gloves"`.

---

## 4. Conditions (PoE1)

> `[Op]` = optional comparison operator. Operatorless string conditions test "contains any of the listed values".

### 4.1 Core item properties

| Keyword | Value | Notes |
|---|---|---|
| `Class` | string list | Item class(es), e.g. `"Bows"`, `"Body Armours"`, `"Currency"`, `"Divination Card"`. Contains-match; `==` for exact. |
| `BaseType` | string list | Base item name(s). Contains-match; `==` for exact. |
| `Rarity` | `[Op]` enum | `Normal` `Magic` `Rare` `Unique` (ordered). e.g. `Rarity >= Rare`. |
| `ItemLevel` | `[Op]` int | Item level (the level it dropped at). |
| `DropLevel` | `[Op]` int | The base type's minimum drop level. |
| `AreaLevel` | `[Op]` int (0–100) | Monster/area level of the current zone. Very useful for level-gating rules. |
| `Quality` | `[Op]` int | Item quality %. |
| `StackSize` | `[Op]` int | Stack count (currency/cards). |
| `Width` | `[Op]` int | Inventory width (cells). |
| `Height` | `[Op]` int | Inventory height (cells). |
| `Identified` | bool | `True` / `False`. |
| `Corrupted` | bool | |
| `Mirrored` | bool | |
| `FracturedItem` | bool | |
| `SynthesisedItem` | bool | |
| `Scourged` | bool | |
| `CorruptedMods` | `[Op]` int | Number of corrupted (implicit) mods. |
| `AlternateQuality` | bool | Alternate-quality gem. |
| `AnyEnchantment` | bool | Has any (lab) enchantment. |

### 4.2 Defences (base values)

| Keyword | Value |
|---|---|
| `BaseArmour` | `[Op]` int |
| `BaseEvasion` | `[Op]` int |
| `BaseEnergyShield` | `[Op]` int |
| `BaseWard` | `[Op]` int |
| `BaseDefencePercentile` | `[Op]` int |

### 4.3 Sockets & links

| Keyword | Syntax | Notes |
|---|---|---|
| `Sockets` | `[Op] <GroupSyntax>` | Total socket count and/or colours. Colours: `R G B W A D` (Red/Green/Blue/White/Abyss/**D**=resonator/Delve). e.g. `Sockets >= 6`, `Sockets RRR`. |
| `LinkedSockets` | `[Op] int` | Size of the largest link group. e.g. `LinkedSockets >= 5`. |
| `SocketGroup` | `[Op] <GroupSyntax>` | Linked-socket colour groups; a numeric count followed by `R G B W A D`. Accepts a list of groups; at least one must match. e.g. `SocketGroup 5GGG`. |

**GroupSyntax:** an optional integer (number of sockets/links) immediately followed by colour letters, e.g. `6`, `RGB`, `5RRG`.

### 4.4 Gems

| Keyword | Value | Notes |
|---|---|---|
| `GemLevel` | `[Op]` int | |
| `GemQualityType` | enum | `Superior` `Divergent` `Anomalous` `Phantasmal`. |
| `TransfiguredGem` | bool | |

### 4.5 Influence & special mods

| Keyword | Value | Notes |
|---|---|---|
| `HasInfluence` | enum list | `Shaper` `Elder` `Crusader` `Hunter` `Redeemer` `Warlord` `None`. Also affects influenced Maps. `None` = no influence. |
| `ShaperItem` / `ElderItem` | bool | Legacy single-influence flags. |
| `HasExplicitMod` | string list | Item has an explicit mod by name. |
| `HasImplicitMod` | bool | |
| `HasEnchantment` | string list | Specific lab enchantment. |
| `EnchantmentPassiveNode` | string list | Cluster-jewel / cluster enchant node. |
| `EnchantmentPassiveNum` | `[Op]` int | |
| `HasEaterOfWorldsImplicit` | `[Op]` int | Eater implicit tier. |
| `HasSearingExarchImplicit` | `[Op]` int | Exarch implicit tier. |
| `HasCruciblePassiveTree` | bool | |
| `HasVaalUniqueMod` | bool | |
| `Replica` | bool | |

### 4.6 Maps & area content

| Keyword | Value | Notes |
|---|---|---|
| `MapTier` | `[Op]` int | Map tier **1–16** (current). e.g. `MapTier >= 14`. |
| `BlightedMap` | bool | |
| `UberBlightedMap` | bool | |
| `ShapedMap` | bool | |
| `ElderMap` | bool | |
| `ZanaMemory` | bool | |
| `ArchnemesisMod` | string list | |

> **重要（地圖系統現況）：常規地圖已沒有逐個 base type 名稱**——現在只有 **T1–T16 階級**。所以地圖規則必須用 **`Class "Maps"` + `MapTier`（1–16）** 控制，**不要**對常規地圖用 `BaseType "XX 地圖"`（那些舊地圖基底已從遊戲移除）。
> **只有傳奇地圖（unique maps）仍是固定具名物品**，可用 `BaseType` / `Rarity Unique` 處理（對照表保留 32 個）。
> 對照面：`data/name-map/items.json` 已把 map 分類的常規/舊地圖 base 標 `excluded:"legacy-or-tierless"`，僅 `kind:unique` 為可用名稱對照。

---

## 5. Actions

### 5.1 Colours

| Action | Params | Range |
|---|---|---|
| `SetTextColor` | `R G B [A]` | each 0–255 (A=alpha, optional) |
| `SetBorderColor` | `R G B [A]` | 0–255 |
| `SetBackgroundColor` | `R G B [A]` | 0–255 |

### 5.2 Label

| Action | Params | Range |
|---|---|---|
| `SetFontSize` | `<size>` | 1–45 (default ~32) |

### 5.3 Sound

| Action | Params | Notes |
|---|---|---|
| `PlayAlertSound` | `<id> [volume]` | built-in sound id **1–16**, volume **0–300**. e.g. `PlayAlertSound 4 75`. |
| `PlayAlertSoundPositional` | `<id> [volume]` | positional variant (audible direction). |
| `CustomAlertSound` | `"file.ext" [volume]` | play a custom sound file. |
| `CustomAlertSoundOptional` | `"file.ext" [volume]` | as above, no error if file missing. |
| `DisableDropSound` | — | mute the default item drop sound. |
| `EnableDropSound` | — | |
| `DisableDropSoundIfAlertSound` | — | |
| `EnableDropSoundIfAlertSound` | — | |

### 5.4 Minimap icon

`MinimapIcon <Size> <Color> <Shape>`

- **Size:** `0` (largest) · `1` (medium) · `2` (small) · `-1` (disable).
- **Color:** `Red Green Blue Brown White Yellow Cyan Grey Orange Pink Purple`.
- **Shape:** `Circle Diamond Hexagon Square Star Triangle Cross Moon Raindrop Kite Pentagon UpsideDownHouse`.
- e.g. `MinimapIcon 0 Red Diamond`.

### 5.5 Light beam

`PlayEffect <Color> [Temp]`

- **Color:** `Red Green Blue Brown White Yellow Cyan Grey Orange Pink Purple` · `None` (disable).
- `Temp` = show only briefly on drop (not persistent).
- e.g. `PlayEffect Red`, `PlayEffect Blue Temp`.

---

## 6. Enumerations (quick lookup)

- **Rarity:** `Normal` < `Magic` < `Rare` < `Unique`
- **Influence (`HasInfluence`):** `Shaper` `Elder` `Crusader` `Hunter` `Redeemer` `Warlord` `None`
- **GemQualityType:** `Superior` `Divergent` `Anomalous` `Phantasmal`
- **Socket/colour letters:** `R`=red `G`=green `B`=blue `W`=white `A`=abyss `D`=resonator(Delve)
- **MinimapIcon colours:** Red Green Blue Brown White Yellow Cyan Grey Orange Pink Purple
- **MinimapIcon shapes:** Circle Diamond Hexagon Square Star Triangle Cross Moon Raindrop Kite Pentagon UpsideDownHouse
- **Booleans:** `True` / `False`

---

## 7. Block grammar (summary)

```
( Show | Hide | Minimal )
    <Condition> [Operator] <Value> [<Value> ...]
    <Condition> ...
    <Action> <Args>
    <Action> ...
    [ Continue ]
```

- One block = one `Show`/`Hide`/`Minimal` header, then zero+ conditions, then zero+ actions.
- All conditions in a block are **AND**-combined; a multi-value condition is **OR** across its values.

---

## 8. Annotated examples (English / canonical)

**Highlight 6-linked items with a red border:**
```
Show
    LinkedSockets >= 6
    SetBorderColor 255 0 0
    SetFontSize 45
    PlayAlertSound 6 300
    MinimapIcon 0 Red Star
    PlayEffect Red
```

**Show high-tier rares, hide the rest of normal/magic gear:**
```
Show
    Rarity >= Rare
    ItemLevel >= 70
    SetTextColor 255 255 119

Hide
    Rarity <= Magic
    Class "Body Armours" "Boots" "Gloves" "Helmets"
```

**Currency tiering with stack size:**
```
Show
    Class "Currency"
    BaseType "Divine Orb" "Mirror of Kalandra"
    SetBackgroundColor 200 0 0
    PlayAlertSound 1 300
    MinimapIcon 0 White Diamond

Show
    Class "Currency"
    StackSize >= 10
    SetTextColor 170 158 130
```

**Catch-all hide at the end:**
```
Hide
```

---

## 9. Conditions index (alphabetical, PoE1)

`AlternateQuality` `AnyEnchantment` `AreaLevel` `ArchnemesisMod` `BaseArmour` `BaseDefencePercentile` `BaseEnergyShield` `BaseEvasion` `BaseType` `BaseWard` `BlightedMap` `Class` `Corrupted` `CorruptedMods` `DropLevel` `ElderItem` `ElderMap` `EnchantmentPassiveNode` `EnchantmentPassiveNum` `FracturedItem` `GemLevel` `GemQualityType` `HasCruciblePassiveTree` `HasEaterOfWorldsImplicit` `HasEnchantment` `HasExplicitMod` `HasImplicitMod` `HasInfluence` `HasSearingExarchImplicit` `HasVaalUniqueMod` `Height` `Identified` `ItemLevel` `LinkedSockets` `MapTier` `Mirrored` `Quality` `Rarity` `Replica` `Scourged` `ShaperItem` `ShapedMap` `SocketGroup` `Sockets` `StackSize` `SynthesisedItem` `TransfiguredGem` `UberBlightedMap` `Width` `ZanaMemory`

## 10. Actions index

`SetTextColor` `SetBorderColor` `SetBackgroundColor` `SetFontSize` `PlayAlertSound` `PlayAlertSoundPositional` `CustomAlertSound` `CustomAlertSoundOptional` `DisableDropSound` `EnableDropSound` `DisableDropSoundIfAlertSound` `EnableDropSoundIfAlertSound` `MinimapIcon` `PlayEffect` · flag: `Continue`

---

## 11. 台服 (Hotcool) localization

The grammar above (keywords, operators, enum values, colours, shapes) is **identical on 台服**.

- **`BaseType` / `Class` values accept English *or* Traditional Chinese on 台服.** English filters (e.g. an unmodified NeverSink filter) load and match correctly; Chinese values also match. So Chinese is for **human readability**, not for the engine to match.
  - `BaseType "Mirror of Kalandra"` ✅ works on 台服
  - `BaseType "卡蘭德的魔鏡"` ✅ also works on 台服
- Enum values always stay English (`Rarity Rare`, `MinimapIcon 0 Red Star`, `HasInfluence Shaper`).
- **Recommended output:** emit **English** values (universally compatible — same file works on 台服 and international). Use `data/name-map/` to render Chinese names in the editor UI so players can *read* each rule, and offer an optional "emit Chinese values" toggle for players who want the in-file text localized.
- File must be UTF-8.

---

## 12. Sources

- Official syntax: <https://www.pathofexile.com/item-filter/about>
- PoE Wiki guide: <https://www.poewiki.net/wiki/Guide:Item_filter_guide>
- Name-value localization: this repo `data/name-map/` (see `FILTER-EDITOR-ANALYSIS.md`)
