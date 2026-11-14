CREATE INDEX "title_year_idx" ON "title" USING btree ("library_id","year");--> statement-breakpoint
CREATE INDEX "title_rating_idx" ON "title" USING btree ("library_id","rating");--> statement-breakpoint
CREATE INDEX "title_runtime_idx" ON "title" USING btree ("library_id","runtime_minutes");