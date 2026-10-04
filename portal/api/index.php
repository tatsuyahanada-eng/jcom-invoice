<?php
declare(strict_types=1);

ini_set('display_errors', '0');   // エラーの詳細を画面（JSON）に混ぜない。ログには残る

require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/users.php';
require __DIR__ . '/data.php';
require __DIR__ . '/files.php';

/*
 * WorkBase Portal API（health と session 以外は、ログインが必要）
 *   GET  ?r=health                 接続確認
 *   GET  ?r=session                ログイン状態
 *   POST ?r=auth/login | auth/logout | auth/password
 *   GET  ?r=bootstrap              画面に必要なデータ一式（権限に応じて内容が変わる）
 *   POST ?r=data/{op}              作業・大項目・お知らせ・ユーザーの変更（権限はサーバーで判定）
 *   POST ?r=upload/{init|chunk|finish|cancel}  GET ?r=upload/status   ファイルのアップロード（分割・再開）
 *   GET  ?r=files/limits | files/incoming | files/list | files/{id}   POST ?r=files/import | files/delete
 *   POST ?r=records                作業記録の登録（同じ id は二重登録しない）
 *   GET  ?r=records                一覧  q, task, worker, status(ok|skipped), from, to, limit, offset
 *   GET  ?r=records/{id}           詳細（項目ごとのチェック結果つき）
 *   GET  ?r=stats                  集計  days（0 = すべて）
 *   GET  ?r=export                 CSV  （一覧と同じ絞り込み）
 */

/* ------------------------------------------------------------ 登録 */

function create_record(): never
{
    $user = require_login();
    $b = read_json();
    $id = (string)($b['id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{8,40}$/', $id)) fail(422, '記録IDの形式が正しくありません');
    $taskId = str($b['taskId'] ?? '', 20);
    if (!preg_match('/^[A-Za-z0-9_-]{1,20}$/', $taskId)) fail(422, '作業IDの形式が正しくありません');
    $title = str($b['title'] ?? '', 255);
    if ($title === '') fail(422, '作業名がありません');

    $at = (string)($b['at'] ?? '');
    $dt = DateTime::createFromFormat('!Y-m-d H:i', $at);
    if (!$dt || $dt->format('Y-m-d H:i') !== $at) fail(422, '完了日時の形式が正しくありません');
    if ($dt->getTimestamp() > time() + 86400) fail(422, '完了日時が未来になっています');

    $items = $b['items'] ?? null;
    if (!is_array($items) || count($items) < 1 || count($items) > 300) fail(422, 'チェック項目は 1〜300 件で送ってください');
    $rows = [];
    $done = 0;
    foreach (array_values($items) as $i => $it) {
        if (!is_array($it)) fail(422, 'チェック項目の形式が正しくありません');
        $label = str($it['label'] ?? '', 500);
        $key = str($it['key'] ?? '', 255);
        if ($label === '' || $key === '') fail(422, 'チェック項目に名前または識別子がありません');
        $checked = !empty($it['checked']) ? 1 : 0;
        $done += $checked;
        $rows[] = [$i + 1, str($it['section'] ?? '', 40), $key, $label, $checked];
    }
    $total = count($rows);
    $reason = str($b['reason'] ?? '', 2000);
    if ($done < $total && $reason === '') fail(422, '未完了のまま記録する理由を入力してください');
    $notes = str($b['notes'] ?? '', 2000);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO work_records (id, task_id, task_title, task_version, place, worker_name, auth_user, completed_at, total_items, done_items, skipped_reason, notes)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$id, $taskId, $title, str($b['version'] ?? '', 20), str($b['place'] ?? '', 255), str($b['by'] ?? '', 100) ?: $user['display_name'], str($user['username'], 100),
                       $dt->format('Y-m-d H:i:00'), $total, $done, $done < $total ? $reason : null, $notes !== '' ? $notes : null]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        if (($e->errorInfo[1] ?? 0) === 1062) json_out(['ok' => true, 'id' => $id, 'duplicate' => true]);   // 再送された記録
        throw $e;
    }
    foreach (array_chunk($rows, 100) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '(?,?,?,?,?,?,?)'));
        $args = [];
        foreach ($chunk as $r) array_push($args, $id, $taskId, $r[0], $r[1], $r[2], $r[3], $r[4]);
        $pdo->prepare("INSERT INTO work_record_items (record_id, task_id, seq, section, item_key, label, checked) VALUES $ph")->execute($args);
    }
    $pdo->commit();
    json_out(['ok' => true, 'id' => $id, 'total' => $total, 'done' => $done], 201);
}

/* ------------------------------------------------------------ 一覧・詳細 */

const REC_COLS = "id, task_id, task_title, task_version, place, worker_name, auth_user,
                  DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i') AS at, total_items, done_items, skipped_reason, notes";

function shape(array $r): array
{
    return [
        'id' => $r['id'], 'taskId' => $r['task_id'], 'title' => $r['task_title'], 'version' => $r['task_version'],
        'place' => $r['place'], 'by' => $r['worker_name'], 'authUser' => $r['auth_user'], 'at' => $r['at'],
        'total' => (int)$r['total_items'], 'done' => (int)$r['done_items'],
        'skippedCount' => (int)$r['total_items'] - (int)$r['done_items'],
        'reason' => $r['skipped_reason'] ?? '', 'notes' => $r['notes'] ?? '',
    ];
}

function date_param(string $k): ?string
{
    $v = (string)($_GET[$k] ?? '');
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) !== false ? $v : null;
}

/** 一覧・CSV 共通の絞り込み条件 */
function filters(): array
{
    $w = ['1=1'];
    $a = [];
    $q = str($_GET['q'] ?? '', 100);
    if ($q !== '') {
        $like = '%' . like_escape($q) . '%';
        $w[] = '(task_title LIKE ? OR place LIKE ? OR worker_name LIKE ? OR task_id LIKE ? OR notes LIKE ?)';
        array_push($a, $like, $like, $like, $like, $like);
    }
    $task = str($_GET['task'] ?? '', 20);
    if ($task !== '') { $w[] = 'task_id = ?'; $a[] = $task; }
    $worker = str($_GET['worker'] ?? '', 100);
    if ($worker !== '') { $w[] = 'worker_name = ?'; $a[] = $worker; }
    $status = (string)($_GET['status'] ?? '');
    if ($status === 'ok') $w[] = 'done_items = total_items';
    if ($status === 'skipped') $w[] = 'done_items < total_items';
    if ($from = date_param('from')) { $w[] = 'completed_at >= ?'; $a[] = $from . ' 00:00:00'; }
    if ($to = date_param('to')) { $w[] = 'completed_at < ?'; $a[] = date('Y-m-d', strtotime($to . ' +1 day')) . ' 00:00:00'; }
    return [implode(' AND ', $w), $a];
}

function list_records(): never
{
    require_login();
    [$where, $args] = filters();
    $limit = max(1, min(100, (int)($_GET['limit'] ?? 30)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $pdo = db();
    $c = $pdo->prepare("SELECT COUNT(*) FROM work_records WHERE $where");
    $c->execute($args);
    $total = (int)$c->fetchColumn();
    $s = $pdo->prepare('SELECT ' . REC_COLS . " FROM work_records WHERE $where ORDER BY completed_at DESC, created_at DESC LIMIT $limit OFFSET $offset");
    $s->execute($args);
    json_out(['ok' => true, 'total' => $total, 'records' => array_map('shape', $s->fetchAll())]);
}

function get_record(string $id): never
{
    require_login();
    $pdo = db();
    $s = $pdo->prepare('SELECT ' . REC_COLS . ' FROM work_records WHERE id = ?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) fail(404, '記録が見つかりません');
    $i = $pdo->prepare('SELECT seq, section, item_key, label, checked FROM work_record_items WHERE record_id = ? ORDER BY seq');
    $i->execute([$id]);
    $items = array_map(fn($x) => ['seq' => (int)$x['seq'], 'section' => $x['section'], 'key' => $x['item_key'], 'label' => $x['label'], 'checked' => (bool)$x['checked']], $i->fetchAll());
    json_out(['ok' => true, 'record' => shape($r) + ['items' => $items]]);
}

/* ------------------------------------------------------------ 集計 */

function stats(): never
{
    require_login();
    $days = (int)($_GET['days'] ?? 90);
    $w = '1=1';
    $a = [];
    if ($days > 0) { $w = 'r.completed_at >= ?'; $a[] = date('Y-m-d 00:00:00', strtotime("-{$days} days")); }
    $pdo = db();

    $t = $pdo->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(r.done_items < r.total_items),0) AS skipped,
                               COALESCE(SUM(r.total_items),0) AS items, COALESCE(SUM(r.total_items - r.done_items),0) AS missed
                        FROM work_records r WHERE $w");
    $t->execute($a);
    $tot = $t->fetch();

    $bt = $pdo->prepare("SELECT r.task_id, MAX(r.task_title) AS title, COUNT(*) AS n, SUM(r.done_items < r.total_items) AS skipped
                         FROM work_records r WHERE $w GROUP BY r.task_id ORDER BY n DESC LIMIT 10");
    $bt->execute($a);

    $tm = $pdo->prepare("SELECT i.task_id, MAX(r.task_title) AS title, i.item_key, i.label, SUM(i.checked = 0) AS missed, COUNT(*) AS n
                         FROM work_record_items i JOIN work_records r ON r.id = i.record_id
                         WHERE $w GROUP BY i.task_id, i.item_key, i.label HAVING SUM(i.checked = 0) > 0
                         ORDER BY missed DESC, n DESC LIMIT 8");
    $tm->execute($a);

    $bm = $pdo->query("SELECT DATE_FORMAT(completed_at, '%Y-%m') AS ym, COUNT(*) AS n, SUM(done_items < total_items) AS skipped
                       FROM work_records GROUP BY ym ORDER BY ym DESC LIMIT 12");

    json_out(['ok' => true, 'days' => $days,
        'totals' => ['records' => (int)$tot['n'], 'withSkips' => (int)$tot['skipped'], 'items' => (int)$tot['items'], 'missed' => (int)$tot['missed']],
        'byTask' => array_map(fn($x) => ['taskId' => $x['task_id'], 'title' => $x['title'], 'count' => (int)$x['n'], 'withSkips' => (int)$x['skipped']], $bt->fetchAll()),
        'topMissed' => array_map(fn($x) => ['taskId' => $x['task_id'], 'title' => $x['title'], 'label' => $x['label'], 'missed' => (int)$x['missed'], 'of' => (int)$x['n']], $tm->fetchAll()),
        'byMonth' => array_map(fn($x) => ['month' => $x['ym'], 'count' => (int)$x['n'], 'withSkips' => (int)$x['skipped']], $bm->fetchAll()),
    ]);
}

/* ------------------------------------------------------------ CSV */

function csv_cell(string $v): string
{
    if ($v !== '' && strpos("=+-@\t\r", $v[0]) !== false) $v = "'" . $v;   // 表計算ソフトで数式として実行されないようにする
    return '"' . str_replace('"', '""', $v) . '"';
}

function export_csv(): never
{
    require_login();
    [$where, $args] = filters();
    $s = db()->prepare("SELECT r.id, r.task_id, r.task_title, r.task_version, r.place, r.worker_name, r.auth_user,
            DATE_FORMAT(r.completed_at, '%Y-%m-%d %H:%i') AS at, r.total_items, r.done_items, r.skipped_reason, r.notes,
            (SELECT GROUP_CONCAT(i.label ORDER BY i.seq SEPARATOR ' / ') FROM work_record_items i WHERE i.record_id = r.id AND i.checked = 0) AS missed
        FROM work_records r WHERE $where ORDER BY r.completed_at DESC LIMIT 10000");
    $s->execute($args);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="work-records-' . date('Ymd-His') . '.csv"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo "\xEF\xBB\xBF" . implode(',', array_map('csv_cell', ['完了日時', '作業ID', '作業名', '版', '店舗・案件', '作業者', 'ログインユーザー', '項目数', '完了数', '未完了数', '未完了の項目', '未完了の理由', '備考'])) . "\r\n";
    foreach ($s as $r) {
        echo implode(',', array_map('csv_cell', [$r['at'], $r['task_id'], $r['task_title'], $r['task_version'], $r['place'], $r['worker_name'], $r['auth_user'],
            (string)$r['total_items'], (string)$r['done_items'], (string)($r['total_items'] - $r['done_items']), (string)($r['missed'] ?? ''), (string)($r['skipped_reason'] ?? ''), (string)($r['notes'] ?? '')])) . "\r\n";
    }
    exit;
}

/* ------------------------------------------------------------ 実行 */

function main(): void
{
    $cfg = [];
    try {
        $route = trim((string)($_GET['r'] ?? ''), '/');
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $cfg = cfg();

        if ($route === 'health' && $method === 'GET') {
            db()->query('SELECT 1');
            json_out(['ok' => true, 'time' => date('Y-m-d H:i:s')]);
        }
        if ($route === 'session' && $method === 'GET') route_session();
        if ($route === 'auth/login' && $method === 'POST') route_login();
        if ($route === 'auth/logout' && $method === 'POST') route_logout();
        if ($route === 'auth/password' && $method === 'POST') route_password();
        if ($route === 'bootstrap' && $method === 'GET') json_out(['ok' => true, 'user' => public_user(require_login()), 'data' => bootstrap_payload(require_login())]);
        if (preg_match('#^data/([a-z]+\.[a-z]+)$#', $route, $m) && $method === 'POST') run_data_op($m[1]);
        if (preg_match('#^upload/(init|chunk|finish|cancel)$#', $route, $m) && $method === 'POST') route_upload($m[1]);
        if ($route === 'upload/status' && $method === 'GET') route_upload('status');
        if ($route === 'files/limits' && $method === 'GET') { require_role('editor'); json_out(['ok' => true, 'limits' => upload_limits()]); }
        if ($route === 'files/incoming' && $method === 'GET') route_incoming();
        if ($route === 'files/list' && $method === 'GET') route_file_list();
        if ($route === 'files/delete' && $method === 'POST') route_file_delete();
        if ($route === 'files/import' && $method === 'POST') route_import();
        if (preg_match('#^files/([a-f0-9]{32})$#', $route, $m) && $method === 'GET') route_download($m[1]);
        if ($route === 'records' && $method === 'POST') { require_same_site_write(); create_record(); }
        if ($route === 'records' && $method === 'GET') list_records();
        if (preg_match('#^records/([A-Za-z0-9_-]{1,40})$#', $route, $m) && $method === 'GET') get_record($m[1]);
        if ($route === 'stats' && $method === 'GET') stats();
        if ($route === 'export' && $method === 'GET') export_csv();

        fail(404, '見つかりません');
    } catch (Throwable $e) {
        error_log('[WorkBase API] ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
        $dbg = !empty($cfg['debug']);
        fail(500, 'サーバーでエラーが発生しました', $dbg ? ['detail' => $e->getMessage()] : []);
    }
}

main();
