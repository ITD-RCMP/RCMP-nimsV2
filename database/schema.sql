CREATE DATABASE IF NOT EXISTS nimsV2
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
  USE nimsV2;

CREATE TABLE IF NOT EXISTS role (
  id INT UNSIGNED PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE
);

INSERT IGNORE INTO role (id, name) VALUES (1, 'technician'), (2, 'admin'), (3, 'user');

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  oid VARCHAR(36) DEFAULT NULL COMMENT 'Azure AD object ID (oid); set on first Microsoft SSO sign-in',
  email VARCHAR(128) NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  phone VARCHAR(64) DEFAULT NULL,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (role_id) REFERENCES role(id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_oid (oid),
  INDEX idx_role_id (role_id)
);

-- RCMP staff directory (CSV import, handover recipients). Linked from handover_staff.employee_no and will be import by admin of this system for handover recipients.
CREATE TABLE IF NOT EXISTS staff (
  `employee_no` VARCHAR(32) NOT NULL,
  `full_name` VARCHAR(128) NOT NULL,
  `faculty` VARCHAR(128) DEFAULT NULL,
  `department` VARCHAR(128) DEFAULT NULL,
  `division` VARCHAR(20) DEFAULT NULL,
  `email` VARCHAR(128) DEFAULT NULL,
  `phone` VARCHAR(64) DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`employee_no`),
  INDEX idx_staff_full_name (full_name),
  INDEX idx_staff_department (department)
);

CREATE TABLE IF NOT EXISTS department_table (
  `department_id` INT NOT NULL AUTO_INCREMENT,
  `department_name` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`department_id`)
);

CREATE TABLE IF NOT EXISTS status (
  status_id INT UNSIGNED PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE
);

INSERT IGNORE INTO status (status_id, name) VALUES
  (1, 'new'),
  (2, 'return'),
  (3, 'deploy'),
  (4, 'pre-disposed'),
  (5, 'disposed'),
  (6, 'assign (request)'),
  (7, 'booked (request)'),
  (8, 'checkout'),
  (9, 'deploy (facility)');

CREATE TABLE IF NOT EXISTS laptop (
    `asset_id` VARCHAR(32) NOT NULL COMMENT 'required',
    `acc_code` VARCHAR(64) DEFAULT NULL COMMENT 'asset / inventory',
    `supplier` VARCHAR(64) DEFAULT NULL COMMENT,
    `serial_num` VARCHAR(100) DEFAULT NULL COMMENT 'required',
    `brand` VARCHAR(100) DEFAULT NULL,
    `model` VARCHAR(100) DEFAULT NULL,
    `category` VARCHAR(100) DEFAULT NULL COMMENT 'required',
    `part_number` VARCHAR(100) DEFAULT NULL,
    `processor` VARCHAR(100) DEFAULT NULL,
    `memory` VARCHAR(100) DEFAULT NULL,
    `os` VARCHAR(100) DEFAULT NULL,
    `storage` VARCHAR(100) DEFAULT NULL,
    `gpu` VARCHAR(100) DEFAULT NULL,
    `PO_DATE` DATE DEFAULT NULL,
    `PO_NUM` VARCHAR(50) DEFAULT NULL,
    `DO_DATE` DATE DEFAULT NULL,
    `DO_NUM` VARCHAR(50) DEFAULT NULL,
    `INVOICE_DATE` DATE DEFAULT NULL,
    `INVOICE_NUM` VARCHAR(50) DEFAULT NULL,
    `PURCHASE_COST` DECIMAL(10,2) DEFAULT NULL,
    `status_id` INT UNSIGNED NOT NULL COMMENT '1=new, 2=return, 3=deploy, 4=pre-disposed, 5=disposed, 6=assign (request), 7=booked (request), 8=checkout, 9=deploy (facility)',
    `remarks` TEXT DEFAULT NULL,
    `registered_by` INT UNSIGNED NULL,
    `registered_by_name` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (asset_id),
    FOREIGN KEY (status_id) REFERENCES status(status_id),
    INDEX idx_asset_id (asset_id),
    INDEX idx_status_id (status_id)
);

CREATE TABLE IF NOT EXISTS network (
    `asset_id` VARCHAR(32) NOT NULL COMMENT 'required',
    `acc_code` VARCHAR(64) DEFAULT NULL COMMENT 'asset / inventory',
    `supplier` VARCHAR(64) DEFAULT NULL COMMENT,
    `category` VARCHAR(100) DEFAULT NULL,
    `serial_num` VARCHAR(100) DEFAULT NULL,
    `brand` VARCHAR(100) DEFAULT NULL,
    `model` VARCHAR(100) DEFAULT NULL,
    `mac_address` VARCHAR(100) DEFAULT NULL,
    `ip_address` VARCHAR(100) DEFAULT NULL,
    `PO_DATE` DATE DEFAULT NULL,
    `PO_NUM` VARCHAR(50) DEFAULT NULL,
    `DO_DATE` DATE DEFAULT NULL,
    `DO_NUM` VARCHAR(50) DEFAULT NULL,
    `INVOICE_DATE` DATE DEFAULT NULL,
    `INVOICE_NUM` VARCHAR(50) DEFAULT NULL,
    `PURCHASE_COST` DECIMAL(10,2) DEFAULT NULL,
    `status_id` INT UNSIGNED NOT NULL COMMENT '1=new, 2=return, 3=deploy, 4=pre-disposed, 5=disposed, 6=assign (request), 7=booked (request), 8=checkout, 9=deploy (facility)',
    `remarks` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (asset_id),
    FOREIGN KEY (status_id) REFERENCES status(status_id),
    INDEX idx_asset_id (asset_id),
    INDEX idx_status_id (status_id)
);

-- AV assets (audio/visual equipment: speaker, mic, projector, etc.)
CREATE TABLE IF NOT EXISTS av (
    `asset_id` VARCHAR(32) NOT NULL COMMENT 'required',
    `acc_code` VARCHAR(64) DEFAULT NULL COMMENT 'asset / inventory',
    `supplier` VARCHAR(64) DEFAULT NULL COMMENT,
    `asset_id_old` VARCHAR(64) DEFAULT NULL COMMENT 'required',
    `category` VARCHAR(128) DEFAULT NULL,
    `brand` VARCHAR(100) DEFAULT NULL,
    `model` VARCHAR(100) DEFAULT NULL,
    `serial_num` VARCHAR(100) DEFAULT NULL,
    `status_id` INT UNSIGNED NOT NULL COMMENT '1=new, 2=return, 3=deploy, 4=pre-disposed, 5=disposed, 6=assign (request), 7=booked (request), 8=checkout, 9=deploy (facility)',
    `PO_DATE` DATE DEFAULT NULL,
    `PO_NUM` VARCHAR(50) DEFAULT NULL,
    `DO_DATE` DATE DEFAULT NULL,
    `DO_NUM` VARCHAR(50) DEFAULT NULL,
    `INVOICE_DATE` DATE DEFAULT NULL,
    `INVOICE_NUM` VARCHAR(50) DEFAULT NULL,
    `PURCHASE_COST` DECIMAL(10,2) DEFAULT NULL,
    `remarks` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (asset_id),
    FOREIGN KEY (status_id) REFERENCES status(status_id),
    INDEX idx_asset_id (asset_id),
    INDEX idx_status_id (status_id)
);

CREATE TABLE IF NOT EXISTS it_deploy (
  `deployment_id` INT(11) NOT NULL AUTO_INCREMENT,
  `asset_id` VARCHAR(32) NOT NULL,
  `asset_type` ENUM('av','network') NOT NULL,
  `building` VARCHAR(128) NOT NULL,
  `level` VARCHAR(128) NOT NULL,
  `zone` VARCHAR(128) NOT NULL,
  `deployment_date` DATE NOT NULL,
  `deployment_remarks` TEXT DEFAULT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (deployment_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_it_deploy_asset (asset_type, asset_id),
  INDEX idx_it_deploy_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS it_return (
  `return_id` INT(11) NOT NULL AUTO_INCREMENT,
  `deployment_id` INT(11) NOT NULL,
  `returned_by` INT UNSIGNED NOT NULL,
  `return_date` DATE NOT NULL,
  `return_time` TIME DEFAULT NULL,
  `return_place` VARCHAR(128) DEFAULT NULL,
  `condition` VARCHAR(64) DEFAULT NULL,
  `return_remarks` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`return_id`),
  FOREIGN KEY (`deployment_id`) REFERENCES `it_deploy`(`deployment_id`),
  FOREIGN KEY (`returned_by`) REFERENCES `users`(`id`),
  INDEX `idx_it_return_deployment` (`deployment_id`),
  INDEX `idx_it_return_returned_by` (`returned_by`),
  INDEX `idx_it_return_date` (`return_date`)
);

CREATE TABLE IF NOT EXISTS handover (
  `handover_id` INT(11) NOT NULL AUTO_INCREMENT,
  `asset_id` VARCHAR(32) NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `building` VARCHAR(128) DEFAULT NULL,
  `level` VARCHAR(128) DEFAULT NULL,
  `zone` VARCHAR(128) DEFAULT NULL,
  `handler` VARCHAR(128) DEFAULT NULL,
  `handover_date` DATE NOT NULL,
  `handover_remarks` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `handled_by_name` VARCHAR(128) DEFAULT NULL COMMENT 'Technician display name captured at handover time — avoids an Azure directory lookup when generating the PDF/email',
  `email_status` ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending' COMMENT 'Handover notification email delivery state (sent async in the background)',
  `email_sent_at` TIMESTAMP NULL DEFAULT NULL,
  `email_error` VARCHAR(512) DEFAULT NULL,
  `email_attempts` INT NOT NULL DEFAULT 0,
  `email_updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (handover_id),
  FOREIGN KEY (asset_id) REFERENCES laptop(asset_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_handover_id (handover_id),
  INDEX idx_asset_id (asset_id)
);

-- One row per recipient on a handover; person details live in staff.
CREATE TABLE IF NOT EXISTS handover_staff(
  `handover_staff_id` INT(11) NOT NULL AUTO_INCREMENT,
  `employee_no` VARCHAR(32) NOT NULL,
  `handover_id` INT(11) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (handover_staff_id),
  FOREIGN KEY (`employee_no`) REFERENCES staff(`employee_no`),
  FOREIGN KEY (`handover_id`) REFERENCES handover(`handover_id`),
  INDEX idx_handover_staff_employee (`employee_no`),
  INDEX idx_handover_id (`handover_id`)
);

CREATE TABLE IF NOT EXISTS warranty(
  `warranty_id` INT(11) NOT NULL AUTO_INCREMENT,
  `asset_id` VARCHAR(32) NOT NULL,
  `asset_type` ENUM('laptop','network','av') NOT NULL DEFAULT 'laptop',
  `warranty_start_date` DATE NOT NULL,
  `warranty_end_date` DATE NOT NULL,
  `warranty_remarks` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (warranty_id),
  INDEX idx_warranty_id (warranty_id),
  INDEX idx_asset_id (asset_id),
  INDEX idx_asset_type_asset (asset_type, asset_id)
);

-- Return after a handover: either one staff recipient (handover_staff_id) or place-only handover (handover_id, no handover_staff row)
CREATE TABLE IF NOT EXISTS handover_return (
  `return_id` INT(11) NOT NULL AUTO_INCREMENT,
  `handover_staff_id` INT(11) DEFAULT NULL,
  `handover_id` INT(11) DEFAULT NULL,
  `returned_by` INT UNSIGNED NOT NULL,
  `return_date` DATE NOT NULL,
  `return_time` TIME DEFAULT NULL,
  `return_place` VARCHAR(128) DEFAULT NULL,
  `condition` VARCHAR(64) DEFAULT NULL,
  `return_remarks` TEXT DEFAULT NULL,
  `return_status_id` INT UNSIGNED DEFAULT NULL,
  `return_dedupe_key` VARCHAR(48) GENERATED ALWAYS AS (
    CASE
      WHEN `handover_staff_id` IS NOT NULL THEN CONCAT('S', `handover_staff_id`)
      WHEN `handover_id` IS NOT NULL THEN CONCAT('P', `handover_id`)
      ELSE 'X0'
    END
  ) STORED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `returned_by_name` VARCHAR(128) DEFAULT NULL COMMENT 'Technician display name captured at return time — avoids an Azure directory lookup when generating the PDF/email',
  `email_status` ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending' COMMENT 'Return notification email delivery state (sent async in the background)',
  `email_sent_at` TIMESTAMP NULL DEFAULT NULL,
  `email_error` VARCHAR(512) DEFAULT NULL,
  `email_attempts` INT NOT NULL DEFAULT 0,
  `email_updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`return_id`),
  CONSTRAINT `chk_return_staff_or_place` CHECK (
    (`handover_staff_id` IS NOT NULL AND `handover_id` IS NULL)
    OR (`handover_staff_id` IS NULL AND `handover_id` IS NOT NULL)
  ),
  FOREIGN KEY (`handover_staff_id`) REFERENCES `handover_staff`(`handover_staff_id`),
  FOREIGN KEY (`handover_id`) REFERENCES `handover`(`handover_id`),
  FOREIGN KEY (`returned_by`) REFERENCES `users`(`id`),
  FOREIGN KEY (`return_status_id`) REFERENCES `status`(`status_id`),
  UNIQUE KEY `uq_return_dedupe_key` (`return_dedupe_key`),
  INDEX `idx_return_handover_id` (`handover_id`),
  INDEX `idx_returned_by` (`returned_by`),
  INDEX `idx_return_date` (`return_date`),
  INDEX `idx_return_status_id` (`return_status_id`)
);

-- request table submits request (categories only), assets must be status 6 (active (request))
CREATE TABLE IF NOT EXISTS request (
  `request_id` INT(11) NOT NULL AUTO_INCREMENT,
  `requested_by` INT UNSIGNED NOT NULL,
  `borrow_date` DATE NOT NULL,
  `return_date` DATE NOT NULL,
  `program_type` VARCHAR(128) NOT NULL COMMENT 'e.g. academic project/class, Official Event, Club/Society',
  `usage_location` VARCHAR(255) NOT NULL,
  `remarks` TEXT DEFAULT NULL,
  `terms_accepted_at` TIMESTAMP NOT NULL,
  `rejected_at` TIMESTAMP NULL DEFAULT NULL,
  `rejected_by` INT UNSIGNED NULL DEFAULT NULL,
  `rejection_reason` VARCHAR(512) NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`),
  FOREIGN KEY (`rejected_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_request_requested_by` (`requested_by`),
  INDEX `idx_request_rejected_at` (`rejected_at`),
  INDEX `idx_request_borrow_date` (`borrow_date`),
  INDEX `idx_request_return_date` (`return_date`)
);

CREATE TABLE IF NOT EXISTS request_item (
  `request_item_id` INT(11) NOT NULL AUTO_INCREMENT,
  `request_id` INT(11) NOT NULL,
  `asset_type` VARCHAR(128) NOT NULL COMMENT 'e.g. Laptop, Projector — user selects category only',
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_item_id`),
  FOREIGN KEY (`request_id`) REFERENCES `request`(`request_id`) ON DELETE CASCADE,
  INDEX `idx_request_item_request` (`request_id`)
);

CREATE TABLE IF NOT EXISTS request_assignment (
  `assignment_id` INT(11) NOT NULL AUTO_INCREMENT,
  `request_id` INT(11) NOT NULL,
  `request_item_id` INT(11) DEFAULT NULL,
  `asset_id` VARCHAR(32) DEFAULT NULL COMMENT 'NULL when slot marked unavailable',
  `assigned_by` INT UNSIGNED NOT NULL,
  `assigned_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'set when asset booked or slot marked unavailable',
  `unavailable_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'technician could not assign a pool asset for this slot',
  `checkout_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'set when asset marked Checkout (nextcheck) 13',
  `returned_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'technician checked equipment back in',
  `return_condition` VARCHAR(512) DEFAULT NULL COMMENT 'physical condition / notes at return',
  `returned_by` INT UNSIGNED DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  FOREIGN KEY (`request_id`) REFERENCES `request`(`request_id`) ON DELETE CASCADE,
  FOREIGN KEY (`request_item_id`) REFERENCES `request_item`(`request_item_id`) ON DELETE SET NULL,
  FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`),
  FOREIGN KEY (`returned_by`) REFERENCES `users`(`id`),
  UNIQUE KEY `uq_request_asset_per_request` (`request_id`, `asset_id`),
  INDEX `idx_request_assignment_asset` (`asset_id`),
  INDEX `idx_request_assignment_returned` (`returned_at`)
);

CREATE TABLE IF NOT EXISTS request_overdue_email_log (
  `log_id` INT(11) NOT NULL AUTO_INCREMENT,
  `request_id` INT(11) NOT NULL,
  `sent_on` DATE NOT NULL,
  `sent_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `days_overdue` INT NOT NULL,
  PRIMARY KEY (`log_id`),
  UNIQUE KEY `uq_request_overdue_sent_on` (`request_id`, `sent_on`),
  INDEX `idx_overdue_email_sent_on` (`sent_on`)
);

CREATE TABLE IF NOT EXISTS request_overdue_auto_reject_log (
  `request_id` INT(11) NOT NULL,
  `rejected_on` DATE NOT NULL,
  `rejected_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `email_sent` TINYINT(1) NOT NULL DEFAULT 0,
  `last_error` VARCHAR(512) DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  INDEX `idx_auto_reject_rejected_on` (`rejected_on`)
);

-- Pre-disposal queue (pending / in_disposal). One active row per asset via queue_key.
-- Submitted disposal is a separate row on `disposal`.
CREATE TABLE IF NOT EXISTS pre_disposal (
  `pre_disposal_id` INT(11) NOT NULL AUTO_INCREMENT,
  `asset_id` VARCHAR(32) NOT NULL,
  `asset_type` ENUM('laptop','av','network') NOT NULL DEFAULT 'laptop',
  `reason` ENUM('manual','return_from_deployment','lifespan_over_7y') NOT NULL DEFAULT 'manual',
  `marked_by` INT UNSIGNED NOT NULL,
  `marked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('pending','in_disposal','cancelled') NOT NULL DEFAULT 'pending',
  `notes` TEXT NULL,
  `queue_key` VARCHAR(64) GENERATED ALWAYS AS (
    CASE
      WHEN `status` IN ('pending', 'in_disposal') THEN CONCAT(`asset_type`, ':', `asset_id`)
      ELSE NULL
    END
  ) STORED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pre_disposal_id`),
  FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`),
  UNIQUE KEY `uq_pre_disposal_active` (`queue_key`),
  INDEX `idx_pre_disposal_asset_id` (`asset_id`),
  INDEX `idx_pre_disposal_asset_type` (`asset_type`),
  INDEX `idx_pre_disposal_status` (`status`),
  INDEX `idx_pre_disposal_marked_by` (`marked_by`),
  INDEX `idx_pre_disposal_marked_at` (`marked_at`)
);

-- Submitted disposal only: one row per asset; same submit shares `batch` (DP-YY-NN).
CREATE TABLE IF NOT EXISTS disposal (
  `disposal_id` INT(11) NOT NULL AUTO_INCREMENT,
  `batch` VARCHAR(32) NOT NULL,
  `no_rujukan_pelupusan` VARCHAR(64) NOT NULL,
  `pre_disposal_id` INT(11) NOT NULL,
  `asset_id` VARCHAR(32) NOT NULL,
  `asset_type` ENUM('laptop','av','network') NOT NULL DEFAULT 'laptop',
  `submitted_by` INT UNSIGNED NOT NULL,
  `submitted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `disposal_date` DATE NULL,
  `disposal_time` TIME NULL,
  `pusat` VARCHAR(128) NOT NULL DEFAULT 'JABATAN TEKNOLOGI MAKLUMAT',
  `disposal_remarks` TEXT NULL,
  `latar_belakang` TEXT NULL,
  `rekod_fizikal_harta` TEXT NULL,
  `image_whole_asset` VARCHAR(512) NULL,
  `image_serial_number` VARCHAR(512) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`disposal_id`),
  FOREIGN KEY (`pre_disposal_id`) REFERENCES `pre_disposal`(`pre_disposal_id`),
  FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`),
  UNIQUE KEY `uq_disposal_rujukan_asset` (`no_rujukan_pelupusan`, `asset_type`, `asset_id`),
  INDEX `idx_disposal_batch` (`batch`),
  INDEX `idx_disposal_no_rujukan` (`no_rujukan_pelupusan`),
  INDEX `idx_disposal_asset_id` (`asset_id`),
  INDEX `idx_disposal_asset_type` (`asset_type`),
  INDEX `idx_disposal_submitted_by` (`submitted_by`),
  INDEX `idx_disposal_date` (`disposal_date`),
  INDEX `idx_disposal_pre_disposal_id` (`pre_disposal_id`)
);

CREATE TABLE IF NOT EXISTS system_settings (
  `setting_key` VARCHAR(64) NOT NULL,
  `value` VARCHAR(255) NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
);

INSERT IGNORE INTO system_settings (setting_key, value) VALUES ('login_maintenance', '0');

-- Preventive maintenance: one pm_log row per room visit, one pm_log_asset row per asset inspected
CREATE TABLE IF NOT EXISTS pm_log (
  `pm_log_id` INT(11) NOT NULL AUTO_INCREMENT,
  `building` VARCHAR(128) NOT NULL,
  `level` VARCHAR(128) NOT NULL,
  `zone` VARCHAR(128) NOT NULL,
  `performed_by` INT UNSIGNED NOT NULL,
  `pm_date` DATE NOT NULL,
  `status` ENUM('passed','failed','partial') NOT NULL DEFAULT 'passed',
  `remarks` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pm_log_id`),
  FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`),
  INDEX `idx_pm_log_place` (`building`, `level`, `zone`),
  INDEX `idx_pm_log_performed_by` (`performed_by`),
  INDEX `idx_pm_log_date` (`pm_date`)
);

CREATE TABLE IF NOT EXISTS pm_log_asset (
  `pm_log_asset_id` INT(11) NOT NULL AUTO_INCREMENT,
  `pm_log_id` INT(11) NOT NULL,
  `asset_type` ENUM('laptop','network','av') NOT NULL,
  `asset_id` VARCHAR(32) NOT NULL COMMENT 'Matches laptop/av/network.asset_id',
  `asset_category` VARCHAR(128) DEFAULT NULL COMMENT 'Category snapshot at maintenance time',
  `asset_label` VARCHAR(255) DEFAULT NULL COMMENT 'Brand + model snapshot at maintenance time',
  `serial_num` VARCHAR(64) DEFAULT NULL COMMENT 'Serial snapshot at maintenance time',
  `condition` ENUM('good','faulty') NOT NULL DEFAULT 'good',
  `remarks` TEXT DEFAULT NULL COMMENT 'Required when condition is faulty',
  `follow_up_required` TINYINT(1) NOT NULL DEFAULT 0,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Set when a later visit marks the asset good again',
  `resolved_pm_log_id` INT(11) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pm_log_asset_id`),
  FOREIGN KEY (`pm_log_id`) REFERENCES `pm_log`(`pm_log_id`) ON DELETE CASCADE,
  FOREIGN KEY (`resolved_pm_log_id`) REFERENCES `pm_log`(`pm_log_id`) ON DELETE SET NULL,
  UNIQUE KEY `uq_pm_log_asset` (`pm_log_id`, `asset_type`, `asset_id`),
  INDEX `idx_pm_log_asset_log` (`pm_log_id`),
  INDEX `idx_pm_log_asset_asset` (`asset_type`, `asset_id`),
  INDEX `idx_pm_log_asset_follow_up` (`follow_up_required`, `resolved_at`)
);

-- Archived checklist-era maintenance logs (kept read-only for history)
CREATE TABLE IF NOT EXISTS pm_log_archive (
  `pm_log_id` INT(11) NOT NULL,
  `asset_id` VARCHAR(32) NOT NULL,
  `asset_type` VARCHAR(16) NOT NULL,
  `checklist_name` VARCHAR(255) DEFAULT NULL,
  `asset_category` VARCHAR(128) DEFAULT NULL,
  `performed_by` INT UNSIGNED NOT NULL,
  `pm_date` DATE NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `remarks` TEXT DEFAULT NULL,
  `items` TEXT DEFAULT NULL COMMENT 'Flattened "item = result (remarks)" list from the old checklist tables',
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`pm_log_id`),
  INDEX `idx_pm_log_archive_asset` (`asset_type`, `asset_id`),
  INDEX `idx_pm_log_archive_date` (`pm_date`)
);

-- Migration: handover/return notification performance columns (safe to re-run on an existing database, requires MySQL 8.0.29+/MariaDB 10.5.2+ for IF NOT EXISTS).
ALTER TABLE handover
  ADD COLUMN IF NOT EXISTS `handled_by_name` VARCHAR(128) DEFAULT NULL COMMENT 'Technician display name captured at handover time — avoids an Azure directory lookup when generating the PDF/email',
  ADD COLUMN IF NOT EXISTS `building` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `level` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `zone` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `handler` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `email_status` ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending' COMMENT 'Handover notification email delivery state (sent async in the background)',
  ADD COLUMN IF NOT EXISTS `email_sent_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `email_error` VARCHAR(512) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `email_attempts` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `email_updated_at` DATETIME DEFAULT NULL;

UPDATE handover h
INNER JOIN department_table d ON d.department_id = h.department_id
SET h.handler = d.department_name
WHERE h.handler IS NULL AND h.department_id IS NOT NULL;

ALTER TABLE handover DROP COLUMN IF EXISTS `department_id`;

ALTER TABLE handover_return
  ADD COLUMN IF NOT EXISTS `returned_by_name` VARCHAR(128) DEFAULT NULL COMMENT 'Technician display name captured at return time — avoids an Azure directory lookup when generating the PDF/email',
  ADD COLUMN IF NOT EXISTS `email_status` ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending' COMMENT 'Return notification email delivery state (sent async in the background)',
  ADD COLUMN IF NOT EXISTS `email_sent_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `email_error` VARCHAR(512) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `email_attempts` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `email_updated_at` DATETIME DEFAULT NULL;

ALTER TABLE network
  ADD COLUMN IF NOT EXISTS `category` VARCHAR(100) DEFAULT NULL AFTER `asset_id`;

INSERT IGNORE INTO status (status_id, name) VALUES (9, 'deploy (facility)');

ALTER TABLE staff
  MODIFY COLUMN `division` VARCHAR(20) DEFAULT NULL;

ALTER TABLE department_table
  DROP INDEX IF EXISTS uq_department_name,
  DROP COLUMN IF EXISTS `created_at`,
  DROP COLUMN IF EXISTS `updated_at`,
  MODIFY COLUMN `department_id` INT NOT NULL AUTO_INCREMENT,
  MODIFY COLUMN `department_name` VARCHAR(255) NOT NULL;

-- Migration: split pre_disposal queue from submitted disposal — run database/migration/20260908_split_pre_disposal_and_disposal.sql on existing databases.

-- Migration: drop PM checklists in favour of per-asset room condition logging — run database/migration/20260914_pm_room_condition_log.sql on existing databases.

-- Migration: disposal.batch DP-YY-NN — run database/migration/20260917_add_disposal_batch.sql on existing databases.

-- Migration: av/network.asset_id VARCHAR(32) — run database/migration/20260922_av_network_asset_id_varchar.sql on existing databases.

-- Migration: users.department_id FK to department_table — run database/migration/20261019_add_users_department_id.sql on existing databases.
