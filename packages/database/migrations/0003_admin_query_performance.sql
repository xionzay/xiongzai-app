CREATE INDEX "admin_operation_logs_created_id_idx" ON "admin_operation_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "files_admin_queue_created_id_idx" ON "files" USING btree ("upload_status","moderation_status","created_at","id") WHERE "files"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "risk_events_status_created_id_idx" ON "risk_events" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "security_logs_status_created_id_idx" ON "security_logs" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "users_status_created_id_idx" ON "users" USING btree ("status","created_at","id");