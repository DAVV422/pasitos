ALTER TABLE "tokens" ADD COLUMN "grupo" uuid;--> statement-breakpoint
CREATE INDEX "tokens_grupo" ON "tokens" USING btree ("grupo");