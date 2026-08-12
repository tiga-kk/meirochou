# Phase 7.3 Task 2: カタログ拡張からGASまでのPOST経路診断

## 目標

「カタログページから抽出できるがGASへ届いたか分からない」状態を解消する。既存の拡張service worker経路を再利用し、設定画面から実GASへ到達できるprobeと、失敗種別を利用者へ示せる最小限の診断を追加する。

## 前提

現行 `manifest.json` は既に次のhost permissionを持つ。

```text
https://script.google.com/*
https://script.googleusercontent.com/*
```

このTaskではmanifest権限拡張を既定の解決策にしない。実機証拠がない限り `<all_urls>`、`https://*/`、任意hostへの拡張は禁止する。

Apps ScriptのContentService応答ではGoogle側のredirectを通るため、redirect後の成功・HTML応答・非2xx・JSON内エラーを区別して扱う。

## API契約

GASへ副作用のないprobe actionを追加する。

```json
{ "action": "probe" }
```

成功応答は少なくとも次の意味を持つ。

```json
{ "ok": true, "status": "success", "kind": "probe" }
```

既存catalog POSTの公開contractは壊さない。

## 本番接続

`options.js`から直接別fetch実装を作らず、通常のcatalog POSTと同じ `background.js` / `lib/catalog-client.js` transportを通す。

```text
options「接続を確認」
  -> background/service worker
  -> catalog-client共通transport
  -> Apps Script URL
  -> redirect追従
  -> probe JSON判定
  -> optionsへ結果表示

catalog page
  -> content/popup/shortcut
  -> background/service worker
  -> 同じtransport
  -> catalog POST
```

## 対象ファイル

**変更候補:**

- `integrations/gas-spreadsheet/src/post-router.js`
- `integrations/gas-spreadsheet/src/response.js`
- 必要な場合のみ `integrations/gas-spreadsheet/src/catalog-api.js`
- `integrations/gas-spreadsheet/Code.gs`（生成のみ）
- `apps/catalog-extension/lib/catalog-client.js`
- `apps/catalog-extension/background.js`
- `apps/catalog-extension/options.html`
- `apps/catalog-extension/options.js`
- `apps/catalog-extension/README.md`
- `tests/catalog-extension-client.test.mjs`
- `tests/gas-contract.test.mjs`
- `tests/gas-build.test.mjs`

`apps/catalog-extension/manifest.json` は現在のhost permissionで不足する実機証拠がある場合だけ変更する。

## エラー分類

最低限、次を同じ「送信失敗」へ潰さない。

- 設定URL不正。
- network/fetch失敗。
- 非2xx。
- 2xxだがJSONでない。
- JSONだが `ok:false` / error status。
- probe成功。
- catalog POST成功。

診断メッセージへGAS URL全文、HTML本文、credential、個人データを出さない。

## テスト方針

最初に次のREDを作る。

- probeが通常POSTと同じtransportを通る。
- redirect後に正常JSONを得た場合は成功になる。
- 非2xx、非JSON、`ok:false`が別の失敗として扱われる。
- optionsの「接続を確認」がbackground経路へ接続され、別fetch実装ではない。
- catalog POSTを同じspaceで2回送ってもTask 1のcanonical lookupにより1行だけが更新される。

mock fetchの成功だけで完了しない。少なくともassemblyまたはbackground message経路のテストで、実際のcallerが共通transportを使うことを確認する。

## 実機確認

実装環境からtest deploymentを利用できる場合は次を確認する。

1. optionsからprobe成功。
2. 実カタログページからPOST成功。
3. 同じcircleを再送して既存行が更新される。
4. Sheet列が崩れない。

資格情報、headed browser、実GAS deploymentへアクセスできない場合は、実装と自動検証までを完了して進捗へ「実機確認待ち」と記録する。これだけを理由にTask 3〜7を停止しない。Task 8で再確認する。

## やってはいけないこと

- 新しいbackend、proxy、外部監視サービスを追加しない。
- optionsとcatalog送信で別transportを持たない。
- permissionを広域化して原因調査を省略しない。
- consoleやUIへGAS URL全文・HTML本文を露出しない。
- 実機環境不足を本番コード失敗と誤分類しない。

## 完了条件

- probeとcatalog POSTが同一の本番transportを通る。
- 失敗種別が診断可能で、secretを露出しない。
- 自動テストが本番caller接続を証明する。
- 実GAS確認が可能なら完了し、不可能なら未確認事項が進捗正本へ残っている。