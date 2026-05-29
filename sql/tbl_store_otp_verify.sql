-- RM store onboarding OTP (send-otp / verify-otp)
-- Run on hellochotu_main_db if tbl_store_otp_verify was dropped by legacy cleanup.

CREATE TABLE IF NOT EXISTS `tbl_store_otp_verify` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mobile` varchar(20) NOT NULL,
  `ccode` varchar(10) NOT NULL DEFAULT '+91',
  `otp` varchar(10) NOT NULL DEFAULT '0',
  `status` tinyint NOT NULL DEFAULT 0 COMMENT '0=pending OTP, 1=verified/used',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mobile` (`mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
