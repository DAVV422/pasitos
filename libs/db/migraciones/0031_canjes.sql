CREATE TABLE "canje_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"canje_id" uuid NOT NULL,
	"premio_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"puntos_unitarios" integer NOT NULL,
	CONSTRAINT "canje_items_premio" UNIQUE("canje_id","premio_id"),
	CONSTRAINT "canje_items_cantidad" CHECK ("canje_items"."cantidad" between 1 and 20),
	CONSTRAINT "canje_items_puntos" CHECK ("canje_items"."puntos_unitarios" >= 0)
);
--> statement-breakpoint
CREATE TABLE "canjes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"mesa_id" uuid NOT NULL,
	"asistente_id" uuid,
	"token_hash" "bytea" NOT NULL,
	"comprobante" text NOT NULL,
	"total_puntos" integer NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"confirmado_at" timestamp with time zone,
	"cancelado_at" timestamp with time zone,
	"cancelado_por" uuid,
	"anulado_at" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"movimiento_id" uuid,
	"movimiento_anulacion_id" uuid,
	"requiere_ci" boolean DEFAULT false NOT NULL,
	"grupo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canjes_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "canjes_comprobante_evento" UNIQUE("evento_id","comprobante"),
	CONSTRAINT "canjes_estado" CHECK ("canjes"."estado" in ('pendiente', 'confirmado', 'vencido', 'cancelado', 'anulado')),
	CONSTRAINT "canjes_total" CHECK ("canjes"."total_puntos" >= 0),
	CONSTRAINT "canjes_comprobante" CHECK ("canjes"."comprobante" ~ '^C-[0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "canje_items" ADD CONSTRAINT "canje_items_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canje_items" ADD CONSTRAINT "canje_items_canje_id_canjes_id_fk" FOREIGN KEY ("canje_id") REFERENCES "public"."canjes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canje_items" ADD CONSTRAINT "canje_items_premio_id_premios_id_fk" FOREIGN KEY ("premio_id") REFERENCES "public"."premios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_movimiento_anulacion_id_movimientos_id_fk" FOREIGN KEY ("movimiento_anulacion_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canje_items_premio_idx" ON "canje_items" USING btree ("premio_id");--> statement-breakpoint
CREATE INDEX "canjes_mesa" ON "canjes" USING btree ("mesa_id","created_at");--> statement-breakpoint
CREATE INDEX "canjes_pendientes" ON "canjes" USING btree ("expira_at") WHERE "canjes"."estado" = 'pendiente';--> statement-breakpoint
CREATE INDEX "canjes_asistente" ON "canjes" USING btree ("asistente_id");--> statement-breakpoint
-- HU-316: la clave foránea que el libro dejó pendiente (Modelo §3).
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_canje_id_canjes_id_fk" FOREIGN KEY ("canje_id") REFERENCES "public"."canjes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canjes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "canjes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "canjes"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "canje_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "canje_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "canje_items"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
