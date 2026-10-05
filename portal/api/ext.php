<?php
/**
 * FTP で置いた大きなファイル（EXE・イメージなど）の登録。
 *
 * ファイルは FTP の受け取りフォルダ（storage/incoming）に置いたまま、コピーも移動もしない。
 * 「どのパスの・どのファイルを・どの作業で使うか」だけをデータベースに登録し、
 * ダウンロードはポータルを通す（ログインが必要。再開にも対応）。
 */
declare(strict_types=1);

const EXT_MAX_DEPTH = 6;
const EXT_MAX_SCAN = 3000;

function ensure_ext(): void
{
    static $done = false;
    if ($done) return;
    // 以前の版で設置したデータベースにも、自動で表を追加する
    db()->exec('CREATE TABLE IF NOT EXISTS ext_files (
      id         VARCHAR(16)   NOT NULL,
      path       VARCHAR(500)  NOT NULL,
      path_hash  CHAR(64)      NOT NULL,
      name       VARCHAR(255)  NOT NULL,
      descr      VARCHAR(1000) NOT NULL DEFAULT \'\',
      tasks      TEXT          NOT NULL,
      created_by VARCHAR(24)   NOT NULL DEFAULT \'\',
      created_at DATETIME      NOT NULL,
      updated_at DATETIME      NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_path (path_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $done = true;
}

/** FTP の受け取りフォルダ（ここより外のファイルは登録できない） */
function ext_base(): string
{
    return storage_sub('incoming');
}

/** 画面に見せるための、FTP の転送先 */
function ext_base_label(): string
{
    return (string)(cfg()['incoming_label'] ?? 'storage/incoming');
}

/** 受け取りフォルダからの相対パスを、実在するファイルの絶対パスにする。フォルダの外・リンクは拒否 */
function ext_resolve(string $rel): ?string
{
    $rel = trim(str_replace('\\', '/', $rel), '/ ');
    if ($rel === '' || strlen($rel) > 500 || preg_match('/[\x00-\x1F]/', $rel)) return null;
    foreach (explode('/', $rel) as $seg) if ($seg === '' || $seg === '.' || $seg === '..' || $seg[0] === '.') return null;
    $base = ext_base();
    $p = $base . '/' . $rel;
    if (is_link($p) || !is_file($p)) return null;
    $real = realpath($p);
    if ($real === false || strncmp(str_replace('\\', '/', $real), str_replace('\\', '/', $base) . '/', strlen($base) + 1) !== 0) return null;
    return $real;
}

function ext_rel_clean(string $rel): string
{
    return trim(str_replace('\\', '/', $rel), '/ ');
}

function ext_row_out(array $r, bool $withPath): array
{
    $abs = ext_resolve($r['path']);
    $o = ['id' => $r['id'], 'name' => $r['name'], 'desc' => $r['descr'], 'size' => $abs ? (int)filesize($abs) : 0, 'missing' => !$abs,
        'tasks' => array_values(array_filter((array)json_decode((string)$r['tasks'], true), 'is_string'))];
    if ($withPath) $o += ['path' => $r['path'], 'modified' => $abs ? date('Y-m-d H:i', (int)filemtime($abs)) : '', 'by' => $r['created_by']];
    return $o;
}

/** 作業ごとの「FTP のファイル」（現場の画面用。パスは見せない） */
function ext_by_task(): array
{
    ensure_ext();
    $map = [];
    foreach (db()->query('SELECT * FROM ext_files ORDER BY name')->fetchAll() as $r) {
        $o = ext_row_out($r, false);
        foreach ($o['tasks'] as $tid) $map[$tid][] = ['id' => $o['id'], 'name' => $o['name'], 'desc' => $o['desc'], 'size' => $o['size'], 'missing' => $o['missing']];
    }
    return $map;
}

function ext_scan(string $dir, string $prefix, int $depth, array &$out, array $registered): void
{
    if (count($out) >= EXT_MAX_SCAN) return;
    foreach (scandir($dir) ?: [] as $n) {
        if ($n[0] === '.' || $n === 'index.html' || $n === 'index.php') continue;
        $p = $dir . '/' . $n;
        if (is_link($p)) continue;
        $rel = $prefix === '' ? $n : $prefix . '/' . $n;
        if (is_dir($p)) { if ($depth < EXT_MAX_DEPTH) ext_scan($p, $rel, $depth + 1, $out, $registered); continue; }
        if (!is_file($p) || isset($registered[$rel])) continue;
        $out[] = ['path' => $rel, 'name' => $n, 'size' => (int)filesize($p), 'modified' => date('Y-m-d H:i', (int)filemtime($p)), 'settled' => filemtime($p) < time() - 60];
        if (count($out) >= EXT_MAX_SCAN) return;
    }
}

function route_ext_list(): never
{
    require_role('editor');
    ensure_ext();
    $items = [];
    $registered = [];
    foreach (db()->query('SELECT * FROM ext_files ORDER BY name, path')->fetchAll() as $r) {
        $items[] = ext_row_out($r, true);
        $registered[$r['path']] = true;
    }
    $found = [];
    ext_scan(ext_base(), '', 0, $found, $registered);
    usort($found, fn($a, $b) => strcmp($b['modified'], $a['modified']));
    json_out(['ok' => true, 'dir' => ext_base_label(), 'items' => $items, 'found' => array_slice($found, 0, 500)]);
}

function ext_valid_tasks($in): array
{
    $ids = [];
    foreach ((array)$in as $t) if (is_string($t) && preg_match('/^[A-Za-z0-9_-]{1,20}$/', $t)) $ids[$t] = true;
    $ids = array_keys($ids);
    if (!$ids) return [];
    $q = db()->prepare('SELECT id FROM tasks WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $q->execute($ids);
    $ok = $q->fetchAll(PDO::FETCH_COLUMN);
    return array_values(array_intersect($ids, $ok));
}

/** 登録・変更。id があれば変更、なければ path のファイルを新しく登録する */
function route_ext_save(): never
{
    require_same_site_write();
    $u = require_role('editor');
    ensure_ext();
    $b = read_json(65536);
    $desc = str($b['desc'] ?? '', 1000);
    $tasks = ext_valid_tasks($b['tasks'] ?? []);
    $id = (string)($b['id'] ?? '');
    if ($id !== '') {
        $s = db()->prepare('SELECT * FROM ext_files WHERE id = ?');
        $s->execute([$id]);
        $r = $s->fetch() ?: fail(404, '登録が見つかりません');
        $name = $r['name'];   // 名前は、FTP に置いたファイルの名前そのまま（現場でダウンロードされる名前と同じ）
        db()->prepare('UPDATE ext_files SET descr = ?, tasks = ?, updated_at = ? WHERE id = ?')
            ->execute([$desc, json_encode($tasks), date('Y-m-d H:i:s'), $id]);
        log_history($u['id'], 'update', 'ext', '', $name, '使う作業・説明を更新' . ($tasks ? '（' . implode('、', $tasks) . '）' : '（作業の指定なし）'));
        json_out(['ok' => true, 'id' => $id, 'message' => '保存しました']);
    }
    $rel = ext_rel_clean((string)($b['path'] ?? ''));
    $abs = ext_resolve($rel) ?? fail(422, 'そのパスにファイルが見つかりません。FTP の転送先（' . ext_base_label() . '）からの相対パスで、ファイル名まで入力してください');
    $hash = hash('sha256', $rel);
    $dup = db()->prepare('SELECT id FROM ext_files WHERE path_hash = ?');
    $dup->execute([$hash]);
    if ($dup->fetchColumn()) fail(409, 'このファイルは、すでに登録されています');
    $name = mb_substr(basename($rel), 0, 255);
    $id = new_id('x');
    db()->prepare('INSERT INTO ext_files (id, path, path_hash, name, descr, tasks, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $rel, $hash, $name, $desc, json_encode($tasks), $u['id'], date('Y-m-d H:i:s'), date('Y-m-d H:i:s')]);
    log_history($u['id'], 'create', 'ext', '', $name, 'FTP のファイルを登録（' . $rel . '）' . ($tasks ? '。使う作業：' . implode('、', $tasks) : ''));
    json_out(['ok' => true, 'id' => $id, 'message' => '登録しました']);
}

/** 登録の解除。ファイルそのものは、FTP のフォルダに残る */
function route_ext_delete(): never
{
    require_same_site_write();
    $u = require_role('editor');
    ensure_ext();
    $b = read_json(2048);
    $id = (string)($b['id'] ?? '');
    $s = db()->prepare('SELECT * FROM ext_files WHERE id = ?');
    $s->execute([$id]);
    $r = $s->fetch() ?: fail(404, '登録が見つかりません');
    db()->prepare('DELETE FROM ext_files WHERE id = ?')->execute([$id]);
    log_history($u['id'], 'delete', 'ext', '', $r['name'], '登録を解除（ファイルは FTP のフォルダに残っています）');
    json_out(['ok' => true, 'message' => '登録を解除しました。ファイルは FTP のフォルダに残っています']);
}

function ext_can_download(array $u, array $r): bool
{
    if (role_lv($u) >= 1) return true;
    $tasks = array_values(array_filter((array)json_decode((string)$r['tasks'], true), 'is_string'));
    if (!$tasks) return false;
    $q = db()->prepare("SELECT 1 FROM tasks WHERE status = 'published' AND id IN (" . implode(',', array_fill(0, count($tasks), '?')) . ') LIMIT 1');
    $q->execute($tasks);
    return (bool)$q->fetchColumn();   // 閲覧のみ：公開中の作業に使われているファイルだけ
}

function route_ext_download(string $id): never
{
    $u = require_login();
    ensure_ext();
    $s = db()->prepare('SELECT * FROM ext_files WHERE id = ?');
    $s->execute([$id]);
    $r = $s->fetch() ?: fail(404, 'ファイルが見つかりません');
    if (!ext_can_download($u, $r)) fail(403, 'このファイルをダウンロードする権限がありません');
    $abs = ext_resolve($r['path']) ?? fail(404, 'ファイルが FTP のフォルダに見つかりません（移動または削除された可能性があります）');
    $etag = '"' . substr(sha1($r['path'] . '|' . filesize($abs) . '|' . filemtime($abs)), 0, 32) . '"';
    stream_file($abs, $r['name'], $etag, !empty($_GET['inline']));
}
