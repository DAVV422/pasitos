ALTER TABLE "pantallas" ADD COLUMN "pin_fallos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pantallas" ADD COLUMN "controles_bloqueados_hasta" timestamp with time zone;