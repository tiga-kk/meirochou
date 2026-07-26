# Phase 4 Task 4–10 Plan and Test Review — 2026-07-23

## 結論

Task 4〜10の大枠と順序は維持してよい。特に、source requestとapplyをTask 4/5で分けること、outbox回復を削除より先に置くこと、CSV exportを読み取り専用Taskとして分けること、最後にmobile E2Eとhandoffを置くことは妥当である。

ただし、現在の計画をそのまま実装すると既存APIでは満たせない契約、Task間の依存漏れ、公開文書の配置誤りがある。別の補足計画を正本にせず、各Task文書を直接訂正する方針を採る。

検討した選択肢は次のとおり。

1. **既存Taskを直接補強する（採用）** — 既存のservice境界とコミット粒度を維持しつつ、実装不能なinterfaceとテスト漏れだけを直す。
2. Phase 4 Task 4以降を全面的に再分割する — 安全だが、既に確立したPhase 2/3の境界まで再検討する過剰な変更になる。
3. テスト補足文書だけを追加する — 差分は小さいが、実装者がTask正本だけを読んだ場合に安全条件を落とす。

## 現在のTask 3引継ぎ判定

Task 4の前提であるTask 3は、未コミット実装が存在するものの完了ゲートを通過していない。

2026-07-23の確認結果:

- `npx vitest run --root . tests/event-day-selector.test.ts tests/event-day-transition-service.test.ts`: **18 passed**
- `npm run check:webapp`: **PASS**
- 最初の `npm run test:webapp`: **256 passed / 1 failed**
  - `tests/webapp-contracts.test.mjs` のbootstrap順序に関するsource文字列テストが失敗した。
- 並行して進んだTask 3差分の更新後に再実行した
  `npm run test:webapp`: **259 passed / 0 failed**

標準Vitestの再通過だけではTask 3 handoff完了とはしない。Task 4へ進む前に、少なくとも次をTask 3の完了条件として満たす。

1. 起動時manifestをAppへ引き継ぎ、同一event内のday切替でmanifestを再取得しない。
2. 別の選択が進行中の要求を置き換え、古い完了をcommitしない。
3. prepare/commit/render failureで旧map、state、selector、Config、last-openedを矛盾させない。
4. fallback refをregistryから導出し、`demo-v1/day1`を固定値で使わない。
5. event/day両selectに一意なaccessible nameを与え、失敗時に旧選択を再表示して関連selectへfocusを戻す。
6. Task 3計画のApp統合ケースと標準検証をすべて通す。source文字列の出現順ではなく、event-scoped bootstrapの振る舞いをテストする。

Task 3差分の修正自体はこのレビューの作業範囲外である。

## Task 4〜10の修正判断

### Task 4: Source manager

維持する点:

- CSV/GASを排他的に表示する。
- 初回を含む全source変更をpreview経由にする。
- full GAS URLをeditable input以外へ出さない。
- pending outboxをUIとserviceの両方で防ぐ。

追記が必要な点:

- Appが肥大化しないよう、serviceをimportしない `management-session.ts` にrequest token、AbortController、busy lane、active preview descriptorを集約する。service呼出しの所有者は引き続きAppとする。
- source requestのbusyとevent transitionのbusyを分離する。source GET中でもevent/day切替を可能にし、その切替で旧requestをabortまたは無効化する。
- `GasRefreshService` と `DataManager` のGAS preview APIへ任意の `AbortSignal` を通す。`File.text()` はabortできないためtokenで結果を捨てる。
- request開始時のrefとsource generationを捕捉し、event/day切替、source generation変更、settings close、より新しいrequestの後に完了した結果を表示しない。
- `configured` はstateの存在ではなく、空CSV sentinel以外のsourceがあることを意味する。空sentinelにactivityが残っていてもsourceは「未設定」と表示する。
- `event-registry.test.ts` を標準 `test:webapp` 一覧へ追加する。

### Task 5: Source diff dialog

維持する点:

- componentへraw CSV/GAS payloadを渡さない。
- applyはservice-issued preview IDだけで行う。
- focus trap、background inert、focus returnを共通helperへ分ける。

追記が必要な点:

- App/sessionはactive previewを `csv` / `gas` で識別し、ref、previewId、mode、safe diff modelを保持する。componentのIDだけから適用serviceを推測しない。
- CSVにも `cancelCsvPreview(previewId)` を追加し、cancel、settings close、event/day切替、新previewでmemory-only previewを破棄する。
- preview作成はTask 4、表示・apply/cancelはTask 5という境界を明記する。Task 4では永続化しない。
- apply二重押下、cancelと遅延preview完了の競合、旧ref previewのapply、期限切れ、pending発生、保存失敗をテストする。

### Task 6: Outbox recovery

維持する点:

- safe view modelだけを描画する。
- retryとdiscardを分け、discard後もLocalStorageの購入状態を保持する。
- refをまたいだIDの一括discardを禁止する。

追記が必要な点:

- coordinatorへone-ref retryを表す明示APIを追加し、all-ref retry、startup、online、manual retryの重複実行を既存outbox coalescingと整合させる。
- POST中のentryはservice側でdiscardを拒否する。UIのprocessing disableだけを安全境界にしない。
- POST中に別IDをdiscardする場合、新規appendや未選択entryを失わないこと、discard保存失敗でqueueを変えないことをテストする。
- retry/discardの完了後、outbox panelだけでなくselectorのpending数、source lock、delete lockを同じrepository snapshotから再構築する。

### Task 7: Scoped deletion

維持する点:

- 四つのscopeをserviceで実装し、componentへ削除意味論を置かない。
- pending outboxがあるscopeをservice側で拒否する。
- all-eventsは最初のwrite前に全対象をpreflightし、途中失敗を成功扱いしない。

追記が必要な点:

- `circles-delete` はempty CSV sentinelへのsource replacementであり、新しいgenerationを必要とする。`SourceSettingsService` のreplacement分類とテストをTask 7で更新する。
- delete view modelはactive refのpending数と全ref合計pending数を別々に受け取る。active scopeは前者、all-eventsは後者でblockする。
- `repository.list()` は壊れたindexを黙って落とすため、all-events専用のstrict列挙/preflight APIを追加する。malformed index、重複ref、missing state、schema不正stateはいずれもwrite前に失敗させる。
- all-eventsの最終状態は「既存state/index/last-openedを削除後、registry defaultを新しいempty sentinelとして再初期化する」と定義する。保存領域が完全な空のままになるとは表現しない。
- event-day/all-events削除後の再初期化は通常selectionのsame-ref no-opを通さない専用経路を使う。fallback失敗時は削除済みstateと旧mapを組み合わせず、安全なno-active-data画面にする。
- Task 5のdialog focus helperとTask 6のrecovery導線を使うため、依存をTasks 1, 2, 4, 5, 6へ修正する。

### Task 8: CSV download

維持する点:

- active source rowだけをexportし、`removedFromSource`行を除外する。
- LocalStorage購入状態から`isSale`を生成する。
- browser APIをadapter化し、object URLを`finally`で解放する。

追記が必要な点:

- create URL、click、revokeの各失敗でstate、activity、source generationが変わらないことを固定する。
- IDの1/64文字境界、65文字、不正区切り、invalid Date、ローカル時刻の桁埋めをテストする。
- formula-like文字列はComiPath内では実行されず、round-tripを壊さないため現行値を保持する。`=`, `+`, `-`, `@`で始まる外部由来セルを表計算ソフトで開く場合のリスクを公開文書へ記載し、serializerが値を暗黙変換しないことを回帰テストで固定する。将来のneutralizationはCSV契約変更として別承認にする。

### Task 9: Mobile E2E

維持する点:

- 架空fixtureだけを使う。
- UI操作を通る8主要flowを実行する。
- 新snapshotを四つの管理surfaceに限定する。
- full E2Eを2回通す。

追記が必要な点:

- 現在のbaselineは5論理scenario、9 snapshot fileである。固定ファイル数ではなく既存snapshot directory全体のzero diffを確認する。
- source request中のevent/day切替、古いresponse破棄、preview expiry、apply二重実行、全管理modelの同期更新を追加flowで固定する。
- outbound requestをlocalhost、public asset、明示した架空GAS routeだけへallowlistし、それ以外をabortする。
- E2Eでproduction不具合が見つかった場合はTask 9へ混ぜず、所有Taskの修正・回帰テストとして分離する。

### Task 10: Accessibility, docs, handoff

維持する点:

- accessible name、focus、live region、44×44、safe area、200% zoom、keyboard orderを完了条件にする。
- public/credential auditとfresh verificationを行う。

訂正が必要な点:

- 公開文書の正本はignore対象の`docs/`ではなく、追跡対象の `guides/user-data-management.md`, `guides/data-contracts.md`, `guides/gas-sync.md` とする。
- ローカル `docs/architecture/`、`docs/status/`、`docs/plans/` は承認commit後の内部handoff更新として分ける。
- remoteは既に `origin` が設定済みである。最終確認は「空」を期待せず、既知のoriginから追加・変更がなく、push/PR/mergeを行っていないことを確認する。
- component DOM、alert、toast、console、snapshotにfull URL、CSV本文、sheet内容、request body、raw response、stack、memo/tweetが残らない専用fixtureを追加する。

## テスト保障の棚卸し

### 既存テストで保障済み

- CSV parse/serialize: CRLF/LF、quote、改行、duplicate space、missing header、priority、決定的出力。
- CSV preview: ID、generation、input hash、TTL、stale、tamper、pending after preview。
- GAS preview: initial/replacement/refresh、generation、snapshot fingerprint、TTL、pending、save failure。
- Source guard: pending recheck、generation、timestamp、replacement/refresh規則、delete failure。
- Repository: event/day分離、state corruption、save/delete rollback、quota相当失敗。
- Outbox: FIFO、error redaction、same-ref coalescing、in-flight append、remote成功後save失敗、unknown/duplicate discard ID。
- Coordinator: 全ref順序、途中失敗継続、safe summary、online burst coalescing。
- Event transition service: prepare無副作用、same-event manifest reuse、mismatch、不正ref、stale prepare、storage rollback。
- 既存mobile E2E: navigation/map/galleryとGAS local-first/reload/online recovery。

### 実装すべき追加テスト

| Priority | Owning task / test file | Scenario | Expected result |
|---|---|---|---|
| P0 | Task 3 / `tests/event-day-selector.test.ts` | rapid A→B、prepare/commit/render failure、same-event manifest reuse | newestだけcommitし、失敗時は旧map/state/selector/last-openedを保持 |
| P0 | Task 4 / `tests/source-manager-app.test.ts` | sheet A→Bが逆順完了、GET/File read中にref変更 | Aをabort/破棄し、旧sheet/preview/errorを新refへ出さない |
| P0 | Task 4 / `tests/source-manager.test.ts` | 5 MiBちょうど/+1、同一File再選択、不正URL/path/query/fragment | 境界内だけ一度emitし、inputをclear、invalid時はservice未呼出 |
| P0 | Task 4 / `tests/management-view-model.test.ts` | empty sentinel stateとactivityありsentinel | どちらもsourceは「未設定」、activityは消さない |
| P0 | Task 5 / `tests/source-diff-dialog.test.ts` | CSV/GAS cancel、ref変更、double apply、stale/pending/quota | active previewだけ適用し、失敗時state不変・dialog維持 |
| P0 | Task 6 / `tests/gas-outbox-service.test.ts` | processing ID discard、別ID discard、discard quota、concurrent append | processing IDは拒否し、未選択/new entryを失わない |
| P0 | Task 6 / `tests/outbox-panel-app.test.ts` | online/all/one retryとdiscardの競合 | 二重POSTなし、全management modelのpending/lockが一致 |
| P0 | Task 7 / `tests/storage-deletion-service.test.ts` | 四scopeの全field比較とsource generation | circlesだけ新generation、activityはsource/generation不変 |
| P0 | Task 7 / `tests/event-day-repository.test.ts` | malformed index、missing/invalid state、各remove失敗、rollback失敗 | preflightならwriteゼロ、write失敗なら可能な限り全復元し安全metadata |
| P0 | Task 7 / `tests/storage-deletion-app.test.ts` | active/default/all deleteとfallback prepare/commit/render failure | defaultを空で再初期化、失敗時no-active-data、map/state mismatchなし |
| P0 | Task 8 / `tests/csv-download.test.ts` | create/click/revoke failureとfilename境界 | URL解放を試行し、state/generation不変、safe error |
| P0 | Task 8 / `tests/data-manager-event-day.test.ts` | active/removed混在、purchase truth、escaping | removed除外、順序/CRLF/末尾改行を維持 |
| P0 | Task 9 / `tests/e2e/management.spec.ts` | Task 9の主要flowとrequest race/expiry | DOM、network order、LocalStorage、downloadを同時に保障 |
| P0 | Task 10 / component + E2E | focus全経路、unique name、live一重、44px、overflow、safe area、200% zoom | keyboard/screen reader/mobile DoDを自動観測可能な範囲で保障 |
| P0 | Task 10 / docs/public tests | labels、4 scope、pending/discard、single-device、no backup、known remote | 実装と公開文書が一致し、private/deployed値を含まない |
| P1 | Task 8/10 / codec and docs | formula-like text | 値を暗黙変換せず、外部表計算ソフトの注意を文書化 |
| P1 | Task 4–10 / DOM + console leak tests | URL、CSV、body、stack、memo/tweetを含む失敗fixture | editable URL input以外のDOM/log/snapshotに出さない |

## 実装順

1. Task 3の引継ぎゲートを完了する。
2. Task 4でmanagement session、source request cancellation、configured定義、source formを固定する。
3. Task 5でactive preview lifecycleとdialog apply/cancelを固定する。
4. Task 6でretry/discardのservice競合を先に固定してからpanelを接続する。
5. Task 7でstrict preflightとrollbackを先に固定してからdialog/fallbackを接続する。
6. Task 8でpure filename/download adapter/DataManager exportの順に実装する。
7. Task 9でproduction変更を混ぜずmobile flowとsnapshotを追加する。
8. Task 10でa11yの残差修正、追跡対象guides、監査、handoffを完了する。

## Review verdict

- **Task 4着手:** Blocked until Task 3 handoff gate passes.
- **Task 4〜10の構造:** Accept with the amendments recorded in the owning Task plans.
- **現行テスト網羅性:** Phase 2/3のservice層は強いが、management component、App orchestration、削除全体、download、focus/mobile flowは未保障。上表のP0追加テストがPhase 4 exit gateに必要。
