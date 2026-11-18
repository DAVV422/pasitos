CREATE TABLE "escaneos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"pantalla_id" uuid,
	"reto_id" uuid,
	"asistente_id" uuid,
	"dispositivo_id" uuid,
	"qr_epoca" integer,
	"qr_franja" integer,
	"qr_nonce" text,
	"metodo" text DEFAULT 'qr' NOT NULL,
	"resultado" text NOT NULL,
	"movimiento_id" uuid,
	"latencia_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escaneos_metodo" CHECK ("escaneos"."metodo" in ('qr')),
	CONSTRAINT "escaneos_resultado" CHECK ("escaneos"."resultado" in ('aceptado', 'firma_invalida', 'evento_no_activo', 'vencido', 'ya_usado', 'fuera_de_horario', 'solo_para_grupo', 'sin_check_in', 'ya_completado', 'agotado', 'dispositivo_anulado', 'error'))
);
--> statement-breakpoint
CREATE TABLE "qr_emitidos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"pantalla_id" uuid NOT NULL,
	"reto_id" uuid NOT NULL,
	"modo" text NOT NULL,
	"epoca" integer NOT NULL,
	"franja" integer,
	"nonce" text,
	"inicio_at" timestamp with time zone NOT NULL,
	"fin_at" timestamp with time zone,
	"fin_motivo" text,
	"invalidado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_emitidos_modo" CHECK ("qr_emitidos"."modo" in ('por_tiempo', 'un_uso')),
	CONSTRAINT "qr_emitidos_fin_motivo" CHECK ("qr_emitidos"."fin_motivo" is null or "qr_emitidos"."fin_motivo" in ('vencio', 'usado', 'invalidado', 'pausa')),
	CONSTRAINT "qr_emitidos_franja_o_nonce" CHECK (("qr_emitidos"."franja" is null) <> ("qr_emitidos"."nonce" is null))
);
--> statement-breakpoint
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_pantalla_id_pantallas_id_fk" FOREIGN KEY ("pantalla_id") REFERENCES "public"."pantallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_reto_id_retos_id_fk" FOREIGN KEY ("reto_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_emitidos" ADD CONSTRAINT "qr_emitidos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_emitidos" ADD CONSTRAINT "qr_emitidos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_emitidos" ADD CONSTRAINT "qr_emitidos_pantalla_id_pantallas_id_fk" FOREIGN KEY ("pantalla_id") REFERENCES "public"."pantallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_emitidos" ADD CONSTRAINT "qr_emitidos_reto_id_retos_id_fk" FOREIGN KEY ("reto_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_emitidos" ADD CONSTRAINT "qr_emitidos_invalidado_por_usuarios_id_fk" FOREIGN KEY ("invalidado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escaneos_nonce_aceptado" ON "escaneos" USING btree ("pantalla_id","qr_nonce") WHERE "escaneos"."resultado" = 'aceptado' and "escaneos"."qr_nonce" is not null;--> statement-breakpoint
CREATE INDEX "escaneos_evento" ON "escaneos" USING btree ("evento_id","created_at");--> statement-breakpoint
CREATE INDEX "escaneos_asistente" ON "escaneos" USING btree ("asistente_id");--> statement-breakpoint
CREATE INDEX "qr_emitidos_pantalla" ON "qr_emitidos" USING btree ("pantalla_id","inicio_at");--> statement-breakpoint
ALTER TABLE "qr_emitidos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "qr_emitidos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "qr_emitidos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "escaneos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "escaneos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "escaneos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
