CREATE TABLE "envios_correo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"prioridad" integer NOT NULL,
	"destinatario" "citext" NOT NULL,
	"datos" jsonb NOT NULL,
	"estado" text DEFAULT 'en_cola' NOT NULL,
	"programado_para" timestamp with time zone NOT NULL,
	"ref_id" uuid,
	"proveedor_id" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"error" text,
	"enviado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "envios_correo_prioridad" CHECK ("envios_correo"."prioridad" between 1 and 4),
	CONSTRAINT "envios_correo_estado" CHECK ("envios_correo"."estado" in ('en_cola', 'enviado', 'entregado', 'rebotado', 'fallido'))
);
--> statement-breakpoint
CREATE INDEX "envios_correo_cola" ON "envios_correo" USING btree ("prioridad","created_at") WHERE "envios_correo"."estado" = 'en_cola';--> statement-breakpoint
CREATE INDEX "envios_correo_enviados" ON "envios_correo" USING btree ("enviado_at");--> statement-breakpoint
CREATE INDEX "envios_correo_ref" ON "envios_correo" USING btree ("ref_id");