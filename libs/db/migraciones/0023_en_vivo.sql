CREATE INDEX "outbox_evento" ON "outbox" USING btree ("evento_id","id");--> statement-breakpoint
-- T-301 §1: cada fila nueva de outbox avisa a los procesos del API (LISTEN outbox). pg_notify
-- dentro de una transacción se entrega recién al confirmarla: nadie se entera de algo que no pasó.
CREATE FUNCTION avisar_outbox() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM pg_notify('outbox', NEW.id::text);
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER outbox_avisar AFTER INSERT ON "outbox"
  FOR EACH ROW EXECUTE FUNCTION avisar_outbox();
