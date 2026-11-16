CREATE TABLE "invitaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"asistente_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"token_cifrado" "bytea" NOT NULL,
	"estado" text DEFAULT 'creada' NOT NULL,
	"envio_correo_id" uuid,
	"enviada_at" timestamp with time zone,
	"usada_at" timestamp with time zone,
	"revocada_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitaciones_estado" CHECK ("invitaciones"."estado" in ('creada', 'enviada', 'rebotada', 'usada', 'revocada'))
);
--> statement-breakpoint
ALTER TABLE "envios_correo" DROP CONSTRAINT "envios_correo_estado";--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_envio_correo_id_envios_correo_id_fk" FOREIGN KEY ("envio_correo_id") REFERENCES "public"."envios_correo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitaciones_vigente" ON "invitaciones" USING btree ("asistente_id") WHERE "invitaciones"."estado" <> 'revocada';--> statement-breakpoint
CREATE INDEX "invitaciones_evento" ON "invitaciones" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "invitaciones_envio" ON "invitaciones" USING btree ("envio_correo_id");--> statement-breakpoint
ALTER TABLE "envios_correo" ADD CONSTRAINT "envios_correo_estado" CHECK ("envios_correo"."estado" in ('en_cola', 'enviado', 'entregado', 'rebotado', 'fallido', 'cancelado'));--> statement-breakpoint
ALTER TABLE "invitaciones" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitaciones" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "invitaciones"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
