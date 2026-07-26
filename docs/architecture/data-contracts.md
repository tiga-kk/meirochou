# Cross-Phase Data Contracts

## State ownership

- LocalStorageが単一端末における正本である。
- stateは`eventId + dayId`で分離し、source更新は`sourceGeneration`で識別する。
- IDは英数字開始・英数字／`_`／`-`だけの1〜64文字。保存キーに連結する前に必ずruntime parserで検証する。
- `sourceGeneration` はsourceの初回作成または確認済み置換を確定する時だけ変更する。購入・保留・履歴操作では変更しない。

## Source and circle contracts

```ts
type DataSource =
  | { type: "csv"; fileName: string }
  | { type: "gas"; gasUrl: string; sheetName: string };

interface CircleRecord {
  space: string;
  priority?: number;
  account?: string;
  tweet?: string;
  memo?: string;
  isSale?: string;
  removedFromSource?: boolean;
}
```

CSVの解析、source diff、LocalStorage schemaはすべて`unknown`からruntime validationする。CSV置換はpreviewを作成し、source generation・入力hash・有効期限をapply直前に再検証してから確定する。

CSV/GASの初回作成・置換・更新は、すべてservice-issued `previewId`を経由する。applyは対象ref、現在のsource generation、source snapshot/input hash、有効期限、pending outboxを保存直前に再検証する。

- CSV→CSV、GAS→CSV、CSV→GAS、GAS URL/sheet変更はsource replacementであり、新しい`sourceGeneration`を発行する。
- 同じGAS URL/sheetからの明示refreshは同じsourceの更新であり、`sourceGeneration`を変えない。
- purchase、hold、undo、redo、reset、preview作成、exportでも`sourceGeneration`を変えない。

## GAS safety boundary

- GAS GETは初回または明示更新だけ。起動時の暗黙GETは禁止する。
- 購入・取消はまずLocalStorageへ保存し、GAS POST失敗でローカル状態を戻さない。
- outbox entryはevent/day/source generation、URL、sheet、space、希望状態を捕捉する。
- 未送信outboxがある間はsource URL、sheet、type、source置換、event/day削除をservice側で拒否する。
- GAS sourceの購入状態変更とoutbox追加は、1回のrepository saveで同時に確定する。保存成功前にPOSTしてはならない。
- POSTはtoggleではなく希望状態の冪等な代入とする。remote成功後のqueue削除保存に失敗した場合、同じ希望状態を再送しても結果が変わらない契約にする。
- 起動時・online復帰時はrepository indexにある全event/dayを処理する。現在選択中のrefだけを再送してはならない。
- 保留と保留履歴はGASへ送らない。購入、明示取消、購入undo/redo、購入済みを含むactivity resetは対応する希望状態をqueueへ追加する。
- pending outboxがあるrefでは、circle削除、activity削除、event/day削除も拒否する。LocalStorage正本と未送信コピーの対応を確認なしで破壊しないためである。
- GAS endpointは公開版で`https://script.google.com/macros/s/<deployment-id>/exec`形式だけを受け入れる。任意HTTPS origin、credentials、query、fragment、別pathを送信先として保存・利用しない。

## Event map and state transition

event/day切替では、registry ref、event-scoped map manifest、LocalStorage stateをprepare段階で検証し、prepare中は現在のmap/state/last-openedを変更しない。commit時にmap manifest、`Config` area、active state、route cache、selected pin/route、last-openedを同じ遷移として切り替える。

- dayだけの変更は同じevent manifestを再利用する。
- event変更ではregistryの`mapBundle` URLを使い、first-event compatibility aliasへフォールバックしない。
- `manifest.eventId`が選択refと一致しない場合は旧画面を維持して失敗する。
- commit/render失敗時は旧map/state/selection/last-openedを復元し、別eventのmapとstateを同時表示しない。

実装順と各serviceの過去の詳細は、履歴文書の [Phase 2記録](../archive/phase-02/phase-02-event-day.md) と [Phase 3記録](../archive/phase-03/phase-03-gas-sync.md) を参照する。
