ALTER TABLE "eventos" ADD COLUMN "pedir_celular" text DEFAULT 'opcional' NOT NULL;--> statement-breakpoint
ALTER TABLE "asistentes" ADD COLUMN "celular" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_pedir_celular" CHECK ("eventos"."pedir_celular" in ('no', 'opcional', 'obligatorio'));--> statement-breakpoint
ALTER TABLE "asistentes" ADD CONSTRAINT "asistentes_celular" CHECK ("asistentes"."celular" is null or "asistentes"."celular" ~ '^[+][1-9][0-9]{7,14}$');