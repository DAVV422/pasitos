CREATE TABLE "operaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"estado" text DEFAULT 'en_cola' NOT NULL,
	"progreso" integer DEFAULT 0 NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resultado" jsonb,
	"datos" jsonb,
	"error" text,
	"created_by" uuid,
	"expira_at" timestamp with time zone NOT NULL,
	"descarga_token_hash" "bytea",
	"descarga_expira_at" timestamp with time zone,
	"descargada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operaciones_tipo" CHECK ("operaciones"."tipo" in ('import-asistentes', 'export-asistentes', 'send-invitaciones')),
	CONSTRAINT "operaciones_estado" CHECK ("operaciones"."estado" in ('en_cola', 'procesando', 'lista', 'fallida', 'confirmada')),
	CONSTRAINT "operaciones_progreso" CHECK ("operaciones"."progreso" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "asistentes" ALTER COLUMN "codigo_asistente" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "ultimo_codigo_asistente" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "codigo_externo" text;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "email" "citext";--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "email_estado" text DEFAULT 'sin_correo' NOT NULL;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "origen" text DEFAULT 'lista' NOT NULL;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "registrado_por" uuid;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operaciones_pendientes" ON "operaciones" USING btree ("estado","created_at");--> statement-breakpoint
CREATE INDEX "operaciones_evento" ON "operaciones" USING btree ("evento_id");--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asistentes_email" ON "asistentes" USING btree ("evento_id","email") WHERE "asistentes"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "asistentes_codigo_externo" ON "asistentes" USING btree ("evento_id","codigo_externo") WHERE "asistentes"."codigo_externo" is not null;--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_email_estado" CHECK ("asistentes"."email_estado" in ('sin_correo', 'pendiente', 'en_cola', 'enviado', 'rebotado'));--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_origen" CHECK ("asistentes"."origen" in ('lista', 'csv', 'puerta'));--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_nombre" CHECK (char_length("asistentes"."nombre") between 2 and 120);--> statement-breakpoint
-- Para buscar sin tildes ni mayúsculas con el índice trigram: unaccent no es IMMUTABLE y un índice
-- lo necesita; con el diccionario explícito, el resultado es fijo.
CREATE FUNCTION pasitos_normalizar(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, texto)) $$;
--> statement-breakpoint
CREATE INDEX "asistentes_nombre_trgm" ON "asistentes" USING gin (pasitos_normalizar("nombre") gin_trgm_ops);
--> statement-breakpoint
-- El código de asistente (A-0001, A-0002… y 5 dígitos desde 10 000): con el contador del evento, fijo.
CREATE FUNCTION asignar_codigo_asistente() RETURNS trigger AS $$
DECLARE
  n integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.codigo_asistente <> OLD.codigo_asistente THEN
      RAISE EXCEPTION 'El código de un asistente no cambia';
    END IF;
    RETURN NEW;
  END IF;
  UPDATE eventos SET ultimo_codigo_asistente = ultimo_codigo_asistente + 1
    WHERE id = NEW.evento_id RETURNING ultimo_codigo_asistente INTO n;
  IF n IS NULL THEN
    RAISE EXCEPTION 'Evento % no encontrado', NEW.evento_id;
  END IF;
  NEW.codigo_asistente := 'A-' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER asignar_codigo_asistente BEFORE INSERT OR UPDATE ON "asistentes" FOR EACH ROW EXECUTE FUNCTION asignar_codigo_asistente();
--> statement-breakpoint
-- Los asistentes que ya existían (semillas de prueba): el contador sigue desde el mayor código.
UPDATE "eventos" e SET "ultimo_codigo_asistente" = coalesce((
  SELECT max(substring(a."codigo_asistente" FROM 3)::integer) FROM "asistentes" a
   WHERE a."evento_id" = e."id" AND a."codigo_asistente" ~ '^A-[0-9]+$'
), 0);
--> statement-breakpoint
-- Con RLS como el resto: el guard resuelve el evento de la operación y el servicio entra con su organización.
ALTER TABLE "operaciones" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "operaciones" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "operaciones"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
