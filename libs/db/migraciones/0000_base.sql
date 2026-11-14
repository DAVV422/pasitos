CREATE TABLE "miembros_organizacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rol" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "miembros_organizacion_unico" UNIQUE("organizacion_id","usuario_id"),
	CONSTRAINT "miembros_organizacion_rol" CHECK ("miembros_organizacion"."rol" in ('dueno'))
);
--> statement-breakpoint
CREATE TABLE "organizaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"es_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizaciones_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizaciones_estado" CHECK ("organizaciones"."estado" in ('activa', 'suspendida'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" uuid,
	"vinculacion_id" uuid,
	"segundo_factor_at" timestamp with time zone,
	"ultimo_uso_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"revocada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_tipo" CHECK ("sessions"."tipo" in ('usuario', 'asistente')),
	CONSTRAINT "sessions_dueno" CHECK (("sessions"."tipo" = 'usuario' and "sessions"."usuario_id" is not null) or ("sessions"."tipo" = 'asistente' and "sessions"."vinculacion_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"proposito" text NOT NULL,
	"evento_id" uuid,
	"ref_id" uuid,
	"creado_por" uuid,
	"motivo" text,
	"expira_at" timestamp with time zone NOT NULL,
	"usado_at" timestamp with time zone,
	"revocado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "tokens_proposito" CHECK ("tokens"."proposito" in ('qr_asistente', 'enlace_corto_asistente', 'conexion_pantalla', 'conexion_mesa', 'invitacion_equipo', 'restablecer_password', 'verificar_email'))
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"nombre" text NOT NULL,
	"password_hash" text,
	"email_verificado_at" timestamp with time zone,
	"rol_plataforma" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "usuarios_rol_plataforma" CHECK ("usuarios"."rol_plataforma" is null or "usuarios"."rol_plataforma" in ('admin', 'soporte')),
	CONSTRAINT "usuarios_estado" CHECK ("usuarios"."estado" in ('activo', 'bloqueado'))
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'real' NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"visibilidad" text DEFAULT 'privado' NOT NULL,
	"zona_horaria" text DEFAULT 'America/La_Paz' NOT NULL,
	"inicio_at" timestamp with time zone NOT NULL,
	"fin_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_slug_unique" UNIQUE("slug"),
	CONSTRAINT "eventos_tipo" CHECK ("eventos"."tipo" in ('real', 'demo', 'prueba')),
	CONSTRAINT "eventos_estado" CHECK ("eventos"."estado" in ('borrador', 'publicado', 'en_curso', 'pausado', 'cerrado', 'archivado')),
	CONSTRAINT "eventos_visibilidad" CHECK ("eventos"."visibilidad" in ('privado', 'solo_enlace', 'publico')),
	CONSTRAINT "eventos_fechas" CHECK ("eventos"."fin_at" > "eventos"."inicio_at")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"evento_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"procesado_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD CONSTRAINT "miembros_organizacion_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros_organizacion" ADD CONSTRAINT "miembros_organizacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "miembros_organizacion_usuario" ON "miembros_organizacion" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessions_usuario" ON "sessions" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tokens_ref" ON "tokens" USING btree ("proposito","ref_id");--> statement-breakpoint
CREATE INDEX "eventos_organizacion" ON "eventos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "outbox_pendientes" ON "outbox" USING btree ("created_at") WHERE "outbox"."procesado_at" is null;