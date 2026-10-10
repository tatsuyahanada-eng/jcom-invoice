<?php
declare(strict_types=1);

/* ユーザーの登録・権限の変更（管理者のみ） */

function user_by_id(string $id): ?array
{
    $s = db()->prepare('SELECT * FROM users WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch() ?: null;
}

function op_users_save(array $me, array $b): array
{
    $in = $b['users'] ?? null;
    if (!is_array($in) || count($in) > 500) fail(422, 'ユーザーの形式が正しくありません');
    $pdo = db();
    $old = [];
    foreach ($pdo->query('SELECT * FROM users')->fetchAll() as $r) $old[$r['id']] = $r;

    $rows = [];
    $names = [];
    foreach ($in as $x) {
        if (!is_array($x)) fail(422, 'ユーザーの形式が正しくありません');
        $id = (string)($x['id'] ?? '');
        $isNew = !isset($old[$id]);
        $name = str($x['name'] ?? '', 100);
        $role = (string)($x['role'] ?? 'viewer');
        if ($name === '') fail(422, '氏名は必須です');
        if ($role === 'approver') $role = 'editor';   // 旧版の「公開承認」は「編集」にまとめた
        if (!in_array($role, ['viewer', 'editor', 'admin'], true)) fail(422, '権限の指定が正しくありません');
        $username = $isNew ? strtolower(str($x['username'] ?? '', 50)) : $old[$id]['username'];
        if ($isNew) {
            if (!preg_match('/^[a-z0-9._-]{3,50}$/', $username)) fail(422, 'ユーザー名は、英数字と . _ - の3〜50文字で入力してください');
            $pw = (string)($x['password'] ?? '');
            if ($err = check_password($pw, $username)) fail(422, "{$name}：" . $err);
            $id = new_id('u');
        }
        if (isset($names[$username])) fail(422, "ユーザー名「{$username}」が重複しています");
        $names[$username] = true;
        $active = !empty($x['active']);
        if (!$isNew && $id === $me['id'] && ($role !== $me['role'] || !$active)) fail(422, '自分自身の権限と状態は変更できません');
        $rows[] = compact('id', 'isNew', 'username', 'name', 'role', 'active') + ['dept' => str($x['dept'] ?? '', 100), 'pw' => $isNew ? $pw : null];
    }
    foreach ($old as $id => $_) {   // ユーザーは削除できない（無効にする）
        if (!in_array($id, array_column($rows, 'id'), true)) fail(422, 'ユーザーは削除できません。無効にしてください');
    }
    if (!array_filter($rows, fn($r) => $r['role'] === 'admin' && $r['active'])) fail(422, '有効な管理者が1人以上必要です');

    foreach ($rows as $r) {
        if ($r['isNew']) {
            $pdo->prepare('INSERT INTO users (id, username, display_name, dept, role, active, password_hash, must_change) VALUES (?,?,?,?,?,?,?,1)')
                ->execute([$r['id'], $r['username'], $r['name'], $r['dept'], $r['role'], $r['active'] ? 1 : 0, password_hash($r['pw'], PASSWORD_DEFAULT)]);
            log_history($me['id'], 'create', 'user', '', $r['name'], 'ユーザーを追加（' . ROLE_LABEL[$r['role']] . '）');
            continue;
        }
        $o = $old[$r['id']];
        $pdo->prepare('UPDATE users SET display_name = ?, dept = ?, role = ?, active = ? WHERE id = ?')
            ->execute([$r['name'], $r['dept'], $r['role'], $r['active'] ? 1 : 0, $r['id']]);
        if ($o['role'] !== $r['role']) log_history($me['id'], 'update', 'user', '', $r['name'], '権限を変更：' . ROLE_LABEL[$o['role']] . ' → ' . ROLE_LABEL[$r['role']]);
        if ((bool)$o['active'] !== $r['active']) log_history($me['id'], 'update', 'user', '', $r['name'], $r['active'] ? 'ユーザーを有効にしました' : 'ユーザーを無効にしました');
        if ($o['display_name'] !== $r['name'] || $o['dept'] !== $r['dept']) log_history($me['id'], 'update', 'user', '', $r['name'], '登録情報を変更');
    }
    return ['message' => 'ユーザー情報を保存しました'];
}

/** 管理者が、他のユーザーのパスワードを再設定する（次回ログイン後に変更を促す） */
function op_users_password(array $me, array $b): array
{
    $u = user_by_id((string)($b['id'] ?? ''));
    if (!$u) fail(404, 'ユーザーが見つかりません');
    $pw = (string)($b['password'] ?? '');
    if ($err = check_password($pw, $u['username'])) fail(422, $err);
    db()->prepare('UPDATE users SET password_hash = ?, must_change = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id'] === $me['id'] ? 0 : 1, $u['id']]);
    log_history($me['id'], 'update', 'user', '', $u['display_name'], 'パスワードを再設定');
    return ['message' => 'パスワードを再設定しました'];
}
