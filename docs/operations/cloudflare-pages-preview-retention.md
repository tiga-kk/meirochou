# Cloudflare Pages Preview Deployment Retention

更新日: 2026-08-12

## 目的

Cloudflare Pagesがbranch/commitごとに生成するpreview deploymentを無期限に残さず、必要なpreviewだけを保持する。Phase 7.2のproduction機能とは独立した運用課題として扱う。

## まず増加を止める

### 1. Preview branch control

Cloudflare PagesのGit連携では、Preview branch controlで自動preview対象を制限できる。

推奨:

```text
Production branch: main
Preview branches: Custom
include: feature/*, feat/*, fix/*
exclude: docs/*, chore/*
```

実際に使うbranch namingに合わせてincludeを狭くする。docs-only branchのpreviewが不要なら`docs/*`はCloudflare側で除外する。

### 2. Build watch paths

branchだけでなく変更pathも絞る。Cloudflare PagesのBuild watch pathsでdocs-only pushをbuild対象外にできる。

基本案:

```text
Include paths: *
Exclude paths: docs/*
```

ただし`.github/`、scripts、config変更がwebapp buildへ影響することがあるため、それらを一律excludeしない。`docs/*`のようにproduction artifactへ影響しないことが明確なpathだけから始める。

この設定により、`feature/*` branch上でも変更がdocsだけなら不要なPages buildを抑制できる。

### 3. 単発skip

単発でbuild不要なcommitはcommit message先頭へCloudflare Pagesのskip markerを使える。

```text
[CF-Pages-Skip] docs: update implementation plan
```

ただし人手で毎回付け忘れるため、恒常運用はbranch control + build watch pathsを主とする。

## 手動cleanup

現在のdeployment一覧:

```bash
npx wrangler pages deployment list \
  --project-name meirochou \
  --environment preview \
  --json
```

個別削除:

```bash
npx wrangler pages deployment delete <DEPLOYMENT_ID> \
  --project-name meirochou
```

alias付きpreviewも削除対象にする場合は、そのdeploymentが不要であることを確認した上で`--force`を使う。

```bash
npx wrangler pages deployment delete <DEPLOYMENT_ID> \
  --project-name meirochou \
  --force
```

Cloudflareの仕様上、branchのlatest deploymentは削除できない。したがって「各branchの先頭previewだけ残し、それより古いcommit previewを消す」というretentionが自然である。

## 推奨retention policy

Phase開発中:

```text
production: 全て保護
各preview branchの最新: 保護
7日以内のpreview: 保護
7日より古いpreview: 削除候補
```

さらにPR情報を使うcleanupを後で作る場合:

```text
open PRの最新preview: 保護
closed/merged PR branchの古いpreview: 削除候補
```

ただしCloudflare側のbranch latestは削除不可なので、branch自体にlatest deploymentが1件残ることは許容する。

## GitHub Actionsで定期cleanupする場合

手動整理でpolicyが妥当と確認できた後、weekly workflowを追加する。

候補:

```text
.github/workflows/cloudflare-preview-cleanup.yml
scripts/cleanup-cloudflare-pages-previews.mjs
```

workflow schedule例:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: "20 18 * * 0"
```

18:20 UTCは日本時間月曜03:20。時刻に意味はないため、他CIと競合しにくい時間へ変更してよい。

## cleanup scriptの安全規則

Cloudflare Pages APIからdeploymentsを全page取得し、削除前に必ずclassificationする。

```ts
type DeploymentDecision =
  | { kind: "keep"; reason: string }
  | { kind: "delete"; reason: string };
```

KEEP:

- environmentがproduction。
- branch内でcreated_onが最新。
- `created_on >= now - retentionDays`。
- API responseが不完全でbranch/latest判定できない。

DELETE:

- preview。
- branch最新ではない。
- retentionDaysより古い。
- deployment IDが取得できる。

分類不能はfail-closedでKEEPする。

## 最初はdry-runにする

script defaultはdeleteしない。

```bash
node scripts/cleanup-cloudflare-pages-previews.mjs \
  --project meirochou \
  --retention-days 7 \
  --dry-run
```

実削除は明示flagを要求する。

```bash
node scripts/cleanup-cloudflare-pages-previews.mjs \
  --project meirochou \
  --retention-days 7 \
  --apply
```

GitHub Actionsへ入れる前にdry-run outputを人間が確認する。

## secrets

GitHub Actionsでは最低限:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

API tokenはCloudflare Pages deploymentsを削除できる`Pages Write`権限だけを与え、Global API Keyを使わない。project nameはsecretでないためworkflow envでよい。

## API

一覧:

```text
GET /accounts/{account_id}/pages/projects/{project_name}/deployments
```

削除:

```text
DELETE /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}
```

## 導入順序

1. DashboardのPreview branch controlをCustomへ変更し、不要branchの新規previewを止める。
2. Build watch pathsで`docs/*`だけの変更をskipする。
3. Wrangler `deployment list --json`で現状を把握する。
4. 古いpreviewを数件だけ手動削除し、branch latestが残ることを確認する。
5. 1〜2週間運用してretention `7 days`が短すぎないか確認する。
6. 問題なければdry-run scriptをrepoへ追加する。
7. dry-run output review後にweekly `--apply`を有効化する。

この運用はapp feature Phaseとは別PRにする。