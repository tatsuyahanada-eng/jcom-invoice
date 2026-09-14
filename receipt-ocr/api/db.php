<?php
/**
 * 共通処理：設定の読み込み、MySQLへの接続、テーブル作成、JSON応答。
 * 各エンドポイント（records.php / image.php / setup.php）から読み込まれます。
 */

declare(strict_types=1);

const KEIHI_TYPES = ['駐車場', '高速', 'ガソリン', 'タクシー', '電車・バス', 'その他'];

/** JSONでエラーを返して終了する */
function keihi_fail(int $status, string $message, array $extra = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $message] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}

/** JSONで正常応答を返して終了する */
function keihi_ok(array $payload): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => true] + $payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/** config.php を読む */
function keihi_config(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        keihi_fail(500, 'api/config.php がありません。api/config.sample.php をコピーして作成してください。');
    }
    $config = require $path;
    if (!is_array($config)) {
        keihi_fail(500, 'api/config.php の内容が正しくありません（配列を return してください）。');
    }
    $cache = $config + [
        'db_host' => 'localhost',
        'db_port' => 3306,
        'db_name' => '',
        'db_user' => '',
        'db_password' => '',
        'store_images' => true,
        'max_image_bytes' => 2 * 1024 * 1024,
        'access_token' => '',
    ];
    return $cache;
}

/** 合言葉を設定している場合の照合 */
function keihi_check_token(): void
{
    $expected = (string) keihi_config()['access_token'];
    if ($expected === '') {
        return;
    }
    $given = $_SERVER['HTTP_X_ACCESS_TOKEN'] ?? '';
    if (!is_string($given) || !hash_equals($expected, $given)) {
        keihi_fail(401, '合言葉が違います。アプリの「設定 > サーバー」を確認してください。');
    }
}

/** PDO接続を返す */
function keihi_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = keihi_config();
    if ($c['db_name'] === '' || $c['db_user'] === '') {
        keihi_fail(500, 'api/config.php にデータベース名とユーザー名を設定してください。');
    }
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $c['db_host'], (int) $c['db_port'], $c['db_name']);
    try {
        $pdo = new PDO($dsn, $c['db_user'], $c['db_password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        error_log('[keihi] db connect: ' . $e->getMessage());
        keihi_fail(500, 'データベースに接続できませんでした。api/config.php の接続情報をご確認ください。');
    }
    return $pdo;
}

/** テーブルが無ければ作る（初回アクセス時に自動で実行されます） */
function keihi_migrate(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS receipts (
        id                VARCHAR(64)  NOT NULL,
        staff             VARCHAR(60)  NOT NULL DEFAULT '',
        `date`            DATE         NULL,
        `time`            VARCHAR(5)   NOT NULL DEFAULT '',
        `type`            VARCHAR(20)  NOT NULL DEFAULT '',
        `name`            VARCHAR(160) NOT NULL DEFAULT '',
        amount            INT          NOT NULL DEFAULT 0,
        note              VARCHAR(400) NOT NULL DEFAULT '',
        source            VARCHAR(40)  NOT NULL DEFAULT '',
        confidence        TEXT         NULL,
        raw_text          TEXT         NULL,
        has_image         TINYINT(1)   NOT NULL DEFAULT 0,
        deleted           TINYINT(1)   NOT NULL DEFAULT 0,
        client_updated_at BIGINT       NOT NULL DEFAULT 0,
        server_seq        BIGINT       NOT NULL DEFAULT 0,
        updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_seq (server_seq),
        KEY idx_date (`date`),
        KEY idx_staff_date (staff, `date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS sync_state (
        k VARCHAR(32) NOT NULL,
        v BIGINT      NOT NULL,
        PRIMARY KEY (k)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("INSERT IGNORE INTO sync_state (k, v) VALUES ('seq', 0)");
}

/**
 * 同期カーソルを1つ進めて返す。
 * サーバー側の単調増加値なので、端末ごとの時計のズレに影響されない。
 */
function keihi_next_seq(PDO $pdo): int
{
    $pdo->exec("UPDATE sync_state SET v = v + 1 WHERE k = 'seq'");
    $seq = $pdo->query("SELECT v FROM sync_state WHERE k = 'seq'")->fetchColumn();
    return (int) $seq;
}

/** 現在の同期カーソル */
function keihi_current_seq(PDO $pdo): int
{
    $seq = $pdo->query("SELECT v FROM sync_state WHERE k = 'seq'")->fetchColumn();
    return $seq === false ? 0 : (int) $seq;
}

/** 明細IDとして安全か */
function keihi_valid_id(string $id): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_-]{8,64}$/', $id);
}

/** 画像の保存先（IDの先頭2文字でディレクトリを分ける） */
function keihi_image_path(string $id, string $kind): string
{
    $suffix = $kind === 'thumb' ? '_t.jpg' : '.jpg';
    return __DIR__ . '/uploads/' . substr($id, 0, 2) . '/' . $id . $suffix;
}

/** リクエストボディのJSONを読む */
function keihi_read_json(int $maxBytes): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false) {
        keihi_fail(400, 'リクエストを読み取れませんでした。');
    }
    if (strlen($raw) > $maxBytes) {
        keihi_fail(413, 'リクエストが大きすぎます。');
    }
    if ($raw === '') {
        return [];
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        keihi_fail(400, 'JSONの形式が正しくありません。');
    }
    return $body;
}
