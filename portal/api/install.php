<?php
declare(strict_types=1);

/* 初期設定の処理（コマンドラインの migrate.php と、ブラウザの setup.php の両方から使う） */

require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/users.php';
require_once __DIR__ . '/data.php';

const DEFAULT_ADMIN_PASSWORD = 'Welsys@1234';

function install_schema(): void
{
    db(true)->exec((string)file_get_contents(__DIR__ . '/schema.sql'));
}

/** 管理者（admin）を登録する。すでにユーザーがいる場合は何もしない。登録したら true */
function install_admin(string $pw): bool
{
    $pdo = db();
    if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) return false;
    $pdo->prepare('INSERT INTO users (id, username, display_name, dept, role, active, password_hash, must_change) VALUES (?,?,?,?,?,1,?,?)')
        ->execute(['u1', 'admin', '管理者', '', 'admin', password_hash($pw, PASSWORD_DEFAULT), $pw === DEFAULT_ADMIN_PASSWORD ? 1 : 0]);
    return true;
}

/** サンプルの作業データを登録する。登録した作業の数を返す（すでにデータがある場合は -1） */
function install_sample(): int
{
    $pdo = db();
    if ((int)$pdo->query('SELECT COUNT(*) FROM categories')->fetchColumn() > 0) return -1;
    $seed = json_decode((string)file_get_contents(__DIR__ . '/seed.json'), true);
    $pdo->beginTransaction();
    foreach ($seed['categories'] as $c) {
        $pdo->prepare('INSERT INTO categories (id, ord, name, icon, descr) VALUES (?,?,?,?,?)')->execute([$c['id'], $c['order'], $c['name'], $c['icon'], $c['desc']]);
    }
    foreach ($seed['tasks'] as $t) {
        $pdo->prepare('INSERT INTO tasks (id, cat, ord, status, title, body, updated) VALUES (?,?,?,?,?,?,?)')
            ->execute([$t['id'], $t['cat'], $t['order'], $t['status'], $t['title'], body_of($t), $t['updated']]);
    }
    foreach ($seed['notices'] as $n) {
        $pdo->prepare('INSERT INTO notices (id, notice_date, lvl, body, task, status, until_date) VALUES (?,?,?,?,?,?,?)')
            ->execute([$n['id'], $n['date'], $n['level'], $n['text'], $n['task'], $n['status'], $n['until'] ?: null]);
    }
    if (!empty($seed['contacts'])) {
        $pdo->prepare('INSERT INTO settings (k, v, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)')
            ->execute(['contacts', json_encode($seed['contacts'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), date('Y-m-d H:i')]);
    }
    log_history('u1', 'create', 'task', '', 'サンプルの作業データ', '初期データとして ' . count($seed['tasks']) . ' 件の作業を登録');
    $pdo->commit();
    return count($seed['tasks']);
}
