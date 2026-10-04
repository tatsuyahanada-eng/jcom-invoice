<?php
declare(strict_types=1);

/* WorkBase Portal API: 共通処理 */

function cfg(): array
{
    static $c = null;
    if ($c !== null) return $c;
    $file = __DIR__ . '/config.php';
    if (is_file($file)) {
        $c = require $file;
    } else {
        $c = [
            'db' => [
                'host' => getenv('WB_DB_HOST') ?: 'localhost',
                'port' => (int)(getenv('WB_DB_PORT') ?: 3306),
                'name' => getenv('WB_DB_NAME') ?: 'workbase',
                'user' => getenv('WB_DB_USER') ?: 'workbase',
                'pass' => getenv('WB_DB_PASS') ?: '',
            ],
            'timezone' => 'Asia/Tokyo',
            'debug' => false,
            'storage_dir' => getenv('WB_STORAGE_DIR') ?: null,
            'incoming_dir' => getenv('WB_INCOMING_DIR') ?: null,
        ];
    }
    date_default_timezone_set($c['timezone'] ?? 'Asia/Tokyo');
    return $c;
}

function db(bool $multi = false): PDO
{
    static $pdo = null;
    if ($pdo !== null && !$multi) return $pdo;
    $d = cfg()['db'];
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $d['host'], $d['port'], $d['name']);
    $h = new PDO($dsn, $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => $multi,   // 通常は本物のプリペアドステートメントを使う
    ]);
    $h->exec("SET time_zone = '+09:00'");
    $h->exec('SET SESSION group_concat_max_len = 8192');
    if (!$multi) $pdo = $h;
    return $h;
}

function json_out($data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message, array $extra = []): never
{
    json_out(['ok' => false, 'error' => $message] + $extra, $status);
}

function auth_user(): string
{
    $u = current_user();
    return $u ? (string)$u['username'] : (string)($_SERVER['REMOTE_USER'] ?? $_SERVER['REDIRECT_REMOTE_USER'] ?? '');
}

/** 他サイトのページからの書き込み（CSRF）を防ぐ。自作ヘッダーはクロスサイトから付けられない。 */
function require_same_site_write(): void
{
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'WorkBase') fail(403, '不正なリクエストです');
}

function read_json(int $maxBytes = 1048576): array
{
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || $raw === '') fail(400, 'リクエストの本文が空です');
    if (strlen($raw) > $maxBytes) fail(413, 'リクエストが大きすぎます');
    $j = json_decode($raw, true);
    if (!is_array($j)) fail(400, 'JSON の形式が正しくありません');
    return $j;
}

/** 文字列を取り出し、前後の空白を除いて最大長で切る */
function str($v, int $max): string
{
    if (!is_string($v) && !is_int($v) && !is_float($v)) return '';
    $s = trim((string)$v);
    return mb_strlen($s) > $max ? mb_substr($s, 0, $max) : $s;
}

function like_escape(string $s): string
{
    return addcslashes($s, '\\%_');
}


/* ------------------------------------------------------------ 認証・権限 */

const ROLE_LV = ['viewer' => 0, 'editor' => 1, 'approver' => 2, 'admin' => 3];
const ROLE_LABEL = ['viewer' => '閲覧のみ', 'editor' => '編集', 'approver' => '公開承認', 'admin' => '管理者'];

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $c = cfg();
    if (!empty($c['session_path']) && is_dir($c['session_path']) && is_writable($c['session_path'])) session_save_path($c['session_path']);
    session_name('wbsid');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string)(((int)($c['idle_minutes'] ?? 480)) * 60));
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

function destroy_session(): void
{
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
    }
    session_destroy();
}

/** ログイン中のユーザー（毎回 DB を見るので、権限の変更や無効化がすぐ反映される） */
function current_user(): ?array
{
    static $cache = false;
    if ($cache !== false) return $cache;
    start_session();
    $uid = $_SESSION['uid'] ?? null;
    if (!$uid) return $cache = null;
    $idle = ((int)(cfg()['idle_minutes'] ?? 480)) * 60;
    if (time() - (int)($_SESSION['seen'] ?? 0) > $idle) { destroy_session(); return $cache = null; }
    $s = db()->prepare('SELECT * FROM users WHERE id = ? AND active = 1');
    $s->execute([$uid]);
    $u = $s->fetch();
    if (!$u) { destroy_session(); return $cache = null; }
    $_SESSION['seen'] = time();
    return $cache = $u;
}

function require_login(): array
{
    $u = current_user();
    if (!$u) fail(401, 'ログインが必要です', ['login' => true]);
    return $u;
}

function require_role(string $min): array
{
    $u = require_login();
    if ((ROLE_LV[$u['role']] ?? -1) < ROLE_LV[$min]) fail(403, 'この操作を行う権限がありません');
    return $u;
}

function role_lv(array $u): int
{
    return ROLE_LV[$u['role']] ?? 0;
}

function public_user(array $r, bool $full = true): array
{
    $o = ['id' => $r['id'], 'name' => $r['display_name'], 'dept' => $r['dept'], 'role' => $r['role'], 'active' => (bool)$r['active']];
    if ($full) $o += ['username' => $r['username'], 'email' => $r['email'], 'last' => $r['last_login'] ? substr((string)$r['last_login'], 0, 16) : '', 'mustChange' => (bool)$r['must_change']];
    return $o;
}

/** パスワードの条件。問題があればメッセージを返す */
function check_password(string $pw, string $username): ?string
{
    if (mb_strlen($pw) < 8) return 'パスワードは8文字以上にしてください';
    if (mb_strlen($pw) > 128) return 'パスワードは128文字以内にしてください';
    if (strcasecmp($pw, $username) === 0) return 'ユーザー名と同じパスワードは使えません';
    $classes = (preg_match('/[a-z]/', $pw) ? 1 : 0) + (preg_match('/[A-Z]/', $pw) ? 1 : 0) + (preg_match('/\d/', $pw) ? 1 : 0) + (preg_match('/[^A-Za-z0-9]/', $pw) ? 1 : 0);
    if ($classes < 2) return 'パスワードは、英小文字・英大文字・数字・記号のうち2種類以上を含めてください';
    return null;
}

/* ログインの試行回数の制限（総当たりへの対策） */
function throttle_check(string $username): void
{
    $pdo = db();
    $since = date('Y-m-d H:i:s', time() - 900);
    $a = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE username = ? AND happened_at >= ?');
    $a->execute([$username, $since]);
    $b = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND happened_at >= ?');
    $b->execute([client_ip(), $since]);
    if ((int)$a->fetchColumn() >= 5 || (int)$b->fetchColumn() >= 30) fail(429, 'ログインに失敗した回数が多いため、15分ほど待ってからやり直してください');
}

function throttle_fail(string $username): void
{
    $pdo = db();
    $pdo->prepare('INSERT INTO login_attempts (username, ip, happened_at) VALUES (?,?,?)')->execute([$username, client_ip(), date('Y-m-d H:i:s')]);
    $pdo->prepare('DELETE FROM login_attempts WHERE happened_at < ?')->execute([date('Y-m-d H:i:s', time() - 86400)]);
}

function throttle_clear(string $username): void
{
    db()->prepare('DELETE FROM login_attempts WHERE username = ?')->execute([$username]);
}

function new_id(string $prefix): string
{
    return $prefix . bin2hex(random_bytes(6));
}
