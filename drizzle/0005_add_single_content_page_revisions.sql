CREATE TABLE "page_content_revisions" (
	"page_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"content" text,
	CONSTRAINT "page_content_revisions_page_id_chapter_id_pk" PRIMARY KEY("page_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "page_infobox_content_revisions" (
	"page_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"content" text,
	"image_url" text,
	CONSTRAINT "page_infobox_content_revisions_page_id_chapter_id_pk" PRIMARY KEY("page_id","chapter_id")
);
--> statement-breakpoint
ALTER TABLE "page_suggestions" ADD COLUMN "proposed_content" text;--> statement-breakpoint
ALTER TABLE "page_suggestions" ADD COLUMN "proposed_infobox_content" text;--> statement-breakpoint
ALTER TABLE "page_content_revisions" ADD CONSTRAINT "page_content_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_content_revisions" ADD CONSTRAINT "page_content_revisions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_content_revisions" ADD CONSTRAINT "page_infobox_content_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_content_revisions" ADD CONSTRAINT "page_infobox_content_revisions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;