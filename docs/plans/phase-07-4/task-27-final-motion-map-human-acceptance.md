# Phase 7.4 Task 27: 経路motion・地図workspaceの最終人間受入

## 目的

Task 23〜26を自動検証とMotorola Android実機の双方で確認し、第二回人間受入で残った二テーマが解消した場合だけPhase 7.4を終了する。

## 対象外

- FAIL項目をこのTask内で場当たり的に修正すること。FAIL時は対応Taskを再オープンする。
- visual snapshotの無条件更新。
- GAS残件を今回のPhase終了条件へ混ぜること。

## 前提と依存関係

Task 23〜26完了。

## 読むべき文書と既存実装

- `docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`
- `docs/reviews/phase-07-4-second-human-acceptance-failures.md`
- Task 23〜26
- `docs/reviews/phase-07-4-field-verification.md`
- `package.json`
- `.github/workflows/webapp-ci.yml`

## 対象ファイル

### 変更

- `docs/reviews/phase-07-4-field-verification.md`
- `docs/reviews/phase-07-4-second-human-acceptance-failures.md`
- `docs/status/progress.md`
- 人間が意味的に受入済みと確認したvisual snapshotだけ

### 新規作成

なし。

### 削除

なし。

## 実装手順

1. Task 23〜26のfocused testsを再実行する。
2. `npm run verify`、`npm run test:e2e:ci`、public tree audit、`git diff --check`を実行する。
3. Motorola AndroidのAnimator再生時間スケールを0xへ戻し、通常アプリのanimationを復活させない状態を作る。
4. meirochou設定`system`でcurrent motionが停止することを確認する。
5. 同じ端末設定のまま`always`へ変更し、current routeに5個程度の白cueが見え、start→goalへ現状より速く流れることを人間が確認する。
6. `off`で完全停止することを確認する。
7. `always`状態でmapを連続drag/pinchし、motion OFF時と比べて以前のような明確な重さが再発しないことを人間が確認する。gesture中のcue停止は許容する。
8. 390px級、ユーザー確認時に近い644x886級、900px以上で「地図」画面を開く。
9. 644x886級で地図が第二回確認時より明確に大きく、上部・左右の無駄な余白が縮小されていることを確認する。
10. 5件cardで水平strip操作を要求せず、narrow/mediumでは折り返しgrid、wideではside panelになることを確認する。
11. 縦長と横長のお品書きが一律aspect ratioへ潰されず表示されることを確認する。
12. cardがmapを覆わず、leader lineをanchorからcardまで追えることを確認する。
13. `お品書きを見る`を押し、nearby mapを閉じずdetailが前面に出ることを確認する。閉じると元cardへ戻り、mapのorigin/filter/zoomが保持されることも確認する。
14. 人間確認に合格したvisual snapshotだけを必要最小限更新する。
15. 結果をfield verificationとsecond human acceptance reviewへ追記し、全条件PASS時だけprogressをPhase終了へ更新する。

## テスト方針

自動PASSと人間受入を分離して記録する。Androidのmotion/performanceと、地図の視覚的な利用面積・detail layeringは実機/実画面確認なしにPASS扱いしない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-motion-preference.test.ts tests/route-motion-controller.test.ts tests/nearby-map-workspace-layout.test.ts tests/nearby-map-view.test.ts tests/circle-detail.test.ts tests/dialog-focus.test.ts
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

## 受入条件

- Motorola AndroidでAnimator=0のまま、`always`でmeirochouのcurrent motionだけを視認できる。
- OS全体のanimationを1xへ戻す運用を要求しない。
- 5個程度の白cueが現状より高速にstart→goalへ流れる。
- motion ONでもmap gestureがOFF時より明確に重くならない。
- 独立地図が第二回人間確認時より大きく、画面余白を有効利用する。
- 5件のお品書きを水平一列stripで探させない。
- cardはmap外で、自然aspect ratioを維持する。
- catalog detailがnearby mapより前面に表示され、mapを閉じる必要がない。
- 自動回帰に新規FAILがない。
- 上記を人間が受入済み。

一つでもFAILならPhase 7.4を終了しない。

## 予定コミットメッセージ

```text
docs(phase-07-4): close motion and map workspace acceptance
```
