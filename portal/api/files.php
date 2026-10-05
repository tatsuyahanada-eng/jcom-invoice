<?php
declare(strict_types=1);

/*
 * ダウンロード用ファイルの管理
 *  - ブラウザからのアップロード：ブラウザがファイルを小さく分割して送る。PHP の1回あたりの上限（post_max_size）を超えるファイルも送れる。途中から再開できる。
 *  - FTP：大きなファイルは storage/incoming/ に置き、ext.php の画面で「使う作業」とあわせて登録する（コピーしない）。
 *  - ダウンロード：ログイン済みのユーザーだけ。途中から再開できる（Range）。
 */

function ini_bytes(string $v): int
{
    $v = trim($v);
    if ($v === '') return 0;
    $n = (float)$v;
    switch (strtolower(substr($v, -1))) {
        case 'g': return (int)($n * 1073741824);
        case 'm': return (int)($n * 1048576);
        case 'k': return (int)($n * 1024);
    }
    return (int)$n;
}

function storage_root(): string
{
    $d = cfg()['storage_dir'] ?: (__DIR__ . '/../storage');
    if (!is_dir($d)) @mkdir($d, 0750, true);
    return rtrim((string)(realpath($d) ?: $d), '/\\');
}
function storage_sub(string $n): string
{
    $d = $n === 'incoming' && !empty(cfg()['incoming_dir']) ? cfg()['incoming_dir'] : storage_root() . '/' . $n;
    if (!is_dir($d)) @mkdir($d, 0750, true);
    return rtrim((string)(realpath($d) ?: $d), '/\\');
}

function upload_limits(): array
{
    $post = ini_bytes((string)ini_get('post_max_size'));
    $chunk = $post > 0 ? max(262144, min(8 * 1048576, (int)floor($post * 0.8))) : 8 * 1048576;
    $max = (int)(cfg()['max_upload_bytes'] ?? 2147483648);
    return [
        'maxBytes' => $max,                                  // ブラウザから送れる1ファイルの上限（設定）
        'chunkBytes' => $chunk,                              // 1回に送る大きさ（PHP の post_max_size から決める）
        'phpUploadMax' => ini_bytes((string)ini_get('upload_max_filesize')),
        'phpPostMax' => $post,
        'phpMaxExecution' => (int)ini_get('max_execution_time'),
        'freeBytes' => (int)(@disk_free_space(storage_root()) ?: 0),
        'incomingDir' => cfg()['incoming_label'] ?? 'storage/incoming',
    ];
}

function clean_name(string $n): string
{
    $n = str_replace('\\', '/', $n);
    $n = basename($n);
    $n = preg_replace('/[\x00-\x1F\x7F<>:"|?*]/u', '_', $n) ?? '';
    $n = trim($n, " .\t");
    return mb_substr($n, 0, 200);
}

function file_row(string $id): ?array
{
    $s = db()->prepare('SELECT * FROM files WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch() ?: null;
}

function file_out(array $r): array
{
    return ['fid' => $r['id'], 'name' => $r['orig_name'], 'size' => (int)$r['size'], 'sha' => $r['sha256'], 'desc' => ''];
}

/* ------------------------------------------------------------ アップロード（分割） */

function tmp_paths(string $id): array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) fail(422, 'アップロードIDの形式が正しくありません');
    $d = storage_sub('tmp');
    return [$d . '/' . $id . '.part', $d . '/' . $id . '.json'];
}

function load_upload(string $id, array $u): array
{
    [$part, $meta] = tmp_paths($id);
    $m = is_file($meta) ? json_decode((string)file_get_contents($meta), true) : null;
    if (!$m || $m['user'] !== $u['id']) fail(404, 'アップロードが見つかりません。最初からやり直してください');
    return [$m, $part, $meta];
}

function route_upload(string $action): never
{
    $u = require_login();
    if ($action === 'init') {
        require_same_site_write();
        $b = read_json(8192);
        $name = clean_name((string)($b['name'] ?? ''));
        $size = (int)($b['size'] ?? 0);
        $L = upload_limits();
        // 作業記録の添付（画像・PDF）は、ログインしている全員が上げられる。それ以外のファイルは、編集の権限が必要
        $purpose = ($b['purpose'] ?? '') === 'record' ? 'record' : '';
        if ($purpose === '') require_role('editor');
        elseif (!in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), LOG_UPLOAD_EXT, true)) fail(422, '添付できるのは、画像（JPG・PNG・GIF・WebP）と PDF だけです');
        elseif ($size > LOG_UPLOAD_MAX) fail(413, '添付できるのは、1ファイル ' . fmt_bytes(LOG_UPLOAD_MAX) . ' までです');
        if ($name === '') fail(422, 'ファイル名が正しくありません');
        if ($size <= 0) fail(422, '空のファイルはアップロードできません');
        if ($size > $L['maxBytes']) fail(413, 'ブラウザから送れるのは、1ファイル ' . fmt_bytes($L['maxBytes']) . ' までです。これより大きいファイルは FTP で転送してください', ['limits' => $L]);
        if ($L['freeBytes'] > 0 && $size + 104857600 > $L['freeBytes']) fail(507, 'サーバーの空き容量が足りません');
        foreach (glob(storage_sub('tmp') . '/*.json') ?: [] as $f) {   // 24時間以上前の中断分を片付ける
            if (filemtime($f) < time() - 86400) { @unlink($f); @unlink(substr($f, 0, -5) . '.part'); }
        }
        $id = bin2hex(random_bytes(16));
        [$part, $meta] = tmp_paths($id);
        file_put_contents($part, '');
        file_put_contents($meta, json_encode(['name' => $name, 'size' => $size, 'user' => $u['id'], 'created' => time(), 'purpose' => $purpose]));
        json_out(['ok' => true, 'uploadId' => $id, 'received' => 0, 'chunkBytes' => $L['chunkBytes'], 'name' => $name]);
    }
    if ($action === 'status') {
        [$m, $part] = load_upload((string)($_GET['id'] ?? ''), $u);
        if (($m['purpose'] ?? '') !== 'record') require_role('editor');
        clearstatcache();
        json_out(['ok' => true, 'received' => (int)filesize($part), 'size' => $m['size'], 'chunkBytes' => upload_limits()['chunkBytes']]);
    }
    if ($action === 'chunk') {
        require_same_site_write();
        [$m, $part] = load_upload((string)($_GET['id'] ?? ''), $u);
        if (($m['purpose'] ?? '') !== 'record') require_role('editor');
        $offset = (int)($_GET['offset'] ?? -1);
        $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        $L = upload_limits();
        if ($len <= 0) fail(400, 'データが空です');
        if ($len > $L['chunkBytes'] + 1048576) fail(413, '1回に送るデータが大きすぎます', ['chunkBytes' => $L['chunkBytes']]);
        session_write_close();
        $out = fopen($part, 'cb');
        if (!$out || !flock($out, LOCK_EX)) fail(500, 'ファイルを書き込めません');
        clearstatcache(true, $part);
        $have = (int)filesize($part);
        if ($offset !== $have) { flock($out, LOCK_UN); fclose($out); fail(409, '送信位置が合いません。続きから再開します', ['received' => $have]); }
        if ($have + $len > $m['size']) { flock($out, LOCK_UN); fclose($out); fail(422, '宣言したサイズより大きいデータです'); }
        fseek($out, 0, SEEK_END);
        $in = fopen('php://input', 'rb');
        $n = (int)stream_copy_to_stream($in, $out, $len);
        fflush($out); flock($out, LOCK_UN); fclose($out); fclose($in);
        if ($n !== $len) { clearstatcache(true, $part); $fh = fopen($part, 'cb'); ftruncate($fh, $have); fclose($fh); fail(400, 'データを最後まで受け取れませんでした。もう一度送ります', ['received' => $have]); }
        json_out(['ok' => true, 'received' => $have + $n]);
    }
    if ($action === 'finish') {
        require_same_site_write();
        $b = read_json(2048);
        [$m, $part, $meta] = load_upload((string)($b['id'] ?? ''), $u);
        $isRec = ($m['purpose'] ?? '') === 'record';
        if (!$isRec) require_role('editor');
        clearstatcache(true, $part);
        if ((int)filesize($part) !== (int)$m['size']) fail(409, 'まだ全部届いていません', ['received' => (int)filesize($part)]);
        if ($isRec && !log_file_ok($part, $m['name'])) { @unlink($part); @unlink($meta); fail(422, '画像（JPG・PNG・GIF・WebP）か PDF として読み取れないファイルです'); }
        @set_time_limit(0);
        $sha = hash_file('sha256', $part);
        $fid = bin2hex(random_bytes(16));
        if (!@rename($part, storage_sub('files') . '/' . $fid)) fail(500, 'ファイルを保存できません');
        @unlink($meta);
        db()->prepare('INSERT INTO files (id, orig_name, size, sha256, uploaded_by, uploaded_at, source) VALUES (?,?,?,?,?,?,?)')
            ->execute([$fid, $m['name'], $m['size'], $sha, $u['id'], date('Y-m-d H:i:s'), $isRec ? 'record' : 'browser']);
        json_out(['ok' => true, 'file' => file_out(file_row($fid))]);
    }
    if ($action === 'cancel') {
        require_same_site_write();
        $b = read_json(2048);
        [$m, $part, $meta] = load_upload((string)($b['id'] ?? ''), $u);
        if (($m['purpose'] ?? '') !== 'record') require_role('editor');
        @unlink($part); @unlink($meta);
        json_out(['ok' => true]);
    }
    fail(404, '見つかりません');
}

function fmt_bytes(int $b): string
{
    if ($b >= 1073741824) return round($b / 1073741824, 1) . ' GB';
    if ($b >= 1048576) return round($b / 1048576) . ' MB';
    return max(1, (int)round($b / 1024)) . ' KB';
}

/* ------------------------------------------------------------ ダウンロード */

function can_download(array $u, string $fid): bool
{
    if (role_lv($u) >= 1) return true;
    ensure_logs();
    $l = db()->prepare('SELECT 1 FROM work_log_files WHERE file_id = ? LIMIT 1');
    $l->execute([$fid]);
    if ($l->fetchColumn()) return true;   // 作業記録の添付は、ログインしている全員が見られる
    $own = db()->prepare("SELECT 1 FROM files WHERE id = ? AND source = 'record' AND uploaded_by = ?");
    $own->execute([$fid, $u['id']]);
    if ($own->fetchColumn()) return true;   // 記録に付ける前の（上げたばかりの）添付は、上げた本人が確認できる
    $s = db()->prepare("SELECT 1 FROM tasks WHERE status = 'published' AND body LIKE ? LIMIT 1");
    $s->execute(['%"fid":"' . $fid . '"%']);   // 閲覧のみ：公開中の作業のファイルだけ
    return (bool)$s->fetchColumn();
}

function route_download(string $fid): never
{
    $u = require_login();
    $r = file_row($fid) ?? fail(404, 'ファイルが見つかりません');
    if (!can_download($u, $fid)) fail(403, 'このファイルをダウンロードする権限がありません');
    $path = storage_sub('files') . '/' . $fid;
    if (!is_file($path)) fail(404, 'ファイルが見つかりません');
    stream_file($path, $r['orig_name'], '"' . substr($r['sha256'], 0, 32) . '"', !empty($_GET['inline']));
}

/** ファイルを送り出す（Range・再開に対応）。画像と PDF だけは、?inline=1 でブラウザ内に表示できる */
function stream_file(string $path, string $name, string $etag, bool $wantInline = false): never
{
    session_write_close();
    clearstatcache(true, $path);
    $size = (int)filesize($path);
    $start = 0;
    $end = $size - 1;
    $status = 200;
    $rangeHdr = trim((string)($_SERVER['HTTP_RANGE'] ?? ''));
    $ifRange = trim((string)($_SERVER['HTTP_IF_RANGE'] ?? ''));
    if ($rangeHdr !== '' && ($ifRange === '' || $ifRange === $etag) && preg_match('/^bytes=(\d*)-(\d*)$/', $rangeHdr, $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') { $start = max(0, $size - (int)$m[2]); }
        else { $start = (int)$m[1]; if ($m[2] !== '') $end = min($end, (int)$m[2]); }
        if ($start > $end || $start >= $size) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
        $status = 206;
        header("Content-Range: bytes $start-$end/$size");
    }
    while (ob_get_level()) ob_end_clean();
    http_response_code($status);
    $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $name);
    $types = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'pdf' => 'application/pdf', 'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime'];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $inline = $wantInline && isset($types[$ext]);
    header('Content-Type: ' . ($inline ? $types[$ext] : 'application/octet-stream'));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($name));
    header('Content-Length: ' . ($end - $start + 1));
    header('Accept-Ranges: bytes');
    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int)filemtime($path)) . ' GMT');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-transform');
    @set_time_limit(0);
    $fp = fopen($path, 'rb');
    fseek($fp, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !connection_aborted()) {
        $buf = fread($fp, (int)min(1048576, $left));
        if ($buf === false || $buf === '') break;
        echo $buf;
        $left -= strlen($buf);
        flush();
    }
    fclose($fp);
    exit;
}

/* ------------------------------------------------------------ 一覧・削除 */

/** どのファイルが、どの作業で使われているか（公開中の内容・下書き・承認待ちの申請のすべてを見る） */
function file_usage(): array
{
    $used = [];
    foreach (db()->query('SELECT id, title, status, body, review FROM tasks')->fetchAll() as $t) {
        $add = function (string $json, string $where) use (&$used, $t) {
            if (preg_match_all('/"fid":"([a-f0-9]{32})"/', $json, $m)) {
                foreach (array_unique($m[1]) as $fid) $used[$fid][] = ['id' => $t['id'], 'title' => $t['title'], 'where' => $where];
            }
        };
        $add((string)$t['body'], $t['status'] === 'published' ? '公開中' : '非公開');
    }
    ensure_logs();   // 作業記録に添付されているファイルも、使用中として扱う（削除できない）
    foreach (db()->query('SELECT lf.file_id, l.id, l.place FROM work_log_files lf JOIN work_logs l ON l.id = lf.log_id')->fetchAll() as $r) {
        $used[$r['file_id']][] = ['id' => $r['id'], 'title' => $r['place'], 'where' => '作業記録'];
    }
    return $used;
}

function route_file_list(): never
{
    require_role('editor');
    $used = file_usage();
    $dir = storage_sub('files');
    $q = db()->query('SELECT f.*, u.display_name AS who FROM files f LEFT JOIN users u ON u.id = f.uploaded_by ORDER BY f.uploaded_at DESC LIMIT 2000');
    $files = [];
    $tot = ['count' => 0, 'size' => 0, 'unusedCount' => 0, 'unusedSize' => 0];
    foreach ($q->fetchAll() as $r) {
        $u = $used[$r['id']] ?? [];
        $size = (int)$r['size'];
        $files[] = ['fid' => $r['id'], 'name' => $r['orig_name'], 'size' => $size, 'sha' => $r['sha256'], 'by' => $r['who'] ?? '（削除済み）',
            'at' => substr($r['uploaded_at'], 0, 16), 'source' => $r['source'], 'used' => $u, 'missing' => !is_file($dir . '/' . $r['id'])];
        $tot['count']++; $tot['size'] += $size;
        if (!$u) { $tot['unusedCount']++; $tot['unusedSize'] += $size; }
    }
    $tot['free'] = (int)(@disk_free_space($dir) ?: 0);
    json_out(['ok' => true, 'files' => $files, 'totals' => $tot]);
}

/** ファイルの削除（編集以上）。作業で使われているファイルは削除できない */
function route_file_delete(): never
{
    require_same_site_write();
    $u = require_role('editor');
    $b = read_json(65536);
    $ids = [];
    foreach ((array)($b['ids'] ?? []) as $x) if (is_string($x) && preg_match('/^[a-f0-9]{32}$/', $x)) $ids[$x] = true;
    $ids = array_keys($ids);
    if (!$ids || count($ids) > 500) fail(422, '削除するファイルを選んでください');
    $used = file_usage();
    $deleted = 0;
    $freed = 0;
    $skipped = [];
    foreach ($ids as $id) {
        $r = file_row($id);
        if (!$r) { $skipped[] = ['fid' => $id, 'name' => '', 'reason' => 'ファイルが見つかりません']; continue; }
        if (isset($used[$id])) { $skipped[] = ['fid' => $id, 'name' => $r['orig_name'], 'reason' => '作業「' . $used[$id][0]['title'] . '」で使われています']; continue; }
        $path = storage_sub('files') . '/' . $id;
        if (is_file($path) && !@unlink($path)) { $skipped[] = ['fid' => $id, 'name' => $r['orig_name'], 'reason' => 'サーバー上のファイルを削除できませんでした']; continue; }
        db()->prepare('DELETE FROM files WHERE id = ?')->execute([$id]);
        log_history($u['id'], 'delete', 'file', '', $r['orig_name'], 'ファイルを削除（' . fmt_bytes((int)$r['size']) . '）');
        $deleted++; $freed += (int)$r['size'];
    }
    json_out(['ok' => true, 'deleted' => $deleted, 'freedBytes' => $freed, 'skipped' => $skipped]);
}
