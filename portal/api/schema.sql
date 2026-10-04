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


-- ---------------------------------------------------------------- ユーザー・認証
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(20)  NOT NULL,
  username      VARCHAR(50)  NOT NULL COMMENT 'ログインID（大文字小文字は区別しない）',
  display_name  VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL DEFAULT '',
  dept          VARCHAR(100) NOT NULL DEFAULT '',
  role          VARCHAR(10)  NOT NULL DEFAULT 'viewer' COMMENT 'viewer / editor / approver / admin',
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  password_hash VARCHAR(255) NOT NULL,
  must_change   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '初期パスワードのまま',
  last_login    DATETIME     NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_username (username),
  KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username    VARCHAR(50)     NOT NULL,
  ip          VARCHAR(45)     NOT NULL,
  happened_at DATETIME        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_user (username, happened_at),
  KEY idx_ip (ip, happened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- 作業マスタ
CREATE TABLE IF NOT EXISTS categories (
  id    VARCHAR(20)  NOT NULL,
  ord   INT          NOT NULL DEFAULT 0,
  name  VARCHAR(100) NOT NULL,
  icon  VARCHAR(20)  NOT NULL DEFAULT 'box',
  descr VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id       VARCHAR(20)  NOT NULL COMMENT '作業ID（例：WK-1101）',
  cat      VARCHAR(20)  NOT NULL,
  ord      INT          NOT NULL DEFAULT 0,
  status   VARCHAR(12)  NOT NULL DEFAULT 'draft' COMMENT 'draft / published',
  title    VARCHAR(255) NOT NULL,
  body     MEDIUMTEXT   NOT NULL COMMENT '機器・準備・ファイル・手順・マニュアルなど（JSON）',
  review   MEDIUMTEXT   NULL COMMENT '承認待ちの申請（JSON）',
  rejected TEXT         NULL COMMENT '直近の差し戻し（JSON）',
  updated  DATE         NOT NULL,
  PRIMARY KEY (id),
  KEY idx_cat (cat, ord),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notices (
  id          VARCHAR(24)   NOT NULL,
  notice_date DATE          NOT NULL,
  lvl         VARCHAR(10)   NOT NULL DEFAULT 'accent',
  body        VARCHAR(1000) NOT NULL,
  task        VARCHAR(20)   NOT NULL DEFAULT '',
  status      VARCHAR(12)   NOT NULL DEFAULT 'draft',
  until_date  DATE          NULL,
  PRIMARY KEY (id),
  KEY idx_status (status, notice_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  k          VARCHAR(50)  NOT NULL,
  v          MEDIUMTEXT   NOT NULL,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS history (
  id          VARCHAR(24)  NOT NULL,
  happened_at DATETIME     NOT NULL,
  user_id     VARCHAR(20)  NOT NULL,
  action      VARCHAR(12)  NOT NULL,
  type        VARCHAR(12)  NOT NULL,
  tid         VARCHAR(20)  NOT NULL DEFAULT '',
  name        VARCHAR(255) NOT NULL DEFAULT '',
  detail      TEXT         NULL,
  PRIMARY KEY (id),
  KEY idx_at (happened_at),
  KEY idx_tid (tid, happened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- ダウンロード用ファイル
CREATE TABLE IF NOT EXISTS files (
  id          CHAR(32)        NOT NULL COMMENT 'ランダムなID。実ファイルは storage/files/<id> に保存',
  orig_name   VARCHAR(255)    NOT NULL,
  size        BIGINT UNSIGNED NOT NULL,
  sha256      CHAR(64)        NOT NULL,
  uploaded_by VARCHAR(20)     NOT NULL,
  uploaded_at DATETIME        NOT NULL,
  source      VARCHAR(10)     NOT NULL DEFAULT 'browser' COMMENT 'browser / ftp',
  PRIMARY KEY (id),
  KEY idx_uploaded (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
