import * as z from 'zod';

/** Pantallas y mesas (HU-209). Lo usan el API, el panel y las terminales. */
export const esquemaPin = z.string().regex(/^\d{4}$/, { error: 'El PIN son 4 números.' });

export const esquemaPantalla = z.object({
  nombre: z.string().trim().min(3).max(60),
  lugarId: z.uuid({ error: 'Elige el lugar de la pantalla.' }),
  pin: esquemaPin,
});

export const esquemaEditarPantalla = z
  .object({
    nombre: z.string().trim().min(3).max(60),
    lugarId: z.uuid({ error: 'Elige el lugar de la pantalla.' }),
    pin: esquemaPin,
  })
  .partial();

export const esquemaMesa = z.object({
  nombre: z.string().trim().min(3).max(60),
  lugarId: z.uuid().nullable().default(null),
});

export const esquemaEditarMesa = z
  .object({ nombre: z.string().trim().min(3).max(60), lugarId: z.uuid().nullable() })
  .partial();

/** Conectar otra tablet a una pantalla ya registrada en Stellar pide el motivo (ajuste 10). */
export const esquemaMotivoReemplazo = z.string().trim().min(5).max(300);

export const esquemaGenerarConexion = z.object({
  motivo: esquemaMotivoReemplazo.optional(),
});

/** La llave P-256 que crea la tablet, en JWK (solo la parte pública). */
export const esquemaLlavePublica = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  y: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export type LlavePublicaJwk = z.infer<typeof esquemaLlavePublica>;

export const esquemaConectar = z.object({
  token: z.string().min(20).max(100),
  llavePublica: esquemaLlavePublica.optional(),
});

export * from './conexion';
