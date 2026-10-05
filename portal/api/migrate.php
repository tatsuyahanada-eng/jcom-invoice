<?php
declare(strict_types=1);

/*
 * 初期設定（コマンドラインからだけ実行できます）
 *   php api/migrate.php                  テーブルを作成し、管理者（admin）とサンプルの作業データを登録
 *   php api/migrate.php --no-sample      サンプルの作業データを入れない（空の状態で始める）
 *   php api/migrate.php --seed           確認用のデモの作業記録を約 40 件追加（本番では使わない）
 *   php api/migrate.php --purge-orphans  どの作業からも使われていない、7日以上前のファイルを削除
 * 管理者のパスワードは、環境変数 WB_ADMIN_PASSWORD または --admin-password=... で指定できます。
 * 指定しない場合は初期パスワード「Welsys@1234」になり、ログイン後に変更するよう案内が出ます。
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/install.php';
require __DIR__ . '/files.php';
require __DIR__ . '/ext.php';
require __DIR__ . '/logs.php';

install_schema();
echo "テーブルを作成しました（または既に存在します）\n";
$pdo = db();

/* 管理者 */
$pw = getenv('WB_ADMIN_PASSWORD') ?: DEFAULT_ADMIN_PASSWORD;
foreach ($argv as $a) if (strpos($a, '--admin-password=') === 0) $pw = substr($a, 17);
if ($err = check_password($pw, 'admin')) { fwrite(STDERR, "管理者のパスワードが使えません：$err\n"); exit(1); }
if (install_admin($pw)) echo "管理者を登録しました（ユーザー名：admin）" . ($pw === DEFAULT_ADMIN_PASSWORD ? "。初期パスワードのため、ログイン後に変更してください" : '') . "\n";
else echo "ユーザーは登録済みです（管理者は追加しません）\n";

/* サンプルの作業データ */
if (!in_array('--no-sample', $argv, true)) {
    $n = install_sample();
    if ($n >= 0) echo "サンプルの作業データを登録しました（{$n} 作業）。サンプルのファイルは実体がないため、ダウンロードできません\n";
}

/* デモの作業記録 */
if (in_array('--seed', $argv, true)) {
    ensure_logs();
    $count = (int)$pdo->query("SELECT COUNT(*) FROM work_logs WHERE id LIKE 'rdemo%'")->fetchColumn();
    if ($count > 0) { echo "デモデータは既に投入済みです（{$count}件）\n"; }
    else {
        mt_srand(42);
        $tasks = $pdo->query("SELECT id, title FROM tasks WHERE status = 'published' ORDER BY id")->fetchAll();
        $places = ['渋谷店（新規）', '新宿西口店', '横浜みなとみらい店', '大宮駅前店', '名古屋栄店', '梅田店', '福岡天神店', 'ホテルグランド東京', '札幌すすきの店'];
        $workers = [['田中 美咲', 'tanaka'], ['鈴木 一郎', 'suzuki'], ['高橋 健', 'takahashi'], ['伊藤 大輔', 'ito']];
        $memos = ['問題なく完了。店長に引き渡し済み。', '回線工事が未完了のため、通信確認は後日。', 'お客様の都合で、当日は未実施。', 'プリンタの設定に時間がかかった。次回は予備を持参する。', ''];
        $ins = $pdo->prepare('INSERT INTO work_logs (id, worked_on, place, task_id, task_title, result, notes, user_id, user_name, username, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        for ($n = 0; $n < 40; $n++) {
            $t = $tasks[mt_rand(0, count($tasks) - 1)];
            [$wn, $wu] = $workers[mt_rand(0, count($workers) - 1)];
            $day = date('Y-m-d', strtotime('-' . mt_rand(0, 120) . ' days'));
            $at = $day . ' ' . sprintf('%02d:%02d:00', mt_rand(9, 18), mt_rand(0, 59));
            $res = ['done', 'done', 'done', 'partial', 'stopped'][mt_rand(0, 4)];
            $ins->execute([sprintf('rdemo%07d', $n + 1), $day, $places[mt_rand(0, count($places) - 1)], $t['id'], $t['title'], $res, $memos[mt_rand(0, count($memos) - 1)], 'demo', $wn, $wu, $at, $at]);
        }
        echo "デモ用の作業記録を 40 件追加しました\n";
    }
}

/* 使われていないファイルの削除 */
if (in_array('--purge-orphans', $argv, true)) {
    $used = [];
    foreach ($pdo->query('SELECT body, review FROM tasks') as $r) {
        preg_match_all('/"fid":"([a-f0-9]{32})"/', $r['body'] . ' ' . $r['review'], $m);
        foreach ($m[1] as $f) $used[$f] = true;
    }
    ensure_logs();   // 作業記録の添付も、使用中として扱う
    foreach ($pdo->query('SELECT file_id FROM work_log_files')->fetchAll(PDO::FETCH_COLUMN) as $f) $used[$f] = true;
    $n = 0;
    foreach ($pdo->query("SELECT id FROM files WHERE uploaded_at < '" . date('Y-m-d H:i:s', strtotime('-7 days')) . "'")->fetchAll(PDO::FETCH_COLUMN) as $id) {
        if (isset($used[$id])) continue;
        @unlink(storage_sub('files') . '/' . $id);
        $pdo->prepare('DELETE FROM files WHERE id = ?')->execute([$id]);
        $n++;
    }
    echo "使われていないファイルを {$n} 件削除しました\n";
}
