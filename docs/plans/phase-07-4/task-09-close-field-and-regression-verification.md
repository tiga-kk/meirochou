# Phase 7.4 タスク9: 総合回帰・実機visual・実GAS残件の終了判定

## 目的

Task 1〜8の本番接続を自動テストとheaded/実機で確認し、Phase 7.3から持ち越したvisual・GAS・drag確認を含めて終了状態を正本へ記録する。

## 対象外

- Task 1〜8で未実装の新機能をこのTaskで追加すること。
- snapshot差分の無条件一括更新。
- credentialをrepositoryへ保存すること。
- drag遅延の再現証拠なしにgesture実装を書き換えること。

## 前提と依存関係

Task 1〜8完了。

## 読むべき文書と既存実装

- `docs/status/progress.md`
- `docs/reviews/phase-07-2-field-verification.md`
- `docs/reviews/phase-07-4-route-animation-diagnosis.md`
- Phase 7.4 Task 1〜8
- `package.json`
- `.github/workflows/webapp-ci.yml`

## 対象ファイル

### 作成

- `docs/reviews/phase-07-4-field-verification.md`

### 変更

- `docs/status/progress.md`
- 意図が確認できたvisual snapshotだけ
- 必要なら`docs/README.md`

### 削除

なし。

## 実装手順

1. Task 1〜8のfocused testを再実行する。
2. `npm run verify`、`npm run test:e2e:ci`、public tree auditを実行する。
3. 390px / 200% zoomでcurrent moving cue、static candidate、priority chip、standalone mapの横overflowをheaded確認する。
4. C108 public bundleで地図の任意地点をoriginにし、priority 10 / 9等を選択し、5 / 10 / 15件表示が条件どおり切り替わることを確認する。
5. 同じ地図で「保留も表示」のoff/onを確認する。
6. nearby cardのspaceとleader先anchorが別circleへずれていないことをheaded確認する。
7. 通常購入とGallery購入の双方でUndoを実操作し、route / status / pin表示が戻ることを確認する。
8. 実GAS test deploymentを利用できる場合、同じspaceを二度送信し、二回目が新規行追加ではなく既存行更新になることを確認する。対象外列が保持されることも確認する。URLやcredentialを文書へ記録しない。
9. Phase 7.3 Task 4のdrag遅延は実機でまだ再現する場合だけphysical inputでtraceを取り、再現条件を記録する。再現しない、または実機がない場合は「未確認/再現せず」とし、コード変更を追加しない。
10. snapshot差分が意図したPhase 7.4表示だけならheaded結果と対応づけて個別更新する。
11. `docs/reviews/phase-07-4-field-verification.md`へコマンド、PASS/FAIL、skip理由、manual結果を記録し、`docs/status/progress.md`を一意な終了状態へ更新する。

## テスト方針

失敗を、Phase 7.4回帰、意図したvisual変更、既存失敗、fixture/credential不足、外部GAS障害、実機限定gesture問題に分類する。retry成功だけで回帰をなかったことにしない。

## 検証コマンド

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

## 受入条件

- Task 1〜8の主要要求が本番入口から確認されている。
- animationは自動テストだけでなくheaded確認済み。
- priority filterがrouteとnearby mapで一致する。
- nearby mapの任意origin、件数、hold切替、お品書きoverlayが確認済み。
- 通常購入UndoとGallery Undoが確認済み。
- 実GAS確認を実行できた場合は同一space更新と列保持の証拠が記録されている。
- 実施不能事項は理由付きで「未確認」と記録され、自動PASS扱いされていない。
- progressがPhase 7.4の最終状態と一致する。

## 予定コミットメッセージ

```text
docs(phase-07-4): record field verification
```
