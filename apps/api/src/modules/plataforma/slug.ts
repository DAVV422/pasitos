/** "Feria de Ciencias 2026" → "feria-de-ciencias-2026" (sin tildes, minúsculas, guiones). */
export function toSlug(texto: string): string {
  const slug = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `${slug}-org`.replace(/^-/, '');
}

/** El primero libre: `slug`, `slug-2`, `slug-3`… */
export async function findSlugLibre(
  base: string,
  existe: (slug: string) => Promise<boolean>,
): Promise<string> {
  for (let n = 1; n < 1_000; n++) {
    const candidato = n === 1 ? base : `${base}-${n}`;
    if (!(await existe(candidato))) {
      return candidato;
    }
  }
  throw new Error('No hay un slug libre');
}
