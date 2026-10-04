-- WorkBase Portal: チェックシートの作業記録
-- MySQL 5.7+ / 8.x、MariaDB 10.3+ で動作します。文字コードは utf8mb4。
-- 実行: php api/migrate.php   （または phpMyAdmin などでこのファイルをそのまま実行）

CREATE TABLE IF NOT EXISTS work_records (
  id             VARCHAR(40)       NOT NULL COMMENT '端末で採番した記録ID（再送しても二重登録されない）',
  task_id        VARCHAR(20)       NOT NULL COMMENT '作業ID（例：WK-1101）',
  task_title     VARCHAR(255)      NOT NULL COMMENT '記録時点の作業名',
  task_version   VARCHAR(20)       NOT NULL DEFAULT '' COMMENT '記録時点の版',
  place          VARCHAR(255)      NOT NULL DEFAULT '' COMMENT '店舗・案件名',
  worker_name    VARCHAR(100)      NOT NULL DEFAULT '' COMMENT '作業者（画面で入力）',
  auth_user      VARCHAR(100)      NOT NULL DEFAULT '' COMMENT 'ログインユーザー（Basic認証など。サーバーが記録）',
  completed_at   DATETIME          NOT NULL COMMENT '作業完了日時（日本時間）',
  total_items    SMALLINT UNSIGNED NOT NULL,
  done_items     SMALLINT UNSIGNED NOT NULL,
  skipped_reason TEXT              NULL COMMENT '未完了のまま記録した理由',
  notes          TEXT              NULL COMMENT '備考',
  created_at     TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'サーバーに届いた日時',
  PRIMARY KEY (id),
  KEY idx_completed (completed_at),
  KEY idx_task (task_id, completed_at),
  KEY idx_place (place),
  KEY idx_worker (worker_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_record_items (
  id         BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  record_id  VARCHAR(40)       NOT NULL,
  task_id    VARCHAR(20)       NOT NULL COMMENT '集計用（work_records.task_id の複製）',
  seq        SMALLINT UNSIGNED NOT NULL COMMENT 'チェックシート上の並び順',
  section    VARCHAR(40)       NOT NULL COMMENT 'bring / prep / files / steps / final',
  item_key   VARCHAR(255)      NOT NULL COMMENT '項目の識別子（例：steps:2）',
  label      VARCHAR(500)      NOT NULL COMMENT '記録時点の項目名',
  checked    TINYINT(1)        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_record (record_id, seq),
  KEY idx_missed (task_id, checked, item_key(100)),
  CONSTRAINT fk_items_record FOREIGN KEY (record_id) REFERENCES work_records (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
