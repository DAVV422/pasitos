CREATE TABLE "premios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"imagen_archivo_id" uuid,
	"puntos" integer NOT NULL,
	"stock_total" integer NOT NULL,
	"stock_reservado" integer DEFAULT 0 NOT NULL,
	"stock_entregado" integer DEFAULT 0 NOT NULL,
	"max_por_persona" integer,
	"estado" text DEFAULT 'activo' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "premios_puntos" CHECK ("premios"."puntos" between 1 and 100000),
	CONSTRAINT "premios_stock_total" CHECK ("premios"."stock_total" between 0 and 100000),
	CONSTRAINT "premios_stock" CHECK ("premios"."stock_reservado" >= 0 and "premios"."stock_entregado" >= 0 and "premios"."stock_reservado" + "premios"."stock_entregado" <= "premios"."stock_total"),
	CONSTRAINT "premios_max_por_persona" CHECK ("premios"."max_por_persona" is null or "premios"."max_por_persona" between 1 and 100),
	CONSTRAINT "premios_estado" CHECK ("premios"."estado" in ('activo', 'oculto'))
);
--> statement-breakpoint
ALTER TABLE "premios" ADD CONSTRAINT "premios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premios" ADD CONSTRAINT "premios_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premios" ADD CONSTRAINT "premios_imagen_archivo_id_archivos_id_fk" FOREIGN KEY ("imagen_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "premios_evento" ON "premios" USING btree ("evento_id","orden");--> statement-breakpoint
ALTER TABLE "premios" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "premios" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "premios"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
