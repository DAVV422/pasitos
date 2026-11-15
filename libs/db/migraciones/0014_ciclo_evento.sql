ALTER TABLE "eventos" ADD COLUMN "publicado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "publicado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "iniciado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "cerrado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "cerrado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "nombre_puntos" text DEFAULT 'puntos' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "modo_registro" text DEFAULT 'lista' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "registro_puerta_activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "puntos_check_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "tope_ajuste" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "retos_requieren_check_in" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_modo_registro" CHECK ("eventos"."modo_registro" in ('lista'));--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_puntos_check_in" CHECK ("eventos"."puntos_check_in" between 0 and 1000);--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_tope_ajuste" CHECK ("eventos"."tope_ajuste" between 1 and 10000);--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_nombre_puntos" CHECK (char_length("eventos"."nombre_puntos") between 2 and 20);