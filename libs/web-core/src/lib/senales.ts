import { getNavegador, isNavegadorDeOtraApp } from '@pasitos/dominio';
import { isPosibleIncognito } from './dispositivo-asistente';

/**
 * Las señales técnicas del navegador al vincular (HU-307 §1, Acceso §6.1): **sin permisos ni
 * técnicas pesadas**. Sirven solo para detectar trampas; nunca bloquean ni se muestran crudas al
 * equipo. Los nombres coinciden con los que lee el API para la huella.
 */
export type Senales = Readonly<Record<string, string | number | boolean | null>>;

interface DatosAltaEntropia {
  readonly model?: string;
  readonly platformVersion?: string;
}

interface NavigatorConDatos extends Navigator {
  readonly userAgentData?: {
    readonly platform?: string;
    getHighEntropyValues?(pistas: readonly string[]): Promise<DatosAltaEntropia>;
  };
  readonly deviceMemory?: number;
}

function getPlataforma(agente: string): string {
  if (/Android/.test(agente)) return 'Android';
  if (/iPhone|iPad|iPod/.test(agente)) return 'iOS';
  if (/Windows/.test(agente)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(agente)) return 'Mac';
  if (/Linux/.test(agente)) return 'Linux';
  return 'otro';
}

function getVersionSistema(agente: string): string | null {
  const android = /Android (\d+(?:\.\d+)?)/.exec(agente);
  if (android?.[1]) return android[1];
  const ios = /OS (\d+[_.]\d+)/.exec(agente);
  return ios?.[1] ? ios[1].replace('_', '.') : null;
}

async function getAltaEntropia(nav: NavigatorConDatos): Promise<DatosAltaEntropia> {
  try {
    return (await nav.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion'])) ?? {};
  } catch {
    return {};
  }
}

async function isPersistido(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}

function getZonaHoraria(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export async function getSenales(): Promise<Senales> {
  const nav = navigator as NavigatorConDatos;
  const agente = nav.userAgent;
  const navegador = getNavegador(agente);
  const plataforma = getPlataforma(agente);
  const [alta, incognito, persistido] = await Promise.all([
    getAltaEntropia(nav),
    isPosibleIncognito(),
    isPersistido(),
  ]);
  const densidad = Math.round((globalThis.devicePixelRatio || 1) * 100) / 100;
  return {
    plataforma,
    versionSistema: alta.platformVersion || getVersionSistema(agente),
    // En iPhone el navegador no dice el modelo.
    modelo: plataforma === 'iOS' ? 'iPhone' : alta.model || null,
    navegador: navegador.nombre,
    versionNavegador: navegador.version,
    otraApp: isNavegadorDeOtraApp(agente),
    pantalla: `${screen.width}x${screen.height}@${densidad}`,
    idioma: nav.language || null,
    zonaHoraria: getZonaHoraria(),
    nucleos: nav.hardwareConcurrency || null,
    memoria: nav.deviceMemory ?? null,
    tactil: nav.maxTouchPoints > 0,
    incognito,
    persistido,
    webdriver: nav.webdriver === true,
  };
}
