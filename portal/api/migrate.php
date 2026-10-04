<?php
declare(strict_types=1);

/*
 * テーブルの作成（と、デモ用データの投入）。コマンドラインからだけ実行できます。
 *   php api/migrate.php           テーブルを作成（すでにある場合は何もしません）
 *   php api/migrate.php --seed    デモ用の作業記録を約 40 件追加（確認用。本番では使わない）
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib.php';

db(true)->exec(file_get_contents(__DIR__ . '/schema.sql'));
echo "テーブルを作成しました（または既に存在します）\n";

if (in_array('--seed', $argv, true)) {
    $pdo = db();
    $count = (int)$pdo->query("SELECT COUNT(*) FROM work_records WHERE id LIKE 'demo-%'")->fetchColumn();
    if ($count > 0) { echo "デモデータは既に投入済みです（{$count}件）\n"; exit; }

    mt_srand(42);
    $tasks = [
        ['WK-1101', 'POSレジ本体 初期セットアップ（飲食店向け）', '5.3', [
            ['bring', 'LANケーブル 3m'], ['bring', '電源タップ（6口・雷ガード付き）'], ['bring', 'レシートロール紙 80mm'],
            ['prep', '店舗の LAN 配線と電源工事が完了している'], ['prep', '店舗コードと端末番号が作業票に記載されている'],
            ['files', 'ダウンロード：pos-image_v5.3.zip'], ['files', 'ハッシュ値が一致することを確認した'], ['files', '指定のフォルダに展開した'],
            ['steps', '機器の設置と配線'], ['steps', 'イメージの適用'], ['steps', 'POSアプリのインストール'], ['steps', 'ドライバの導入'], ['steps', '印字テストとドロア確認'], ['steps', '店舗担当者への引き渡し'],
            ['final', '動作確認を実施した'], ['final', '展開したフォルダと一時ファイルを削除した'], ['final', '作業票に作業ID（WK-1101）と版（5.3）を記入した']]],
        ['WK-2101', 'セルフオーダーKIOSK 設置と初期設定', '3.0', [
            ['bring', 'アンカーボルト M8'], ['bring', 'インパクトドライバ'], ['bring', 'テスト用ICカード'],
            ['prep', 'メニューデータが本部で承認済みになっている'], ['prep', '決済端末の加盟店登録が完了している'],
            ['steps', 'スタンドの組み立てと固定'], ['steps', 'KIOSK アプリのインストール'], ['steps', 'メニューデータの取り込み'], ['steps', '決済端末の連携'], ['steps', 'テスト注文と会計'],
            ['final', '動作確認を実施した'], ['final', '作業票に作業ID（WK-2101）と版（3.0）を記入した']]],
        ['WK-4101', '店舗ルーターの設定と本部VPN接続', '2.6', [
            ['bring', 'LANケーブル 1m'], ['prep', '回線事業者の開通工事が完了している'], ['prep', '店舗ごとの設定ファイルが本部から発行されている'],
            ['steps', 'ファームウェアの確認'], ['steps', '設定ファイルの読み込み'], ['steps', 'VPN と POS 通信の確認'],
            ['final', '動作確認を実施した'], ['final', '作業票に作業ID（WK-4101）と版（2.6）を記入した']]],
    ];
    $places = ['渋谷店（新規）', '新宿西口店', '横浜みなとみらい店', '大宮駅前店', '名古屋栄店', '梅田店', '福岡天神店', 'ホテルグランド東京', '札幌すすきの店'];
    $workers = ['田中 美咲', '鈴木 一郎', '高橋 健', '伊藤 大輔'];
    $reasons = ['お客様の都合で、当日は未実施。後日対応', '部材が届いておらず、持参できなかった', '回線工事が未完了のため、通信確認は後日'];
    $hardToDo = ['作業票に作業ID', '展開したフォルダ', 'ハッシュ値', '店舗担当者への引き渡し', 'レシートロール紙'];   // 抜けやすい項目
    $ins = $pdo->prepare('INSERT INTO work_records (id, task_id, task_title, task_version, place, worker_name, auth_user, completed_at, total_items, done_items, skipped_reason, notes)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    $insI = $pdo->prepare('INSERT INTO work_record_items (record_id, task_id, seq, section, item_key, label, checked) VALUES (?,?,?,?,?,?,?)');
    for ($n = 0; $n < 40; $n++) {
        [$tid, $title, $ver, $items] = $tasks[mt_rand(0, count($tasks) - 1)];
        $day = date('Y-m-d', strtotime('-' . mt_rand(0, 120) . ' days'));
        $at = $day . ' ' . sprintf('%02d:%02d:00', mt_rand(9, 18), mt_rand(0, 59));
        $skip = [];
        foreach ($items as $i => $it) {
            $p = 0.03;
            foreach ($hardToDo as $h) if (mb_strpos($it[1], $h) !== false) $p = 0.25;
            if (mt_rand(0, 1000) / 1000 < $p) $skip[$i] = true;
        }
        $done = count($items) - count($skip);
        $id = sprintf('demo-%03d', $n + 1);
        $ins->execute([$id, $tid, $title, $ver, $places[mt_rand(0, count($places) - 1)], $workers[mt_rand(0, count($workers) - 1)], '', $at,
            count($items), $done, $skip ? $reasons[mt_rand(0, count($reasons) - 1)] : null, mt_rand(0, 4) === 0 ? '店長の立ち会いのもとで実施' : null]);
        foreach ($items as $i => $it) $insI->execute([$id, $tid, $i + 1, $it[0], $it[0] . ':' . $i, $it[1], isset($skip[$i]) ? 0 : 1]);
    }
    echo "デモ用の作業記録を 40 件追加しました\n";
}
