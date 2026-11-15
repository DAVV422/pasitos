CREATE TABLE "aceptaciones_terminos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"asistente_id" uuid,
	"documento" text NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aceptaciones_terminos_documento" CHECK ("aceptaciones_terminos"."documento" in ('terminos', 'privacidad')),
	CONSTRAINT "aceptaciones_terminos_quien" CHECK (num_nonnulls("aceptaciones_terminos"."usuario_id", "aceptaciones_terminos"."asistente_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "aceptaciones_terminos" ADD CONSTRAINT "aceptaciones_terminos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aceptaciones_terminos_usuario" ON "aceptaciones_terminos" USING btree ("usuario_id");