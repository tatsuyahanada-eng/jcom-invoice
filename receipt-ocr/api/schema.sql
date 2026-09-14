-- 交通費レシート読み取り — MySQL テーブル定義
--
-- 通常は api/setup.php を開けば自動で作成されます。
-- phpMyAdmin から手動で作りたい場合は、対象のデータベースを選んで
-- このファイルの内容を「SQL」タブに貼り付けて実行してください。

CREATE TABLE IF NOT EXISTS receipts (
  id                VARCHAR(64)  NOT NULL COMMENT '明細ID（端末側で採番するUUID）',
  staff             VARCHAR(60)  NOT NULL DEFAULT '' COMMENT '担当者',
  `date`            DATE         NULL     COMMENT '利用日',
  `time`            VARCHAR(5)   NOT NULL DEFAULT '' COMMENT '利用時刻 HH:MM',
  `type`            VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '種別（駐車場・高速など）',
  `name`            VARCHAR(160) NOT NULL DEFAULT '' COMMENT '駐車場名・経路',
  amount            INT          NOT NULL DEFAULT 0  COMMENT '金額（税込・円）',
  note              VARCHAR(400) NOT NULL DEFAULT '' COMMENT 'メモ',
  source            VARCHAR(40)  NOT NULL DEFAULT '' COMMENT '読取方法',
  confidence        TEXT         NULL     COMMENT '項目ごとの読み取り信頼度（JSON）',
  raw_text          TEXT         NULL     COMMENT 'OCRの生テキスト',
  has_image         TINYINT(1)   NOT NULL DEFAULT 0  COMMENT 'レシート画像の有無',
  deleted           TINYINT(1)   NOT NULL DEFAULT 0  COMMENT '削除フラグ（他端末へ削除を伝えるため行は残す）',
  client_updated_at BIGINT       NOT NULL DEFAULT 0  COMMENT '端末側の更新時刻（ミリ秒）。競合時はこれが新しい方を採用',
  server_seq        BIGINT       NOT NULL DEFAULT 0  COMMENT 'サーバー側の同期カーソル',
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_seq (server_seq),
  KEY idx_date (`date`),
  KEY idx_staff_date (staff, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_state (
  k VARCHAR(32) NOT NULL,
  v BIGINT      NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sync_state (k, v) VALUES ('seq', 0);
