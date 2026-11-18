CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"device_id_hash" "bytea" NOT NULL,
	"llave_publica" "bytea",
	"huella" "bytea",
	"modelo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"borrar_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dispositivos_navegador" UNIQUE("evento_id","device_id_hash")
);
--> statement-breakpoint
CREATE TABLE "idempotencia" (
	"actor" text NOT NULL,
	"clave" uuid NOT NULL,
	"ruta" text NOT NULL,
	"hash_cuerpo" "bytea" NOT NULL,
	"estado_http" integer,
	"respuesta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotencia_actor_clave_pk" PRIMARY KEY("actor","clave")
);
--> statement-breakpoint
CREATE TABLE "vinculaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"asistente_id" uuid NOT NULL,
	"dispositivo_id" uuid NOT NULL,
	"metodo" text NOT NULL,
	"invitacion_id" uuid,
	"token_id" uuid,
	"registrador_id" uuid,
	"anulada_at" timestamp with time zone,
	"anulada_por" uuid,
	"motivo_anulacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vinculaciones_metodo" CHECK ("vinculaciones"."metodo" in ('enlace', 'qr_puerta', 'enlace_corto', 'autoregistro'))
);
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_dueno";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "asistente_organizacion_id" uuid;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_invitacion_id_invitaciones_id_fk" FOREIGN KEY ("invitacion_id") REFERENCES "public"."invitaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_registrador_id_usuarios_id_fk" FOREIGN KEY ("registrador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculaciones" ADD CONSTRAINT "vinculaciones_anulada_por_usuarios_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotencia_vieja" ON "idempotencia" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculaciones_activa" ON "vinculaciones" USING btree ("asistente_id") WHERE "vinculaciones"."anulada_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "vinculaciones_dispositivo_activo" ON "vinculaciones" USING btree ("dispositivo_id") WHERE "vinculaciones"."anulada_at" is null;--> statement-breakpoint
CREATE INDEX "vinculaciones_dispositivo" ON "vinculaciones" USING btree ("dispositivo_id");--> statement-breakpoint
CREATE INDEX "sessions_vinculacion" ON "sessions" USING btree ("vinculacion_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_dueno" CHECK (("sessions"."tipo" = 'usuario' and "sessions"."usuario_id" is not null) or ("sessions"."tipo" = 'asistente' and "sessions"."vinculacion_id" is not null and "sessions"."asistente_organizacion_id" is not null));--> statement-breakpoint
ALTER TABLE "dispositivos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "dispositivos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "dispositivos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "vinculaciones" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vinculaciones" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "vinculaciones"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
