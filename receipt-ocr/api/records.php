<?php
/**
 * 明細の同期エンドポイント。
 *
 * POST { since: int, records: [...], limit: int }
 *   1回の通信で「送信（push）」と「受信（pull）」の両方を行います。
 *
 * 競合の扱い:
 *   同じ明細を複数の端末で編集した場合は、client_updated_at（端末側の更新時刻）が
 *   新しい方を採用します。端末の時計が大きくずれていると意図しない側が残るため、
 *   端末の時刻は自動設定にしておいてください。
 *
 * 受信カーソル:
 *   端末の時計に依存しないよう、サーバー側で単調増加する server_seq を使います。
 *   端末は前回受け取った seq を since として送り、それより新しい行だけを受け取ります。
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    keihi_fail(405, 'POSTのみ受け付けます。');
}

keihi_check_token();

$body = keihi_read_json(8 * 1024 * 1024);
$since = isset($body['since']) ? max(0, (int) $body['since']) : 0;
$limit = isset($body['limit']) ? (int) $body['limit'] : 500;
$limit = max(1, min(2000, $limit));
$incoming = is_array($body['records'] ?? null) ? $body['records'] : [];
if (count($incoming) > 1000) {
    keihi_fail(413, '一度に送れる明細は1000件までです。');
}

/** 受け取った1件を、保存してよい形に整える */
function keihi_sanitize(array $r): ?array
{
    $id = (string) ($r['id'] ?? '');
    if (!keihi_valid_id($id)) {
        return null;
    }
    $date = (string) ($r['date'] ?? '');
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $date = '';
    }
    $time = (string) ($r['time'] ?? '');
    if ($time !== '' && !preg_match('/^\d{2}:\d{2}$/', $time)) {
        $time = '';
    }
    $type = (string) ($r['type'] ?? '');
    if (!in_array($type, KEIHI_TYPES, true)) {
        $type = 'その他';
    }
    $amount = (int) ($r['amount'] ?? 0);
    if ($amount < 0 || $amount > 99999999) {
        $amount = 0;
    }
    $updated = (int) ($r['updatedAt'] ?? 0);
    if ($updated <= 0) {
        $updated = (int) round(microtime(true) * 1000);
    }

    return [
        'id'                => $id,
        'staff'             => mb_substr((string) ($r['staff'] ?? ''), 0, 60),
        'date'              => $date === '' ? null : $date,
        'time'              => $time,
        'type'              => $type,
        'name'              => mb_substr((string) ($r['name'] ?? ''), 0, 160),
        'amount'            => $amount,
        'note'              => mb_substr((string) ($r['note'] ?? ''), 0, 400),
        'source'            => mb_substr((string) ($r['source'] ?? ''), 0, 40),
        'confidence'        => is_array($r['confidence'] ?? null)
            ? json_encode($r['confidence'], JSON_UNESCAPED_UNICODE) : null,
        'raw_text'          => mb_substr((string) ($r['rawText'] ?? ''), 0, 3000),
        // has_image は image.php が実際に画像を受け取ったときだけ立てる。
        // 端末からの申告は信用しない（まだ存在しない画像を他端末が読みに行かないように）。
        'has_image'         => 0,
        'deleted'           => !empty($r['deleted']) ? 1 : 0,
        'client_updated_at' => $updated,
    ];
}

/** DBの1行を、アプリが扱う形へ戻す */
function keihi_to_client(array $row): array
{
    $confidence = null;
    if (is_string($row['confidence']) && $row['confidence'] !== '') {
        $decoded = json_decode($row['confidence'], true);
        if (is_array($decoded)) {
            $confidence = $decoded;
        }
    }
    return [
        'id'         => $row['id'],
        'staff'      => $row['staff'],
        'date'       => $row['date'] ?? '',
        'time'       => $row['time'],
        'type'       => $row['type'],
        'name'       => $row['name'],
        'amount'     => (int) $row['amount'],
        'note'       => $row['note'],
        'source'     => $row['source'],
        'confidence' => $confidence,
        'rawText'    => $row['raw_text'] ?? '',
        'hasImage'   => (int) $row['has_image'] === 1,
        'deleted'    => (int) $row['deleted'] === 1 ? 1 : 0,
        'updatedAt'  => (int) $row['client_updated_at'],
        'serverSeq'  => (int) $row['server_seq'],
    ];
}

try {
    $pdo = keihi_db();
    keihi_migrate($pdo);

    $accepted = 0;
    $skipped  = 0;

    if ($incoming) {
        $clean = [];
        foreach ($incoming as $item) {
            if (!is_array($item)) {
                continue;
            }
            $rec = keihi_sanitize($item);
            if ($rec !== null) {
                $clean[$rec['id']] = $rec;   // 同一IDが重複していれば後勝ち
            }
        }

        if ($clean) {
            $pdo->beginTransaction();

            // すでに新しい版がサーバーにある明細は上書きしない
            $ids = array_keys($clean);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $pdo->prepare("SELECT id, client_updated_at FROM receipts WHERE id IN ($placeholders)");
            $stmt->execute($ids);
            $existing = [];
            foreach ($stmt->fetchAll() as $row) {
                $existing[$row['id']] = (int) $row['client_updated_at'];
            }

            $toWrite = [];
            foreach ($clean as $id => $rec) {
                if (isset($existing[$id]) && $existing[$id] >= $rec['client_updated_at']) {
                    $skipped++;
                    continue;
                }
                $toWrite[] = $rec;
            }

            if ($toWrite) {
                $seq = keihi_next_seq($pdo);
                $sql = 'INSERT INTO receipts
                          (id, staff, `date`, `time`, `type`, `name`, amount, note, source,
                           confidence, raw_text, has_image, deleted, client_updated_at, server_seq)
                        VALUES
                          (:id, :staff, :date, :time, :type, :name, :amount, :note, :source,
                           :confidence, :raw_text, :has_image, :deleted, :client_updated_at, :server_seq)
                        ON DUPLICATE KEY UPDATE
                          staff = VALUES(staff), `date` = VALUES(`date`), `time` = VALUES(`time`),
                          `type` = VALUES(`type`), `name` = VALUES(`name`), amount = VALUES(amount),
                          note = VALUES(note), source = VALUES(source), confidence = VALUES(confidence),
                          raw_text = VALUES(raw_text),
                          has_image = GREATEST(has_image, VALUES(has_image)),
                          deleted = VALUES(deleted),
                          client_updated_at = VALUES(client_updated_at),
                          server_seq = VALUES(server_seq)';
                $insert = $pdo->prepare($sql);
                foreach ($toWrite as $rec) {
                    $rec['server_seq'] = $seq;
                    $insert->execute($rec);
                    $accepted++;
                }
            }
            $pdo->commit();
        }
    }

    // 受信: since より新しい行を返す
    $stmt = $pdo->prepare("SELECT * FROM receipts WHERE server_seq > :since
                           ORDER BY server_seq ASC, id ASC LIMIT $limit");
    $stmt->execute([':since' => $since]);
    $rows = $stmt->fetchAll();

    $records = array_map('keihi_to_client', $rows);
    $nextSince = $since;
    foreach ($rows as $row) {
        $nextSince = max($nextSince, (int) $row['server_seq']);
    }

    keihi_ok([
        'accepted'  => $accepted,
        'skipped'   => $skipped,
        'records'   => $records,
        'since'     => $nextSince,
        'hasMore'   => count($rows) >= $limit,
        'serverSeq' => keihi_current_seq($pdo),
        'total'     => (int) $pdo->query('SELECT COUNT(*) FROM receipts WHERE deleted = 0')->fetchColumn(),
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[keihi/records] ' . $e->getMessage());
    keihi_fail(500, 'サーバー側でエラーが発生しました。api/setup.php で設置状況をご確認ください。');
}
