# Audio Progress Spatial Demo (Eel)

音源を `audio/` に置き、3D音像を移動させながら進捗提示するPC向けデモです。  
モードは `Mode A / Mode B / No Motion` を切り替えできます。

## UI
- デフォルトはライトモード
- `Dark Mode` ボタンでライト/ダークを切替可能

## 再生仕様
- 1回目再生: 画面暗転（真っ黒）のまま音源のみ移動
- 2回目再生: 2軸可視化（Side/Top）+ プログレスバー表示
- 移動位置は音源長を100%とした進捗に同期（周回しない）
- 2回目可視化では、予定ルートを点線で事前表示

## 軌跡仕様
- Mode A
  - Side (y-z): 下から上へ線形に上昇
  - Top (x-z): 前方へ回り込んで原点に戻る円弧状
- Mode B
  - 右耳付近から左耳付近へ横断（x方向線形）
  - 前方回り込みと中盤の沈み込みを重畳
- No Motion
  - 定位置

## 画像素材
- `image/side.png`: 側面図
- `image/top.png`: 上面図
- `top.png` が無い場合は `image/front.png` を代替表示
- `top.png` は上下反転して表示

## セットアップ
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 実行
```bash
python app.py
```

## URL
- Main: `http://127.0.0.1:8080/web/index.html`
- Debug: `http://127.0.0.1:8080/debug`

## 使い方
1. `audio/` に音源ファイルを配置
2. `image/` に `side.png` と `top.png` を配置
3. アプリ起動後、音源をプルダウンから選択
4. モードを選んで `開始`

## ファイル構成
- `app.py`: Eel起動 + `audio/` の一覧取得API
- `web/index.html`: UI
- `web/styles.css`: テーマ切替 + 2画面可視化
- `web/main.js`: Web Audio API + 2回再生制御 + 進捗同期移動 + ルート描画
