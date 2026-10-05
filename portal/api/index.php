<?php
declare(strict_types=1);

ini_set('display_errors', '0');   // エラーの詳細を画面（JSON）に混ぜない。ログには残る

require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/users.php';
require __DIR__ . '/data.php';
require __DIR__ . '/files.php';
require __DIR__ . '/ext.php';
require __DIR__ . '/logs.php';

/*
 * WorkBase Portal API（health と session 以外は、ログインが必要）
 *   GET  ?r=health                 接続確認
 *   GET  ?r=session                ログイン状態
 *   POST ?r=auth/login | auth/logout | auth/password
 *   GET  ?r=bootstrap              画面に必要なデータ一式（権限に応じて内容が変わる）
 *   POST ?r=data/{op}              作業・大項目・お知らせ・ユーザーの変更（権限はサーバーで判定）
 *   POST ?r=upload/{init|chunk|finish|cancel}  GET ?r=upload/status   ファイルのアップロード（分割・再開）
 *   GET  ?r=files/limits | files/list | files/{id}   POST ?r=files/delete
 *   GET  ?r=ext/list | files/x{id}（FTP のファイル）   POST ?r=ext/save | ext/delete
 *   GET  ?r=logs                   作業記録の一覧・検索  q, from, to, task, user, result, limit, offset
 *   GET  ?r=logs/{id}              作業記録の詳細（添付つき）
 *   POST ?r=logs/save | logs/delete   作業記録の登録・変更・削除（担当者はログインユーザー）
 *   GET  ?r=logs/export            CSV  （一覧と同じ絞り込み）
 */

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
        if ($route === 'files/list' && $method === 'GET') route_file_list();
        if ($route === 'files/delete' && $method === 'POST') route_file_delete();
        if ($route === 'ext/list' && $method === 'GET') route_ext_list();
        if ($route === 'ext/save' && $method === 'POST') route_ext_save();
        if ($route === 'ext/delete' && $method === 'POST') route_ext_delete();
        if (preg_match('#^files/([a-f0-9]{32})$#', $route, $m) && $method === 'GET') route_download($m[1]);
        if (preg_match('#^files/(x[a-f0-9]{12})$#', $route, $m) && $method === 'GET') route_ext_download($m[1]);
        if ($route === 'logs' && $method === 'GET') route_log_list();
        if ($route === 'logs/save' && $method === 'POST') route_log_save();
        if ($route === 'logs/delete' && $method === 'POST') route_log_delete();
        if ($route === 'logs/export' && $method === 'GET') route_log_export();
        if (preg_match('#^logs/(r[a-f0-9]{12})$#', $route, $m) && $method === 'GET') route_log_get($m[1]);

        fail(404, '見つかりません');
    } catch (Throwable $e) {
        error_log('[WorkBase API] ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
        $dbg = !empty($cfg['debug']);
        fail(500, 'サーバーでエラーが発生しました', $dbg ? ['detail' => $e->getMessage()] : []);
    }
}

main();
