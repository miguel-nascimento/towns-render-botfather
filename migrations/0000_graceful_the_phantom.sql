CREATE TABLE `bots` (
	`client_address` text PRIMARY KEY NOT NULL,
	`app_private_data` text NOT NULL,
	`jwt_secret` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer
);
