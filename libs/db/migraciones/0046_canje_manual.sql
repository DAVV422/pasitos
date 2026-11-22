ALTER TABLE "canjes" ALTER COLUMN "mesa_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "canjes" ADD COLUMN "registrado_por" uuid;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes" ADD CONSTRAINT "canjes_origen" CHECK ("canjes"."mesa_id" is not null or "canjes"."registrado_por" is not null);