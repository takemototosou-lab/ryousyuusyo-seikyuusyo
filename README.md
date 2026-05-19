# takemototosou 請求書・領収書アプリ

スマホで請求書と領収書を作成・保存・PDF化・LINE共有するための、GitHub Pages対応Webアプリです。

## 機能

- 請求書 / 領収書の切替
- PDF生成
- LINE共有
- 自動保存
- バックアップ保存 / 復元
- 宛名記憶
- 免税事業者対応
- 入金確認済みの場合のみ領収書を発行できるロック
- iPhone Safari / Android Chrome向けのモバイル優先UI

## 工事写真帳

Issue #1 の工事写真帳アプリは `/photo-album/` で利用できます。

- 写真枠の追加と削除
- 写真アップロード
- 工事内容、使用材料、場所の入力
- 1ページ2件のA4縦印刷レイアウト
- ブラウザの印刷機能によるPDF保存

## ファイル構成

- `index.html`: 請求書・領収書の画面構造
- `styles.css`: 請求書・領収書のデザイン
- `app.js`: 請求書・領収書のアプリ機能
- `photo-album/index.html`: 工事写真帳の画面構造
- `photo-album/styles.css`: 工事写真帳の画面と印刷レイアウト
- `photo-album/app.js`: 工事写真帳の操作と自動保存
- `server.mjs`: ローカル確認用サーバー

## 使い方

GitHub Pages では `index.html` をそのまま公開できます。
工事写真帳は `/photo-album/` を開いてください。

ローカルで確認する場合:

```bash
node server.mjs
```

表示されたURLをブラウザで開いてください。
