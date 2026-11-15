/**
 * Indicador de fuerza mientras se escribe (HU-201 §2): un cálculo local liviano, sin librerías.
 * Solo orienta; las reglas reales (largo, comunes, filtradas) las revisa el servidor.
 */
export type FuerzaPassword = 'vacia' | 'corta' | 'debil' | 'buena' | 'muy_buena';

export const TEXTOS_FUERZA: Readonly<Record<FuerzaPassword, string>> = {
  vacia: '',
  corta: 'Muy corta: usa al menos 8 caracteres',
  debil: 'Débil: suma palabras o caracteres distintos',
  buena: 'Buena',
  muy_buena: 'Muy buena',
};

export function getFuerzaPassword(password: string): FuerzaPassword {
  const largo = [...password].length;
  if (largo === 0) {
    return 'vacia';
  }
  if (largo < 8) {
    return 'corta';
  }
  const variedad = [/[a-záéíóúñ]/, /[A-ZÁÉÍÓÚÑ]/, /\d/, /[^\wáéíóúñÁÉÍÓÚÑ]/].filter((r) =>
    r.test(password),
  ).length;
  const distintos = new Set(password.toLowerCase()).size;
  const puntaje = largo + variedad * 3 + Math.min(distintos, 12) - (distintos < 5 ? 10 : 0);
  if (puntaje >= 30 || largo >= 16) {
    return 'muy_buena';
  }
  return puntaje >= 20 ? 'buena' : 'debil';
}
