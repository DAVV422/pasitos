ALTER TABLE "retos" DROP CONSTRAINT "retos_tipo";--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_metodo";--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "pedir_ci" text DEFAULT 'no' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "verificacion_ci_activa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "reto_verificacion_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "llave_carnets_cifrada" "bytea";--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "ci_verificado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "ci_verificado_por" uuid;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "ci_hash_verificado" "bytea";--> statement-breakpoint
ALTER TABLE "miembros_evento" ADD COLUMN "verifica_ci" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "premios" ADD COLUMN "requiere_ci" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_ci_verificado_por_usuarios_id_fk" FOREIGN KEY ("ci_verificado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asistentes_ci_verificado" ON "asistentes" USING btree ("evento_id","ci_hash_verificado") WHERE "asistentes"."ci_hash_verificado" is not null;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_pedir_ci" CHECK ("eventos"."pedir_ci" in ('no', 'opcional'));--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_tipo" CHECK ("retos"."tipo" in ('qr', 'otorgado', 'encuesta', 'verificacion_ci'));--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_metodo" CHECK ("check_ins"."metodo" in ('escaneo_entrada', 'busqueda', 'registro_puerta', 'vinculacion_puerta', 'autoregistro_equipo', 'autoregistro_tablet', 'autoregistro_impreso', 'verificacion_ci'));--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_reto_verificacion_id_retos_id_fk" FOREIGN KEY ("reto_verificacion_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;
