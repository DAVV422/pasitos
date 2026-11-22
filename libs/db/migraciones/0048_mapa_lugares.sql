ALTER TABLE "lugares" ADD COLUMN "mapa_x" double precision;--> statement-breakpoint
ALTER TABLE "lugares" ADD COLUMN "mapa_y" double precision;--> statement-breakpoint
ALTER TABLE "lugares" ADD CONSTRAINT "lugares_mapa" CHECK (("lugares"."mapa_x" is null and "lugares"."mapa_y" is null) or ("lugares"."mapa_x" between 0 and 1 and "lugares"."mapa_y" between 0 and 1));