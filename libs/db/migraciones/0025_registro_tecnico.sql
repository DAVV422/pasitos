CREATE TABLE "alertas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"asistente_id" uuid,
	"dispositivo_id" uuid,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"clave" text,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"atendida_por" uuid,
	"atendida_at" timestamp with time zone,
	"resolucion" text,
	"nota" text,
	"resuelta_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alertas_tipo" CHECK ("alertas"."tipo" in ('A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'no_fui_yo')),
	CONSTRAINT "alertas_prioridad" CHECK ("alertas"."prioridad" in ('normal', 'alta')),
	CONSTRAINT "alertas_estado" CHECK ("alertas"."estado" in ('abierta', 'atendiendo', 'resuelta', 'descartada'))
);
--> statement-breakpoint
CREATE TABLE "registros_tecnicos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"asistente_id" uuid,
	"momento" text NOT NULL,
	"resultado" text NOT NULL,
	"motivo" text,
	"ip" text,
	"red" text,
	"user_agent" text,
	"senales" jsonb,
	"diferencia_reloj_ms" integer,
	"latencia_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"borrar_at" timestamp with time zone NOT NULL,
	CONSTRAINT "registros_tecnicos_momento" CHECK ("registros_tecnicos"."momento" in ('vinculacion', 'reclamo', 'canje', 'foto', 'intento_fallido')),
	CONSTRAINT "registros_tecnicos_resultado" CHECK ("registros_tecnicos"."resultado" in ('aceptado', 'rechazado'))
);
--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_atendida_por_usuarios_id_fk" FOREIGN KEY ("atendida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_tecnicos" ADD CONSTRAINT "registros_tecnicos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_tecnicos" ADD CONSTRAINT "registros_tecnicos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_tecnicos" ADD CONSTRAINT "registros_tecnicos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_tecnicos" ADD CONSTRAINT "registros_tecnicos_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_clave" ON "alertas" USING btree ("evento_id","clave");--> statement-breakpoint
CREATE INDEX "alertas_evento" ON "alertas" USING btree ("evento_id","estado","created_at");--> statement-breakpoint
CREATE INDEX "registros_tecnicos_evento" ON "registros_tecnicos" USING btree ("evento_id","created_at");--> statement-breakpoint
CREATE INDEX "registros_tecnicos_dispositivo" ON "registros_tecnicos" USING btree ("dispositivo_id");--> statement-breakpoint
CREATE INDEX "registros_tecnicos_borrar" ON "registros_tecnicos" USING btree ("borrar_at");--> statement-breakpoint
ALTER TABLE "registros_tecnicos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "registros_tecnicos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "registros_tecnicos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "alertas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "alertas" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "alertas"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
