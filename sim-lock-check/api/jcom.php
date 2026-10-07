<?php
/* J:COMチェッカー差分確認API（管理者専用）
   POST (JSON)  { "action":"check"|"apply", "password":"管理者パスワード", ... }
   ・check : J:COMのページを取得して機種一覧を抽出し、保存済みスナップショット(data/jcom_snapshot.json)との差分を返す
   ・apply : ブラウザで照合した結果（jcom_ref.js の中身とスナップショット）をサーバーに保存する（変更前はバックアップ）
   ※ data/ フォルダと jcom_ref.js はPHPから書き込める権限（例：755/644＋所有者がPHP実行ユーザー）が必要 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
const ADMIN_USER = 'admin';
const ADMIN_HASH = '82e4b91688eae1b2691a29549d5b8b28a590a6303ad543637ffce0544296a5e3';   // sha256('psc-v1:admin:パスワード')
const JCOM_URL = 'https://www.jcom.co.jp/service/mobile/device/sim/detail/device.html';
$root = dirname(__DIR__);
$snapFile = $root . '/data/jcom_snapshot.json';
$refFile = $root . '/jcom_ref.js';

function out($arr, $code = 200) { http_response_code($code); echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'error' => 'POSTで呼び出してください'], 405);
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) out(['ok' => false, 'error' => 'リクエストが不正です'], 400);
usleep(300000);   // 総当たり対策の待ち
if (!hash_equals(ADMIN_HASH, hash('sha256', 'psc-v1:' . ADMIN_USER . ':' . ($in['password'] ?? '')))) out(['ok' => false, 'error' => '管理者パスワードが違います'], 403);

function fetch_jcom() {
  $ctx = stream_context_create(['http' => ['timeout' => 40, 'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36\r\nAccept-Language: ja\r\n"]]);
  $html = null;
  if (function_exists('curl_init')) {
    $ch = curl_init(JCOM_URL);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 40, CURLOPT_ENCODING => '', CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36']);
    $html = curl_exec($ch); curl_close($ch);
  }
  if (!$html) $html = @file_get_contents(JCOM_URL, false, $ctx);
  return $html;
}
function txt($s) { return trim(html_entity_decode(strip_tags($s), ENT_QUOTES | ENT_HTML5, 'UTF-8')); }
function extract_devices($html) {
  $out = [];
  preg_match_all('/<details\s+data-category="([^"]*)"\s+data-maker="([^"]*)"\s+data-type="([^"]*)"\s+data-esim="([^"]*)".*?<summary[^>]*>(.*?)<\/summary>(.*?)<\/details>/s', $html, $m, PREG_SET_ORDER);
  foreach ($m as $x) {
    $body = $x[6];
    $li = function ($k) use ($body) { return preg_match('/<span class="fw-bold">' . $k . '\s*:<\/span>(.*?)<\/li>/s', $body, $y) ? txt($y[1]) : ''; };
    preg_match_all('/<td[^>]*>(.*?)<\/td>/s', $body, $td);
    preg_match_all('/<ul class="list-note">(.*?)<\/ul>/s', $body, $nt);
    $out[] = ['cat' => $x[1], 'maker' => $x[2], 'type' => $x[3], 'esim' => $x[4], 'name' => txt($x[5]), 'sim' => $li('対応SIM'), 'os' => $li('OSバージョン'), 'unlock' => $li('SIMロック解除'),
              'func' => array_map('txt', array_slice($td[1], 0, 4)), 'note' => trim(implode(' ', array_filter(array_map('txt', $nt[1]))))];
  }
  return $out;
}
function key_of($o) { return $o['cat'] . "\x01" . $o['name']; }

$action = $in['action'] ?? '';
if ($action === 'check') {
  $html = fetch_jcom();
  if (!$html) out(['ok' => false, 'error' => 'J:COMのページを取得できませんでした（サーバーから外部へ接続できない可能性）'], 502);
  $new = extract_devices($html);
  if (count($new) < 1000) out(['ok' => false, 'error' => '機種数が少なすぎます（' . count($new) . '件）。J:COM側のページ構成が変わった可能性があります'], 502);
  $old = is_file($snapFile) ? (json_decode(file_get_contents($snapFile), true) ?: []) : [];
  $O = []; foreach ($old as $o) $O[key_of($o)] = $o;
  $N = []; foreach ($new as $o) $N[key_of($o)] = $o;
  $added = []; $removed = []; $changed = [];
  foreach ($N as $k => $o) { if (!isset($O[$k])) $added[] = ['cat' => $o['cat'], 'name' => $o['name'], 'unlock' => $o['unlock']]; elseif ($O[$k]['unlock'] !== $o['unlock']) $changed[] = ['cat' => $o['cat'], 'name' => $o['name'], 'from' => $O[$k]['unlock'], 'to' => $o['unlock']]; }
  foreach ($O as $k => $o) if (!isset($N[$k])) $removed[] = ['cat' => $o['cat'], 'name' => $o['name'], 'unlock' => $o['unlock']];
  out(['ok' => true, 'checkedAt' => date('Y-m-d'), 'total' => count($new), 'prevTotal' => count($old), 'added' => $added, 'removed' => $removed, 'changed' => $changed, 'snapshot' => $new]);
}
if ($action === 'apply') {
  $ref = $in['refJs'] ?? ''; $snap = $in['snapshot'] ?? null;
  if (!is_string($ref) || strpos($ref, 'const JCOM_REF_DATE') === false || strpos($ref, 'const JCOM_REF = ') === false || strlen($ref) > 3000000) out(['ok' => false, 'error' => '保存内容が不正です'], 400);
  if (!is_array($snap) || count($snap) < 1000) out(['ok' => false, 'error' => 'スナップショットが不正です'], 400);
  if (!is_dir($root . '/data')) @mkdir($root . '/data', 0755, true);
  $stamp = date('Ymd-His');
  if (is_file($refFile)) @copy($refFile, $root . '/data/jcom_ref.' . $stamp . '.bak.js');
  if (is_file($snapFile)) @copy($snapFile, $root . '/data/jcom_snapshot.' . $stamp . '.bak.json');
  $a = @file_put_contents($refFile, $ref, LOCK_EX);
  $b = @file_put_contents($snapFile, json_encode($snap, JSON_UNESCAPED_UNICODE), LOCK_EX);
  if ($a === false || $b === false) out(['ok' => false, 'error' => 'サーバーに書き込めません（jcom_ref.js と data/ フォルダの書き込み権限を確認してください）'], 500);
  foreach (glob($root . '/data/*.bak.*') ?: [] as $i => $f) { if (count(glob($root . '/data/*.bak.*')) > 20) @unlink($f); }   // バックアップは新しい20件ほどに
  out(['ok' => true, 'savedAt' => date('c')]);
}
out(['ok' => false, 'error' => '不明な操作です'], 400);
