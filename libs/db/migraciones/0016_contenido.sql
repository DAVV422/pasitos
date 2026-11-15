CREATE TABLE "actividades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"titulo" text NOT NULL,
	"inicio_at" timestamp with time zone NOT NULL,
	"fin_at" timestamp with time zone NOT NULL,
	"lugar_id" uuid,
	"expositor" text,
	"sponsor_id" uuid,
	"reto_id" uuid,
	"descripcion" text,
	CONSTRAINT "actividades_fechas" CHECK ("actividades"."fin_at" > "actividades"."inicio_at")
);
--> statement-breakpoint
CREATE TABLE "lugares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"numero_mapa" integer,
	"descripcion" text,
	CONSTRAINT "lugares_tipo" CHECK ("lugares"."tipo" in ('sala', 'stand', 'mesa', 'servicio')),
	CONSTRAINT "lugares_numero_mapa" CHECK ("lugares"."numero_mapa" is null or "lugares"."numero_mapa" between 1 and 99)
);
--> statement-breakpoint
CREATE TABLE "preguntas_frecuentes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pregunta" text NOT NULL,
	"respuesta" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"logo_archivo_id" uuid,
	"descripcion" text,
	"enlace" text,
	"lugar_id" uuid,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sponsors_enlace" CHECK ("sponsors"."enlace" is null or "sponsors"."enlace" like 'https://%')
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "descripcion" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "contacto" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "wifi" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "secciones_publicas" text[] DEFAULT '{descripcion,fecha,lugar,agenda,sponsors,preguntas}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_lugar_id_lugares_id_fk" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_reto_id_retos_id_fk" FOREIGN KEY ("reto_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lugares" ADD CONSTRAINT "lugares_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lugares" ADD CONSTRAINT "lugares_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preguntas_frecuentes" ADD CONSTRAINT "preguntas_frecuentes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preguntas_frecuentes" ADD CONSTRAINT "preguntas_frecuentes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_logo_archivo_id_archivos_id_fk" FOREIGN KEY ("logo_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_lugar_id_lugares_id_fk" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actividades_evento" ON "actividades" USING btree ("evento_id","inicio_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lugares_numero_mapa_unico" ON "lugares" USING btree ("evento_id","numero_mapa") WHERE "lugares"."numero_mapa" is not null;--> statement-breakpoint
CREATE INDEX "lugares_evento" ON "lugares" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "preguntas_frecuentes_evento" ON "preguntas_frecuentes" USING btree ("evento_id","orden");--> statement-breakpoint
CREATE INDEX "sponsors_evento" ON "sponsors" USING btree ("evento_id","orden");--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_secciones_sin_wifi" CHECK (not ('wifi' = any("eventos"."secciones_publicas")));--> statement-breakpoint
ALTER TABLE "lugares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lugares" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "lugares"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "sponsors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sponsors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "sponsors"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "actividades" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "actividades" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "actividades"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "preguntas_frecuentes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "preguntas_frecuentes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "preguntas_frecuentes"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
