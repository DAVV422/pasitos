CREATE TABLE "miembro_terminales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"miembro_evento_id" uuid NOT NULL,
	"pantalla_id" uuid,
	"mesa_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "miembro_terminales_una" CHECK (num_nonnulls("miembro_terminales"."pantalla_id", "miembro_terminales"."mesa_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "miembros_evento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"usuario_id" uuid,
	"email_invitado" "citext" NOT NULL,
	"rol" text NOT NULL,
	"estado" text DEFAULT 'invitado' NOT NULL,
	"invitado_por" uuid,
	"aceptado_at" timestamp with time zone,
	"revocado_at" timestamp with time zone,
	"tope_registros_puerta" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "miembros_evento_rol" CHECK ("miembros_evento"."rol" in ('coorganizador', 'registrador', 'operador_mesa', 'operador_stand', 'financiador')),
	CONSTRAINT "miembros_evento_estado" CHECK ("miembros_evento"."estado" in ('invitado', 'activo', 'vencido', 'revocado')),
	CONSTRAINT "miembros_evento_tope" CHECK ("miembros_evento"."tope_registros_puerta" is null or "miembros_evento"."tope_registros_puerta" between 1 and 100000)
);
--> statement-breakpoint
ALTER TABLE "miembro_terminales" ADD CONSTRAINT "miembro_terminales_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembro_terminales" ADD CONSTRAINT "miembro_terminales_miembro_evento_id_miembros_evento_id_fk" FOREIGN KEY ("miembro_evento_id") REFERENCES "public"."miembros_evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembro_terminales" ADD CONSTRAINT "miembro_terminales_pantalla_id_pantallas_id_fk" FOREIGN KEY ("pantalla_id") REFERENCES "public"."pantallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros_evento" ADD CONSTRAINT "miembros_evento_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros_evento" ADD CONSTRAINT "miembros_evento_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros_evento" ADD CONSTRAINT "miembros_evento_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros_evento" ADD CONSTRAINT "miembros_evento_invitado_por_usuarios_id_fk" FOREIGN KEY ("invitado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "miembro_terminales_pantalla" ON "miembro_terminales" USING btree ("miembro_evento_id","pantalla_id") WHERE "miembro_terminales"."pantalla_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "miembro_terminales_mesa" ON "miembro_terminales" USING btree ("miembro_evento_id","mesa_id") WHERE "miembro_terminales"."mesa_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "miembros_evento_email" ON "miembros_evento" USING btree ("evento_id","email_invitado") WHERE "miembros_evento"."estado" <> 'revocado';--> statement-breakpoint
CREATE INDEX "miembros_evento_usuario" ON "miembros_evento" USING btree ("usuario_id","evento_id");--> statement-breakpoint
-- Aislamiento entre organizaciones (D47), como en 0001_aislamiento.sql.
ALTER TABLE "miembros_evento" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "miembros_evento" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "miembros_evento"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "miembro_terminales" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "miembro_terminales" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "miembro_terminales"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
