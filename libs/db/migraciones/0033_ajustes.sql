CREATE TABLE "notas_movimiento" (
	"movimiento_id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_movimiento" ADD CONSTRAINT "notas_movimiento_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_movimiento" ADD CONSTRAINT "notas_movimiento_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_movimiento" ADD CONSTRAINT "notas_movimiento_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "movimientos_anula_unica" ON "movimientos" USING btree ("anula_movimiento_id") WHERE "movimientos"."anula_movimiento_id" is not null;--> statement-breakpoint
ALTER TABLE "notas_movimiento" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notas_movimiento" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "notas_movimiento"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
