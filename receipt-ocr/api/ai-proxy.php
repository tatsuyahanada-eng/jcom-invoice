<?php
/**
 * AI解析の中継（任意）
 *
 * APIキーをブラウザに置かずに済ませるための最小プロキシです。
 * ブラウザ -> このファイル -> Anthropic API と中継し、キーはサーバー上だけに置きます。
 *
 * 設置手順:
 *   1. api/config.php を作成し、次の1行を書く（このファイルは公開しないこと）
 *        <?php return ['api_key' => 'sk-ant-...'];
 *      もしくはサーバーの環境変数 ANTHROPIC_API_KEY を設定する
 *   2. 同じディレクトリの .htaccess で config.php と data/ を保護する（同梱済み）
 *   3. アプリの「設定 > 読み取りエンジン」で「AI解析」＋「サーバー経由」を選ぶ
 *
 * 注意: 誰でも叩けるURLになるため、必ずディレクトリにBasic認証をかけてください。
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MAX_BODY_BYTES = 12 * 1024 * 1024;   // 画像を含むので少し大きめ
const ALLOWED_MODELS = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1'];
const UPSTREAM = 'https://api.anthropic.com/v1/messages';

function fail(int $status, string $message): void {
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'POSTのみ受け付けます');
}

$apiKey = getenv('ANTHROPIC_API_KEY') ?: '';
if ($apiKey === '' && is_file(__DIR__ . '/config.php')) {
    $config = require __DIR__ . '/config.php';
    $apiKey = is_array($config) ? (string)($config['api_key'] ?? '') : '';
}
if ($apiKey === '') {
    fail(500, 'サーバーにAPIキーが設定されていません（api/config.php または環境変数 ANTHROPIC_API_KEY）');
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
    fail(413, 'リクエストが大きすぎます');
}

$body = json_decode($raw, true);
if (!is_array($body) || !isset($body['messages'])) {
    fail(400, 'リクエストの形式が正しくありません');
}

// 中継するのは「このアプリが送る形」だけに限定する
$model = (string)($body['model'] ?? 'claude-sonnet-5');
if (!in_array($model, ALLOWED_MODELS, true)) {
    fail(400, '許可されていないモデルです');
}
$payload = json_encode([
    'model'      => $model,
    'max_tokens' => min(4096, max(64, (int)($body['max_tokens'] ?? 1024))),
    'messages'   => $body['messages'],
], JSON_UNESCAPED_UNICODE);

$ch = curl_init(UPSTREAM);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_HTTPHEADER     => [
        'content-type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
]);
$response = curl_exec($ch);
if ($response === false) {
    $err = curl_error($ch);
    curl_close($ch);
    error_log('[ai-proxy.php] ' . $err);
    fail(502, 'AIサービスに接続できませんでした');
}
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($status);
echo $response;
