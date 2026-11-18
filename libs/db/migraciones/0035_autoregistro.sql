ALTER TABLE "asistentes" DROP CONSTRAINT "asistentes_origen";--> statement-breakpoint
DROP INDEX "asistentes_email";--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "qr_registro_id" uuid;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "ci_cifrado" "bytea";--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "ci_ultimos" text;--> statement-breakpoint
CREATE INDEX "asistentes_qr_registro" ON "asistentes" USING btree ("qr_registro_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "asistentes_email" ON "asistentes" USING btree ("evento_id","email") WHERE "asistentes"."email" is not null and "asistentes"."origen" <> 'autoregistro';--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_ci_ultimos" CHECK ("asistentes"."ci_ultimos" is null or char_length("asistentes"."ci_ultimos") <= 3);--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_origen" CHECK ("asistentes"."origen" in ('lista', 'csv', 'puerta', 'autoregistro'));--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_qr_registro_id_qr_registro_id_fk" FOREIGN KEY ("qr_registro_id") REFERENCES "public"."qr_registro"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_qr_registro_id_qr_registro_id_fk" FOREIGN KEY ("qr_registro_id") REFERENCES "public"."qr_registro"("id") ON DELETE no action ON UPDATE no action;
