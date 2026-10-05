<?php
/**
 * 作業記録：いつ・誰が・どの店舗で・どんな作業をして・結果はどうだったか、を残して後から探せるようにする。
 *
 *  - 担当者は、ログインしているユーザーの名前がそのまま入る（画面からは変えられない）
 *  - 作業報告書の写真・PDF などを添付できる（画像と PDF だけ。中身も確認する）
 *  - 見られるのは、ログインしている全員。変更・削除は、記録した本人と、編集以上の権限の人
 */
declare(strict_types=1);

const LOG_RESULTS = ['done' => '完了', 'partial' => '一部未完了', 'stopped' => '中止'];
const LOG_MAX_FILES = 20;
const LOG_UPLOAD_MAX = 31457280;   // 添付1つの上限（30MB）。スマホの写真は、画面側で縮小してから送る
const LOG_UPLOAD_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

function ensure_logs(): void
{
    static $done = false;
    if ($done) return;
    // 以前の版で設置したデータベースにも、自動で表を追加する
    db()->exec('CREATE TABLE IF NOT EXISTS work_logs (
      id         VARCHAR(24)  NOT NULL,
      worked_on  DATE         NOT NULL,
      place      VARCHAR(200) NOT NULL,
      task_id    VARCHAR(20)  NOT NULL DEFAULT \'\',
      task_title VARCHAR(255) NOT NULL,
      result     VARCHAR(10)  NOT NULL DEFAULT \'done\',
      notes      TEXT         NOT NULL,
      user_id    VARCHAR(24)  NOT NULL,
      user_name  VARCHAR(100) NOT NULL,
      username   VARCHAR(50)  NOT NULL DEFAULT \'\',
      created_at DATETIME     NOT NULL,
      updated_at DATETIME     NOT NULL,
      PRIMARY KEY (id),
      KEY idx_date (worked_on, created_at),
      KEY idx_place (place(100)),
      KEY idx_user (user_id),
      KEY idx_task (task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    db()->exec('CREATE TABLE IF NOT EXISTS work_log_files (
      log_id  VARCHAR(24) NOT NULL,
      file_id CHAR(32)    NOT NULL,
      ord     INT         NOT NULL DEFAULT 0,
      PRIMARY KEY (log_id, file_id),
      KEY idx_file (file_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $done = true;
}

function log_date(string $v): ?string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return null;
    return $v;
}

/** 検索の条件：キーワード（空白で区切ると、すべてを含むもの）・期間・作業・担当者・結果 */
function log_filters(): array
{
    $w = ['1=1'];
    $a = [];
    $terms = preg_split('/[\s　]+/u', trim((string)($_GET['q'] ?? '')), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    foreach (array_slice($terms, 0, 6) as $t) {
        $like = '%' . str_replace(['|', '%', '_'], ['||', '|%', '|_'], mb_substr($t, 0, 60)) . '%';
        $w[] = "(l.place LIKE ? ESCAPE '|' OR l.user_name LIKE ? ESCAPE '|' OR l.username LIKE ? ESCAPE '|' OR l.task_title LIKE ? ESCAPE '|' OR l.task_id LIKE ? ESCAPE '|' OR l.notes LIKE ? ESCAPE '|')";
        array_push($a, $like, $like, $like, $like, $like, $like);
    }
    if (($f = log_date((string)($_GET['from'] ?? ''))) !== null) { $w[] = 'l.worked_on >= ?'; $a[] = $f; }
    if (($t = log_date((string)($_GET['to'] ?? ''))) !== null) { $w[] = 'l.worked_on <= ?'; $a[] = $t; }
    $task = (string)($_GET['task'] ?? '');
    if ($task !== '' && preg_match('/^[A-Za-z0-9_-]{1,20}$/', $task)) { $w[] = 'l.task_id = ?'; $a[] = $task; }
    $user = (string)($_GET['user'] ?? '');
    if ($user !== '' && preg_match('/^[A-Za-z0-9_-]{1,24}$/', $user)) { $w[] = 'l.user_id = ?'; $a[] = $user; }
    $res = (string)($_GET['result'] ?? '');
    if (isset(LOG_RESULTS[$res])) { $w[] = 'l.result = ?'; $a[] = $res; }
    return [implode(' AND ', $w), $a];
}

function log_files_for(array $ids): array
{
    if (!$ids) return [];
    $q = db()->prepare('SELECT lf.log_id, f.id, f.orig_name, f.size FROM work_log_files lf JOIN files f ON f.id = lf.file_id WHERE lf.log_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY lf.log_id, lf.ord, f.orig_name');
    $q->execute(array_values($ids));
    $out = [];
    foreach ($q->fetchAll() as $r) $out[$r['log_id']][] = ['fid' => $r['id'], 'name' => $r['orig_name'], 'size' => (int)$r['size']];
    return $out;
}

function log_out(array $r, array $files, bool $full): array
{
    $notes = (string)$r['notes'];
    return ['id' => $r['id'], 'date' => $r['worked_on'], 'place' => $r['place'], 'taskId' => $r['task_id'], 'taskTitle' => $r['task_title'], 'result' => $r['result'],
        'notes' => $full || mb_strlen($notes) <= 140 ? $notes : mb_substr($notes, 0, 140) . '…',
        'user' => ['id' => $r['user_id'], 'name' => $r['user_name'], 'username' => $r['username']],
        'files' => $files[$r['id']] ?? [], 'createdAt' => substr((string)$r['created_at'], 0, 16), 'updatedAt' => substr((string)$r['updated_at'], 0, 16)];
}

function route_log_list(): never
{
    require_login();
    ensure_logs();
    [$where, $args] = log_filters();
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 50)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $c = db()->prepare("SELECT COUNT(*) FROM work_logs l WHERE $where");
    $c->execute($args);
    $total = (int)$c->fetchColumn();
    $s = db()->prepare("SELECT l.* FROM work_logs l WHERE $where ORDER BY l.worked_on DESC, l.created_at DESC, l.id DESC LIMIT $limit OFFSET $offset");
    $s->execute($args);
    $rows = $s->fetchAll();
    $files = log_files_for(array_column($rows, 'id'));
    $out = ['ok' => true, 'total' => $total, 'logs' => array_map(fn($r) => log_out($r, $files, false), $rows)];
    if ($offset === 0) {   // 絞り込みの選択肢・店舗名の入力補助
        $out['users'] = array_map(fn($r) => ['id' => $r['user_id'], 'name' => $r['user_name']],
            db()->query('SELECT user_id, MAX(user_name) AS user_name FROM work_logs GROUP BY user_id ORDER BY user_name')->fetchAll());
        $out['places'] = db()->query('SELECT place FROM work_logs GROUP BY place ORDER BY MAX(worked_on) DESC, MAX(created_at) DESC LIMIT 200')->fetchAll(PDO::FETCH_COLUMN);
    }
    json_out($out);
}

function log_fetch(string $id): ?array
{
    ensure_logs();
    $s = db()->prepare('SELECT * FROM work_logs WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch() ?: null;
}

function route_log_get(string $id): never
{
    require_login();
    $r = log_fetch($id) ?? fail(404, '記録が見つかりません');
    json_out(['ok' => true, 'log' => log_out($r, log_files_for([$id]), true)]);
}

function log_can_edit(array $u, array $r): bool
{
    return $r['user_id'] === $u['id'] || role_lv($u) >= 1;
}

/** 添付が外れて、どの記録からも使われなくなったファイルは、ディスクからも消す（記録の添付用に上げたものだけ） */
function log_drop_files(array $fids): void
{
    foreach ($fids as $fid) {
        $u = db()->prepare('SELECT 1 FROM work_log_files WHERE file_id = ? LIMIT 1');
        $u->execute([$fid]);
        if ($u->fetchColumn()) continue;
        $f = db()->prepare("SELECT id FROM files WHERE id = ? AND source = 'record'");
        $f->execute([$fid]);
        if (!$f->fetchColumn()) continue;
        @unlink(storage_sub('files') . '/' . $fid);
        db()->prepare('DELETE FROM files WHERE id = ?')->execute([$fid]);
    }
}

function route_log_save(): never
{
    require_same_site_write();
    $u = require_login();
    ensure_logs();
    $b = read_json(65536);
    $id = (string)($b['id'] ?? '');
    $cur = null;
    if ($id !== '') {
        $cur = log_fetch($id) ?? fail(404, '記録が見つかりません');
        if (!log_can_edit($u, $cur)) fail(403, 'この記録を変更できるのは、記録した本人と、編集の権限を持つ人だけです');
    }
    $date = log_date((string)($b['date'] ?? '')) ?? fail(422, '作業日を入力してください');
    if ($date > date('Y-m-d', strtotime('+1 day'))) fail(422, '作業日が未来になっています');
    $place = str($b['place'] ?? '', 200);
    if ($place === '') fail(422, '店舗名を入力してください');
    $result = (string)($b['result'] ?? 'done');
    if (!isset(LOG_RESULTS[$result])) fail(422, '作業結果を選んでください');
    $notes = str($b['notes'] ?? '', 4000);
    $taskId = (string)($b['taskId'] ?? '');
    $title = '';
    if ($taskId !== '') {
        $t = db()->prepare('SELECT id, title FROM tasks WHERE id = ?');
        $t->execute([$taskId]);
        $row = $t->fetch();
        if ($row) $title = $row['title'];
        elseif ($cur && $cur['task_id'] === $taskId) $title = $cur['task_title'];   // 作業が削除されたあとも、記録は残る
        else fail(422, '選んだ作業が見つかりません');
    }
    if ($title === '') { $taskId = ''; $title = str($b['taskTitle'] ?? '', 255); }
    if ($title === '') fail(422, '作業を選ぶか、作業の内容を入力してください');

    // 添付：画面から上げた画像・PDF だけ。ほかの人が上げたもの・ほかの記録に付いているものは付けられない
    $fids = [];
    foreach ((array)($b['files'] ?? []) as $f) if (is_string($f) && preg_match('/^[a-f0-9]{32}$/', $f)) $fids[$f] = true;
    $fids = array_keys($fids);
    if (count($fids) > LOG_MAX_FILES) fail(422, '添付できるのは ' . LOG_MAX_FILES . ' 件までです');
    $had = [];
    if ($cur) { $q = db()->prepare('SELECT file_id FROM work_log_files WHERE log_id = ?'); $q->execute([$id]); $had = $q->fetchAll(PDO::FETCH_COLUMN); }
    foreach ($fids as $fid) {
        if (in_array($fid, $had, true)) continue;
        $q = db()->prepare("SELECT uploaded_by FROM files WHERE id = ? AND source = 'record'");
        $q->execute([$fid]);
        $by = $q->fetchColumn();
        if ($by === false || $by !== $u['id']) fail(422, '添付するファイルが見つかりません。もう一度アップロードしてください');
        $q = db()->prepare('SELECT 1 FROM work_log_files WHERE file_id = ? LIMIT 1');
        $q->execute([$fid]);
        if ($q->fetchColumn()) fail(422, 'このファイルは、ほかの記録に使われています');
    }

    $now = date('Y-m-d H:i:s');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        if ($cur) {
            // 担当者は、最初に記録した人のまま。（本人以外が直しても、記録した人は変わらない）
            $pdo->prepare('UPDATE work_logs SET worked_on = ?, place = ?, task_id = ?, task_title = ?, result = ?, notes = ?, updated_at = ? WHERE id = ?')
                ->execute([$date, $place, $taskId, $title, $result, $notes, $now, $id]);
            $pdo->prepare('DELETE FROM work_log_files WHERE log_id = ?')->execute([$id]);
        } else {
            $id = new_id('r');
            $pdo->prepare('INSERT INTO work_logs (id, worked_on, place, task_id, task_title, result, notes, user_id, user_name, username, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$id, $date, $place, $taskId, $title, $result, $notes, $u['id'], $u['display_name'], $u['username'], $now, $now]);
        }
        $ins = $pdo->prepare('INSERT INTO work_log_files (log_id, file_id, ord) VALUES (?,?,?)');
        foreach ($fids as $i => $fid) $ins->execute([$id, $fid, $i]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    log_drop_files(array_values(array_diff($had, $fids)));
    json_out(['ok' => true, 'id' => $id, 'message' => $cur ? '記録を保存しました' : '記録を登録しました']);
}

function route_log_delete(): never
{
    require_same_site_write();
    $u = require_login();
    $b = read_json(2048);
    $r = log_fetch((string)($b['id'] ?? '')) ?? fail(404, '記録が見つかりません');
    if (!log_can_edit($u, $r)) fail(403, 'この記録を削除できるのは、記録した本人と、編集の権限を持つ人だけです');
    $q = db()->prepare('SELECT file_id FROM work_log_files WHERE log_id = ?');
    $q->execute([$r['id']]);
    $fids = $q->fetchAll(PDO::FETCH_COLUMN);
    db()->prepare('DELETE FROM work_log_files WHERE log_id = ?')->execute([$r['id']]);
    db()->prepare('DELETE FROM work_logs WHERE id = ?')->execute([$r['id']]);
    log_drop_files($fids);
    json_out(['ok' => true, 'message' => '記録を削除しました']);
}

/* ------------------------------------------------------------ CSV */

function csv_cell(string $v): string
{
    if ($v !== '' && strpos("=+-@\t\r", $v[0]) !== false) $v = "'" . $v;   // 表計算ソフトで数式として実行されないようにする
    return '"' . str_replace('"', '""', $v) . '"';
}

function route_log_export(): never
{
    require_login();
    ensure_logs();
    [$where, $args] = log_filters();
    $s = db()->prepare("SELECT l.*, (SELECT COUNT(*) FROM work_log_files lf WHERE lf.log_id = l.id) AS nfiles FROM work_logs l WHERE $where ORDER BY l.worked_on DESC, l.created_at DESC LIMIT 10000");
    $s->execute($args);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="work-logs-' . date('Ymd-His') . '.csv"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo "\xEF\xBB\xBF" . implode(',', array_map('csv_cell', ['作業日', '店舗名', '担当者', 'ユーザー名', '作業ID', '作業', '結果', 'メモ', '添付数', '登録日時'])) . "\r\n";
    foreach ($s as $r) {
        echo implode(',', array_map('csv_cell', [$r['worked_on'], $r['place'], $r['user_name'], $r['username'], $r['task_id'], $r['task_title'], LOG_RESULTS[$r['result']] ?? $r['result'], (string)$r['notes'], (string)$r['nfiles'], substr((string)$r['created_at'], 0, 16)])) . "\r\n";
    }
    exit;
}

/* ------------------------------------------------------------ 添付ファイルの確認 */

/** 拡張子と、ファイルの中身（先頭の印）が合っているか。画像と PDF 以外・偽装されたファイルは通さない */
function log_file_ok(string $path, string $name): bool
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, LOG_UPLOAD_EXT, true)) return false;
    $fh = @fopen($path, 'rb');
    if (!$fh) return false;
    $head = (string)fread($fh, 1024);
    fclose($fh);
    return match ($ext) {
        'jpg', 'jpeg' => strncmp($head, "\xFF\xD8\xFF", 3) === 0,
        'png' => strncmp($head, "\x89PNG\r\n\x1A\n", 8) === 0,
        'gif' => strncmp($head, 'GIF8', 4) === 0,
        'webp' => strncmp($head, 'RIFF', 4) === 0 && substr($head, 8, 4) === 'WEBP',
        'pdf' => strpos($head, '%PDF-') !== false,
        default => false,
    };
}
