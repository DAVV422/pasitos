ALTER TABLE "invitaciones" DROP CONSTRAINT "invitaciones_estado";--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "cierre_programado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "cierre_aviso_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "cierre_automatico_aviso_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "cierre_estado" text;--> statement-breakpoint
ALTER TABLE "canjes" ADD COLUMN "cancelado_por_cierre" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_cierre_estado" CHECK ("eventos"."cierre_estado" is null or "eventos"."cierre_estado" in ('sellando', 'listo', 'fallido'));--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_estado" CHECK ("invitaciones"."estado" in ('creada', 'enviada', 'rebotada', 'usada', 'revocada', 'vencida'));