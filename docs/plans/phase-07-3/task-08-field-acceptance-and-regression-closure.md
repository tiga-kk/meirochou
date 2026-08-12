# Phase 7.3 Task 8: 実機受入・回帰検証・終了判定

## 目標

Task 1〜7が本番利用経路へ接続されていることを、自動テスト・headed visual・可能な範囲の実GAS確認で検証し、Phase 7.2から持ち越した未確認事項も含めて終了状態を一意にする。

Phase 7.2 の既知の検証結果は `docs/reviews/phase-07-2-field-verification.md` を基準にする。そこでは自動検証は概ね成功した一方、visual snapshot差分、private C108 fixtureによるskip、headed browser/資格情報不足によるextension→実GAS smoke未実施が残っている。これらを「存在しなかった」ことにしない。

## 前提

Task 1〜7の実装コミットが完了していること。Task 2の実GAS確認だけが環境待ちの場合はTask 8で再試行する。

Cloudflare Pagesアカウント設定は独立運用作業であり、このTaskのアプリ受入をブロックしない。運用設定が未完なら進捗は「アプリ完了・Cloudflare運用設定待ち」と分離して記録する。

## 自動検証

まずfocused testを再実行し、その後に次を実行する。

```bash
npm run verify
npm run test:e2e:ci
```

GAS変更が含まれるため、`npm run verify` 内のGAS build/contractが通っていることも確認する。

失敗は次へ分類する。

1. Phase 7.3の回帰。
2. 意図したUI変更によるvisual baseline差分。
3. Task開始基準点から存在する既存失敗。
4. fixture / headed browser / credential不足。
5. 外部GASまたは外部サービス障害。

snapshot差分を自動更新しない。意図した画面であることをheaded確認し、関連する意味的behavior assertionが通ってから必要なsnapshot更新を別の実装作業として行う。

## 実機・headed確認

### Space/GAS

- 表記揺れを含む同一circleが重複行にならない。
- extension optionsのprobeが実test deploymentへ成功する。
- 実カタログページからPOSTできる。
- 同じcircleを再送して既存行が更新される。

### 地図

- 購入済みcircleの通常pinが消える。
- pin tapでcurrent targetは維持され、floating candidate cardだけが出る。
- candidate closeでcurrent routeへ戻る。
- current routeの赤いbaseと方向cueが実機で認識できる。
- candidate routeの青と混同しない。
- drag traceがTask 4のbeforeより改善、または改善しない原因が記録されている。

### モバイル/Gallery

- 360px/390pxと200% zoomでtarget catalogが一列・無横スクロール。
- 購入時に対象cardだけが退出する。
- Undo期限内にstatus、route、outbox、card、pinが一貫して戻る。
- reduced motionでも操作可能。

## C108/private fixture

private fixtureが利用できる環境ではC108 browser smokeも実行する。利用不能の場合はその理由を明示し、public fixtureで証明できる要求まで止めない。fixture不足をコード回帰と分類しない。

## 成果物

Task完了時に次を作成・更新する。

- `docs/reviews/phase-07-3-field-verification.md`
- `docs/status/progress.md`

review文書には実行コマンド、結果、skip/失敗分類、実機確認の実施可否だけを記録し、secret、GAS URL、実データを含めない。

## やってはいけないこと

- snapshotを機械的に更新して差分を消さない。
- private fixture不足だけで全Phaseを失敗扱いしない。
- 実GAS資格情報をrepoへ保存しない。
- Cloudflareアカウント権限不足をアプリTask 8の失敗へ混ぜない。
- 自動test PASSだけで実機要求を実施済みと記録しない。

## 完了条件

- Task 1〜7の主要要求が本番入口から検証されている。
- 自動検証結果とvisual/manual結果が分類されている。
- 実施不能の外部確認が進捗正本へ残っている。
- アプリ側に既知の実装欠陥が残らない場合はTask 8を完了にできる。
- Cloudflare運用設定だけが未完の場合はPhase状態を分離して記録し、アプリ実装を再度開かない。