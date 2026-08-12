# ComiPath Catalog Sender

対応カタログページの現在のサークルからspaceとお品書き画像URLを読み取り、利用者が明示的に押した時だけ自分のGAS Web Appへ `upsertCatalog` として送信するManifest V3拡張です。

## 使い方

1. ComiPath管理画面でGASコードをコピーし、SpreadsheetのApps Scriptへ配置・デプロイする。
2. Chromeの `chrome://extensions` を開き、デベロッパーモードを有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」でこの`apps/catalog-extension`を選ぶ。
4. 拡張の「詳細」→「拡張機能のオプション」で自分のGAS Web App URLとsheet名を保存する。
5. `https://classic-webcatalog.circle.ms/CircleRapid/Cut2?Day=2` のような対応カタログページを開き、拡張popupで内容を確認して「このお品書きをGASへ送る」を押す。
6. またはChromeの拡張機能ショートカットで `Alt+S`（macOSの通常の表示は`Option+S`）を設定し、現在のカタログを送信する。

ショートカットは `chrome://extensions/shortcuts` で変更できます。ページを開いただけでは送信せず、popupのボタンまたはショートカットを実行したときだけ送信します。

GAS URLとsheet名は拡張の`chrome.storage.sync`だけに保存し、repositoryへ個人URLやtokenを含めません。ページのDOM構造が変わって抽出できない場合は、`lib/catalog-extractor.js`の限定selectorとfixture/testを更新してから確認します。ページ全体の文字列探索や一括crawlは行いません。
