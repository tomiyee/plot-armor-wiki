CREATE TABLE "text_migration_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"migration_id" text NOT NULL,
	"table_name" text NOT NULL,
	"row_pk" jsonb NOT NULL,
	"before" text
);
--> statement-breakpoint
CREATE TABLE "text_migrations_applied" (
	"id" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"rows_changed" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "text_migration_backups" ADD CONSTRAINT "text_migration_backups_migration_id_text_migrations_applied_id_fk" FOREIGN KEY ("migration_id") REFERENCES "public"."text_migrations_applied"("id") ON DELETE no action ON UPDATE no action;