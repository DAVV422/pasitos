CREATE TABLE "archivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"proposito" text NOT NULL,
	"nombre_original" text NOT NULL,
	"mime" text,
	"tamano_bytes" integer NOT NULL,
	"ancho" integer,
	"alto" integer,
	"sha256" text,
	"estado" text DEFAULT 'cuarentena' NOT NULL,
	"motivo_rechazo" text,
	"variantes" jsonb,
	"subido_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reemplazado_at" timestamp with time zone,
	CONSTRAINT "archivos_proposito" CHECK ("archivos"."proposito" in ('logo_evento', 'portada', 'plano', 'logo_sponsor', 'imagen_premio', 'importacion_csv', 'mapa_estatico')),
	CONSTRAINT "archivos_estado" CHECK ("archivos"."estado" in ('cuarentena', 'aprobado', 'rechazado'))
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "logo_archivo_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "portada_archivo_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "plano_archivo_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "mapa_estatico_archivo_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "lugar_nombre" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "lugar_direccion" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "ubicacion_lat" double precision;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "ubicacion_lng" double precision;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_subido_por_usuarios_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archivos_evento" ON "archivos" USING btree ("evento_id","proposito");--> statement-breakpoint
CREATE INDEX "archivos_cuarentena" ON "archivos" USING btree ("created_at") WHERE "archivos"."estado" = 'cuarentena';--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_ubicacion" CHECK (("eventos"."ubicacion_lat" is null) = ("eventos"."ubicacion_lng" is null) and ("eventos"."ubicacion_lat" is null or ("eventos"."ubicacion_lat" between -90 and 90 and "eventos"."ubicacion_lng" between -180 and 180)));--> statement-breakpoint
-- Aislamiento entre organizaciones (D47), como en 0001_aislamiento.sql.
ALTER TABLE "archivos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "archivos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "archivos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
