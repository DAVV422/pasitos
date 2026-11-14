CREATE TABLE "asistentes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"codigo_asistente" text NOT NULL,
	"nombre" text NOT NULL,
	"estado" text DEFAULT 'invitado' NOT NULL,
	"id_anonimo" "bytea" DEFAULT decode('', 'hex') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asistentes_codigo" UNIQUE("evento_id","codigo_asistente"),
	CONSTRAINT "asistentes_id_anonimo" UNIQUE("evento_id","id_anonimo"),
	CONSTRAINT "asistentes_estado" CHECK ("asistentes"."estado" in ('invitado', 'registrado', 'presente', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "bitacora" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid,
	"evento_id" uuid,
	"actor_tipo" text NOT NULL,
	"actor_id" uuid,
	"actor_nombre" text NOT NULL,
	"actor_rol" text,
	"accion" text NOT NULL,
	"objeto_tipo" text,
	"objeto_id" uuid,
	"objeto_nombre" text,
	"antes" jsonb,
	"despues" jsonb,
	"dispositivo_modelo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bitacora_actor_tipo" CHECK ("bitacora"."actor_tipo" in ('usuario', 'pantalla', 'mesa', 'sistema'))
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"huella_anterior" "bytea" NOT NULL,
	"raiz" "bytea" NOT NULL,
	"huella" "bytea" NOT NULL,
	"cantidad_movimientos" integer NOT NULL,
	"conteos_por_reto" jsonb NOT NULL,
	"es_cierre" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'armado' NOT NULL,
	"tx_hash" text,
	"ledger_stellar" integer,
	"intentos" integer DEFAULT 0 NOT NULL,
	"ultimo_error" text,
	"comision_estimada_stroops" bigint,
	"comision_stroops" bigint,
	"archivo_ruta" text,
	"armado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_at" timestamp with time zone,
	"confirmado_at" timestamp with time zone,
	CONSTRAINT "lotes_numero" UNIQUE("evento_id","numero"),
	CONSTRAINT "lotes_estado" CHECK ("lotes"."estado" in ('armado', 'enviado', 'confirmado', 'rechazado')),
	CONSTRAINT "lotes_numero_positivo" CHECK ("lotes"."numero" >= 1),
	CONSTRAINT "lotes_hashes" CHECK (octet_length("lotes"."huella_anterior") = 32 and octet_length("lotes"."raiz") = 32 and octet_length("lotes"."huella") = 32)
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"asistente_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"puntos" integer NOT NULL,
	"reto_id" uuid,
	"canje_id" uuid,
	"pantalla_id" uuid,
	"anula_movimiento_id" uuid,
	"qr" jsonb,
	"firma_dispositivo" "bytea",
	"autor_id" uuid,
	"motivo" text,
	"origen" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_tipo" CHECK ("movimientos"."tipo" in ('checkin', 'reto', 'canje', 'anulacion', 'ajuste', 'vencimiento')),
	CONSTRAINT "movimientos_origen" CHECK ("movimientos"."origen" in ('asistente', 'equipo', 'sistema')),
	CONSTRAINT "movimientos_signo" CHECK (("movimientos"."tipo" = 'checkin' and "movimientos"."puntos" >= 0)
        or ("movimientos"."tipo" = 'reto' and "movimientos"."puntos" > 0)
        or ("movimientos"."tipo" in ('canje', 'vencimiento') and "movimientos"."puntos" < 0)
        or ("movimientos"."tipo" in ('anulacion', 'ajuste') and "movimientos"."puntos" <> 0)),
	CONSTRAINT "movimientos_reto" CHECK ("movimientos"."tipo" <> 'reto' or "movimientos"."reto_id" is not null),
	CONSTRAINT "movimientos_canje" CHECK ("movimientos"."tipo" <> 'canje' or "movimientos"."canje_id" is not null),
	CONSTRAINT "movimientos_anulacion" CHECK ("movimientos"."tipo" <> 'anulacion' or "movimientos"."anula_movimiento_id" is not null),
	CONSTRAINT "movimientos_autor" CHECK ("movimientos"."tipo" not in ('ajuste', 'anulacion') or ("movimientos"."autor_id" is not null and "movimientos"."motivo" is not null))
);
--> statement-breakpoint
CREATE TABLE "movimientos_lote" (
	"movimiento_id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "movimientos_lote_n" UNIQUE("evento_id","n"),
	CONSTRAINT "movimientos_lote_n_positivo" CHECK ("movimientos_lote"."n" >= 1)
);
--> statement-breakpoint
CREATE TABLE "pantallas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"numero" integer DEFAULT 0 NOT NULL,
	"nombre" text NOT NULL,
	"llave_publica" "bytea",
	"registrada_en_stellar_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pantallas_numero" UNIQUE("evento_id","numero"),
	CONSTRAINT "pantallas_numero_positivo" CHECK ("pantallas"."numero" >= 1),
	CONSTRAINT "pantallas_llave_publica" CHECK ("pantallas"."llave_publica" is null or octet_length("pantallas"."llave_publica") = 65)
);
--> statement-breakpoint
CREATE TABLE "participaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"reto_id" uuid NOT NULL,
	"asistente_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participaciones_movimiento_id_unique" UNIQUE("movimiento_id"),
	CONSTRAINT "participaciones_unica" UNIQUE("reto_id","asistente_id","numero"),
	CONSTRAINT "participaciones_numero" CHECK ("participaciones"."numero" >= 1)
);
--> statement-breakpoint
CREATE TABLE "retos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"numero" integer DEFAULT 0 NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'qr' NOT NULL,
	"puntos" integer NOT NULL,
	"tope_total" integer NOT NULL,
	"veces_por_persona" integer DEFAULT 1 NOT NULL,
	"entregados" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"registrado_en_stellar_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retos_numero" UNIQUE("evento_id","numero"),
	CONSTRAINT "retos_tipo" CHECK ("retos"."tipo" in ('qr', 'otorgado', 'encuesta')),
	CONSTRAINT "retos_estado" CHECK ("retos"."estado" in ('activo', 'desactivado')),
	CONSTRAINT "retos_puntos" CHECK ("retos"."puntos" > 0),
	CONSTRAINT "retos_tope_total" CHECK ("retos"."tope_total" > 0),
	CONSTRAINT "retos_veces_por_persona" CHECK ("retos"."veces_por_persona" >= 1),
	CONSTRAINT "retos_entregados" CHECK ("retos"."entregados" >= 0 and "retos"."entregados" <= "retos"."tope_total"),
	CONSTRAINT "retos_numero_positivo" CHECK ("retos"."numero" >= 1)
);
--> statement-breakpoint
CREATE TABLE "saldos" (
	"asistente_id" uuid PRIMARY KEY NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"puntos" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saldos_no_negativo" CHECK ("saldos"."puntos" >= 0)
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "sal_anonima" "bytea" DEFAULT sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea) NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "contrato_id" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "intervalo_anclaje_min" integer;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "tope_puntos_persona" integer;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "ultimo_numero_reto" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "ultimo_numero_pantalla" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_reto_id_retos_id_fk" FOREIGN KEY ("reto_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_pantalla_id_pantallas_id_fk" FOREIGN KEY ("pantalla_id") REFERENCES "public"."pantallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_anula_movimiento_id_movimientos_id_fk" FOREIGN KEY ("anula_movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_lote" ADD CONSTRAINT "movimientos_lote_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_lote" ADD CONSTRAINT "movimientos_lote_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_lote" ADD CONSTRAINT "movimientos_lote_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_lote" ADD CONSTRAINT "movimientos_lote_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantallas" ADD CONSTRAINT "pantallas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participaciones" ADD CONSTRAINT "participaciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participaciones" ADD CONSTRAINT "participaciones_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participaciones" ADD CONSTRAINT "participaciones_reto_id_retos_id_fk" FOREIGN KEY ("reto_id") REFERENCES "public"."retos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participaciones" ADD CONSTRAINT "participaciones_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participaciones" ADD CONSTRAINT "participaciones_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retos" ADD CONSTRAINT "retos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos" ADD CONSTRAINT "saldos_asistente_id_asistentes_id_fk" FOREIGN KEY ("asistente_id") REFERENCES "public"."asistentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos" ADD CONSTRAINT "saldos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos" ADD CONSTRAINT "saldos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bitacora_evento" ON "bitacora" USING btree ("evento_id","created_at");--> statement-breakpoint
CREATE INDEX "movimientos_evento" ON "movimientos" USING btree ("evento_id","id");--> statement-breakpoint
CREATE INDEX "movimientos_asistente" ON "movimientos" USING btree ("asistente_id","id");--> statement-breakpoint
CREATE INDEX "movimientos_lote_lote" ON "movimientos_lote" USING btree ("lote_id");--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_intervalo_anclaje" CHECK ("eventos"."intervalo_anclaje_min" is null or "eventos"."intervalo_anclaje_min" in (1, 2, 5, 10, 15, 30));--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_tope_puntos_persona" CHECK ("eventos"."tope_puntos_persona" is null or "eventos"."tope_puntos_persona" > 0);--> statement-breakpoint
-- ── A mano (HU-101) ─────────────────────────────────────────────────────────────
-- Aislamiento entre organizaciones (D47): misma política que 0001_aislamiento.sql.
ALTER TABLE "asistentes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asistentes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "asistentes"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "retos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "retos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "retos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "pantallas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pantallas" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "pantallas"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "movimientos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "movimientos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "movimientos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "saldos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "saldos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "saldos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "participaciones" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "participaciones" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "participaciones"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "lotes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lotes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "lotes"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "movimientos_lote" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "movimientos_lote" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "movimientos_lote"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "bitacora" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bitacora" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "bitacora"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
-- Tablas de solo agregar: el libro, las participaciones, la asignación a lotes y la bitácora.
CREATE TRIGGER solo_agregar BEFORE UPDATE OR DELETE ON "movimientos" FOR EACH ROW EXECUTE FUNCTION rechazar_cambios();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "movimientos" FROM pasitos_app, pasitos_sistema;
--> statement-breakpoint
CREATE TRIGGER solo_agregar BEFORE UPDATE OR DELETE ON "participaciones" FOR EACH ROW EXECUTE FUNCTION rechazar_cambios();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "participaciones" FROM pasitos_app, pasitos_sistema;
--> statement-breakpoint
CREATE TRIGGER solo_agregar BEFORE UPDATE OR DELETE ON "movimientos_lote" FOR EACH ROW EXECUTE FUNCTION rechazar_cambios();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "movimientos_lote" FROM pasitos_app, pasitos_sistema;
--> statement-breakpoint
CREATE TRIGGER solo_agregar BEFORE UPDATE OR DELETE ON "bitacora" FOR EACH ROW EXECUTE FUNCTION rechazar_cambios();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "bitacora" FROM pasitos_app, pasitos_sistema;
--> statement-breakpoint
-- ID anónimo de los lotes públicos: SHA-256(sal del evento ‖ id). La sal no sale de la base.
CREATE FUNCTION asignar_id_anonimo() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_anonimo <> OLD.id_anonimo OR NEW.evento_id <> OLD.evento_id OR NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'El id anónimo y el evento de un asistente no cambian';
    END IF;
    RETURN NEW;
  END IF;
  SELECT sha256(e.sal_anonima || convert_to(NEW.id::text, 'UTF8')) INTO NEW.id_anonimo
    FROM eventos e WHERE e.id = NEW.evento_id;
  IF NEW.id_anonimo IS NULL THEN
    RAISE EXCEPTION 'Evento % no encontrado', NEW.evento_id;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER asignar_id_anonimo BEFORE INSERT OR UPDATE ON "asistentes" FOR EACH ROW EXECUTE FUNCTION asignar_id_anonimo();
--> statement-breakpoint
-- Cada asistente nace con su saldo en 0, en la misma transacción.
CREATE FUNCTION crear_saldo() RETURNS trigger AS $$
BEGIN
  INSERT INTO saldos (asistente_id, organizacion_id, evento_id)
    VALUES (NEW.id, NEW.organizacion_id, NEW.evento_id);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER crear_saldo AFTER INSERT ON "asistentes" FOR EACH ROW EXECUTE FUNCTION crear_saldo();
--> statement-breakpoint
-- Números cortos de la red (Contrato §1.5): se asignan con el contador del evento y no cambian.
CREATE FUNCTION asignar_numero_corto() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.numero <> OLD.numero OR NEW.evento_id <> OLD.evento_id THEN
      RAISE EXCEPTION 'El número de % en la red no cambia', TG_TABLE_NAME;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'retos' THEN
    UPDATE eventos SET ultimo_numero_reto = ultimo_numero_reto + 1
      WHERE id = NEW.evento_id RETURNING ultimo_numero_reto INTO NEW.numero;
  ELSE
    UPDATE eventos SET ultimo_numero_pantalla = ultimo_numero_pantalla + 1
      WHERE id = NEW.evento_id RETURNING ultimo_numero_pantalla INTO NEW.numero;
  END IF;
  IF NEW.numero IS NULL THEN
    RAISE EXCEPTION 'Evento % no encontrado', NEW.evento_id;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER asignar_numero_corto BEFORE INSERT OR UPDATE ON "retos" FOR EACH ROW EXECUTE FUNCTION asignar_numero_corto();
--> statement-breakpoint
CREATE TRIGGER asignar_numero_corto BEFORE INSERT OR UPDATE ON "pantallas" FOR EACH ROW EXECUTE FUNCTION asignar_numero_corto();
