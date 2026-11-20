CREATE TABLE "reportes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"datos" jsonb NOT NULL,
	"publico" boolean DEFAULT false NOT NULL,
	"token_publico_hash" "bytea",
	"enlace_version" integer DEFAULT 0 NOT NULL,
	"generado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"publicado_at" timestamp with time zone,
	"publicado_por" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reportes_evento_id_unique" UNIQUE("evento_id"),
	CONSTRAINT "reportes_token_publico_hash_unique" UNIQUE("token_publico_hash"),
	CONSTRAINT "reportes_publico_token" CHECK ((not "reportes"."publico" or "reportes"."token_publico_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canjes_evento" ON "canjes" USING btree ("evento_id","created_at");--> statement-breakpoint
ALTER TABLE "reportes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reportes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "reportes"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
REVOKE DELETE ON "reportes" FROM pasitos_app;
