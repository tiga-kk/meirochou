# Phase 7.3 実装計画

## 目的

Phase 7.2 の実機確認で見つかった入力正規化、カタログPOST、地図候補表示、地図操作遅延、現在経路表示、モバイル表示、Gallery購入操作の問題を、本番の実利用経路まで接続した状態で修正する。

設計上の要求は [`../../specs/2026-08-12-phase-07-3-field-followups-design.md`](../../specs/2026-08-12-phase-07-3-field-followups-design.md) を参照する。現在状態と次に着手するTaskの正本は [`../../status/progress.md`](../../status/progress.md) だけとする。

Phase 7.2 の自動検証結果と未完了の実機確認は [`../../reviews/phase-07-2-field-verification.md`](../../reviews/phase-07-2-field-verification.md) を引き継ぐ。Phase 7.3 はその未確認事項を隠さず、独立して実装できる修正まで止めない。

## 実装開始時の基準点

各Taskの開始直前に指定ブランチの最新リモートHEADを取得し、そのHEADをTaskの基準点とする。将来の開始SHAをこの文書へ固定しない。

未完了のWIPコミットがある場合は破棄せず、進捗正本と差分を照合して同じTaskを再開する。複数Taskが着手可能でもユーザー判断を要求せず、WIPがあればそれを優先し、なければ番号が最小の着手可能Taskを選ぶ。

## Task一覧と依存関係

| Task | 内容 | 直接依存 |
|---|---|---|
| 1 | サークルスペース表記の正規化 | なし |
| 2 | カタログ拡張→GAS POST経路の診断と実機確認 | Task 1 |
| 3 | 購入済みピン非表示と候補表示の分離 | なし |
| 4 | 地図ドラッグ遅延の計測と最小改善 | Task 3 |
| 5 | 現在経路の方向表示強化 | Task 3 |
| 6 | 目的地カタログのモバイルレイアウト修正 | Task 3 |
| 7 | Gallery購入時の退出表示と完全Undo | Task 3 |
| 8 | 実機受入・回帰検証・Phase 7.3終了判定 | Task 1〜7 |

Task 1 と Task 3 は並行可能だが、通常は Task 1 から着手する。Task 2 の実GAS確認に資格情報や実デプロイ環境がなくても、実装と自動検証を終えた状態を進捗へ記録し、Task 3〜7を進めてよい。実GAS確認はTask 8で再試行する。

Cloudflare Pagesの「`main`のみ自動デプロイし、preview branch deploymentを作らない」設定は [`operations-cloudflare-pages-main-only.md`](./operations-cloudflare-pages-main-only.md) の独立した運用作業とする。Cloudflareアカウントへアクセスできないことを、Task 1〜8のアプリ実装停止条件にしない。

## 共通の実装規則

### 既存責務を再利用する

- 既存のdomain/use-case/view/controllerを確認してから新しい抽象化を作る。
- 一つの呼び出し元しか持たない薄いwrapper、将来用interface、汎用transaction層を追加しない。
- 本番の既存入口を新実装へ接続する。テスト専用APIやテスト専用分岐で要求を成立させない。

### REDの条件

意味のあるREDは、対象要求が未実装であるために期待値assertionが失敗する状態である。import失敗、fixture不足、Playwright環境不足、外部サービス未接続だけをRED完了と扱わない。

主要な要求では、少なくとも次を確認する。

1. pure/domainの規則。
2. 実際のcallerまたはassemblyがその規則を利用すること。
3. 旧caller・旧分岐のままでは通らないこと。
4. 必要なUI要求では本番DOM/E2Eから到達できること。

snapshotは補助証拠であり、業務挙動や本番接続の唯一の証拠にしない。

### 既存失敗の分類

Task開始時の基準点でも再現する失敗は、今回の回帰と分離して記録する。外部サービス、資格情報、private fixture、headed browser不足は環境要因として扱い、独立して修正できるTaskまで止めない。

### 共通検証

変更範囲に応じてfocused testを先に実行し、Task完了前に少なくとも次を実行する。

```bash
npm run typecheck:webapp
npm run test:webapp
```

GASを変更したTaskでは追加で次を実行する。

```bash
npm run build:gas
node --test ./tests/gas-contract.test.mjs ./tests/gas-build.test.mjs
```

Phase終了時はTask 8で次を実行する。

```bash
npm run verify
npm run test:e2e:ci
```

CIやpackage script自体は、実装上本当に必要な別要件が見つからない限り変更しない。

## 停止が必要な場合

次の場合だけ、独断で仕様を決めずユーザー判断または外部作業待ちとする。

- 公開API、保存形式、後方互換性などの外部挙動を変える複数案がある。
- データ損失または不可逆移行が必要になる。
- 認証、権限、secret、課金、ライセンスの判断が必要になる。
- 他者の差分やGit履歴を破壊しないと進められない。

private helper名、Task内で直せる型エラー、formatter、focused testの失敗は通常の実装作業として解決する。