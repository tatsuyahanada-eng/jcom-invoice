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
    return (string)($_SERVER['REMOTE_USER'] ?? $_SERVER['REDIRECT_REMOTE_USER'] ?? '');
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
