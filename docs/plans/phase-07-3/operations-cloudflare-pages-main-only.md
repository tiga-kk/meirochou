# Phase 7.3 運用作業: Cloudflare Pagesをmainのみ自動デプロイする

## 目的

Cloudflare PagesのGit integrationで、production branchである `main` の自動デプロイだけを有効にし、feature/docs branchごとのpreview deploymentを新規作成しない運用へ変更する。

これはCloudflareアカウント側の設定作業であり、Phase 7.3 Task 1〜8の本番コード実装とは独立して扱う。

## 設定方針

Cloudflare Pages projectで次を設定する。

- Production branch: `main`。
- Production branch automatic deployments: 有効。
- Preview branch deployments: `None`。
- GitHub Actions CI: 現行のまま。Pages previewを止めるために `.github/workflows/webapp-ci.yml` を弱体化しない。

既存preview deploymentの削除は別のcleanupであり、「今後preview branchから自動buildしない」ことの完了条件へ混ぜない。

## 確認手順

1. Cloudflare dashboardでPages projectのBuilds & deployments設定を開く。
2. production branchが `main` であることを確認する。
3. preview branch deploymentsを `None` にする。
4. feature/docs branchへの新しいpushでPages preview buildが新規開始されないことを確認する。
5. `main` への通常の更新ではproduction deploymentが行われることを確認する。
6. GitHub Actionsが従来どおり動作することを確認する。

## 権限がない場合

Cloudflareアカウントへアクセスできない実装担当は設定を推測で変更しない。`docs/status/progress.md` のCloudflare運用項目を「設定待ち」のままにし、Task 1〜8を続行する。

## やってはいけないこと

- CIを無効化してPages build削減の代替にしない。
- preview停止のためにrepositoryへsecretを追加しない。
- production deployment自体を無効化しない。
- 既存preview deploymentの一括削除を必須化しない。
- Cloudflare設定待ちだけを理由にアプリ実装をBLOCKEDへしない。

## 完了条件

- `main`以外のbranch pushで新規Pages preview deploymentが自動作成されない。
- `main`はproduction deploymentを継続する。
- GitHub Actions CIは独立して維持される。
- 設定結果だけを進捗正本へ記録し、credentialやaccount識別情報を文書へ残さない。