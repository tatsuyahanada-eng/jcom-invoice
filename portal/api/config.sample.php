<?php
// このファイルを config.php という名前でコピーし、接続情報を書き換えてください。
// config.php は Git に含めず、Web から読めないようにしてあります（api/.htaccess）。
// 環境変数 WB_DB_HOST / WB_DB_PORT / WB_DB_NAME / WB_DB_USER / WB_DB_PASS でも指定できます。
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'workbase',
        'user' => 'workbase',
        'pass' => 'change-me',
    ],
    'timezone' => 'Asia/Tokyo',
    // true にすると、エラーの詳細を画面に返します。本番では false のままにしてください。
    'debug' => false,
];
