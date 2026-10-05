#!/usr/bin/env python3
"""レンタルサーバーに置くための ZIP を作る。

使い方:  python3 tools/build_package.py
出力:    dist/workbase-portal-YYYYMMDD.zip
ZIP を展開した workbase-portal フォルダの中身を、FTP でサーバーに置きます。
手順は ZIP に入っている INSTALL.txt を見てください。
"""
import datetime, os, secrets, subprocess, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTAL = os.path.join(ROOT, 'portal')
PREFIX = 'workbase-portal/'

FILES = [
    'index.html', 'manifest.webmanifest', 'sw.js', 'README.md',
    'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
    'api/.htaccess', 'api/index.php', 'api/lib.php', 'api/auth.php', 'api/users.php', 'api/data.php', 'api/files.php', 'api/ext.php',
    'api/install.php', 'api/setup.php', 'api/migrate.php', 'api/schema.sql', 'api/seed.json', 'api/config.sample.php',
    'storage/.htaccess',
]
EMPTY_DIRS = ['storage/files', 'storage/tmp', 'storage/incoming']   # FTP でも作れるが、最初から用意しておく


def install_text(key: str, built: str, rev: str) -> str:
    return f"""WorkBase Portal  設置手順（レンタルサーバー向け）
================================================
作成日: {built}    版: {rev}

■ 必要なもの
  ・PHP 8.1 以上が使えるレンタルサーバー（8.2 / 8.3 でも可）
  ・MySQL（または MariaDB）のデータベース 1つ
  ・HTTPS（独自SSL / 無料SSL）が使えること … ログインとアプリ化に必要です
  ・FTP でファイルを置けること（SSH やコマンドは不要です）

■ セットアップキー（手順3で使います）
      {key}

■ 手順
  1. サーバーの管理画面で、次の準備をします。
       ・MySQL のデータベースを作成する
         （「データベース名」「ユーザー名」「パスワード」「ホスト名」を控える）
       ・PHP のバージョンを 8.1 以上にする
       ・HTTPS（SSL）を有効にする

  2. この ZIP を展開し、できた「workbase-portal」フォルダの【中身】を、
     FTP でサーバーの公開フォルダの中に置きます。
       例）公開フォルダ（public_html など）の中に「portal」フォルダを作り、その中へ。
           → https://（あなたのドメイン）/portal/ で開く画面になります。
     ※ api フォルダと storage フォルダも、そのまま置いてください。
     ※ 「.htaccess」という名前のファイル（api と storage の中）も忘れずに。
        FTP ソフトで「隠しファイルを表示」にしないと、見えない場合があります。

  3. ブラウザで、次の画面を開きます。
       https://（あなたのドメイン）/portal/api/setup.php
     画面の案内に沿って、次を入力して実行します。
       ・セットアップキー（上に書いてあります）
       ・データベースの接続情報（手順1で控えたもの）
       ・管理者（admin）のパスワード
           空欄にすると、初期パスワード「Welsys@1234」になります
       ・サンプルの作業データを登録するか（画面を試したいときだけチェック）
     「セットアップが完了しました」と出れば成功です。
     setup.php は自動で削除されます。削除できなかったときは、FTP で
     api/setup.php を削除してください（残すと危険です）。

  4. https://（あなたのドメイン）/portal/ を開いて、admin でログインします。
     初期パスワードのままの場合は、右上のユーザー名 →「パスワードを変更」で、
     すぐに変更してください。

  5. 「設定」→「ユーザー・権限」で、使う人のユーザーを登録します。

■ 大きなファイルを FTP で置くとき
  ブラウザからのアップロードは、1ファイル 2GB までです（設定で変更できます）。
  EXE など、それより大きいファイルは、FTP で  storage/incoming/  に置いてください
  （サブフォルダも使えます）。置いたあと、「設定」→「FTPファイル」の画面で、
  そのファイルを「どの作業で使うか」とあわせて登録します。
  ファイルは移動もコピーもされず、置いた場所のままダウンロードに使われます。

■ 更新するとき
  新しい ZIP の中身で、ファイルを上書きします。ただし、次は上書きしないでください。
    ・api/config.php        （データベースの接続情報）
    ・storage フォルダの中身  （アップロードしたファイル）
  setup.php と setup-key.txt は、新しい ZIP に入っていても、置かないでください。
  画面（index.html など）を更新したときは、sw.js の VERSION が上がっているので、
  利用者の端末も自動で新しい画面に切り替わります。

■ バックアップ
  ・データベース全体（管理画面の「エクスポート」など）
  ・portal/storage/files フォルダ
  この2つを、定期的に保存してください。

■ うまくいかないとき
  ・setup.php で「× 」が出る … 表示された項目（PHP のバージョン、フォルダの権限）を直します。
      api / storage フォルダに書き込めない場合は、FTP ソフトでフォルダの権限を 755（だめなら 707）にします。
  ・「データベースに接続できませんでした」 … ホスト名（localhost とは限りません）、
      データベース名、ユーザー名、パスワードを管理画面で確認します。
  ・500 エラー … PHP のバージョンが 8.1 未満の可能性があります。
  ・ファイルのアップロードに失敗する … Nginx のサーバーでは、client_max_body_size を 6m 以上にします
      （サーバーの管理画面や問い合わせで確認してください）。
  ・.htaccess が使えないサーバー … storage フォルダが Web から見えてしまう恐れがあります。
      api/config.php に 'storage_dir' => '/サーバー上の公開フォルダの外の場所', を書いて、
      storage の中身をそこへ移してください（詳しくは README.md）。

詳しい説明（権限、API、保護すること）は、同じフォルダの README.md にあります。
"""


def main():
    # PHP の構文を確認（PHP が入っている場合）
    if subprocess.run(['which', 'php'], capture_output=True).returncode == 0:
        for f in FILES:
            if f.endswith('.php'):
                r = subprocess.run(['php', '-l', os.path.join(PORTAL, f)], capture_output=True, text=True)
                if r.returncode != 0:
                    sys.exit('PHP の構文エラー: ' + f + '\n' + r.stdout + r.stderr)
    for f in FILES:
        if not os.path.isfile(os.path.join(PORTAL, f)):
            sys.exit('ファイルがありません: ' + f)
    key = secrets.token_urlsafe(12).replace('_', 'x').replace('-', 'y')[:16]
    built = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    rev = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'unknown'
    out_dir = os.path.join(ROOT, 'dist')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"workbase-portal-{datetime.datetime.now().strftime('%Y%m%d')}.zip")
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        def add(name, data, mode=0o644):
            zi = zipfile.ZipInfo(PREFIX + name, date_time=datetime.datetime.now().timetuple()[:6])
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = (0o100000 | mode) << 16
            zi.flag_bits |= 0x800   # UTF-8 のファイル名
            z.writestr(zi, data)
        for f in FILES:
            add(f, open(os.path.join(PORTAL, f), 'rb').read())
        for d in EMPTY_DIRS:
            add(d + '/.keep', b'')
        add('api/setup-key.txt', key.encode() + b'\n')
        add('INSTALL.txt', install_text(key, built, rev).replace('\n', '\r\n').encode('utf-8-sig'))
        add('VERSION.txt', f'WorkBase Portal\nbuilt: {built}\nrevision: {rev}\n'.encode())
    print('作成しました:', out, f'({os.path.getsize(out) / 1024:.0f} KB)')
    print('セットアップキー:', key)
    with zipfile.ZipFile(out) as z:
        for n in z.namelist():
            print('  ', n)


if __name__ == '__main__':
    main()
