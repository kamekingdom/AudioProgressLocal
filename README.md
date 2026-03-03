# Audio Progress Spatial Demo (Eel)

音源を `audio/` に置き、3D音像を移動させながら進捗提示するPC向けデモです。  
モードは `Mode A / Mode B / No Motion` を切り替えできます。

## 再生仕様
- 1回目再生: 画面暗転（真っ黒）のまま音源のみ移動
- 2回目再生: 音源位置可視化 + プログレスバー表示
- 再生長は音源ファイルそのものに従う（秒数設定なし）

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

## 使い方
1. `audio/` に音源ファイルを配置
2. アプリ起動後、音源をプルダウンから選択
3. モードを選んで `開始`

## ファイル構成
- `app.py`: Eel起動 + `audio/` の一覧取得API
- `web/index.html`: UI
- `web/styles.css`: 見た目
- `web/main.js`: Web Audio API + 2回再生制御 + 描画

## 調整しやすい項目
- 軌道定義: `web/main.js` の `pathPosition()`
- 描画見た目: `web/styles.css` と `drawVisualStage()`
