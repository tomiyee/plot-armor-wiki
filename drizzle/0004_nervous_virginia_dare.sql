ALTER TABLE "pages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_idempotency_key_unique" UNIQUE("idempotency_key");