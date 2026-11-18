/** *Ahora y a continuación* en *Inicio* (HU-308 §2): puro, para probarlo sin pantalla. */
export interface ActividadAgenda {
  readonly id: string;
  readonly inicioAt: string;
  readonly finAt: string;
}

export function getAhoraYSiguiente<T extends ActividadAgenda>(
  agenda: readonly T[],
  ahora: Date,
): { readonly ahora: T | null; readonly siguiente: T | null } {
  const momento = ahora.getTime();
  const ordenada = [...agenda].sort((a, b) => Date.parse(a.inicioAt) - Date.parse(b.inicioAt));
  const enCurso =
    ordenada.find((a) => Date.parse(a.inicioAt) <= momento && Date.parse(a.finAt) > momento) ??
    null;
  const siguiente =
    ordenada.find((a) => Date.parse(a.inicioAt) > momento && a.id !== enCurso?.id) ?? null;
  return { ahora: enCurso, siguiente };
}
