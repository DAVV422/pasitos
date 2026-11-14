-- El intervalo mínimo de anclaje pasa de 1 a 2 minutos (D53, 2026-11-14): cada anclaje cuesta.
-- Los eventos que tenían 1 quedan en 2. eventos tiene RLS forzada también para el dueño, así que se
-- levanta solo para este UPDATE y se vuelve a forzar en la misma migración.
ALTER TABLE "eventos" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
UPDATE "eventos" SET "intervalo_anclaje_min" = 2 WHERE "intervalo_anclaje_min" = 1;
--> statement-breakpoint
ALTER TABLE "eventos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "eventos" DROP CONSTRAINT "eventos_intervalo_anclaje";
--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_intervalo_anclaje" CHECK ("eventos"."intervalo_anclaje_min" is null or "eventos"."intervalo_anclaje_min" in (2, 5, 10, 15, 30));
