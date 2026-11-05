<?php
/**
 * Account Manager — サーバー側 API
 *
 * - データはブラウザ側で暗号化済みのものだけを保存（サーバーは中身を読めない）
 * - ログイン：ユーザー名 ＋ パスワード（から作った認証鍵）＋ 暗証番号 の二重チェック
 * - 連続失敗でアカウントを一時ロック
 * - 保存のたびに直前の状態を復元ポイントとして保持
 *
 * 必要：PHP 7.4 以上（レンタルサーバーの標準PHPで可）
 */
declare(strict_types=1);

const MAX_SNAPSHOTS   = 50;
const SESSION_IDLE    = 2 * 3600;       // 操作が無いとセッション失効（秒）
const MAX_FAILS       = 5;              // この回数連続で失敗すると
const LOCK_SECONDS    = 15 * 60;        // この秒数ロック
const MAX_VAULT_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES  = 36 * 1024 * 1024;
const KDF_ITER        = 600000;

// データの保存先。可能なら公開フォルダの外に変更してください（例: '/home/xxx/am-data'）
$DATA_DIR = __DIR__ . '/data';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/* ---------- 共通 ---------- */
function out(int $code, array $body = []): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(int $code, string $msg, array $extra = []): void { out($code, ['error' => $msg] + $extra); }
function path(string $name): string { global $DATA_DIR; return $DATA_DIR . '/' . $name; }

function readJson(string $file, $default = null) {
    if (!is_file($file)) return $default;
    $s = file_get_contents($file);
    $j = json_decode((string)$s, true);
    return $j === null ? $default : $j;
}
/** 一時ファイルに書いてから置き換え（途中で止まっても壊れない） */
function writeAtomic(string $file, string $data): void {
    $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $data, LOCK_EX) === false) fail(500, '保存に失敗しました（書き込み権限を確認してください）');
    if (!rename($tmp, $file)) { @unlink($tmp); fail(500, '保存に失敗しました'); }
}
function writeJson(string $file, $data): void { writeAtomic($file, json_encode($data, JSON_UNESCAPED_UNICODE)); }

function body(): array {
    $raw = file_get_contents('php://input');
    if (strlen((string)$raw) > MAX_VAULT_BYTES + 1024 * 1024) fail(413, 'データが大きすぎます');
    $j = json_decode((string)$raw, true);
    return is_array($j) ? $j : [];
}
function str(array $b, string $k, int $max = 100000): string {
    $v = $b[$k] ?? '';
    if (!is_string($v) || strlen($v) > $max) fail(400, "不正な値: $k");
    return $v;
}
function isB64(string $s): bool { return $s !== '' && preg_match('/^[A-Za-z0-9+\/]+={0,2}$/', $s) === 1; }

/* ---------- 初期化 ---------- */
function ensureDataDir(): void {
    global $DATA_DIR;
    if (!is_dir($DATA_DIR) && !mkdir($DATA_DIR, 0700, true)) fail(500, 'データフォルダを作成できません（書き込み権限を確認してください）');
    foreach (['files', 'snapshots'] as $d) if (!is_dir("$DATA_DIR/$d")) mkdir("$DATA_DIR/$d", 0700, true);
    $ht = "$DATA_DIR/.htaccess";
    if (!is_file($ht)) file_put_contents($ht, "Require all denied\nDeny from all\n");
    if (!is_file("$DATA_DIR/index.html")) file_put_contents("$DATA_DIR/index.html", '');
    if (!is_file("$DATA_DIR/secret.php")) {
        file_put_contents("$DATA_DIR/secret.php", "<?php return '" . bin2hex(random_bytes(32)) . "';\n");
    }
}
function secret(): string { return (string)(include path('secret.php')); }

/** 書き込み系はロックを取って直列化 */
function withLock(callable $fn) {
    $fp = fopen(path('lock'), 'c');
    flock($fp, LOCK_EX);
    try { return $fn(); } finally { flock($fp, LOCK_UN); fclose($fp); }
}

/* ---------- セッション ---------- */
function sessions(): array {
    $all = readJson(path('sessions.json'), []);
    $now = time();
    return array_filter($all, fn($s) => ($s['seen'] ?? 0) > $now - SESSION_IDLE);
}
function newSession(): string {
    $token = bin2hex(random_bytes(32));
    $all = sessions();
    $all[hash('sha256', $token)] = ['seen' => time()];
    writeJson(path('sessions.json'), $all);
    return $token;
}
function requireAuth(): void {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!is_string($token) || !preg_match('/^[0-9a-f]{64}$/', $token)) fail(401, 'ログインしてください');
    $id = hash('sha256', $token);
    withLock(function () use ($id) {
        $all = sessions();
        if (!isset($all[$id])) fail(401, 'セッションの有効期限が切れました。もう一度ログインしてください');
        $all[$id]['seen'] = time();
        writeJson(path('sessions.json'), $all);
    });
}
function dropSession(): void {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!is_string($token)) return;
    withLock(function () use ($token) {
        $all = sessions();
        unset($all[hash('sha256', $token)]);
        writeJson(path('sessions.json'), $all);
    });
}

/* ---------- アカウント ---------- */
function user(): ?array { return readJson(path('user.json')); }
function headerOf(array $u): array {
    return ['salt' => $u['salt'], 'iter' => $u['iter'], 'wk' => $u['wk'], 'wkIv' => $u['wkIv']];
}
/** 認証鍵（ブラウザ側でパスワードから導出）と暗証番号を確認。失敗回数を記録 */
function checkCredentials(array $u, string $auth, string $pin, bool $needPin = true): array {
    $now = time();
    if (($u['lockUntil'] ?? 0) > $now) {
        fail(429, 'ログインに続けて失敗したため一時的にロックしています', ['retryAfter' => $u['lockUntil'] - $now]);
    }
    $ok = password_verify($auth, $u['authHash']);
    $okPin = !$needPin || password_verify($pin, $u['pinHash']);
    if (!$ok || !$okPin) {
        $u['fails'] = ($u['fails'] ?? 0) + 1;
        if ($u['fails'] >= MAX_FAILS) { $u['lockUntil'] = $now + LOCK_SECONDS; $u['fails'] = 0; }
        writeJson(path('user.json'), $u);
        usleep(random_int(400000, 900000));   // 総当たり対策
        if (!empty($u['lockUntil']) && $u['lockUntil'] > $now) fail(429, 'ログインに続けて失敗したため15分間ロックしました', ['retryAfter' => LOCK_SECONDS]);
        fail(403, 'ユーザー名・パスワード・暗証番号のいずれかが違います', ['left' => MAX_FAILS - $u['fails']]);
    }
    if (!empty($u['fails']) || !empty($u['lockUntil'])) {
        $u['fails'] = 0; $u['lockUntil'] = 0;
        writeJson(path('user.json'), $u);
    }
    return $u;
}
function validPin(string $pin): bool { return preg_match('/^[0-9]{4,8}$/', $pin) === 1; }

/* ---------- 保存データ ---------- */
function vaultRec(): ?array { return readJson(path('vault.json')); }
function snapshotList(): array {
    $list = glob(path('snapshots') . '/*.json') ?: [];
    sort($list);
    return $list;
}
function addSnapshot(array $rec): void {
    $sid = sprintf('%013d%04d', (int)(microtime(true) * 1000), random_int(0, 9999));
    writeJson(path("snapshots/$sid.json"), $rec);
    $list = snapshotList();
    while (count($list) > MAX_SNAPSHOTS) @unlink(array_shift($list));
}
function validFileId(string $id): bool { return preg_match('/^[A-Za-z0-9_-]{6,64}$/', $id) === 1; }

/* ---------- ルーティング ---------- */
ensureDataDir();
$a = $_GET['a'] ?? '';

switch ($a) {

case 'status':
    out(200, ['registered' => user() !== null, 'iter' => KDF_ITER]);

case 'register': {
    $b = body();
    withLock(function () use ($b) {
        if (user() !== null) fail(409, 'アカウントはすでに登録されています');
        $name = trim(str($b, 'username', 64));
        $pin = str($b, 'pin', 16);
        if ($name === '') fail(400, 'ユーザー名を入力してください');
        if (!validPin($pin)) fail(400, '暗証番号は4〜8桁の数字にしてください');
        foreach (['salt', 'auth', 'wk', 'wkIv', 'iv'] as $k) if (!isB64(str($b, $k))) fail(400, "不正な値: $k");
        $ct = str($b, 'ct', MAX_VAULT_BYTES);
        if (!isB64($ct)) fail(400, '不正な値: ct');
        $iter = (int)($b['iter'] ?? 0);
        if ($iter < 100000) fail(400, '不正な値: iter');
        writeJson(path('user.json'), [
            'username' => $name, 'salt' => $b['salt'], 'iter' => $iter,
            'authHash' => password_hash($b['auth'], PASSWORD_DEFAULT),
            'pinHash' => password_hash($pin, PASSWORD_DEFAULT),
            'wk' => $b['wk'], 'wkIv' => $b['wkIv'], 'fails' => 0, 'lockUntil' => 0, 'createdAt' => time(),
        ]);
        writeJson(path('vault.json'), ['iv' => $b['iv'], 'ct' => $ct, 'rev' => 1, 'n' => (int)($b['n'] ?? 0), 'savedAt' => (int)(microtime(true) * 1000)]);
    });
    $u = user();
    out(200, ['token' => withLock(fn() => newSession()), 'header' => headerOf($u), 'vault' => vaultRec()]);
}

case 'prelogin': {
    // ユーザー名が存在しなくても同じ形の応答を返す（ユーザー名の推測を防ぐ）
    $b = body();
    $name = trim(str($b, 'username', 64));
    $u = user();
    if ($u && hash_equals($u['username'], $name)) out(200, ['salt' => $u['salt'], 'iter' => $u['iter']]);
    $fake = base64_encode(substr(hash_hmac('sha256', 'salt:' . $name, secret(), true), 0, 16));
    out(200, ['salt' => $fake, 'iter' => KDF_ITER]);
}

case 'login': {
    $b = body();
    $name = trim(str($b, 'username', 64));
    $auth = str($b, 'auth', 200);
    $pin = str($b, 'pin', 16);
    $res = withLock(function () use ($name, $auth, $pin) {
        $u = user();
        if (!$u) fail(404, 'アカウントがまだ登録されていません');
        if (!hash_equals($u['username'], $name)) {
            usleep(random_int(400000, 900000));
            // 存在しないユーザー名でも失敗回数に数える（総当たり対策）
            checkCredentials($u, '', '');
        }
        $u = checkCredentials($u, $auth, $pin);
        return ['token' => newSession(), 'header' => headerOf($u), 'vault' => vaultRec()];
    });
    out(200, $res);
}

case 'logout':
    dropSession();
    out(200, ['ok' => true]);

case 'vault_get':
    requireAuth();
    out(200, ['header' => headerOf(user()), 'vault' => vaultRec()]);

case 'vault_put': {
    requireAuth();
    $b = body();
    $iv = str($b, 'iv'); $ct = str($b, 'ct', MAX_VAULT_BYTES);
    if (!isB64($iv) || !isB64($ct)) fail(400, '不正なデータです');
    $base = (int)($b['base'] ?? -1);
    $res = withLock(function () use ($b, $iv, $ct, $base) {
        $cur = vaultRec();
        if ($cur && (int)$cur['rev'] !== $base) fail(409, '別の端末で更新されています', ['rev' => (int)$cur['rev']]);
        if ($cur) addSnapshot($cur);
        $rec = ['iv' => $iv, 'ct' => $ct, 'rev' => ($cur ? (int)$cur['rev'] : 0) + 1, 'n' => (int)($b['n'] ?? 0), 'savedAt' => (int)(microtime(true) * 1000)];
        writeJson(path('vault.json'), $rec);
        return ['rev' => $rec['rev'], 'savedAt' => $rec['savedAt']];
    });
    out(200, $res);
}

case 'snapshots':
    requireAuth();
    $items = [];
    foreach (array_reverse(snapshotList()) as $f) {
        $r = readJson($f);
        if ($r) $items[] = ['sid' => basename($f, '.json'), 'savedAt' => $r['savedAt'] ?? 0, 'n' => $r['n'] ?? null];
    }
    out(200, ['items' => $items]);

case 'snapshot': {
    requireAuth();
    $sid = (string)($_GET['sid'] ?? '');
    if (!preg_match('/^[0-9]{17}$/', $sid)) fail(400, '不正な値: sid');
    $r = readJson(path("snapshots/$sid.json"));
    if (!$r) fail(404, '見つかりません');
    out(200, $r);
}

case 'file_put': {
    requireAuth();
    $id = (string)($_GET['id'] ?? '');
    if (!validFileId($id)) fail(400, '不正なファイルIDです');
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) < 29) fail(400, 'ファイルが空です');
    if (strlen($raw) > MAX_FILE_BYTES) fail(413, 'ファイルが大きすぎます');
    writeAtomic(path("files/$id.bin"), $raw);
    out(200, ['ok' => true]);
}

case 'file_get': {
    requireAuth();
    $id = (string)($_GET['id'] ?? '');
    if (!validFileId($id)) fail(400, '不正なファイルIDです');
    $f = path("files/$id.bin");
    if (!is_file($f)) fail(404, 'ファイルが見つかりません');
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($f));
    readfile($f);
    exit;
}

case 'password': {
    // 管理者パスワードの変更：データ鍵を新しいパスワードで包み直す
    requireAuth();
    $b = body();
    withLock(function () use ($b) {
        $u = checkCredentials(user(), str($b, 'authOld', 200), '', false);
        foreach (['salt', 'authNew', 'wk', 'wkIv'] as $k) if (!isB64(str($b, $k))) fail(400, "不正な値: $k");
        $u['salt'] = $b['salt']; $u['iter'] = max(100000, (int)$b['iter']);
        $u['authHash'] = password_hash($b['authNew'], PASSWORD_DEFAULT);
        $u['wk'] = $b['wk']; $u['wkIv'] = $b['wkIv'];
        writeJson(path('user.json'), $u);
    });
    out(200, ['ok' => true, 'header' => headerOf(user())]);
}

case 'pin': {
    requireAuth();
    $b = body();
    withLock(function () use ($b) {
        $u = checkCredentials(user(), str($b, 'auth', 200), '', false);
        $pin = str($b, 'pin', 16);
        if (!validPin($pin)) fail(400, '暗証番号は4〜8桁の数字にしてください');
        $u['pinHash'] = password_hash($pin, PASSWORD_DEFAULT);
        writeJson(path('user.json'), $u);
    });
    out(200, ['ok' => true]);
}

case 'username': {
    requireAuth();
    $b = body();
    withLock(function () use ($b) {
        $u = checkCredentials(user(), str($b, 'auth', 200), '', false);
        $name = trim(str($b, 'username', 64));
        if ($name === '') fail(400, 'ユーザー名を入力してください');
        // ユーザー名は暗号鍵の材料ではないので、変更しても再暗号化は不要
        $u['username'] = $name;
        writeJson(path('user.json'), $u);
    });
    out(200, ['ok' => true]);
}

case 'wipe': {
    requireAuth();
    $b = body();
    withLock(function () use ($b) {
        checkCredentials(user(), str($b, 'auth', 200), '', false);
        foreach (array_merge(glob(path('files') . '/*') ?: [], glob(path('snapshots') . '/*') ?: []) as $f) @unlink($f);
        foreach (['user.json', 'vault.json', 'sessions.json'] as $f) @unlink(path($f));
    });
    out(200, ['ok' => true]);
}

default:
    fail(404, '不明な操作です');
}
