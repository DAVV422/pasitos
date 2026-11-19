CREATE TABLE "asistente_grupos" (
	"asistente_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"via" text NOT NULL,
	"agregado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asistente_grupos_asistente_id_grupo_id_pk" PRIMARY KEY("asistente_id","grupo_id"),
	CONSTRAINT "asistente_grupos_via" CHECK ("asistente_grupos"."via" in ('qr', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "grupos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"color" text DEFAULT 'puntos' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_nombre" UNIQUE("evento_id","nombre"),
	CONSTRAINT "grupos_nombre_largo" CHECK (char_length("grupos"."nombre") between 2 and 40),
	CONSTRAINT "grupos_color" CHECK ("grupos"."color" in ('puntos', 'ok', 'peligro', 'atenuado'))
);
--> statement-breakpoint
ALTER TABLE "movimientos" DROP CONSTRAINT "movimientos_signo";--> statement-breakpoint
ALTER TABLE "premios" DROP CONSTRAINT "premios_puntos";--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "grupo_id" uuid;--> statement-breakpoint
ALTER TABLE "premios" ADD COLUMN "grupo_id" uuid;--> statement-breakpoint
ALTER TABLE "asistente_grupos" ADD CONSTRAINT "asistente_grupos_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistente_grupos" ADD CONSTRAINT "asistente_grupos_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistente_grupos" ADD CONSTRAINT "asistente_grupos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistente_grupos" ADD CONSTRAINT "asistente_grupos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistente_grupos" ADD CONSTRAINT "asistente_grupos_agregado_por_usuarios_id_fk" FOREIGN KEY ("agregado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asistente_grupos_grupo" ON "asistente_grupos" USING btree ("grupo_id");--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premios" ADD CONSTRAINT "premios_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registro" ADD CONSTRAINT "qr_registro_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_signo" CHECK (("movimientos"."tipo" = 'checkin' and "movimientos"."puntos" >= 0)
        or ("movimientos"."tipo" = 'reto' and "movimientos"."puntos" > 0)
        or ("movimientos"."tipo" = 'canje' and "movimientos"."puntos" <= 0)
        or ("movimientos"."tipo" = 'vencimiento' and "movimientos"."puntos" < 0)
        or ("movimientos"."tipo" in ('anulacion', 'ajuste') and "movimientos"."puntos" <> 0));--> statement-breakpoint
ALTER TABLE "premios" ADD CONSTRAINT "premios_puntos" CHECK ("premios"."puntos" between 1 and 100000 or ("premios"."puntos" = 0 and "premios"."grupo_id" is not null));--> statement-breakpoint
ALTER TABLE "grupos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "grupos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "grupos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "asistente_grupos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asistente_grupos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "asistente_grupos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
