<?php
declare(strict_types=1);

/* 作業マスタ（大項目・作業・お知らせ）と、承認の流れ・変更履歴。権限の判定はすべてここで行う。 */

const TAB_GROUPS = [
    '基本情報' => ['title', 'summary', 'cat', 'minutes', 'people', 'industries', 'tags'],
    '対象機器' => ['devices', 'os'],
    '準備・持参品' => ['precheck', 'bring'],
    'ファイル' => ['files', 'extractTo'],
    '作業手順' => ['steps'],
    'マニュアル' => ['manuals'],
    '公開設定' => ['version', 'changelog'],
];

function now_dt(): string { return date('Y-m-d H:i'); }
function today_d(): string { return date('Y-m-d'); }

function log_history(string $uid, string $action, string $type, string $tid, string $name, string $detail = ''): void
{
    db()->prepare('INSERT INTO history (id, happened_at, user_id, action, type, tid, name, detail) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([new_id('h'), date('Y-m-d H:i:s'), $uid, $action, $type, $tid, mb_substr($name, 0, 255), mb_substr($detail, 0, 4000)]);
    db()->exec("DELETE FROM history WHERE happened_at < '" . date('Y-m-d', strtotime('-2 years')) . "'");
}

/* ------------------------------------------------------------ 画面に渡すデータ */

function task_out(array $r, bool $full): array
{
    $t = json_decode((string)$r['body'], true) ?: [];
    $t['id'] = $r['id'];
    $t['cat'] = $r['cat'];
    $t['order'] = (int)$r['ord'];
    $t['status'] = $r['status'];
    $t['updated'] = $r['updated'];
    if ($full) {
        $t['review'] = $r['review'] ? json_decode((string)$r['review'], true) : null;
        $t['rejected'] = $r['rejected'] ? json_decode((string)$r['rejected'], true) : null;
    }
    return $t;
}

function notice_out(array $r): array
{
    return ['id' => $r['id'], 'date' => $r['notice_date'], 'level' => $r['lvl'], 'text' => $r['body'], 'task' => $r['task'], 'status' => $r['status'], 'until' => $r['until_date'] ?? ''];
}

/** ログイン中のユーザーの権限で見てよいデータだけを返す */
function bootstrap_payload(array $u): array
{
    $pdo = db();
    $lv = role_lv($u);
    $cats = array_map(fn($r) => ['id' => $r['id'], 'order' => (int)$r['ord'], 'name' => $r['name'], 'icon' => $r['icon'], 'desc' => $r['descr']],
        $pdo->query('SELECT * FROM categories ORDER BY ord, id')->fetchAll());
    $tasks = [];
    foreach ($pdo->query('SELECT * FROM tasks ORDER BY ord, id') as $r) {
        if ($lv < 1 && $r['status'] !== 'published') continue;   // 閲覧のみ：公開中の作業だけ
        $tasks[] = task_out($r, $lv >= 1);
    }
    $notices = [];
    foreach ($pdo->query('SELECT * FROM notices ORDER BY notice_date DESC, id') as $r) {
        if ($lv < 1 && !($r['status'] === 'published' && (!$r['until_date'] || $r['until_date'] >= today_d()))) continue;
        $notices[] = notice_out($r);
    }
    $users = array_map(fn($r) => public_user($r, $lv >= 3), $pdo->query('SELECT * FROM users ORDER BY created_at, id')->fetchAll());
    $history = [];
    if ($lv >= 1) {
        foreach ($pdo->query('SELECT * FROM history ORDER BY happened_at DESC, id DESC LIMIT 300') as $r) {
            $history[] = ['id' => $r['id'], 'at' => substr($r['happened_at'], 0, 16), 'user' => $r['user_id'], 'action' => $r['action'], 'type' => $r['type'], 'tid' => $r['tid'], 'name' => $r['name'], 'detail' => (string)$r['detail']];
        }
    }
    return ['categories' => $cats, 'tasks' => $tasks, 'notices' => $notices, 'users' => $users, 'history' => $history];
}

/* ------------------------------------------------------------ 入力の整形・検証 */

function nt_list($v, int $max): array { return is_array($v) ? array_slice(array_values($v), 0, $max) : []; }
function nt_int($v, int $min, int $max): int { return max($min, min($max, (int)$v)); }
function nt_date($v): string { $s = (string)$v; return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : ''; }

/** クライアントから届いた作業を、保存してよい形にそろえる（余計な項目は捨て、長さと型を制限する） */
function normalize_task(array $in, array $orig): array
{
    $ids = [];
    foreach (nt_list($in['files'] ?? [], 100) as $f) {
        $fid = is_array($f) ? (string)($f['fid'] ?? '') : '';
        if ($fid === '') continue;
        if (!preg_match('/^[a-f0-9]{32}$/', $fid)) fail(422, 'ファイルの指定が正しくありません');
        $ids[] = $fid;
    }
    $found = [];
    if ($ids) {
        $q = db()->prepare('SELECT id, orig_name, size, sha256 FROM files WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
        $q->execute($ids);
        foreach ($q->fetchAll() as $r) $found[$r['id']] = $r;
    }
    $files = [];
    $seen = [];
    foreach (nt_list($in['files'] ?? [], 100) as $f) {
        if (!is_array($f)) continue;
        $fid = (string)($f['fid'] ?? '');
        if ($fid !== '') {
            $r = $found[$fid] ?? fail(422, 'アップロードされていないファイルが指定されています');
            $e = ['name' => $r['orig_name'], 'size' => (int)$r['size'], 'desc' => str($f['desc'] ?? '', 500), 'sha' => $r['sha256'], 'fid' => $fid];
        } else {   // 既存のサンプルのファイル情報だけ引き継げる。新しいファイルは、アップロードか取り込みで追加する
            $name = str($f['name'] ?? '', 255);
            $ex = null;
            foreach ($orig['files'] ?? [] as $x) if (empty($x['fid']) && $x['name'] === $name) $ex = $x;
            if (!$ex) fail(422, 'ファイルは、アップロードまたはFTPの取り込みで追加してください');
            $e = ['name' => $ex['name'], 'size' => (int)$ex['size'], 'desc' => str($f['desc'] ?? '', 500), 'sha' => (string)$ex['sha']];
        }
        if (isset($seen[$e['name']])) fail(422, "同じ名前のファイルが2つあります：{$e['name']}");
        $seen[$e['name']] = true;
        $files[] = $e;
    }
    $dev = [];
    foreach (nt_list($in['devices'] ?? [], 50) as $d) if (is_array($d)) $dev[] = ['type' => str($d['type'] ?? '', 100), 'name' => str($d['name'] ?? '', 255), 'model' => str($d['model'] ?? '', 100), 'note' => str($d['note'] ?? '', 255)];
    $bring = [];
    foreach (nt_list($in['bring'] ?? [], 100) as $b) if (is_array($b)) $bring[] = ['name' => str($b['name'] ?? '', 255), 'qty' => str($b['qty'] ?? '', 40), 'required' => !empty($b['required'])];
    $steps = [];
    foreach (nt_list($in['steps'] ?? [], 100) as $s) if (is_array($s)) $steps[] = ['title' => str($s['title'] ?? '', 255), 'body' => str($s['body'] ?? '', 4000), 'caution' => str($s['caution'] ?? '', 1000)];
    $man = [];
    foreach (nt_list($in['manuals'] ?? [], 50) as $m) if (is_array($m)) $man[] = ['kind' => in_array($m['kind'] ?? '', ['PDF', '動画', 'Web'], true) ? $m['kind'] : 'PDF', 'title' => str($m['title'] ?? '', 255), 'meta' => str($m['meta'] ?? '', 100), 'updated' => nt_date($m['updated'] ?? '')];
    return [
        'title' => str($in['title'] ?? '', 255),
        'summary' => str($in['summary'] ?? '', 2000),
        'minutes' => nt_int($in['minutes'] ?? 0, 0, 9999),
        'people' => nt_int($in['people'] ?? 1, 0, 99),
        'industries' => array_values(array_filter(array_map(fn($x) => str($x, 30), nt_list($in['industries'] ?? [], 20)), 'strlen')),
        'tags' => array_values(array_filter(array_map(fn($x) => str($x, 40), nt_list($in['tags'] ?? [], 30)), 'strlen')),
        'version' => str($in['version'] ?? '', 20),
        'os' => str($in['os'] ?? '', 255),
        'devices' => $dev,
        'precheck' => array_map(fn($x) => str($x, 500), nt_list($in['precheck'] ?? [], 100)),
        'bring' => $bring,
        'files' => $files,
        'extractTo' => str($in['extractTo'] ?? '', 255),
        'steps' => $steps,
        'manuals' => $man,
        'changelog' => str($in['changelog'] ?? '', 1000),
        'old' => $orig['old'] ?? [],   // 旧バージョンの記録は、サーバーだけが更新する
    ];
}

function changed_tabs(array $a, array $b): array
{
    $out = [];
    foreach (TAB_GROUPS as $label => $fields) {
        foreach ($fields as $f) if (json_encode($a[$f] ?? null) !== json_encode($b[$f] ?? null)) { $out[] = $label; break; }
    }
    return $out;
}

/** 公開するために入力が足りないタブ */
function missing_tabs(array $t): array
{
    $m = [];
    if (trim((string)$t['title']) === '' || trim((string)$t['summary']) === '') $m[] = '基本情報';
    if (!$t['devices']) $m[] = '対象機器';
    if (count($t['precheck']) + count($t['bring']) === 0) $m[] = '準備・持参品';
    if (!$t['steps']) $m[] = '作業手順';
    return $m;
}

function fetch_task(string $id): ?array
{
    $s = db()->prepare('SELECT * FROM tasks WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch() ?: null;
}

function category_exists(string $id): bool
{
    $s = db()->prepare('SELECT 1 FROM categories WHERE id = ?');
    $s->execute([$id]);
    return (bool)$s->fetchColumn();
}

function next_order(string $cat): int
{
    $s = db()->prepare('SELECT COALESCE(MAX(ord), 0) + 1 FROM tasks WHERE cat = ?');
    $s->execute([$cat]);
    return (int)$s->fetchColumn();
}

function next_task_id(string $cat): string
{
    $base = ['pos' => 1100, 'self' => 2100, 'hotel' => 3100, 'net' => 4100, 'care' => 5100][$cat] ?? 9000;
    $max = $base;
    foreach (db()->query("SELECT id FROM tasks WHERE id LIKE 'WK-%'")->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $n = (int)substr($id, 3);
        if (intdiv($n, 100) === intdiv($base, 100)) $max = max($max, $n);
    }
    $n = $max + 1;
    while (fetch_task("WK-$n")) $n++;
    return "WK-$n";
}

function body_of(array $t): string
{
    foreach (['id', 'cat', 'order', 'status', 'updated', 'review', 'rejected'] as $k) unset($t[$k]);
    return json_encode($t, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function write_task(string $id, string $cat, int $ord, string $status, array $view, $review, $rejected): void
{
    db()->prepare('UPDATE tasks SET cat = ?, ord = ?, status = ?, title = ?, body = ?, review = ?, rejected = ?, updated = ? WHERE id = ?')
        ->execute([$cat, $ord, $status, $view['title'], body_of($view), $review ? json_encode($review, JSON_UNESCAPED_UNICODE) : null, $rejected ? json_encode($rejected, JSON_UNESCAPED_UNICODE) : null, today_d(), $id]);
}

/* ------------------------------------------------------------ 作業 */

function op_task_create(array $u, array $b): array
{
    $cat = str($b['cat'] ?? '', 20);
    if (!category_exists($cat)) fail(422, '大項目が見つかりません');
    $id = next_task_id($cat);
    $blank = ['title' => '新しい作業', 'summary' => '', 'minutes' => 30, 'people' => 1, 'industries' => [], 'tags' => [], 'version' => '1.0', 'os' => '', 'devices' => [], 'precheck' => [], 'bring' => [], 'files' => [], 'extractTo' => 'C:\\Setup\\' . $id, 'steps' => [], 'manuals' => [], 'changelog' => '', 'old' => []];
    db()->prepare('INSERT INTO tasks (id, cat, ord, status, title, body, updated) VALUES (?,?,?,?,?,?,?)')
        ->execute([$id, $cat, next_order($cat), 'draft', $blank['title'], json_encode($blank, JSON_UNESCAPED_UNICODE), today_d()]);
    log_history($u['id'], 'create', 'task', $id, $blank['title'], '下書きとして新規作成');
    return ['id' => $id, 'message' => "小項目 {$id} を下書きで追加しました"];
}

function op_task_duplicate(array $u, array $b): array
{
    $src = fetch_task((string)($b['id'] ?? '')) ?? fail(404, '作業が見つかりません');
    $id = next_task_id($src['cat']);
    $body = json_decode($src['body'], true);
    $body['title'] .= '（コピー）';
    $body['old'] = [];
    $body['extractTo'] = 'C:\\Setup\\' . $id;
    db()->prepare('INSERT INTO tasks (id, cat, ord, status, title, body, updated) VALUES (?,?,?,?,?,?,?)')
        ->execute([$id, $src['cat'], next_order($src['cat']), 'draft', $body['title'], json_encode($body, JSON_UNESCAPED_UNICODE), today_d()]);
    log_history($u['id'], 'create', 'task', $id, $body['title'], "{$src['id']} を複製して下書きを作成");
    return ['id' => $id, 'message' => "{$src['id']} を複製して {$id} を作成しました（下書き）"];
}

function op_task_move(array $u, array $b): array
{
    $t = fetch_task((string)($b['id'] ?? '')) ?? fail(404, '作業が見つかりません');
    $list = db()->prepare('SELECT id FROM tasks WHERE cat = ? ORDER BY ord, id');
    $list->execute([$t['cat']]);
    $ids = $list->fetchAll(PDO::FETCH_COLUMN);
    $i = array_search($t['id'], $ids, true);
    $j = $i + ((int)($b['d'] ?? 0) < 0 ? -1 : 1);
    if ($j >= 0 && $j < count($ids)) { [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]]; }
    foreach ($ids as $k => $id) db()->prepare('UPDATE tasks SET ord = ? WHERE id = ?')->execute([$k + 1, $id]);
    return [];
}

function op_task_save(array $u, array $b): array
{
    $in = $b['task'] ?? null;
    if (!is_array($in)) fail(422, '作業の形式が正しくありません');
    $row = fetch_task((string)($in['id'] ?? '')) ?? fail(404, '作業が見つかりません');
    $orig = task_out($row, true);
    $cat = str($in['cat'] ?? $orig['cat'], 20);
    if (!category_exists($cat)) fail(422, '大項目が見つかりません');
    $status = ($in['status'] ?? '') === 'published' ? 'published' : 'draft';
    $n = normalize_task($in, $orig);
    if ($n['title'] === '') fail(422, '作業名を入力してください');
    $view = $n + ['cat' => $cat];
    if ($status === 'published' && ($miss = missing_tabs($view))) fail(422, '公開するには「' . implode('・', $miss) . '」の入力が必要です。準備中なら公開設定を「下書き」にして保存してください');
    $chg = changed_tabs($orig, $view);
    $chgTxt = $chg ? '（変更箇所：' . implode('、', $chg) . '）' : '';
    $note = str($b['note'] ?? '', 500);
    $reviewing = !empty($b['reviewing']);
    $id = $row['id'];
    $approver = role_lv($u) >= 2;
    $r0 = $orig['review'];
    $ord = $orig['cat'] !== $cat ? next_order($cat) : (int)$orig['order'];
    $name = fn($uid) => (user_by_id((string)$uid)['display_name'] ?? '（削除済み）');
    $msg = '保存しました';

    if ($reviewing && !$r0) fail(409, '承認待ちの申請が見つかりません（すでに処理された可能性があります）');
    if ($approver) {
        $old = $orig['old'] ?? [];
        if ($orig['status'] === 'published' && $status === 'published' && $orig['version'] !== $n['version']) array_unshift($old, ['v' => $orig['version'], 'date' => $orig['updated'], 'reason' => '新しい版の公開により置き換え']);
        $view['old'] = array_slice($old, 0, 50);
        write_task($id, $cat, $ord, $status, $view, $reviewing ? null : $r0, $reviewing ? null : $orig['rejected']);
        if ($reviewing) {
            log_history($u['id'], 'publish', 'task', $id, $view['title'], $name($r0['by']) . 'さんの申請を承認して公開' . $chgTxt . ($orig['version'] !== $n['version'] ? '。版 ' . $orig['version'] . ' → ' . $n['version'] : ''));
            $msg = '承認して公開しました。現場ビューに反映されています';
        } elseif ($orig['status'] !== 'published' && $status === 'published') {
            log_history($u['id'], 'publish', 'task', $id, $view['title'], "公開しました（版 {$n['version']}）");
            $msg = '公開しました。現場ビューに反映されています';
        } elseif ($orig['status'] === 'published' && $status !== 'published') {
            log_history($u['id'], 'update', 'task', $id, $view['title'], '公開を停止（下書きに変更）');
            $msg = '下書きに戻しました。現場には表示されません';
        } else {
            log_history($u['id'], 'update', 'task', $id, $view['title'], $chg ? '内容を更新' . $chgTxt : '更新');
            if ($status === 'published') $msg = '保存しました。現場ビューに反映されています';
        }
    } elseif ($orig['status'] === 'published') {
        if (!$chg) return ['message' => '変更がありません', 'unchanged' => true];
        $snap = $view + ['id' => $id, 'status' => 'published', 'order' => (int)$orig['order'], 'updated' => $orig['updated']];
        $review = ['by' => $u['id'], 'at' => now_dt(), 'note' => $note, 'snapshot' => $snap];
        write_task($id, $orig['cat'], (int)$orig['order'], 'published', $orig, $review, null);   // 公開中の内容はそのまま
        log_history($u['id'], 'request', 'task', $id, $view['title'], '公開中の内容への変更を申請' . $chgTxt . ($note !== '' ? "　メモ：{$note}" : ''));
        $msg = '変更を承認待ちにしました。承認されるまで現場には反映されません';
    } else {
        $review = $status === 'published' ? ['by' => $u['id'], 'at' => now_dt(), 'note' => $note, 'snapshot' => null] : null;
        $view['old'] = $orig['old'] ?? [];
        write_task($id, $cat, $ord, 'draft', $view, $review, null);
        if ($review) { log_history($u['id'], 'request', 'task', $id, $view['title'], '公開を申請' . ($note !== '' ? "　メモ：{$note}" : '')); $msg = '公開を申請しました。承認されると現場に表示されます'; }
        else { log_history($u['id'], 'update', 'task', $id, $view['title'], $chg ? '下書きを更新' . $chgTxt : '下書きを更新'); $msg = '下書きとして保存しました'; }
    }
    return ['message' => $msg, 'id' => $id];
}

function op_task_delete(array $u, array $b): array
{
    $t = fetch_task((string)($b['id'] ?? '')) ?? fail(404, '作業が見つかりません');
    db()->prepare('DELETE FROM tasks WHERE id = ?')->execute([$t['id']]);
    log_history($u['id'], 'delete', 'task', $t['id'], $t['title'], '作業を削除');
    return ['message' => "{$t['id']} を削除しました"];
}

function op_task_reject(array $u, array $b): array
{
    $row = fetch_task((string)($b['id'] ?? '')) ?? fail(404, '作業が見つかりません');
    $review = $row['review'] ? json_decode($row['review'], true) : null;
    if (!$review) fail(409, '承認待ちの申請が見つかりません（すでに処理された可能性があります）');
    $reason = str($b['reason'] ?? '', 500);
    if ($reason === '') fail(422, '差し戻しの理由を入力してください');
    $rej = ['by' => $u['id'], 'to' => $review['by'], 'at' => now_dt(), 'reason' => $reason];
    db()->prepare('UPDATE tasks SET review = NULL, rejected = ? WHERE id = ?')->execute([json_encode($rej, JSON_UNESCAPED_UNICODE), $row['id']]);
    log_history($u['id'], 'reject', 'task', $row['id'], $row['title'], "差し戻し：「{$reason}」（申請者：" . (user_by_id($review['by'])['display_name'] ?? '（削除済み）') . '）');
    return ['message' => '差し戻しました'];
}

/* ------------------------------------------------------------ 大項目 */

function op_cat_create(array $u, array $b): array
{
    $id = new_id('c');
    $ord = (int)db()->query('SELECT COALESCE(MAX(ord), 0) + 1 FROM categories')->fetchColumn();
    db()->prepare('INSERT INTO categories (id, ord, name, icon, descr) VALUES (?,?,?,?,?)')->execute([$id, $ord, '新しい大項目', 'box', '']);
    log_history($u['id'], 'create', 'category', '', '新しい大項目', '大項目を追加');
    return ['id' => $id, 'message' => '大項目を追加しました。名前とアイコンを設定してください'];
}

function op_cat_save(array $u, array $b): array
{
    $c = $b['cat'] ?? null;
    if (!is_array($c)) fail(422, '大項目の形式が正しくありません');
    $s = db()->prepare('SELECT * FROM categories WHERE id = ?');
    $s->execute([(string)($c['id'] ?? '')]);
    $o = $s->fetch() ?: fail(404, '大項目が見つかりません');
    $name = str($c['name'] ?? '', 100);
    if ($name === '') fail(422, '大項目の名前を入力してください');
    $icon = preg_match('/^[a-z]{2,20}$/', (string)($c['icon'] ?? '')) ? $c['icon'] : 'box';
    $desc = str($c['desc'] ?? '', 255);
    $ch = [];
    if ($o['name'] !== $name) $ch[] = "名前「{$o['name']}」→「{$name}」";
    if ($o['descr'] !== $desc) $ch[] = '説明を変更';
    if ($o['icon'] !== $icon) $ch[] = 'アイコンを変更';
    db()->prepare('UPDATE categories SET name = ?, icon = ?, descr = ? WHERE id = ?')->execute([$name, $icon, $desc, $o['id']]);
    if ($ch) log_history($u['id'], 'update', 'category', '', $name, implode('、', $ch));
    return ['message' => '保存しました'];
}

function op_cat_delete(array $u, array $b): array
{
    $s = db()->prepare('SELECT * FROM categories WHERE id = ?');
    $s->execute([(string)($b['id'] ?? '')]);
    $o = $s->fetch() ?: fail(404, '大項目が見つかりません');
    $n = db()->prepare('SELECT COUNT(*) FROM tasks WHERE cat = ?');
    $n->execute([$o['id']]);
    if ((int)$n->fetchColumn() > 0) fail(422, '小項目が残っているため削除できません');
    db()->prepare('DELETE FROM categories WHERE id = ?')->execute([$o['id']]);
    log_history($u['id'], 'delete', 'category', '', $o['name'], '大項目を削除');
    return ['message' => '大項目を削除しました'];
}

/* ------------------------------------------------------------ お知らせ */

function op_notices_save(array $u, array $b): array
{
    $in = $b['notices'] ?? null;
    if (!is_array($in) || count($in) > 200) fail(422, 'お知らせの形式が正しくありません');
    $approver = role_lv($u) >= 2;
    $old = [];
    foreach (db()->query('SELECT * FROM notices')->fetchAll() as $r) $old[$r['id']] = notice_out($r);
    $new = [];
    foreach ($in as $x) {
        if (!is_array($x)) fail(422, 'お知らせの形式が正しくありません');
        $id = preg_match('/^[A-Za-z0-9_-]{2,24}$/', (string)($x['id'] ?? '')) ? $x['id'] : new_id('n');
        $text = str($x['text'] ?? '', 1000);
        if ($text === '') fail(422, '内容が空のお知らせがあります。入力するか、削除してください');
        $n = ['id' => $id, 'date' => nt_date($x['date'] ?? '') ?: today_d(), 'level' => in_array($x['level'] ?? '', ['danger', 'warn', 'accent'], true) ? $x['level'] : 'accent',
            'text' => $text, 'task' => preg_match('/^[A-Za-z0-9_-]{0,20}$/', (string)($x['task'] ?? '')) ? (string)($x['task'] ?? '') : '', 'status' => ($x['status'] ?? '') === 'published' ? 'published' : 'draft', 'until' => nt_date($x['until'] ?? '')];
        if (!$approver) {   // 編集の権限では、公開・公開中のお知らせの変更・削除はできない
            $o = $old[$id] ?? null;
            if ($n['status'] === 'published' && (!$o || $o['status'] !== 'published')) fail(403, 'お知らせを公開できるのは、公開承認の権限を持つ人だけです');
            if ($o && $o['status'] === 'published' && $o != $n) fail(403, '公開中のお知らせを変更できるのは、公開承認の権限を持つ人だけです');
        }
        $new[$id] = $n;
    }
    if (!$approver) foreach ($old as $id => $o) if ($o['status'] === 'published' && !isset($new[$id])) fail(403, '公開中のお知らせを削除できるのは、公開承認の権限を持つ人だけです');

    $short = fn($t) => mb_strlen($t) > 30 ? mb_substr($t, 0, 30) . '…' : $t;
    foreach ($new as $id => $n) {
        $o = $old[$id] ?? null;
        if (!$o) log_history($u['id'], $n['status'] === 'published' ? 'publish' : 'create', 'notice', '', $short($n['text']), $n['status'] === 'published' ? 'お知らせを公開' : '下書きで作成');
        elseif ($o['status'] !== $n['status']) log_history($u['id'], $n['status'] === 'published' ? 'publish' : 'update', 'notice', '', $short($n['text']), $n['status'] === 'published' ? 'お知らせを公開' : 'お知らせの公開を停止');
        elseif ($o != $n) log_history($u['id'], 'update', 'notice', '', $short($n['text']), '内容を更新');
    }
    foreach ($old as $id => $o) if (!isset($new[$id])) log_history($u['id'], 'delete', 'notice', '', $short($o['text']), 'お知らせを削除');

    db()->exec('DELETE FROM notices');
    $ins = db()->prepare('INSERT INTO notices (id, notice_date, lvl, body, task, status, until_date) VALUES (?,?,?,?,?,?,?)');
    foreach ($new as $n) $ins->execute([$n['id'], $n['date'], $n['level'], $n['text'], $n['task'], $n['status'], $n['until'] ?: null]);
    return ['message' => 'お知らせを保存しました'];
}

/* ------------------------------------------------------------ 受け口 */

function run_data_op(string $op): never
{
    require_same_site_write();
    $u = require_role('editor');
    $b = read_json();
    $need = ['task.delete' => 2, 'task.reject' => 2, 'cat.delete' => 2, 'users.save' => 3, 'users.password' => 3];
    if (role_lv($u) < ($need[$op] ?? 1)) fail(403, 'この操作を行う権限がありません');
    $handlers = [
        'task.create' => 'op_task_create', 'task.duplicate' => 'op_task_duplicate', 'task.move' => 'op_task_move', 'task.save' => 'op_task_save',
        'task.delete' => 'op_task_delete', 'task.reject' => 'op_task_reject', 'cat.create' => 'op_cat_create', 'cat.save' => 'op_cat_save',
        'cat.delete' => 'op_cat_delete', 'notices.save' => 'op_notices_save', 'users.save' => 'op_users_save', 'users.password' => 'op_users_password',
    ];
    if (!isset($handlers[$op])) fail(404, '不明な操作です');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $res = $handlers[$op]($u, $b);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    $fresh = user_by_id($u['id']) ?? $u;
    json_out(['ok' => true] + $res + ['data' => bootstrap_payload($fresh)]);
}
