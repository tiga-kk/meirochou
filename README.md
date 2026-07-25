# ComiPath

架空地図で動作するコミックマーケット向けサークル管理Webアプリ。サークルリストをブラウザのローカルストレージで管理し、地図上にピンを表示します。

## サポート機能マトリクス

| 機能 | 対応 |
|------|------|
| ローカルCSVインポート・差し替え | ✅ |
| Googleスプレッドシート（GAS）連携 | ✅ オプション |
| イベント・日程切替 | ✅ |
| 購入・保留の管理（LocalStorage正本） | ✅ |
| GAS同期キューの再送・破棄 | ✅ |
| サークル・日程・全データの削除 | ✅ |
| CSVエクスポート | ✅ |
| マルチデバイス同期 | ❌ 非対応 |
| JSON完全バックアップ | ❌ 非対応 |
| オフライン資産（Service Worker/PWA） | ❌ 非対応 |

## ドキュメント

- [データ管理ガイド](guides/user-data-management.md) — データ管理機能の詳細な使い方
- [データ契約](guides/data-contracts.md) — LocalStorage スキーマ、ソースプレビュー、CSV境界
- [GAS同期](guides/gas-sync.md) — GASネットワーク動作、outboxリトライ
- [GASデプロイ手順](integrations/gas-spreadsheet/README.md) — スプレッドシート構造、デプロイ手順
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
```
