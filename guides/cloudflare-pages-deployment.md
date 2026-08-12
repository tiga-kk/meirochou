# Cloudflare Pages デプロイ運用

## 現在の方針

Cloudflare PagesのGit integrationは、production branchである `main` の自動デプロイだけを使う。feature/docs branchごとの自動preview deploymentは作らない。

GitHub Actions CIはCloudflare Pagesとは独立して維持する。preview deploymentを減らすためにCIを無効化・弱体化しない。

## Cloudflare Pages設定

Pages projectのBuilds & deploymentsで次を確認する。

- Production branch: `main`
- Production branch automatic deployments: 有効
- Preview branch deployments: `None`

これにより、通常のbranch pushはGitHub上のCI・レビューだけを行い、Pages preview buildの対象にしない。`main`へ反映された変更はproduction deploymentの対象とする。

具体的なアカウント側の確認手順は `docs/plans/phase-07-3/operations-cloudflare-pages-main-only.md` を参照する。

## Pull Requestの確認

PR merge前の必須gateはrepositoryのテスト、型検査、build、必要なE2Eとする。Cloudflare Pages preview URLの存在を必須条件にしない。

UI変更でheaded visual確認が必要な場合は、ローカル/CIのPlaywrightまたは明示的な検証環境を使う。preview deploymentがないことを理由にsnapshotやE2Eを省略しない。

## Production確認

`main`へmerge後は、必要に応じて次を確認する。

1. GitHub Actionsの必須checkが成功している。
2. Cloudflare Pagesのproduction deploymentが開始・成功している。
3. production URLで主要なsmokeを行う。

production障害時は原因をGitHub Actions、Cloudflare build、runtime asset、外部GAS等へ分類する。Pages build失敗を無条件にアプリコード不具合と決めつけない。

## Preview deploymentの既存履歴

過去に作成済みのpreview deploymentを削除するかどうかは、今後の自動preview停止とは別のcleanup作業である。既存履歴が残っていても、新しいbranch pushでpreview buildが発生しないことをまず確認する。

cleanupで履歴破壊や外部URLの削除が必要な場合は、Cloudflare側の権限と影響を確認してから別作業として行う。

## Secretと権限

Cloudflare account token、GAS URL、credentialをrepositoryの文書やコードへ埋め込まない。アカウント設定を変更できない実装担当は推測で代替設定を追加せず、`docs/status/progress.md`へ運用設定待ちとして残す。

Cloudflare設定待ちは、独立して進められるPhase 7.3のアプリ実装を停止させない。