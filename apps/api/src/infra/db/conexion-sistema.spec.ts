import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * La conexión de pasitos_sistema salta RLS (ajuste 13 de la fase 2): **solo** la usan la consola
 * de plataforma, las invitaciones, la sesión (quién necesita segundo factor) y el guard de
 * permisos (de qué evento es una ruta). Cualquier otro módulo trabaja con withOrganizacion().
 */
const PERMITIDOS = [
  'infra/db/',
  'modules/plataforma/',
  'modules/invitaciones/',
  'modules/auth/',
  'common/permisos/',
  // Conectar una terminal y su latido: llegan sin sesión del equipo, con un token global.
  'modules/terminales/conexion.service.ts',
  // El acceso del asistente: de qué organización es un token (HU-306). El resto va con RLS.
  'modules/acceso/acceso-sistema.ts',
  'pruebas/',
  // Los comandos de soporte (pnpm plataforma): actúan como la consola.
  'cli/',
];

function listArchivos(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? listArchivos(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

describe('Conexión de sistema (HU-202 §1)', () => {
  it('solo la usan los módulos permitidos', () => {
    const raiz = join(__dirname, '../..');
    const usos = listArchivos(raiz)
      .filter((archivo) => !archivo.endsWith('.spec.ts'))
      .filter((archivo) =>
        /\bDbSistemaService\b|DATABASE_URL_SISTEMA/.test(readFileSync(archivo, 'utf-8')),
      )
      .map((archivo) => relative(raiz, archivo).split(sep).join('/'))
      .filter((archivo) => !PERMITIDOS.some((permitido) => archivo.startsWith(permitido)))
      .filter((archivo) => !archivo.startsWith('config/') && archivo !== 'app.module.ts');
    expect(usos).toEqual([]);
  });
});
