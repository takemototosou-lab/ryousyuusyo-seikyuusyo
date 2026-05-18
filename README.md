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

## ファイル構成

- `index.html`: 画面構造
- `styles.css`: デザイン
- `app.js`: アプリ機能
- `server.mjs`: ローカル確認用サーバー

## 使い方

GitHub Pages では `index.html` をそのまま公開できます。

ローカルで確認する場合:

```bash
node server.mjs
```

表示されたURLをブラウザで開いてください。
