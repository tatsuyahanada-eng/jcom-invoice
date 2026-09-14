<?php
/**
 * 設置状況の確認ページ。
 * ブラウザで  https://（あなたのサイト）/receipt-ocr/api/setup.php  を開いてください。
 * 必要なテーブルが無ければ、このページを開いた時点で自動的に作成します。
 */

declare(strict_types=1);

$checks = [];
$fatal = null;

function check(string $label, bool $ok, string $detail = '', bool $warnOnly = false): array
{
    return ['label' => $label, 'ok' => $ok, 'detail' => $detail, 'warn' => $warnOnly];
}

$checks[] = check('PHP バージョン 8.0 以上', PHP_VERSION_ID >= 80000, 'この環境: PHP ' . PHP_VERSION);
$checks[] = check('PDO MySQL 拡張', extension_loaded('pdo_mysql'),
    extension_loaded('pdo_mysql') ? '' : 'レンタルサーバーの管理画面でPHPの拡張を有効にしてください。');
$checks[] = check('mbstring 拡張', extension_loaded('mbstring'));
$checks[] = check('GD 拡張（画像の検証に使用）', extension_loaded('gd'), '', true);

$configPath = __DIR__ . '/config.php';
$hasConfig = is_file($configPath);
$checks[] = check('api/config.php が存在する', $hasConfig,
    $hasConfig ? '' : 'api/config.sample.php をコピーして config.php を作り、MySQLの接続情報を書いてください。');

$uploadDir = __DIR__ . '/uploads';
if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0755, true);
}
$checks[] = check('api/uploads/ に書き込みできる', is_dir($uploadDir) && is_writable($uploadDir),
    'レシート画像の共有に使います。書き込みできない場合はパーミッションを 755（または 705）にしてください。', true);

$tableInfo = null;
if ($hasConfig && extension_loaded('pdo_mysql')) {
    try {
        require __DIR__ . '/db.php';
        $config = keihi_config();
        $checks[] = check('接続情報が入力されている',
            $config['db_name'] !== '' && $config['db_user'] !== '',
            'config.php の db_name / db_user / db_password を設定してください。');

        if ($config['db_name'] !== '' && $config['db_user'] !== '') {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                $config['db_host'], (int) $config['db_port'], $config['db_name']);
            $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $checks[] = check('MySQL に接続できた', true,
                'サーバー: ' . $pdo->getAttribute(PDO::ATTR_SERVER_VERSION));

            keihi_migrate($pdo);
            $checks[] = check('テーブルを作成・確認した', true, 'receipts / sync_state');

            $tableInfo = [
                'total'   => (int) $pdo->query('SELECT COUNT(*) FROM receipts WHERE deleted = 0')->fetchColumn(),
                'deleted' => (int) $pdo->query('SELECT COUNT(*) FROM receipts WHERE deleted = 1')->fetchColumn(),
                'seq'     => keihi_current_seq($pdo),
                'months'  => $pdo->query("SELECT DATE_FORMAT(`date`, '%Y-%m') AS m, COUNT(*) c, SUM(amount) s
                                          FROM receipts WHERE deleted = 0 AND `date` IS NOT NULL
                                          GROUP BY m ORDER BY m DESC LIMIT 12")->fetchAll(),
            ];
            $checks[] = check('合言葉（access_token）', true,
                $config['access_token'] === '' ? '未設定（Basic認証で保護してください）' : '設定済み', true);
        }
    } catch (Throwable $e) {
        $fatal = $e->getMessage();
        $checks[] = check('MySQL に接続できた', false, $e->getMessage());
    }
}

$allOk = true;
foreach ($checks as $c) {
    if (!$c['ok'] && !$c['warn']) {
        $allOk = false;
    }
}
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>設置状況の確認 — 交通費レシート読み取り</title>
<style>
  body { font-family: system-ui, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
         background: #eaf2fb; color: #1f2b3a; margin: 0; padding: 24px 16px 60px; line-height: 1.7; }
  .wrap { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 20px; }
  .card { background: #fff; border: 1px solid #a8c4dd; border-radius: 10px; padding: 18px; margin-bottom: 16px; }
  .banner { padding: 14px 16px; border-radius: 10px; font-weight: 700; margin-bottom: 16px; }
  .banner.ok { background: #e8f7f0; border: 1px solid #8fd0b0; color: #10633f; }
  .banner.ng { background: #fdeef1; border: 1px solid #eaa7b4; color: #9c2439; }
  ul.checks { list-style: none; padding: 0; margin: 0; }
  ul.checks li { padding: 7px 0; border-bottom: 1px solid #e3edf7; display: flex; gap: 10px; align-items: baseline; }
  ul.checks li:last-child { border-bottom: 0; }
  .mark { font-weight: 700; width: 1.6em; flex: 0 0 auto; }
  .ok .mark { color: #1a8f5f; } .ng .mark { color: #d6435f; } .warn .mark { color: #b3730a; }
  .detail { color: #5e7081; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border-bottom: 1px solid #e3edf7; padding: 6px 8px; text-align: left; }
  td.num, th.num { text-align: right; }
  code { background: #eaf2fb; padding: 1px 5px; border-radius: 4px; }
  ol li { margin-bottom: 6px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>設置状況の確認</h1>

  <div class="banner <?= $allOk ? 'ok' : 'ng' ?>">
    <?= $allOk ? '✓ 準備できています。アプリを開いて「設定 → サーバー」で同期をオンにしてください。'
               : '✗ あと少しです。下の「✗」の項目を直してから、このページを再読み込みしてください。' ?>
  </div>

  <div class="card">
    <ul class="checks">
      <?php foreach ($checks as $c): ?>
        <li class="<?= $c['ok'] ? 'ok' : ($c['warn'] ? 'warn' : 'ng') ?>">
          <span class="mark"><?= $c['ok'] ? '✓' : ($c['warn'] ? '△' : '✗') ?></span>
          <span>
            <?= htmlspecialchars($c['label'], ENT_QUOTES, 'UTF-8') ?>
            <?php if ($c['detail'] !== ''): ?>
              <br><span class="detail"><?= htmlspecialchars($c['detail'], ENT_QUOTES, 'UTF-8') ?></span>
            <?php endif; ?>
          </span>
        </li>
      <?php endforeach; ?>
    </ul>
  </div>

  <?php if ($tableInfo !== null): ?>
    <div class="card">
      <h2 style="font-size:15px;margin-top:0">保存されているデータ</h2>
      <p>明細 <strong><?= $tableInfo['total'] ?></strong> 件（削除済み <?= $tableInfo['deleted'] ?> 件）／同期カーソル <?= $tableInfo['seq'] ?></p>
      <?php if ($tableInfo['months']): ?>
        <table>
          <thead><tr><th>月</th><th class="num">件数</th><th class="num">合計</th></tr></thead>
          <tbody>
          <?php foreach ($tableInfo['months'] as $m): ?>
            <tr>
              <td><?= htmlspecialchars((string) $m['m'], ENT_QUOTES, 'UTF-8') ?></td>
              <td class="num"><?= (int) $m['c'] ?></td>
              <td class="num">&yen;<?= number_format((int) $m['s']) ?></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      <?php endif; ?>
    </div>
  <?php endif; ?>

  <div class="card">
    <h2 style="font-size:15px;margin-top:0">設置手順</h2>
    <ol>
      <li>レンタルサーバーの管理画面で <strong>MySQLデータベースとユーザーを1つ作成</strong>します
          （文字コードは <code>utf8mb4</code> を選んでください）。</li>
      <li><code>api/config.sample.php</code> をコピーして <code>api/config.php</code> を作り、
          手順1で控えた <strong>ホスト名・データベース名・ユーザー名・パスワード</strong> を書き込みます。</li>
      <li>このページを再読み込みします。テーブルが自動で作成されます
          （手動で作る場合は <code>api/schema.sql</code> を phpMyAdmin で実行してください）。</li>
      <li>アプリを開き、<strong>設定 → サーバー</strong> で「サーバーと同期する」をオンにし、
          担当者名を入力します。PCとスマホの両方で同じ設定にすれば、データが共有されます。</li>
      <li><strong>このディレクトリにBasic認証をかけてください。</strong>
          認証がないと、URLを知っている人が誰でもデータを読み書きできます。</li>
    </ol>
  </div>
</div>
</body>
</html>
