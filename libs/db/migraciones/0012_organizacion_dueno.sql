ALTER TABLE "miembros_organizacion" ALTER COLUMN "usuario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD COLUMN "email_invitado" "citext";--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD COLUMN "estado" text DEFAULT 'activo' NOT NULL;--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD COLUMN "invitado_por" uuid;--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD COLUMN "aceptado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD COLUMN "revocado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD CONSTRAINT "miembros_organizacion_invitado_por_usuarios_id_fk" FOREIGN KEY ("invitado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "miembros_organizacion_invitacion" ON "miembros_organizacion" USING btree ("organizacion_id","email_invitado") WHERE "miembros_organizacion"."estado" = 'invitado';--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD CONSTRAINT "miembros_organizacion_estado" CHECK ("miembros_organizacion"."estado" in ('invitado', 'activo', 'revocado'));--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD CONSTRAINT "miembros_organizacion_quien" CHECK ("miembros_organizacion"."usuario_id" is not null or "miembros_organizacion"."email_invitado" is not null);