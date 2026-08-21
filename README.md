# meirochou

即売会一般参加者向けのwebアプリ。
(独自で構築した地図を用いて)サークルリストの管理、順路の表示と変更、CSV及びスプレッドシートとの連携を行う。


| 機能 | 対応 |
|------|------|
| ローカルCSVインポート・差し替え | o |
| Googleスプレッドシート連携 | o |
| イベント・日程切替(C108対応済み) | o |
| 購入・保留の管理（LocalStorageを正本とする） | o |
| GAS同期キューの再送・破棄 | o |
| Xアカウントの最近の投稿表示（IndexedDB cache対応） | o |
| サークル・日程・全データの削除 | o |
| CSVエクスポート | o |
| マルチデバイス同期 | x 非対応 |
| JSON完全バックアップ | x 非対応 |
| Service Worker / PWA | Service Worker: catalog offline cacheのみ対応 / installable PWAは非対応 |
| Background Sync | x 非対応 |

## 使用方法（人間向け）
1. 宝の地図からサークル名をCSVまたはスプレッドシートに抽出する。

必須要素
- space：サークルの配置箇所(例 東A32ab)
任意要素
- priority：優先度(整数)
- tweet：お品書きのURL(twitterのURLを入れないこと。pbs.twimg形式で)
- account：twitterアカウント
- isSale：まだ売り切れていないか？

X profile URLの`account`は、現在の目的地詳細に最近の投稿（時刻と本文）を表示する対象になります。Pixivなどの非X URLは投稿取得の対象外です。

(スプレッドシートを使う場合：
a.スプレッドシートの「拡張機能」->「Apps Script」を選び、
[Code.gs](integrations/gas-spreadsheet/Code.gs)を貼って保存する。
b.「デプロイ」->「新しいデプロイ」から今貼ったコードを選びデプロイ(機能はwebアプリ)
c. webアプリURLを控えておき、サイトの方に貼る)

2. 地図をタッチするか上の選択肢から選び、始点を決定すると最適化された順路が表示される

3. 購入したら、画面下部の「購入」ボタンを押すことで画面が次の目的地に遷移する

### 可能な操作
- 地図上の点を途中でタッチして、行き先を変更することができる
- 一旦保留にしておくことができる
- 進捗を保存したまま、別のホールに切り替えることができる
- イベント、日程ごとに進捗を保存しておくことができる


## ドキュメント（LLM向け）

- [データ管理ガイド](guides/user-data-management.md) — データ管理機能の詳細な使い方
- [データ契約](guides/data-contracts.md) — LocalStorage スキーマ、ソースプレビュー、CSV境界
- [GAS同期](guides/gas-sync.md) — GASネットワーク動作、outboxリトライ
- [GASデプロイ手順](integrations/gas-spreadsheet/README.md) — スプレッドシート構造、デプロイ手順
- [イベント追加・運用](guides/event-addition.md) — wrapper生成物をproduction registry/map bundleへdata-onlyで追加・検証・公開する手順
- [Cloudflare Pages公開・運用](guides/cloudflare-pages-deployment.md) — 本番、PRプレビュー、Access、ロールバック

## セットアップ

```bash
npm ci
npm run dev:webapp
```

## ビルドと検証

```bash
npm run build:webapp    # 本番ビルド
npm run verify          # ユニットテスト・型チェック・ビルド検証
npm run test:e2e        # モバイルChromium E2Eテスト
npm run test:e2e:ci     # GitHub Actionsと同じPlaywrightコンテナでE2E
```

visual snapshotを更新するときも、GitHub Actionsと同じ環境を使う。

```bash
npm run test:e2e:ci:update
```

`test:e2e:ci`にはDockerと、CIで固定している
`mcr.microsoft.com/playwright:v1.61.1-noble`、Node.js `22.14.0`、npm `10.9.2`が必要になる。
