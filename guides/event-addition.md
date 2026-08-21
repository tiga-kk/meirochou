# イベント追加・運用ガイド

この文書は、`tiga-kk/meirochou_wrapper`でreview済みevent packageを生成し、`tiga-kk/meirochou`へproduction eventとしてdata-onlyで追加し、検証・公開・rollbackするための運用手順です。

通常の新規event追加では`apps/webapp/js/**`を変更しません。application TypeScript変更が必要になった場合はこの手順を中断し、event固有分岐を追加せず別Taskとして原因を調査します。

## Purpose / scope

このガイドは、将来の新規eventをwrapperのstaging packageからmeirochouへ取り込む手順を定めます。ここでいう`C109`はcommand例であり、このTask自体はC109、C110、その他のreal eventをproductionへ追加しません。

wrapperの実装詳細と`build-event`の正本は、[meirochou_wrapper/python/pathdata/README.md](https://github.com/tiga-kk/meirochou_wrapper/blob/main/python/pathdata/README.md)です。meirochou側でOCRやmap生成を再実装しません。

## Repository responsibilities

- `meirochou_wrapper`: reviewed pathdata/map configと`event.toml`から`build-event` staging packageを生成する。
- `meirochou`: reviewed stagingのmap bundleを`apps/webapp/map-bundles/<EVENT_ID>/`へ置き、生成されたregistry entryを`apps/webapp/events/manifest.json`へmergeし、webapp build/deployする。

stagingの`event-registry-entry.json`はproduction registryへmergeするためのsingle objectです。public treeへそのfileをコピーしません。

## Prerequisites

- 対象eventのwrapper input、map config、pathdata reviewが完了していること。
- wrapper側に`review_needed.json`など未解決のreview artifactやpreflight failureがないこと。
- meirochouの新規event作業であること。既存eventの置換・上書きはこの新規event用shortcutとは別のreviewが必要です。
- staging packageを生成し、copy前に次の確認を完了すること。

## 1. wrapperでstaging packageを生成する

wrapper repositoryで、canonical commandを実行します。

```bash
cd /path/to/meirochou_wrapper/python/pathdata

PYTHONPATH=. .venv/bin/python \
  -m comiket_pathdata \
  build-event /path/to/event.toml \
  --output-dir /path/to/dist/C109
```

`C109`はcommand exampleだけです。Task 7ではC109を実際には追加しません。wrapperのreview/preflightが停止した場合は、review済みinputをwrapper側で解決してから再実行します。final web bundleを手で作ったり、validatorを迂回したりしません。

期待するstaging treeは次のとおりです。

```text
/path/to/dist/C109/
  event-registry-entry.json
  map-bundle/
    manifest.json
    <areaId>/
      map.svg
      points.json
      grid-meta.json
      grid.bin
```

## 2. staging packageをreviewする

copy前に、次を確認します。

- `event-registry-entry.json`の`eventId`と`map-bundle/manifest.json`の`eventId`が一致する。
- registryの`mapBundle`が`../maps/<EVENT_ID>/manifest.json`である。
- registryの`mapBundleContract`が`"event"`である。
- map manifestのareaが1件以上ある。
- 各areaの`prefixes`と`labels`が空でない。
- 各areaのassetsが次の相対pathを指す。

  ```text
  ./<areaId>/map.svg
  ./<areaId>/points.json
  ./<areaId>/grid-meta.json
  ./<areaId>/grid.bin
  ```

- published `points.json`にlocal `image.path`がない。
- local absolute path、private review file、未解決のgenerated inputが含まれていない。

web-facing `areaId`とpathdata内部の`map_id`は一致しなくても構いません。両者を無理に同じ名前へ変更しません。

## 3. map bundleをmeirochouへcopyする

meirochou repositoryのrootで、新規eventに限り次のsafe copyを使います。

```bash
export EVENT_ID=C109
export STAGING=/absolute/path/to/dist/C109

test -f "$STAGING/event-registry-entry.json"
test -f "$STAGING/map-bundle/manifest.json"
test ! -e "apps/webapp/map-bundles/$EVENT_ID"

mkdir -p \
  "apps/webapp/map-bundles/$EVENT_ID"

cp -R \
  "$STAGING/map-bundle/." \
  "apps/webapp/map-bundles/$EVENT_ID/"

test -f \
  "apps/webapp/map-bundles/$EVENT_ID/manifest.json"
```

`test ! -e`はnew event用の安全ゲートです。既存eventのbundleをblind overwrite/deleteしません。既存eventの更新は、cache/version、registry、rollbackを含む別途review済み手順にしてください。

正しいtreeは次です。

```text
apps/webapp/map-bundles/C109/manifest.json
```

次は誤りです。

```text
apps/webapp/map-bundles/C109/map-bundle/manifest.json
```

## 4. production registryへentryをmergeする

`$STAGING/event-registry-entry.json`を読み、single objectを`apps/webapp/events/manifest.json`の`events` arrayへ、reviewしながらmergeします。

- 既存のC108 entryを保持する。
- `mapBundleContract: "event"`を保持する。
- `mapBundle`をabsolute URLへ変換しない。
- `event-registry-entry.json`自体をpublic treeへコピーしない。
- registry mutation scriptやinstaller/deployer CLIは使わず、JSON objectを明示的にreviewしてmergeする。

merge後はevent ID、day、map manifestを再確認し、registry parserとbuild verifierを実行します。

## 5. expected data-only diffを確認する

通常の新規event追加で期待する差分は次です。

```text
M apps/webapp/events/manifest.json
A apps/webapp/map-bundles/<EVENT_ID>/manifest.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/map.svg
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/points.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/grid-meta.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/grid.bin
```

次のgateは通常no outputです。

```bash
git diff --name-only -- apps/webapp/js
```

`apps/webapp/js/**`の変更が必要なら、このoperator workflowを停止し、data-only contractの欠陥として別Taskで調査します。eventId branchを追加して回避しません。

重要: Viteのnormal buildはregistry未登録でも`apps/webapp/map-bundles/`配下のdirectoryをnormal build artifactへ含め得ます。したがってfake fixture、old staging、temporary bundle、unused generated dataをproduction treeへ放置しません。Task 4のtest-only `C999` patternもproduction treeへコピーしません。

## 6. automated verificationを実行する

まずfocused event/data checksを実行します。

```bash
npx vitest run --root . \
  tests/event-registry.test.ts \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/deployment-build.test.mjs
```

続けてcanonical gatesをすべて実行します。

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

generic gateとして`--project=chromium`を指定しません。E2Eはfixture-drivenなapplication regressionが中心であり、新しいreal production eventのmanual smokeを代替しません。失敗時はvalidatorを弱めず、生成元・copy topology・registryを修正します。

## 7. local/manual smokeを実行する

通常のappを`?demo_ui=1`なしで起動し、production registryから次を確認します。

- new eventとdisplay daysが表示される。
- new eventへの切替に成功し、map bootstrap errorがない。
- area/current-location controlsがmanifestの`prefixes`/`labels`由来で表示される。
- materially differentな各areaについて、review済み代表spaceを表現できる。
- C108も引き続き選択・ロードできる。

route-ready source dataがある場合だけ、known reviewed circleで短いroute-start smokeを行います。fake spaceを作って無理にroute testをしません。

## 8. main merge / Cloudflare Pages

既存のデプロイ正本は[guides/cloudflare-pages-deployment.md](cloudflare-pages-deployment.md)です。

```text
review + required gates
  ↓
main merge
  ↓
Cloudflare Pages production deployment
  ↓
GitHub Actions確認とCloudflare deployment確認
  ↓
new event + C108 production smoke
```

deploymentが不健康なら、直前のhealthy deploymentへrollbackするか、原因を直したdata commitをrevertします。その後、repository側でforward fixをreviewして再deployします。token、account ID、zone ID、private credentialをこのguideへ記載しません。

## Rollback / recovery

rollbackは、まずproduction smokeとGitHub Actions/Pages buildのどこで失敗したかを分類します。直前のhealthy Cloudflare deploymentへ戻すか、問題のdata commitをrevertし、validatorを弱めずに原因を修正します。

generated artifactが誤っている場合のownershipはwrapper側です。次の順序で直します。

```text
wrapper input / reviewed configを修正
  ↓
build-eventを再実行
  ↓
generated outputを再copy
```

meirochou側で`manifest.json`、`map.svg`、`points.json`、`grid-meta.json`、`grid.bin`を手修正してvalidatorを通してはいけません。

## Common failures

| 失敗 | 復旧 |
|---|---|
| wrapperの`review_needed` / preflightで停止 | wrapperのreview workflowへ戻り、未解決artifactを解決して`build-event`を再実行する。validatorを迂回しない。 |
| `source map manifest for event <ID> is missing` | `apps/webapp/map-bundles/<EVENT_ID>/manifest.json`の存在とregistry merge前後を確認する。nested copyを直す。runtime codeは変更しない。 |
| registry `eventId`とsource map manifest `eventId`が不一致 | generated registry entryとmap manifestを比較し、同じstaging packageから再生成・再copyする。 |
| nested `map-bundle` copy | `apps/webapp/map-bundles/<EVENT_ID>/manifest.json`になるようstaging直下の中身をcopyする。 |
| 意図しないpublic bundle | `apps/webapp/map-bundles/`内のstale/fake/temporary directoryを特定し、production dataとして必要かreviewする。不要ならproduction source treeから除去し、verifierを隠す変更はしない。 |
| source/built bytes mismatch | build outputとsourceの差を調査し、generated input/copy/buildを修正する。byte-identical checkを削除しない。 |
| application TypeScript変更が必要 | このworkflowを停止し、Phase 8 data-only contractの別architectural defect/taskとして調査する。event ID分岐で逃げない。 |

## Do not do these things

- C109等のreal eventをTask 7のverification用にproductionへ追加しない。
- `apps/webapp/js/**`へevent固有分岐を追加しない。
- generated map assetをmeirochou側で手修正しない。
- `event-registry-entry.json`をpublic treeへコピーしない。
- 既存eventをblind overwrite/deleteしない。
- 未登録bundleがpublishされ得ることを無視して、fake/stale bundleを`apps/webapp/map-bundles/`へ置かない。
- installer、deployer、registry editor、backend registry、migration frameworkをTask 7のために追加しない。
- `npm run verify`、`npm run test:e2e:ci`、manual smokeを省略しない。
