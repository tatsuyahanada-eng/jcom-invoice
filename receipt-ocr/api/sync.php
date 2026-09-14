<?php
/**
 * 交通費レシート読み取り — 端末間同期エンドポイント
 *
 * 要件: PHP 8.0 以上 / PDO SQLite 拡張
 *
 * 旧実装との違い:
 *   旧: ワークスペース単位で JSON を丸ごと上書き
 *       -> PCとスマホで別々に追加すると、後から同期した側で相手の追加が消えた
 *   新: 明細1件ずつ id 単位で保存し、updatedAt が新しい方を採用してマージ
 *       削除は deleted=1 の tombstone として保持し、相手側にも削除を伝える
 *
 * 画像はサーバーに保存しません（明細のテキストのみ）。
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MAX_BODY_BYTES   = 4 * 1024 * 1024;  // 4MB
const MAX_RECORDS      = 20000;
const TOMBSTONE_MAX_AGE = 180 * 24 * 60 * 60; // 180日を過ぎた削除記録は掃除する

function fail(int $status, string $message): void {
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'POSTのみ受け付けます');
}

$raw = file_get_contents('php://input');
if ($raw === false) {
    fail(400, 'リクエストを読み取れませんでした');
}
if (strlen($raw) > MAX_BODY_BYTES) {
    fail(413, 'データが大きすぎます');
}

$body = json_decode($raw, true);
if (!is_array($body)) {
    fail(400, 'JSONの形式が正しくありません');
}

$workspace = (string)($body['workspace'] ?? '');
if (!preg_match('/^[A-Za-z0-9_-]{6,40}$/', $workspace)) {
    fail(400, '共有キーは半角英数字・ハイフン・アンダースコアで6〜40文字にしてください');
}

$incoming = is_array($body['records'] ?? null) ? $body['records'] : [];
if (count($incoming) > MAX_RECORDS) {
    fail(413, '明細の件数が多すぎます');
}

/** 受け取った1件を、保存してよい形に整える */
function sanitize(array $r): ?array {
    $id = (string)($r['id'] ?? '');
    if ($id === '' || strlen($id) > 64) {
        return null;
    }
    $date = (string)($r['date'] ?? '');
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $date = '';
    }
    $time = (string)($r['time'] ?? '');
    if ($time !== '' && !preg_match('/^\d{2}:\d{2}$/', $time)) {
        $time = '';
    }
    $updated = (int)($r['updatedAt'] ?? 0);
    if ($updated <= 0) {
        $updated = (int)(microtime(true) * 1000);
    }
    return [
        'id'         => $id,
        'date'       => $date,
        'time'       => $time,
        'type'       => mb_substr((string)($r['type'] ?? ''), 0, 20),
        'name'       => mb_substr((string)($r['name'] ?? ''), 0, 120),
        'amount'     => (int)($r['amount'] ?? 0),
        'note'       => mb_substr((string)($r['note'] ?? ''), 0, 300),
        'source'     => mb_substr((string)($r['source'] ?? ''), 0, 40),
        'confidence' => is_array($r['confidence'] ?? null) ? $r['confidence'] : null,
        'deleted'    => !empty($r['deleted']) ? 1 : 0,
        'updatedAt'  => $updated,
    ];
}

try {
    $dbPath = __DIR__ . '/data/expense-sync.sqlite';
    if (!is_dir(dirname($dbPath))) {
        mkdir(dirname($dbPath), 0700, true);
    }

    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('CREATE TABLE IF NOT EXISTS records (
        workspace  TEXT NOT NULL,
        id         TEXT NOT NULL,
        payload    TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (workspace, id)
    )');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_records_ws ON records (workspace, updated_at)');

    // updatedAt が新しいときだけ更新する（= 双方向マージ）
    $upsert = $db->prepare(
        'INSERT INTO records (workspace, id, payload, updated_at, deleted)
         VALUES (:ws, :id, :payload, :updated, :deleted)
         ON CONFLICT(workspace, id) DO UPDATE SET
           payload    = excluded.payload,
           updated_at = excluded.updated_at,
           deleted    = excluded.deleted
         WHERE excluded.updated_at > records.updated_at'
    );

    $db->beginTransaction();
    $accepted = 0;
    foreach ($incoming as $item) {
        if (!is_array($item)) {
            continue;
        }
        $rec = sanitize($item);
        if ($rec === null) {
            continue;
        }
        $upsert->execute([
            ':ws'      => $workspace,
            ':id'      => $rec['id'],
            ':payload' => json_encode($rec, JSON_UNESCAPED_UNICODE),
            ':updated' => $rec['updatedAt'],
            ':deleted' => $rec['deleted'],
        ]);
        $accepted++;
    }

    // 古い tombstone を掃除
    $cutoff = (int)((time() - TOMBSTONE_MAX_AGE) * 1000);
    $db->prepare('DELETE FROM records WHERE workspace = ? AND deleted = 1 AND updated_at < ?')
       ->execute([$workspace, $cutoff]);

    $db->commit();

    $rows = $db->prepare('SELECT payload FROM records WHERE workspace = ?');
    $rows->execute([$workspace]);

    $out = [];
    foreach ($rows->fetchAll(PDO::FETCH_COLUMN) as $payload) {
        $decoded = json_decode((string)$payload, true);
        if (is_array($decoded)) {
            $out[] = $decoded;
        }
    }

    echo json_encode(['ok' => true, 'accepted' => $accepted, 'records' => $out], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    error_log('[sync.php] ' . $e->getMessage());
    fail(500, 'サーバー側でエラーが発生しました。設置手順（PDO SQLiteの有無・data/ の書き込み権限）をご確認ください。');
}
