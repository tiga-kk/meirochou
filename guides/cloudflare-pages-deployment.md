# Cloudflare Pages 公開・運用ガイド

ComiPathの公開Webappは、Cloudflare PagesのGit integrationでGitHubリポジトリを直接ビルドして配信する。Phase 5Aでは架空データの`demo-v1`だけを公開対象とし、実地図やprivate mapは扱わない。

## 構成と非対象

Cloudflare Pagesには次の値を設定する。

| 項目 | 値 |
|---|---|
| Project name | `meirochou` |
| Production branch | `main` |
| Framework preset | None / 未選択 |
| Build command | `npm run build:webapp` |
| Build output directory | `dist/webapp` |
| Root directory | 空欄（repository root） |
| Production環境変数 | `NODE_VERSION=22.14.0` |
| Preview環境変数 | `NODE_VERSION=22.14.0` |
| Production custom domain | `meirochou.tiga.moe` |

Phase 5AではDirect Upload、Wrangler、Pages Functions、固定staging branch、固定preview custom domain、Cloudflare API token、KV、R2、D1、Web Analytics、PWAを追加しない。デプロイ専用のGitHub Actionsも追加せず、Cloudflare PagesのGit integrationと既存のWebapp CIを分離して運用する。

## 初回Pages設定

Cloudflare DashboardのWorkers & PagesからPagesプロジェクトを作り、GitHubの`tiga-kk/meirochou`を接続する。GitHub Appのアクセス範囲を選べる場合は、このリポジトリだけに限定する。

設定画面へ上表の値を入力し、最初のproduction deploymentを実行する。`meirochou`というproject nameが利用できない場合は、別名をその場で選ばず、公開URLと運用文書の変更を先に確認する。

初回デプロイ後、`meirochou.pages.dev`でdemoアプリが表示され、JavaScript、イベントmanifest、地図、points、gridの各assetが404にならないことを確認する。

## PreviewとAccess

Production以外のbranchに対するpreview deploymentを有効にし、Pages project settingsからpreview用のAccess policyを有効にする。

Accessで保護する対象は、次のようなpreview hostnameである。

```text
<hash>.meirochou.pages.dev
<branch>.meirochou.pages.dev
```

Productionの`meirochou.pages.dev`と`meirochou.tiga.moe`は公開のままにする。組み込みのpreview Access policyで要件を満たす限り、個別のZero Trust applicationは作成しない。

Previewレスポンスでは`X-Robots-Tag: noindex`も確認する。Access認証が介在するため、確認時は認証後のレスポンスまたはブラウザのNetwork表示を使用する。

## Custom domain

最初のproduction deploymentが成功した後、Pages projectのCustom domainsから`meirochou.tiga.moe`を追加する。

Pages projectへ関連付ける前に、DNS画面でCNAMEだけを手動作成しない。`tiga.moe`が同じCloudflare accountのzoneにある場合は、PagesによるDNS recordの作成・検証を利用し、statusがActiveになるまで待つ。

## PR preview gate

PRをmerge可能にする前に、PRへ紐づいたpreviewで次を確認する。

1. 未認証のブラウザではAccess loginが表示される。
2. 許可されたaccountで認証するとdemoアプリが表示される。
3. `/assets/events/manifest.json`が200を返す。
4. demoのmap、points、grid、grid metadataが200を返す。
5. 架空データだけのCSVをimportできる。
6. 現在位置と対象を選び、route overlayを表示できる。
7. reload後もLocalStorageの状態が維持される。
8. ConsoleとNetworkにasset 404、mixed content、CSP errorがない。
9. Preview responseに`X-Robots-Tag: noindex`がある。
10. 実イベント、実地図、private mapを選択できない。

GitHub側では既存Webapp CIとmobile Chromium E2Eが成功していることも確認する。Cloudflareのcheck名は実際に安定して表示されるまでrequired checkへ推測で追加しない。

## Production gate

`main`へのmerge後、`meirochou.pages.dev`と`meirochou.tiga.moe`の両方で次を確認する。

- Access loginなしでHTTPS表示できる。
- merge済みの`main` commitがdeployment sourceになっている。
- demoアプリ、manifest、map、CSV import、route表示が動作する。
- reload後もLocalStorageの状態が維持される。
- ConsoleとNetworkにasset errorがない。
- 実地図やprivate mapが含まれていない。

## Rollback

Productionに問題がある場合は、Pages projectのDeploymentsから直前の成功済みproduction deploymentを開き、三点メニューのRollbackを実行する。

Preview deploymentはRollback対象にしない。RollbackしてもGitの`main`は変更されないため、repositoryでは別途forward fixまたはrevertを作成する。正常時にはRollbackを実行せず、過去の成功済みdeploymentが選択可能であることだけを確認する。

## 障害の切り分け

| 症状 | 最初の確認 | 対応 |
|---|---|---|
| Pages buildが失敗 | build log、Node version、output directory | mergeせず、`npm ci && npm run build:webapp`で再現する |
| PreviewでAccess loginが出る | preview hostnameか | 正常。許可accountで認証する |
| Previewが公開されている | preview Access policy | merge前にpolicyを有効化・修正する |
| Custom domainが開かない | PagesのCustom domains status、その後DNS | Pages associationを直すまでad-hocなrecordを追加しない |
| Appは開くがassetが404 | `dist/webapp` verifierとrelative URL | DNSではなくrepository buildを修正する |
| Production regression | 成功済みdeployment一覧 | Rollback後、repository側で修正する |
