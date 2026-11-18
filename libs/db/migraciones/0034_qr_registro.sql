CREATE TABLE "qr_registro" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"muestra" text NOT NULL,
	"usuario_id" uuid,
	"pantalla_id" uuid,
	"grupo_id" uuid,
	"marca_presente" boolean DEFAULT true NOT NULL,
	"tope" integer,
	"desde" timestamp with time zone,
	"hasta" timestamp with time zone,
	"token_hash" "bytea",
	"token_cifrado" "bytea",
	"secreto_cifrado" "bytea",
	"estado" text DEFAULT 'activo' NOT NULL,
	"invalidado_por" uuid,
	"invalidado_at" timestamp with time zone,
	"motivo_invalidacion" text,
	"registros" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_registro_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "qr_registro_nombre" UNIQUE("evento_id","nombre"),
	CONSTRAINT "qr_registro_nombre_largo" CHECK (char_length("qr_registro"."nombre") between 2 and 60),
	CONSTRAINT "qr_registro_tipo" CHECK ("qr_registro"."tipo" in ('rotativo', 'fijo')),
	CONSTRAINT "qr_registro_muestra" CHECK ("qr_registro"."muestra" in ('miembro', 'pantalla', 'impreso')),
	CONSTRAINT "qr_registro_muestra_tipo" CHECK (("qr_registro"."tipo" = 'fijo') = ("qr_registro"."muestra" = 'impreso')),
	CONSTRAINT "qr_registro_quien_muestra" CHECK (("qr_registro"."muestra" <> 'miembro' or "qr_registro"."usuario_id" is not null) and ("qr_registro"."muestra" <> 'pantalla' or "qr_registro"."pantalla_id" is not null)),
	CONSTRAINT "qr_registro_secretos" CHECK (("qr_registro"."tipo" = 'fijo' and "qr_registro"."token_hash" is not null and "qr_registro"."token_cifrado" is not null and "qr_registro"."secreto_cifrado" is null) or ("qr_registro"."tipo" = 'rotativo' and "qr_registro"."secreto_cifrado" is not null and "qr_registro"."token_hash" is null)),
	CONSTRAINT "qr_registro_tope" CHECK ("qr_registro"."tope" is null or "qr_registro"."tope" between 1 and 100000),
	CONSTRAINT "qr_registro_vigencia" CHECK ("qr_registro"."desde" is null or "qr_registro"."hasta" is null or "qr_registro"."desde" < "qr_registro"."hasta"),
	CONSTRAINT "qr_registro_estado" CHECK ("qr_registro"."estado" in ('activo', 'invalidado')),
	CONSTRAINT "qr_registro_motivo" CHECK ("qr_registro"."motivo_invalidacion" is null or char_length("qr_registro"."motivo_invalidacion") between 5 and 300),
	CONSTRAINT "qr_registro_registros" CHECK ("qr_registro"."registros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "autoregistro_activo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_registro" ADD CONSTRAINT "qr_registro_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registro" ADD CONSTRAINT "qr_registro_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registro" ADD CONSTRAINT "qr_registro_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registro" ADD CONSTRAINT "qr_registro_pantalla_id_pantallas_id_fk" FOREIGN KEY ("pantalla_id") REFERENCES "public"."pantallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registro" ADD CONSTRAINT "qr_registro_invalidado_por_usuarios_id_fk" FOREIGN KEY ("invalidado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registro" ADD CONSTRAINT "qr_registro_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_registro_pantalla_activa" ON "qr_registro" USING btree ("pantalla_id") WHERE "qr_registro"."estado" = 'activo' and "qr_registro"."pantalla_id" is not null;--> statement-breakpoint
CREATE INDEX "qr_registro_evento" ON "qr_registro" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "qr_registro_usuario" ON "qr_registro" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "qr_registro" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "qr_registro" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "qr_registro"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
