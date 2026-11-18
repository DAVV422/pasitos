/**
 * Reglas puras sobre las señales del navegador (HU-307 §2 y §5, Acceso §6). Las arma
 * `libs/web-core/senales.ts`; aquí se decide qué entra en la huella y qué es sospechoso.
 */
export type SenalesDispositivo = Readonly<Record<string, string | number | boolean | null>>;

/** Lo que entra en la huella: estable entre navegadores del mismo celular en buena parte de los casos. */
export const CAMPOS_HUELLA = [
  'plataforma',
  'modelo',
  'pantalla',
  'zonaHoraria',
  'idioma',
  'nucleos',
  'memoria',
  'tactil',
] as const;

/** Los campos de la huella, con `null` en los que falten. `null` si no hay señales. */
export function getCamposHuella(
  senales: SenalesDispositivo | undefined,
): Record<(typeof CAMPOS_HUELLA)[number], string | number | boolean | null> | null {
  if (!senales || Object.keys(senales).length === 0) {
    return null;
  }
  const campos = {} as Record<(typeof CAMPOS_HUELLA)[number], string | number | boolean | null>;
  for (const campo of CAMPOS_HUELLA) {
    const valor = senales[campo];
    // JSON canónico solo admite enteros: la densidad y la memoria van como texto.
    campos[campo] =
      typeof valor === 'number' && !Number.isSafeInteger(valor) ? String(valor) : (valor ?? null);
  }
  return campos;
}

const PANTALLA = /^(\d{2,5})x(\d{2,5})@(\d+(?:\.\d+)?)$/;

/**
 * A8: navegador automatizado (`webdriver`) o señales imposibles para un celular o computadora
 * real. Devuelve los motivos; vacío si nada llama la atención.
 */
export function getMotivosAutomatizado(senales: SenalesDispositivo | undefined): string[] {
  if (!senales) {
    return [];
  }
  const motivos: string[] = [];
  if (senales['webdriver'] === true) {
    motivos.push('webdriver');
  }
  const pantalla = senales['pantalla'];
  if (pantalla !== undefined && pantalla !== null) {
    const partes = typeof pantalla === 'string' ? PANTALLA.exec(pantalla) : null;
    const densidad = partes ? Number(partes[3]) : 0;
    if (!partes || densidad <= 0 || densidad > 8) {
      motivos.push('pantalla');
    }
  }
  const nucleos = senales['nucleos'];
  if (typeof nucleos === 'number' && (nucleos < 1 || nucleos > 128)) {
    motivos.push('nucleos');
  }
  return motivos;
}

/**
 * Lo que ve el equipo: *"SM-A145M · Chrome"* o, sin modelo, lo que dice el User-Agent
 * (*"Chrome en Android"*). Nunca la IP ni la huella (Acceso §6.3).
 */
export function describeModelo(
  senales: SenalesDispositivo | undefined,
  descripcionAgente: string,
): string {
  const modelo = senales?.['modelo'];
  if (typeof modelo !== 'string' || modelo.trim() === '') {
    return descripcionAgente;
  }
  const navegador = descripcionAgente.split(' en ')[0] ?? descripcionAgente;
  return `${modelo.trim().slice(0, 60)} · ${navegador}`;
}
