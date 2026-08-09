# Phase 6 Task 8: 常設の使い方画面と初見ユーザー向け導線を追加する

## 目的

初見ユーザーが外部ドキュメントを読まなくても、データ準備と基本操作をアプリ内で理解できるようにする。

## 対象外

- チュートリアルを完了しないとアプリを使えない強制フロー
- 複数ページのwizard
- help内容を外部CMSから取得する仕組み
- 利用状況analytics

## 前提と依存関係

- Task 4のheaderに「使い方」導線を追加する。
- Task 7の一覧スワイプhintは本Taskで再実装せず、その説明内容だけ整合させる。

## 読むべき文書と既存実装

- `integrations/gas-spreadsheet/README.md`
- `apps/webapp/js/features/circle-data-source/domain/csv-circle-codec.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/index.html`
- `guides/data-contracts.md`が現行treeに存在する場合は内容も照合する

## 対象ファイル

### 作成

- `apps/webapp/js/components/user-guide-dialog.ts`
- `tests/user-guide-dialog.test.ts`

### 変更

- `apps/webapp/index.html`
- `apps/webapp/js/app/browser-application.ts`または既存settings shell binding
- 必要なCSS
- E2E test

### 削除

なし。

## 実装手順

1. headerに常時アクセス可能な「使い方」ボタンを追加する。
2. 独立したdialogとして`user-guide-dialog.ts`を作り、既存Lit componentの方針に合わせる。
3. 初回表示を強制しない。ユーザーはいつでも閉じて通常操作へ戻れる。
4. 内容を少なくとも次のセクションへ分ける。
   - はじめに: 現在地を設定して案内を開始する。
   - CSVを使う。
   - Google Spreadsheet / GASを使う。
   - 地図と経路変更。
   - 一覧とスワイプ。
   - 未送信GASデータ。
5. CSVカラムは現行parserに合わせて記載する。
   - `space`: 必須
   - `priority`: 任意
   - `isSale`: 任意
   - `account`: 任意
   - `tweet`: 任意
   - `memo`: 任意
6. GAS sheetは現行GAS実装に合わせて記載する。
   - 読み込みには`space`必須。
   - `priority`, `isSale`, `account`, `tweet`, `memo`は読み込み時は任意。
   - 購入結果をGASへ書き戻す場合は`isSale`列が必要。
7. 列名はcase-sensitiveであること、duplicate recognized headerやspace欠落がエラーになることを記載する。
8. 実在のGAS URL、Spreadsheet ID、ユーザーデータをhelpやsnapshotへ埋め込まない。
9. 経路変更について「候補を選択→経路を比較→確定」の順をTask 5の実UIと同じ言葉で説明する。
10. GAS送信に失敗しても購入状態は端末へ残り、未送信データを設定から再送できることを説明する。
11. keyboard focus trap/restore、Escapeまたは閉じる操作、aria labelを既存dialog componentの慣例に合わせる。

## テスト方針

- dialogの開閉。
- 必須カラム`space`と任意カラムの表示。
- GAS書き戻しには`isSale`が必要という説明。
- 外部URLやcredentialを固定値として含めない。
- keyboardで閉じられる。
- 200% text zoomでcontentが切れずscrollできる。

## 検証コマンド

```bash
npx vitest run tests/user-guide-dialog.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run test:e2e:ci
git diff --check
```

## 受入条件

- 初見ユーザーがアプリ内からCSV/GAS準備方法を確認できる。
- help内容が現行parser/GAS実装と一致する。
- 強制wizardや新しい外部サービスを追加しない。
- Task 5/7の実操作と説明文が矛盾しない。

## 予定コミットメッセージ

`feat(ui): add in-app usage guide`
