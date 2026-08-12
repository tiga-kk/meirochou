# Phase 7.3 Task 1: サークルスペース表記の正規化

## 目標

CSV、Google Sheet、カタログPOSTでサークルスペースを比較する前に同じ正規形へ変換し、表記揺れによる重複登録・行追加・検索失敗を防ぐ。

既存の `apps/webapp/js/shared/domain/space-parser.ts` を正規化責務の所有者として拡張し、別の汎用normalizer層を作らない。GASはWebappのTypeScriptを直接共有できないため同じ意味論を最小限実装し、共通fixtureで差異を検出する。

## 正規化契約

少なくとも次を満たす。

```text
東A  32-a  -> 東A32a
東Ａ３２ａ  -> 東A32a
東A32A     -> 東A32a
東ア 032-b -> 東ア32b
```

処理順は次とする。

1. Unicode NFKCで互換文字を正規化する。
2. Unicode whitespaceを除去する。
3. `-`等、既存仕様で許される番号とsideの区切りだけを除去する。
4. prefix、label、number、sideを解析する。
5. numberの先頭0を除去する。
6. ASCII sideを小文字化する。
7. area定義が渡されている場合はprefix/labelを既存registryで検証する。

実装担当は `parseSpace()` の既存利用者を先に検索する。正規形を返す関数を追加する場合も、`space-parser.ts` 内に置き、`parseSpace()` と同じ低レベル解析を二重実装しない。

## 本番経路

次の流れを全て追跡する。

```text
CSV/Google Sheet入力
  -> space正規化
  -> duplicate判定
  -> Circleのidentityとして保存
  -> map/catalog/statusの参照

catalog extension POST
  -> GAS request解析
  -> space正規化
  -> Sheet C列を正規化して比較
  -> 既存行update / 未存在時append
```

Sheetに既に保存されているセル文字列そのものを一括書き換えない。行検索時に比較用の正規形を生成する。既存localStorageについても不可逆な一括migrationを新設せず、現在の読み込み・import境界で安全に正規化できる場所を使う。

## 対象ファイル

**変更候補:**

- `apps/webapp/js/shared/domain/space-parser.ts`
- `apps/webapp/js/features/circle-data-source/domain/csv-circle-codec.ts`
- `apps/webapp/js/features/circle-data-source/infrastructure/gas-google-sheet-circle-client.ts`
- `integrations/gas-spreadsheet/src/catalog-api.js`
- `integrations/gas-spreadsheet/Code.gs`（`npm run build:gas`で生成。手編集しない）
- `tests/csv-circle-codec.test.ts`
- `tests/gas-contract.test.mjs`

**作成候補:**

- `tests/space-parser.test.ts`
- `tests/fixtures/space-canonicalization.json`

実際のcaller調査で不要と判明した候補ファイルは変更しない。逆に、space identityをraw比較している本番callerが直接見つかった場合は同Taskの対象へ加える。

## テスト方針

最初に次のbehavior REDを作る。

- 上記4例が同じ規則でcanonicalになる。
- `東A32a` と `東Ａ 032-A` を同一import内へ入れるとduplicateとして拒否される。
- missing/不正なprefix・labelを、area registry利用時には有効値として通さない。
- GAS catalog upsertで既存セルが `東A 032-a`、POSTが `東Ａ32Ａ` でも同じ行を更新し、新規行を追加しない。
- TS側とGAS側が同じ共通fixtureに対して同じcanonical値を返す。

関数の存在だけをassertしない。CSV decodeまたはGAS upsertという実際の利用経路から正規化が使われることを証明する。

## やってはいけないこと

- 正規化ロジックをCSV、GAS client、map viewへそれぞれコピーしない。
- Sheet全体の既存値を不可逆に書き換えるmigrationを追加しない。
- `space.trim()`だけを新しい正規化契約として扱わない。
- raw入力を期待値へ流用してテストを通さない。
- package、CI、storage schemaをこのTaskだけの都合で変更しない。

## 完了条件

- Webapp側のspace identityが一つのshared domain規則を通る。
- GASのrow lookupが同じ意味論を持ち、共通fixtureで差異を検出できる。
- canonical duplicateが意味のあるテストで拒否される。
- `npm run typecheck:webapp`、`npm run test:webapp`、GAS検証が通るか、基準点由来の既存失敗として分類されている。