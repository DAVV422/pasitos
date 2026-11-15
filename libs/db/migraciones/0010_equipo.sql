CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"credential_id" "bytea" NOT NULL,
	"public_key" "bytea" NOT NULL,
	"contador" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_at" timestamp with time zone,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_proposito";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "dispositivo" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "secreto_cifrado" "bytea";--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "totp_secret_cifrado" "bytea";--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "totp_ultimo_paso" bigint;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "intentos_fallidos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "bloqueado_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "password_cambiada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passkeys_usuario" ON "passkeys" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_proposito" CHECK ("tokens"."proposito" in ('qr_asistente', 'enlace_corto_asistente', 'conexion_pantalla', 'conexion_mesa', 'invitacion_equipo', 'invitacion_organizacion', 'invitacion_plataforma', 'restablecer_password', 'desafio_webauthn', 'configurar_totp', 'verificar_email'));