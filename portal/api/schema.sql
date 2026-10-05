-- WorkBase Portal
-- MySQL 5.7+ / 8.x、MariaDB 10.3+ で動作します。文字コードは utf8mb4。
-- 実行: php api/migrate.php   （または phpMyAdmin などでこのファイルをそのまま実行）

-- 作業記録：いつ・誰が・どの店舗で・どんな作業をしたか、その結果。添付（報告書の写真・PDF）は work_log_files
CREATE TABLE IF NOT EXISTS work_logs (
  id         VARCHAR(24)  NOT NULL,
  worked_on  DATE         NOT NULL COMMENT '作業日',
  place      VARCHAR(200) NOT NULL COMMENT '店舗名',
  task_id    VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '作業ID（作業を選んだとき）',
  task_title VARCHAR(255) NOT NULL COMMENT '作業名（記録時点。選ばずに入力した内容も入る）',
  result     VARCHAR(10)  NOT NULL DEFAULT 'done' COMMENT 'done 完了 / partial 一部未完了 / stopped 中止',
  notes      TEXT         NOT NULL,
  user_id    VARCHAR(24)  NOT NULL COMMENT '記録したユーザー（ログインユーザー）',
  user_name  VARCHAR(100) NOT NULL COMMENT '記録時点の名前',
  username   VARCHAR(50)  NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_date (worked_on, created_at),
  KEY idx_place (place(100)),
  KEY idx_user (user_id),
  KEY idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_log_files (
  log_id  VARCHAR(24) NOT NULL,
  file_id CHAR(32)    NOT NULL,
  ord     INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (log_id, file_id),
  KEY idx_file (file_id)
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

CREATE TABLE IF NOT EXISTS ext_files (
  id         VARCHAR(16)   NOT NULL,
  path       VARCHAR(500)  NOT NULL,
  path_hash  CHAR(64)      NOT NULL,
  name       VARCHAR(255)  NOT NULL,
  descr      VARCHAR(1000) NOT NULL DEFAULT '',
  tasks      TEXT          NOT NULL,
  created_by VARCHAR(24)   NOT NULL DEFAULT '',
  created_at DATETIME      NOT NULL,
  updated_at DATETIME      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_path (path_hash)
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
