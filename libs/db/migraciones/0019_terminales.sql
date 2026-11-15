CREATE TABLE "mesas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"lugar_id" uuid,
	"estado" text DEFAULT 'desconectada' NOT NULL,
	"session_token_hash" "bytea",
	"conectada_por" uuid,
	"conectada_at" timestamp with time zone,
	"ultimo_contacto_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mesas_session_token_hash_unique" UNIQUE("session_token_hash"),
	CONSTRAINT "mesas_estado" CHECK ("mesas"."estado" in ('activa', 'desconectada'))
);
--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "lugar_id" uuid;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "epoca" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "estado" text DEFAULT 'desconectada' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "reto_actual_id" uuid;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "session_token_hash" "bytea";--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "conectada_por" uuid;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "conectada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "ultimo_contacto_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "reemplazada_por" uuid;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "motivo_reemplazo" text;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_lugar_id_lugares_id_fk" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_conectada_por_usuarios_id_fk" FOREIGN KEY ("conectada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mesas_evento" ON "mesas" USING btree ("evento_id");--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_reto_actual_id_retos_id_fk" FOREIGN KEY ("reto_actual_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_conectada_por_usuarios_id_fk" FOREIGN KEY ("conectada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_reemplazada_por_pantallas_id_fk" FOREIGN KEY ("reemplazada_por") REFERENCES "public"."pantallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembro_terminales" ADD CONSTRAINT "miembro_terminales_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pantallas_lugar" ON "pantallas" USING btree ("lugar_id");--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_session_token_hash_unique" UNIQUE("session_token_hash");--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_estado" CHECK ("pantallas"."estado" in ('activa', 'pausada', 'desconectada'));--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_motivo_reemplazo" CHECK ("pantallas"."motivo_reemplazo" is null or char_length("pantallas"."motivo_reemplazo") between 5 and 300);--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_lugar_id_lugares_id_fk" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id");
--> statement-breakpoint
ALTER TABLE "mesas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mesas" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "mesas"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
