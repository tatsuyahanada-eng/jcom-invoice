<?php
/**
 * レシート画像のアップロード。
 *
 * POST { id: "明細ID", thumb: "data:image/jpeg;base64,...", full: "data:image/jpeg;base64,..." }
 *
 * 画像は uploads/<IDの先頭2文字>/<ID>.jpg（拡大用）と <ID>_t.jpg（一覧用）に保存します。
 * 表示はこのファイルを直接参照するため、uploads/ にもディレクトリと同じアクセス制限
 * （Basic認証）がかかっている必要があります。
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    keihi_fail(405, 'POSTのみ受け付けます。');
}

keihi_check_token();

$config = keihi_config();
if (empty($config['store_images'])) {
    keihi_fail(403, '画像の保存は設定で無効になっています（config.php の store_images）。');
}

$maxBytes = (int) $config['max_image_bytes'];
$body = keihi_read_json(($maxBytes * 2) + 65536);

$id = (string) ($body['id'] ?? '');
if (!keihi_valid_id($id)) {
    keihi_fail(400, '明細IDが正しくありません。');
}

/**
 * data URL を検証して生バイト列を取り出す。
 * getimagesizefromstring で本当に画像かを確認し、JPEG/PNG 以外は拒否する。
 */
function keihi_decode_image(?string $dataUrl, int $maxBytes): ?string
{
    if (!is_string($dataUrl) || $dataUrl === '') {
        return null;
    }
    if (!preg_match('#^data:image/(jpeg|png);base64,#', $dataUrl)) {
        keihi_fail(400, '対応していない画像形式です（JPEGまたはPNGのみ）。');
    }
    $base64 = substr($dataUrl, (int) strpos($dataUrl, ',') + 1);
    $bytes = base64_decode($base64, true);
    if ($bytes === false || $bytes === '') {
        keihi_fail(400, '画像を復元できませんでした。');
    }
    if (strlen($bytes) > $maxBytes) {
        keihi_fail(413, '画像のサイズが大きすぎます。');
    }
    $info = @getimagesizefromstring($bytes);
    if ($info === false || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
        keihi_fail(400, '画像として読み取れませんでした。');
    }
    return $bytes;
}

$thumb = keihi_decode_image($body['thumb'] ?? null, $maxBytes);
$full  = keihi_decode_image($body['full'] ?? null, $maxBytes);
if ($thumb === null && $full === null) {
    keihi_fail(400, '画像が含まれていません。');
}

try {
    $dir = dirname(keihi_image_path($id, 'thumb'));
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        keihi_fail(500, 'uploads ディレクトリを作成できませんでした。書き込み権限をご確認ください。');
    }

    $written = [];
    foreach ([['thumb', $thumb], ['full', $full]] as [$kind, $bytes]) {
        if ($bytes === null) {
            continue;
        }
        $path = keihi_image_path($id, $kind);
        // 一時ファイルへ書いてから置き換える（途中で切れた画像を残さない）
        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $bytes, LOCK_EX) === false || !rename($tmp, $path)) {
            @unlink($tmp);
            keihi_fail(500, '画像を保存できませんでした。uploads ディレクトリの書き込み権限をご確認ください。');
        }
        $written[] = $kind;
    }

    $pdo = keihi_db();
    keihi_migrate($pdo);
    $seq = keihi_next_seq($pdo);
    $pdo->prepare('UPDATE receipts SET has_image = 1, server_seq = :seq WHERE id = :id')
        ->execute([':seq' => $seq, ':id' => $id]);

    keihi_ok(['id' => $id, 'written' => $written, 'serverSeq' => $seq]);
} catch (Throwable $e) {
    error_log('[keihi/image] ' . $e->getMessage());
    keihi_fail(500, '画像の保存中にエラーが発生しました。');
}
