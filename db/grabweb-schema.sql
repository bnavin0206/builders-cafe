-- Builder's Cafe: database for the GrabWeb MySQL (also fine on MariaDB 10.x).
-- How to use: in phpMyAdmin, pick your (empty) database, open the "SQL" tab,
-- paste this whole file and press Go. It is safe to run again: nothing is dropped
-- and tables that already exist are left alone.
--
-- Times are stored in UTC (DATETIME). The views at the bottom show Indian time.
-- Money is stored in paise (INR x 100) so there is never a rounding problem.
-- Everything is keyed so that a record can be sent twice without being doubled.

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- The event: its name, whether it is open, and the free-coffee settings.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  slug                VARCHAR(64)  NOT NULL,
  name                VARCHAR(200) NOT NULL,
  state               VARCHAR(12)  NOT NULL DEFAULT 'OPEN',      -- OPEN, CLOSED or ENDED
  free_for_all        TINYINT(1)   NOT NULL DEFAULT 0,           -- "free coffee for everyone who answers the quiz"
  free_limit_per_day  INT          NULL,
  raw_json            LONGTEXT     NULL,                         -- the event exactly as stored in Twilio Sync
  synced_at           DATETIME     NOT NULL,
  PRIMARY KEY (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- The menu as it was last synced (one row per item). Today's on/off switches
-- are in "available".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  event_slug   VARCHAR(64)   NOT NULL,
  short_title  VARCHAR(100)  NOT NULL,
  title        VARCHAR(200)  NOT NULL,
  menu_group   VARCHAR(40)   NULL,                               -- Coffee, Tea & More, Sandwich, Savoury, Pastry ...
  price_inr    DECIMAL(8,2)  NOT NULL DEFAULT 0,                 -- 0 means a free item
  veg          TINYINT(1)    NOT NULL DEFAULT 1,
  available    TINYINT(1)    NOT NULL DEFAULT 1,
  sort_no      INT           NOT NULL DEFAULT 0,
  synced_at    DATETIME      NOT NULL,
  PRIMARY KEY (event_slug, short_title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- People who messaged the cafe (personal data: name, phone, email).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendees (
  phone               VARCHAR(20)   NOT NULL,                    -- +919876543210
  full_name           VARCHAR(200)  NULL,
  email               VARCHAR(200)  NULL,
  company             VARCHAR(200)  NULL,
  job_title           VARCHAR(200)  NULL,
  city                VARCHAR(100)  NULL,
  country             VARCHAR(100)  NULL,
  event_slug          VARCHAR(64)   NULL,
  stage               VARCHAR(30)   NULL,                        -- where they are in the chat flow
  quiz_result         VARCHAR(10)   NULL,                        -- passed or failed
  quiz_correct        TINYINT       NULL,                        -- how many of the 3 were right
  quiz_attempts       TINYINT       NULL,
  survey_kind         VARCHAR(10)   NULL,                        -- dev (winners) or general
  orders_count        INT           NOT NULL DEFAULT 0,
  free_coffees_taken  INT           NOT NULL DEFAULT 0,
  last_order_no       INT           NULL,
  signed_up_at        DATETIME      NULL,
  last_activity_at    DATETIME      NULL,
  raw_json            LONGTEXT      NULL,
  synced_at           DATETIME      NOT NULL,
  PRIMARY KEY (phone),
  KEY idx_att_email (email),
  KEY idx_att_signed (signed_up_at),
  KEY idx_att_quiz (quiz_result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Survey answers, one row per answer (a "select all that apply" question has
-- several rows).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey_answers (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone         VARCHAR(20)     NOT NULL,
  survey_kind   VARCHAR(10)     NOT NULL,                        -- dev or general
  question_no   TINYINT         NOT NULL,                        -- 1 to 5
  answer        VARCHAR(500)    NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_survey (phone, question_no, answer(100)),
  KEY idx_survey_q (survey_kind, question_no),
  CONSTRAINT fk_survey_att FOREIGN KEY (phone) REFERENCES attendees (phone) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Orders (WhatsApp, counter sales and hand-made ones).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_slug      VARCHAR(64)     NOT NULL,
  order_no        INT             NOT NULL,                      -- the number the customer sees (#91)
  created_at      DATETIME        NOT NULL,                      -- UTC
  updated_at      DATETIME        NULL,                          -- last status change, UTC
  status          VARCHAR(12)     NOT NULL,                      -- queued, ready, delivered, cancelled
  item            VARCHAR(200)    NULL,                          -- the main item (the free coffee, or the first paid item)
  extras          VARCHAR(500)    NULL,                          -- paid extras next to a free coffee
  add_ons         VARCHAR(500)    NULL,
  order_type      ENUM('free','free_paid','paid','counter','manual') NOT NULL,
  free_for_all    TINYINT(1)      NOT NULL DEFAULT 0,            -- free coffee given by the "everyone" switch
  amount_paise    INT             NOT NULL DEFAULT 0,
  payment_id      VARCHAR(40)     NULL,                          -- Razorpay payment, or ctr_... for counter sales
  pay_mode        VARCHAR(12)     NULL,                          -- razorpay, cash, pos, upi
  channel         VARCHAR(12)     NULL,                          -- whatsapp, other, api
  customer_phone  VARCHAR(20)     NULL,
  customer_name   VARCHAR(200)    NULL,
  sync_index      INT             NULL,                          -- position in the Twilio list (for reference only)
  raw_json        LONGTEXT        NULL,
  synced_at       DATETIME        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order (event_slug, order_no, created_at),
  KEY idx_order_created (created_at),
  KEY idx_order_status (status),
  KEY idx_order_phone (customer_phone),
  KEY idx_order_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per item in an order, for "how many Cappuccinos" style reports.
CREATE TABLE IF NOT EXISTS order_items (
  order_id   BIGINT UNSIGNED NOT NULL,
  line_no    SMALLINT        NOT NULL,
  item_name  VARCHAR(200)    NOT NULL,
  qty        SMALLINT        NOT NULL DEFAULT 1,
  kind       ENUM('main','extra') NOT NULL DEFAULT 'main',
  PRIMARY KEY (order_id, line_no),
  KEY idx_items_name (item_name),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- GST invoices. Real ones are MMC/TBC/00001 ...; test ones are TEST/MMC/...
-- Keep these rows: invoices have to be kept for accounts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  invoice_no      VARCHAR(24)   NOT NULL,                        -- MMC/TBC/00001
  is_test         TINYINT(1)    NOT NULL DEFAULT 0,
  issued_at       DATETIME      NOT NULL,                        -- UTC
  order_no        INT           NULL,                            -- 0 or empty for a training sale
  payment_id      VARCHAR(40)   NOT NULL,
  pay_mode        VARCHAR(12)   NOT NULL DEFAULT 'razorpay',     -- razorpay, cash, pos, upi
  taxable_paise   INT           NOT NULL,
  cgst_paise      INT           NOT NULL,
  sgst_paise      INT           NOT NULL,
  total_paise     INT           NOT NULL,
  customer_name   VARCHAR(200)  NULL,
  customer_phone  VARCHAR(20)   NULL,
  customer_email  VARCHAR(200)  NULL,
  sends           TINYINT       NOT NULL DEFAULT 0,              -- times sent to a typed WhatsApp number
  raw_json        LONGTEXT      NULL,
  synced_at       DATETIME      NOT NULL,
  PRIMARY KEY (invoice_no),
  UNIQUE KEY uq_invoice_payment (payment_id),
  KEY idx_invoice_issued (issued_at),
  KEY idx_invoice_phone (customer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_lines (
  invoice_no     VARCHAR(24)   NOT NULL,
  line_no        SMALLINT      NOT NULL,
  item_name      VARCHAR(200)  NOT NULL,
  qty            SMALLINT      NOT NULL DEFAULT 1,
  gross_paise    INT           NOT NULL,
  taxable_paise  INT           NOT NULL,
  cgst_paise     INT           NOT NULL,
  sgst_paise     INT           NOT NULL,
  PRIMARY KEY (invoice_no, line_no),
  CONSTRAINT fk_lines_invoice FOREIGN KEY (invoice_no) REFERENCES invoices (invoice_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- The nightly finance email: which days were sent.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_reports (
  event_slug   VARCHAR(64)  NOT NULL,
  report_day   DATE         NOT NULL,                            -- the Indian calendar day the report covers
  status       VARCHAR(12)  NOT NULL,                            -- sent, empty, failed, skipped
  sent_at      DATETIME     NULL,
  PRIMARY KEY (event_slug, report_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- A log of what the sync received, so a gap can be found and filled.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  received_at  DATETIME        NOT NULL,
  kind         VARCHAR(20)     NOT NULL,                         -- order, attendee, invoice, event, full
  records      INT             NOT NULL DEFAULT 0,
  ok           TINYINT(1)      NOT NULL DEFAULT 1,
  message      VARCHAR(500)    NULL,
  PRIMARY KEY (id),
  KEY idx_log_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_version (
  version     INT          NOT NULL,
  applied_at  DATETIME     NOT NULL,
  note        VARCHAR(200) NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_version (version, applied_at, note) VALUES (1, UTC_TIMESTAMP(), 'first version');

-- ---------------------------------------------------------------------------
-- Ready-made reports, in Indian time (UTC + 5:30). Open them in phpMyAdmin or
-- from any reporting tool.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_orders_ist AS
  SELECT o.id, o.event_slug, o.order_no,
         DATE_ADD(o.created_at, INTERVAL 330 MINUTE) AS created_ist,
         DATE(DATE_ADD(o.created_at, INTERVAL 330 MINUTE)) AS day_ist,
         HOUR(DATE_ADD(o.created_at, INTERVAL 330 MINUTE)) AS hour_ist,
         o.status, o.item, o.extras, o.order_type, o.free_for_all,
         o.amount_paise / 100 AS amount_inr, o.payment_id, o.pay_mode, o.channel,
         o.customer_phone, o.customer_name
  FROM orders o;

CREATE OR REPLACE VIEW v_daily_orders AS
  SELECT DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) AS day_ist,
         COUNT(*)                                             AS orders,
         SUM(status = 'delivered')                            AS delivered,
         SUM(order_type IN ('free', 'free_paid'))             AS free_coffees,
         SUM(free_for_all)                                    AS free_for_everyone,
         SUM(amount_paise > 0)                                AS paid_orders,
         SUM(amount_paise) / 100                              AS paid_inr
  FROM orders
  WHERE status <> 'cancelled'
  GROUP BY DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE));

CREATE OR REPLACE VIEW v_daily_signups AS
  SELECT DATE(DATE_ADD(signed_up_at, INTERVAL 330 MINUTE)) AS day_ist,
         COUNT(*)                                          AS signups,
         SUM(quiz_result IS NOT NULL)                      AS finished_quiz,
         SUM(quiz_result = 'passed')                       AS passed,
         SUM(quiz_result = 'failed')                       AS not_passed,
         SUM(orders_count > 0)                             AS ordered
  FROM attendees
  WHERE signed_up_at IS NOT NULL
  GROUP BY DATE(DATE_ADD(signed_up_at, INTERVAL 330 MINUTE));

CREATE OR REPLACE VIEW v_daily_invoices AS
  SELECT DATE(DATE_ADD(issued_at, INTERVAL 330 MINUTE)) AS day_ist,
         COUNT(*)                     AS invoices,
         MIN(invoice_no)              AS first_no,
         MAX(invoice_no)              AS last_no,
         SUM(taxable_paise) / 100     AS taxable_inr,
         SUM(cgst_paise) / 100        AS cgst_inr,
         SUM(sgst_paise) / 100        AS sgst_inr,
         SUM(total_paise) / 100       AS total_inr
  FROM invoices
  WHERE is_test = 0
  GROUP BY DATE(DATE_ADD(issued_at, INTERVAL 330 MINUTE));

CREATE OR REPLACE VIEW v_item_counts AS
  SELECT i.item_name, SUM(i.qty) AS times_ordered
  FROM order_items i
  JOIN orders o ON o.id = i.order_id AND o.status <> 'cancelled'
  GROUP BY i.item_name;
