CREATE TABLE "transacciones_stellar" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evento_id" uuid,
	"lote_id" uuid,
	"operacion" text NOT NULL,
	"tx_hash" text NOT NULL,
	"red" text NOT NULL,
	"resultado" text DEFAULT 'enviada' NOT NULL,
	"comision_estimada_stroops" bigint NOT NULL,
	"comision_stroops" bigint,
	"recursos" jsonb NOT NULL,
	"ledger_stellar" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_at" timestamp with time zone,
	CONSTRAINT "transacciones_stellar_operacion" CHECK ("transacciones_stellar"."operacion" in ('upload_wasm', 'deploy', 'add_retos', 'raise_tope', 'add_pantallas', 'anchor', 'close', 'extend_ttl')),
	CONSTRAINT "transacciones_stellar_red" CHECK ("transacciones_stellar"."red" in ('local', 'testnet')),
	CONSTRAINT "transacciones_stellar_resultado" CHECK ("transacciones_stellar"."resultado" in ('enviada', 'incluida', 'fallida', 'vencida'))
);
--> statement-breakpoint
ALTER TABLE "transacciones_stellar" ADD CONSTRAINT "transacciones_stellar_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacciones_stellar" ADD CONSTRAINT "transacciones_stellar_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transacciones_stellar_evento" ON "transacciones_stellar" USING btree ("evento_id","created_at");--> statement-breakpoint
CREATE INDEX "transacciones_stellar_fecha" ON "transacciones_stellar" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transacciones_stellar_hash" ON "transacciones_stellar" USING btree ("tx_hash");--> statement-breakpoint
-- transacciones_stellar (HU-104 §1): una fila por intento enviado. El resultado se fija una sola vez
-- (de 'enviada' a 'incluida', 'fallida' o 'vencida'); después la fila no cambia ni se borra.
CREATE FUNCTION fijar_resultado_transaccion() RETURNS trigger AS $$
BEGIN
  IF OLD.resultado <> 'enviada'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.evento_id IS DISTINCT FROM OLD.evento_id
     OR NEW.lote_id IS DISTINCT FROM OLD.lote_id
     OR NEW.operacion IS DISTINCT FROM OLD.operacion
     OR NEW.tx_hash IS DISTINCT FROM OLD.tx_hash
     OR NEW.red IS DISTINCT FROM OLD.red
     OR NEW.comision_estimada_stroops IS DISTINCT FROM OLD.comision_estimada_stroops
     OR NEW.recursos IS DISTINCT FROM OLD.recursos
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'transacciones_stellar: solo se fija el resultado de una transacción enviada';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER transacciones_stellar_resultado BEFORE UPDATE ON "transacciones_stellar"
  FOR EACH ROW EXECUTE FUNCTION fijar_resultado_transaccion();
--> statement-breakpoint
CREATE TRIGGER transacciones_stellar_sin_borrar BEFORE DELETE ON "transacciones_stellar"
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambios();
--> statement-breakpoint
-- Solo la usa el trabajador. El API no la lee: la salud pasa por la función de abajo.
REVOKE ALL ON "transacciones_stellar" FROM pasitos_app;
--> statement-breakpoint
REVOKE DELETE ON "transacciones_stellar" FROM pasitos_sistema;
--> statement-breakpoint
-- GET /api/v1/salud (HU-104 §4): segundos desde el último anclaje que entró, sin ids ni datos del evento.
-- SECURITY DEFINER porque pasitos_app no lee transacciones_stellar; devuelve solo un número.
CREATE FUNCTION segundos_desde_ultimo_anclaje() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT floor(extract(epoch FROM now() - max(resuelta_at)))::integer
    FROM transacciones_stellar
   WHERE operacion = 'anchor' AND resultado = 'incluida'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION segundos_desde_ultimo_anclaje() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION segundos_desde_ultimo_anclaje() TO pasitos_app;
