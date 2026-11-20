CREATE TABLE "mensajes_contacto" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"email" "citext" NOT NULL,
	"organizacion" text,
	"tipo_evento" text,
	"asistentes_aprox" text,
	"mensaje" text NOT NULL,
	"version_privacidad" text NOT NULL,
	"estado" text DEFAULT 'nuevo' NOT NULL,
	"nota_interna" text,
	"atendido_por" uuid,
	"atendido_at" timestamp with time zone,
	"ip_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"borrar_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mensajes_contacto_estado" CHECK ("mensajes_contacto"."estado" in ('nuevo', 'respondido', 'descartado')),
	CONSTRAINT "mensajes_contacto_tipo_evento" CHECK ("mensajes_contacto"."tipo_evento" is null or "mensajes_contacto"."tipo_evento" in ('conferencia', 'meetup', 'feria', 'universidad', 'otro')),
	CONSTRAINT "mensajes_contacto_asistentes" CHECK ("mensajes_contacto"."asistentes_aprox" is null or "mensajes_contacto"."asistentes_aprox" in ('menos_100', '100_300', '300_1000', 'mas_1000'))
);
--> statement-breakpoint
CREATE INDEX "mensajes_contacto_estado_fecha" ON "mensajes_contacto" USING btree ("estado","created_at");--> statement-breakpoint
CREATE INDEX "mensajes_contacto_borrar" ON "mensajes_contacto" USING btree ("borrar_at");--> statement-breakpoint
-- HU-410: el API (pasitos_app) solo crea y cuenta mensajes; la bandeja es de la consola (pasitos_sistema).
REVOKE UPDATE, DELETE ON "mensajes_contacto" FROM pasitos_app;
