-- Cleaned SQL for categories + subcategories
-- Source: user-provided schema (fixed syntax/ordering)

CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `category_code` VARCHAR(100) NULL,
  `name` TEXT NOT NULL,
  `slug` VARCHAR(500) NULL,
  `short_description` TEXT NULL,
  `description` TEXT NULL,
  `parent_category_id` INT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `level` TINYINT NOT NULL DEFAULT 1,
  `commission_percentage` INT NOT NULL DEFAULT 10,
  `gst_percentage` INT NOT NULL DEFAULT 5,
  `status` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` TINYINT NOT NULL DEFAULT 0,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `subcategories` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `category_id` INT NOT NULL,
  `subcategory_code` VARCHAR(100) NULL,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(500) NULL,
  `description` TEXT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` TINYINT NOT NULL DEFAULT 0,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `uk_subcategory_code` UNIQUE (`subcategory_code`),
  CONSTRAINT `fk_subcategories_category_id` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB;

CREATE INDEX `idx_category_id` ON `subcategories` (`category_id` ASC);
CREATE INDEX `idx_display_order` ON `subcategories` (`display_order` ASC);
CREATE INDEX `idx_status` ON `subcategories` (`status` ASC);
CREATE INDEX `idx_subcategories_category_status` ON `subcategories` (`category_id` ASC, `status` ASC);
CREATE INDEX `idx_subcategories_created_at` ON `subcategories` (`created_at` ASC);
CREATE INDEX `idx_subcategories_display_order` ON `subcategories` (`category_id` ASC, `display_order` ASC);

