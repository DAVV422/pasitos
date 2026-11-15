ALTER TABLE "eventos" DROP CONSTRAINT "eventos_tope_puntos_persona";--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "tope_registros_puerta" integer;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_tope_registros_puerta" CHECK ("eventos"."tope_registros_puerta" is null or "eventos"."tope_registros_puerta" between 1 and 10000);--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_tope_puntos_persona" CHECK ("eventos"."tope_puntos_persona" is null or "eventos"."tope_puntos_persona" between 1 and 1000000);