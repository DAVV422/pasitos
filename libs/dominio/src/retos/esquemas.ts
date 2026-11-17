import * as z from 'zod';

/** Retos (HU-207 §2). Los usan el API y el panel. */
export const TIPOS_RETO = ['qr', 'otorgado'] as const;
/** En el piloto: por tiempo y de un solo uso (los otros dos, P2). */
export const MODOS_QR = ['por_tiempo', 'un_uso'] as const;
export const ROTACIONES_QR = [15, 30, 60] as const;

export const NOMBRES_MODO_QR: Readonly<
  Record<(typeof MODOS_QR)[number], { titulo: string; cuando: string }>
> = {
  por_tiempo: {
    titulo: 'QR que cambia cada pocos segundos',
    cuando: 'Para una charla o un stand: todos escanean el mismo QR, que se renueva solo.',
  },
  un_uso: {
    titulo: 'QR de un solo uso',
    cuando: 'Para algo uno a uno: cada escaneo genera un QR nuevo en la pantalla.',
  },
};

const fecha = z.iso.datetime({ offset: true });

export const esquemaReto = z.object({
  nombre: z.string().trim().min(3).max(80),
  descripcion: z
    .string()
    .trim()
    .max(500)
    .transform((t) => (t.length === 0 ? null : t))
    .nullable()
    .default(null),
  tipo: z.enum(TIPOS_RETO),
  modoQr: z.enum(MODOS_QR).default('por_tiempo'),
  rotacionSegundos: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
  puntos: z.number().int().min(1).max(1_000),
  topeTotal: z.number().int().min(1).max(100_000),
  vecesPorPersona: z.number().int().min(1).max(10).default(1),
  lugarId: z.uuid().nullable().default(null),
  disponibleDesde: fecha.nullable().default(null),
  disponibleHasta: fecha.nullable().default(null),
  sponsorId: z.uuid().nullable().default(null),
});

export type DatosReto = z.infer<typeof esquemaReto>;
