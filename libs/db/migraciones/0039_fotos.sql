CREATE TABLE "reto_responsables" (
	"reto_id" uuid NOT NULL,
	"miembro_id" uuid NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	CONSTRAINT "reto_responsables_reto_id_miembro_id_pk" PRIMARY KEY("reto_id","miembro_id")
);
--> statement-breakpoint
CREATE TABLE "envios_foto" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"reto_id" uuid NOT NULL,
	"asistente_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"intento" integer NOT NULL,
	"archivo_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"estado" text DEFAULT 'recibida' NOT NULL,
	"tomada_por" uuid,
	"tomada_hasta" timestamp with time zone,
	"revisada_por" uuid,
	"revisada_at" timestamp with time zone,
	"motivo_rechazo" text,
	"nota" text,
	"movimiento_id" uuid,
	"firma_dispositivo" "bytea",
	"sha256" text,
	"hash_perceptual" "bytea",
	"autoriza_uso" boolean DEFAULT false NOT NULL,
	"autoriza_uso_at" timestamp with time zone,
	"autoriza_uso_retirada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "envios_foto_intento" UNIQUE("reto_id","asistente_id","intento"),
	CONSTRAINT "envios_foto_origen" CHECK ("envios_foto"."origen" in ('camara', 'galeria')),
	CONSTRAINT "envios_foto_estado" CHECK ("envios_foto"."estado" in ('recibida', 'en_revision', 'rechazada_sistema', 'aprobada', 'rechazada', 'anulada')),
	CONSTRAINT "envios_foto_intento_positivo" CHECK ("envios_foto"."intento" >= 1)
);
--> statement-breakpoint
ALTER TABLE "retos" DROP CONSTRAINT "retos_tipo";--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_proposito";--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_estado";--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "instruccion_foto" text;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "permite_galeria" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "autorizacion_uso" text DEFAULT 'opcional' NOT NULL;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "intentos_max" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "reto_responsables" ADD CONSTRAINT "reto_responsables_reto_id_retos_id_fk" FOREIGN KEY ("reto_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reto_responsables" ADD CONSTRAINT "reto_responsables_miembro_id_miembros_evento_id_fk" FOREIGN KEY ("miembro_id") REFERENCES "public"."miembros_evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reto_responsables" ADD CONSTRAINT "reto_responsables_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reto_responsables" ADD CONSTRAINT "reto_responsables_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_reto_id_retos_id_fk" FOREIGN KEY ("reto_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_tomada_por_usuarios_id_fk" FOREIGN KEY ("tomada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_revisada_por_usuarios_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_foto" ADD CONSTRAINT "envios_foto_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reto_responsables_miembro" ON "reto_responsables" USING btree ("miembro_id");--> statement-breakpoint
CREATE UNIQUE INDEX "envios_foto_pendiente" ON "envios_foto" USING btree ("reto_id","asistente_id") WHERE "envios_foto"."estado" in ('recibida', 'en_revision');--> statement-breakpoint
CREATE INDEX "envios_foto_cola" ON "envios_foto" USING btree ("evento_id","estado","created_at");--> statement-breakpoint
CREATE INDEX "envios_foto_asistente" ON "envios_foto" USING btree ("asistente_id");--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_autorizacion_uso" CHECK ("retos"."autorizacion_uso" in ('opcional', 'requerida'));--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_intentos_max" CHECK ("retos"."intentos_max" between 1 and 10);--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_instruccion_foto" CHECK (("retos"."tipo" <> 'foto' or char_length("retos"."instruccion_foto") between 5 and 200));--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_tipo" CHECK ("retos"."tipo" in ('qr', 'otorgado', 'encuesta', 'verificacion_ci', 'foto'));--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_proposito" CHECK ("archivos"."proposito" in ('logo_evento', 'portada', 'plano', 'logo_sponsor', 'imagen_premio', 'importacion_csv', 'mapa_estatico', 'foto_reto'));--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_estado" CHECK ("archivos"."estado" in ('cuarentena', 'aprobado', 'rechazado', 'borrado'));--> statement-breakpoint
ALTER TABLE "envios_foto" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "envios_foto" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "envios_foto"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "reto_responsables" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reto_responsables" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "reto_responsables"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
