ALTER TABLE "retos" ADD COLUMN "descripcion" text;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "modo_qr" text DEFAULT 'por_tiempo' NOT NULL;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "rotacion_segundos" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "lugar_id" uuid;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "disponible_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "disponible_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "sponsor_id" uuid;--> statement-breakpoint
ALTER TABLE "retos" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_modo_qr" CHECK ("retos"."modo_qr" in ('por_tiempo', 'un_uso', 'bajo_demanda', 'usos_limitados'));--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_rotacion" CHECK ("retos"."rotacion_segundos" in (15, 30, 60));--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_horario" CHECK ("retos"."disponible_desde" is null or "retos"."disponible_hasta" is null or "retos"."disponible_desde" < "retos"."disponible_hasta");--> statement-breakpoint
-- Las FK a lugares y sponsors van aquí: esas tablas se definen en contenido.ts, que ya importa retos.
ALTER TABLE "retos" ADD CONSTRAINT "retos_lugar_id_lugares_id_fk" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id");
--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id");
