# Phase 6: ユーザー体験と経路案内の改善

## 目的

Phase 5D完了後の現行Webappを対象に、実際のデプロイ環境で確認された経路案内バグ、GAS同期時のlocal-first契約、地図操作性能、画面の情報階層、一覧操作、初見ユーザー向け説明を改善する。

本Phaseは内部アーキテクチャの再構築ではない。既存のfeature Session / Use Case / Controller / Viewを再利用し、ユーザーから見える問題を必要な場所で修正する。

設計の正本は`docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`とする。

## 実装原則

1. 最初に状態不整合とlocal-first契約の瑕疵を修正し、その後UIを組み替える。
2. 地図とお品書きを主要情報とし、補助情報の縦方向占有を減らす。
3. CSSで表現できる配置・見た目・アニメーションはCSSを使うが、状態遷移や入力判定を無理にCSSへ移さない。
4. 新しいUI、ジェスチャー、状態管理ライブラリを追加しない。
5. Route Guidanceの正本は`RouteGuidanceSession`と`NavigationState`のままとする。
6. GAS配送の失敗をローカル購入やRoute Guidance進行の失敗へ昇格させない。
7. UI変更はモバイルChromium E2Eと必要なvisual snapshotで検証する。
8. visual snapshotは原因を確認して更新し、一括更新で差分を隠さない。
9. 44px以上の主要タッチ領域、keyboard focus、safe-area、200% text zoomを維持する。

## タスク順序

| タスク | 目的 | 主な要求 |
|---|---|---|
| Task 1 | Route Guidanceの候補/確定状態を修正 | 7, 8 |
| Task 2 | GAS配送を購入後進行から完全に分離 | 追加GAS不具合 |
| Task 3 | 地図のパン・ピンチ操作を軽量化 | 5 |
| Task 4 | メイン画面の情報階層を再構成 | 4, 6, 11 |
| Task 5 | 地図上の候補サークル選択を明確化 | 9 |
| Task 6 | 巡回予定の一覧・番号付き地図を追加 | 10 |
| Task 7 | お品書き一覧を2列化しスワイプを改善 | 1, 3, 初回スワイプヒント |
| Task 8 | 常設の使い方画面と初見導線を追加 | 2 |
| Task 9 | Phase 6全体をE2E・visual snapshotで検証 | 全体 |

Task 1とTask 2はUI再配置より先に完了させる。Task 3もメイン画面の地図を組み替えるTask 4より先に行う。

Task 4以降は、前のTaskで確定したDOM契約を正本として続行する。後続Taskのためだけの仮UIや互換要素を先行追加しない。

## Phase受入条件

- 通常の次目的地表示で青い候補経路が赤い通常経路へ重ならない。
- 経路変更を確定した後の`NavigationState.targetSpace`、`lockedFirstLeg.toSpace`、`currentDestination.space`が一致する。
- 経路変更後に購入済みを押すと次の目的地へ進む。
- GAS配送失敗時も購入済み状態、outbox、Route Guidanceの次目的地表示が維持される。
- 自動GAS配送失敗が購入操作の例外や次画面停止を起こさない。
- 地図のパン・ピンチがPointer Events中心の単一入力経路となり、描画フレーム内の不要なlayout readを行わない。
- 地図の主要領域へ`NEXT`、`FROM`、`ROUTE`の大きなカードを重ねない。
- 地図、お品書き、購入済み/保留の主要操作が補助情報より視覚的に優先される。
- 候補サークル選択と通常案内が明確に区別でき、青線は明示的な経路比較時だけ表示される。
- 「予定」から巡回順を文字列リストと番号付き地図ピンで確認できる。
- 一覧の縦長画像は2列、横長画像は全幅で表示される。
- 2列カードは外側方向にだけスワイプでき、現在より抵抗感がある。
- 一覧初回表示でスワイプ操作の短い説明アニメーションが表示される。
- 使い方画面でCSV/GASの必須・任意カラムと基本操作を確認できる。
- `npm run verify:webapp`、`npm run verify:gas`、CI相当E2Eが成功する。
