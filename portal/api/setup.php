<?php
declare(strict_types=1);

/*
 * 初期設定の画面（ブラウザから、1回だけ使います）
 * レンタルサーバーなど、コマンドラインが使えない環境向けです。
 *   - データベースの接続情報を config.php に保存
 *   - テーブルの作成、管理者（admin）の登録、（希望すれば）サンプルの作業データの登録
 * 終わったら、このファイルは自動で削除されます（削除できなかった場合は、FTP で削除してください）。
 * 他の人に先に実行されないよう、ZIP に入っている「セットアップキー」（api/setup-key.txt）の入力が必要です。
 */
require __DIR__ . '/install.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$keyFile = __DIR__ . '/setup-key.txt';
$cfgFile = __DIR__ . '/config.php';
$h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');

function page(string $title, string $body): never
{
    echo '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>' . htmlspecialchars($title) . '</title><style>'
        . ':root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f1f6fb;color:#0d2537;font:15px/1.75 "Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif}'
        . 'header{background:linear-gradient(100deg,#0866b6,#1c9ddc 62%,#27b3e8);color:#fff;padding:22px 20px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;opacity:.92;font-size:13px}'
        . 'main{max-width:720px;margin:0 auto;padding:20px 16px 60px;display:grid;gap:16px}.card{background:#fff;border:1px solid #d8e4ee;border-radius:14px;padding:20px;box-shadow:0 1px 2px rgba(13,37,55,.06)}'
        . 'h2{margin:0 0 10px;font-size:16px}label{display:block;font-weight:700;font-size:13px;color:#587084;margin:14px 0 4px}input[type=text],input[type=password],input[type=number]{width:100%;padding:10px 12px;border:1px solid #b4c7d7;border-radius:8px;font:inherit}'
        . 'input:focus{outline:2px solid #0a6fc2;outline-offset:-1px}.hint{font-size:12px;color:#587084;margin:4px 0 0;line-height:1.6}.row{display:grid;grid-template-columns:1fr 120px;gap:12px}'
        . 'button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:10px;background:#0a6fc2;color:#fff;font:700 16px inherit;font-family:inherit;cursor:pointer}'
        . 'table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 8px;border-top:1px solid #d8e4ee;text-align:left}th{width:46%;font-weight:400;color:#587084}.ok{color:#17845a;font-weight:700}.ng{color:#c2334a;font-weight:700}'
        . '.err{background:#fce6e9;color:#c2334a;border-radius:10px;padding:12px 14px;font-size:14px}.note{background:#fcf0d9;color:#6a4100;border-radius:10px;padding:12px 14px;font-size:13px}code{background:#e9f1f8;padding:1px 6px;border-radius:5px;font-size:.92em}'
        . 'pre{background:#e9f1f8;padding:12px;border-radius:8px;overflow:auto;font-size:12px}a.btn{display:block;text-align:center;margin-top:16px;padding:13px;border-radius:10px;background:#0a6fc2;color:#fff;font-weight:700;text-decoration:none}'
        . '</style></head><body><header><h1>WorkBase Portal 初期設定</h1><p>データベースの接続と、管理者の登録を行います</p></header><main>' . $body . '</main></body></html>';
    exit;
}

/* すでに設定が終わっている場合は、何もさせない */
$installed = false;
if (is_file($cfgFile)) {
    try {
        $c = require $cfgFile;
        $installed = (int)connect_db($c['db'])->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0;
    } catch (Throwable $e) { $installed = false; }
}
if ($installed) {
    $gone = @unlink(__FILE__);
    page('設定済み', '<div class="card"><h2>設定は完了しています</h2><p>このファイル（<code>api/setup.php</code>）は、' . ($gone ? '削除しました。' : '<b>FTP で削除してください</b>（自動では削除できませんでした）。') . '</p><a class="btn" href="../">ポータルを開く</a></div>');
}

/* 動作環境の確認 */
$checks = [
    ['PHP のバージョン（8.1 以上）', PHP_VERSION, version_compare(PHP_VERSION, '8.1.0', '>=')],
    ['pdo_mysql（MySQL への接続）', extension_loaded('pdo_mysql') ? '利用できます' : '利用できません', extension_loaded('pdo_mysql')],
    ['mbstring（日本語の文字列）', extension_loaded('mbstring') ? '利用できます' : '利用できません', extension_loaded('mbstring')],
    ['api フォルダへの書き込み（config.php の保存）', is_writable(__DIR__) ? '書き込めます' : '書き込めません', is_writable(__DIR__)],
    ['storage フォルダへの書き込み（ファイルの保存）', is_writable(__DIR__ . '/../storage') ? '書き込めます' : '書き込めません', is_writable(__DIR__ . '/../storage')],
];
$envOk = !array_filter($checks, fn($c) => !$c[2]);
$checkHtml = '<table>' . implode('', array_map(fn($c) => '<tr><th>' . $h($c[0]) . '</th><td class="' . ($c[2] ? 'ok' : 'ng') . '">' . ($c[2] ? '✓ ' : '× ') . $h($c[1]) . '</td></tr>', $checks)) . '</table>';
$keyFileOk = is_file($keyFile) && trim((string)file_get_contents($keyFile)) !== '';

$v = ['host' => 'localhost', 'port' => '3306', 'name' => '', 'user' => '', 'sample' => ''];
$errors = [];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    foreach (['host', 'port', 'name', 'user'] as $k) $v[$k] = trim((string)($_POST[$k] ?? ''));
    $v['sample'] = !empty($_POST['sample']) ? '1' : '';
    $pass = (string)($_POST['pass'] ?? '');
    $adminPw = (string)($_POST['admin_pw'] ?? '');
    $key = trim((string)($_POST['key'] ?? ''));
    $real = $keyFileOk ? trim((string)file_get_contents($keyFile)) : '';

    if (!$envOk) $errors[] = '上の「動作環境」に × があります。サーバーの設定（PHP のバージョンやフォルダの権限）を直してください。';
    if (!$keyFileOk) $errors[] = 'セットアップキーのファイル（api/setup-key.txt）が見つかりません。ZIP に入っているファイルを、FTP でアップロードしてください。';
    elseif (!hash_equals($real, $key)) { usleep(500000); $errors[] = 'セットアップキーが違います（INSTALL.txt に書かれています）。'; }
    if ($v['host'] === '' || $v['name'] === '' || $v['user'] === '' || !ctype_digit($v['port'])) $errors[] = 'データベースのホスト名・ポート・データベース名・ユーザー名を入力してください。';
    $pw = $adminPw === '' ? DEFAULT_ADMIN_PASSWORD : $adminPw;
    if ($adminPw !== '' && ($e = check_password($adminPw, 'admin'))) $errors[] = '管理者のパスワード：' . $e;

    if (!$errors) {
        $d = ['host' => $v['host'], 'port' => (int)$v['port'], 'name' => $v['name'], 'user' => $v['user'], 'pass' => $pass];
        try { connect_db($d)->query('SELECT 1'); }
        catch (Throwable $e) { $errors[] = 'データベースに接続できませんでした。ホスト名・データベース名・ユーザー名・パスワードを確認してください。（' . $e->getMessage() . '）'; }
    }
    if (!$errors) {
        $cfg = ['db' => $d, 'timezone' => 'Asia/Tokyo', 'debug' => false, 'max_upload_bytes' => 2147483648, 'idle_minutes' => 480];
        $text = "<?php\n// セットアップ画面が作成しました。必要に応じて、api/config.sample.php を見て項目を追加できます。\nreturn " . var_export($cfg, true) . ";\n";
        $existing = is_file($cfgFile) ? (require $cfgFile) : null;
        if (@file_put_contents($cfgFile, $text, LOCK_EX) === false && !($existing && ($existing['db'] ?? null) == $d)) {
            page('設定を保存できません', '<div class="card"><h2>config.php を保存できませんでした</h2><p>api フォルダに書き込めません。次のどちらかを行ってください。</p><ol><li>api フォルダの権限を変更して書き込めるようにし、もう一度実行する</li><li>下の内容で、<code>api/config.php</code> を自分で作成してアップロードし、もう一度実行する</li></ol><pre>' . $h($text) . '</pre></div>');
        }
        @chmod($cfgFile, 0640);
        try {
            install_schema();
            $created = install_admin($pw);
            $sample = $v['sample'] ? install_sample() : -1;
        } catch (Throwable $e) {
            @unlink($cfgFile);
            $errors[] = 'テーブルの作成に失敗しました：' . $e->getMessage();
        }
        if (!$errors) {
            foreach (['files', 'tmp', 'incoming'] as $sub) @mkdir(__DIR__ . '/../storage/' . $sub, 0755, true);
            @unlink($keyFile);
            $gone = @unlink(__FILE__);
            page('セットアップ完了', '<div class="card"><h2>セットアップが完了しました</h2>'
                . '<table><tr><th>管理者のユーザー名</th><td><b>admin</b></td></tr><tr><th>管理者のパスワード</th><td>' . ($adminPw === '' ? '<b>' . $h(DEFAULT_ADMIN_PASSWORD) . '</b>（初期パスワード）' : '入力したパスワード') . '</td></tr>'
                . '<tr><th>サンプルの作業データ</th><td>' . ($sample > 0 ? $sample . ' 件を登録しました' : '登録していません') . '</td></tr></table>'
                . ($adminPw === '' ? '<p class="note" style="margin-top:14px">初期パスワードのままです。ログインしたら、右上のユーザー名 →「パスワードを変更」で、すぐに変更してください。</p>' : '')
                . '<p style="margin-top:14px">このファイル（<code>api/setup.php</code>）は、' . ($gone ? '<b>削除しました</b>。' : '<b class="ng">削除できませんでした。FTP で削除してください。</b>') . '</p>'
                . '<a class="btn" href="../">ポータルを開いてログインする</a></div>');
        }
    }
}

$err = $errors ? '<div class="err">' . implode('<br>', array_map($h, $errors)) . '</div>' : '';
page('初期設定', '<div class="card"><h2>1. 動作環境の確認</h2>' . $checkHtml . '</div>'
    . ($keyFileOk ? '' : '<div class="err">セットアップキーのファイル（<code>api/setup-key.txt</code>）がありません。ZIP に入っているファイルを、FTP でアップロードしてください。</div>')
    . $err
    . '<form class="card" method="post" autocomplete="off"><h2>2. 設定を入力</h2>'
    . '<label for="key">セットアップキー</label><input type="text" id="key" name="key" required autocomplete="off" spellcheck="false"><p class="hint">ZIP に入っている <code>INSTALL.txt</code> に書かれています。他の人に先に実行されないための確認です。</p>'
    . '<label for="host">データベースのホスト名</label><div class="row"><input type="text" id="host" name="host" value="' . $h($v['host']) . '" required><input type="number" id="port" name="port" value="' . $h($v['port']) . '" aria-label="ポート" required></div><p class="hint">レンタルサーバーの管理画面に書かれています（例：<code>localhost</code> や <code>mysql1234.example.ne.jp</code>）。右はポート番号（通常は 3306）。</p>'
    . '<label for="name">データベース名</label><input type="text" id="name" name="name" value="' . $h($v['name']) . '" required autocomplete="off"><p class="hint">管理画面で、先にデータベースを作成しておいてください。</p>'
    . '<label for="user">データベースのユーザー名</label><input type="text" id="user" name="user" value="' . $h($v['user']) . '" required autocomplete="off">'
    . '<label for="pass">データベースのパスワード</label><input type="password" id="pass" name="pass" autocomplete="new-password">'
    . '<label for="admin_pw">管理者（admin）のパスワード</label><input type="password" id="admin_pw" name="admin_pw" autocomplete="new-password"><p class="hint">空欄にすると、初期パスワード <b>' . $h(DEFAULT_ADMIN_PASSWORD) . '</b> になります（ログイン後に変更してください）。入力する場合は、8文字以上で、英小文字・英大文字・数字・記号のうち2種類以上。</p>'
    . '<label style="display:flex;gap:8px;align-items:center;font-weight:400;color:#0d2537;margin-top:16px"><input type="checkbox" name="sample" value="1"' . ($v['sample'] ? ' checked' : '') . '> サンプルの作業データを登録する（画面を試すため。あとから削除できます）</label>'
    . '<button type="submit"' . ($envOk && $keyFileOk ? '' : ' disabled style="opacity:.5;cursor:not-allowed"') . '>設定を保存して、セットアップを実行</button></form>');
