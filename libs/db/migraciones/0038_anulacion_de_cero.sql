ALTER TABLE "movimientos" DROP CONSTRAINT "movimientos_signo";--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_signo" CHECK (("movimientos"."tipo" = 'checkin' and "movimientos"."puntos" >= 0)
        or ("movimientos"."tipo" = 'reto' and "movimientos"."puntos" > 0)
        or ("movimientos"."tipo" = 'canje' and "movimientos"."puntos" <= 0)
        or ("movimientos"."tipo" = 'vencimiento' and "movimientos"."puntos" < 0)
        or ("movimientos"."tipo" = 'ajuste' and "movimientos"."puntos" <> 0)
        or "movimientos"."tipo" = 'anulacion');