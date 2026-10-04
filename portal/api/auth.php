<?php
declare(strict_types=1);

/* ログイン・ログアウト・パスワード変更 */

function route_session(): never
{
    if (!config_ready()) json_out(['ok' => true, 'authenticated' => false, 'setupNeeded' => true]);   // 初期設定がまだ
    try { db(); } catch (Throwable $e) { error_log('[WorkBase] DB: ' . $e->getMessage()); json_out(['ok' => true, 'authenticated' => false, 'dbError' => true]); }
    $u = current_user();
    json_out(['ok' => true, 'authenticated' => (bool)$u, 'user' => $u ? public_user($u) : null]);
}

function route_login(): never
{
    require_same_site_write();
    $b = read_json(4096);
    $username = strtolower(str($b['username'] ?? '', 50));
    $pw = (string)($b['password'] ?? '');
    if ($username === '' || $pw === '' || strlen($pw) > 256) fail(422, 'ユーザー名とパスワードを入力してください');
    throttle_check($username);

    $s = db()->prepare('SELECT * FROM users WHERE username = ?');
    $s->execute([$username]);
    $u = $s->fetch();
    // ユーザーが存在しない場合も同じだけ時間をかけ、存在の有無を推測されないようにする
    $ok = $u ? password_verify($pw, $u['password_hash']) : (password_verify($pw, password_hash('dummy-password', PASSWORD_DEFAULT)) && false);
    if (!$u || !$ok || !$u['active']) {
        throttle_fail($username);
        usleep(250000);
        fail(401, 'ユーザー名またはパスワードが違います');
    }
    throttle_clear($username);
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    }
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = $u['id'];
    $_SESSION['seen'] = time();
    db()->prepare('UPDATE users SET last_login = ? WHERE id = ?')->execute([date('Y-m-d H:i:s'), $u['id']]);
    $s = db()->prepare('SELECT * FROM users WHERE id = ?');
    $s->execute([$u['id']]);
    json_out(['ok' => true, 'user' => public_user($s->fetch())]);
}

function route_logout(): never
{
    require_same_site_write();
    destroy_session();
    json_out(['ok' => true]);
}

function route_password(): never
{
    require_same_site_write();
    $u = require_login();
    $b = read_json(4096);
    $cur = (string)($b['current'] ?? '');
    $new = (string)($b['new'] ?? '');
    if (!password_verify($cur, $u['password_hash'])) fail(422, '現在のパスワードが違います');
    if ($err = check_password($new, $u['username'])) fail(422, $err);
    if ($new === $cur) fail(422, '現在と同じパスワードは使えません');
    db()->prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    session_regenerate_id(true);
    json_out(['ok' => true]);
}
