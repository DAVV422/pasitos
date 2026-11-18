import { eq } from 'drizzle-orm';
import { mesas, outbox } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { createTokenAleatorio } from '../auth/auth.repository';

interface EventoSse {
  readonly id: string | null;
  readonly evento: string;
  readonly datos: unknown;
}

/** Una conexión SSE de verdad (fetch con el cuerpo en streaming), con lo recibido hasta ahora. */
class ConexionSse {
  readonly eventos: EventoSse[] = [];
  private resto = '';
  private readonly abortar = new AbortController();

  static async open(url: string, headers: Record<string, string>): Promise<ConexionSse> {
    const conexion = new ConexionSse();
    const respuesta = await fetch(url, { headers, signal: conexion.abortar.signal });
    conexion.status = respuesta.status;
    conexion.tipo = respuesta.headers.get('content-type');
    if (respuesta.body && respuesta.status === 200) {
      void conexion.read(respuesta.body.getReader());
    }
    return conexion;
  }

  status = 0;
  tipo: string | null = null;
  cerrada = false;

  private async read(lector: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    const decodificador = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        this.resto += decodificador.decode(value, { stream: true });
        let corte: number;
        while ((corte = this.resto.indexOf('\n\n')) >= 0) {
          const bloque = this.resto.slice(0, corte);
          this.resto = this.resto.slice(corte + 2);
          const campos = Object.fromEntries(
            bloque
              .split('\n')
              .filter((linea) => !linea.startsWith(':') && linea.includes(': '))
              .map((linea) => [
                linea.slice(0, linea.indexOf(': ')),
                linea.slice(linea.indexOf(': ') + 2),
              ]),
          ) as Record<string, string>;
          if (campos['event']) {
            this.eventos.push({
              id: campos['id'] ?? null,
              evento: campos['event'],
              datos: JSON.parse(campos['data'] ?? 'null'),
            });
          }
        }
      }
    } catch {
      // Cortada por el test.
    } finally {
      this.cerrada = true;
    }
  }

  async waitFor(evento: string, cuantos = 1, ms = 5_000): Promise<EventoSse[]> {
    const limite = Date.now() + ms;
    for (;;) {
      const recibidos = this.eventos.filter((e) => e.evento === evento);
      if (recibidos.length >= cuantos) return recibidos;
      if (Date.now() > limite) {
        throw new Error(`No llegó ${evento}: ${JSON.stringify(this.eventos)}`);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  close(): void {
    this.abortar.abort();
  }
}

/** Avisos en vivo con PostgreSQL real: LISTEN/NOTIFY, filtros por actor y reenvío (T-301). */
describe('Avisos en vivo (T-301)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let url: string;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  let cookieMesa: string;
  const abiertas: ConexionSse[] = [];

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    await api.app.listen(0, '127.0.0.1');
    const { port } = api.app.getHttpServer().address() as { port: number };
    url = `http://127.0.0.1:${port}/api/v1`;
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    dueno = await createPersonaConSesion(base, 'Dueña');
    await addRol(base, evento, dueno, 'dueno');
    registrador = await createPersonaConSesion(base, 'Registrador');
    await addRol(base, evento, registrador, 'registrador');
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db
      .update(mesas)
      .set({ sessionTokenHash: hash, estado: 'activa' })
      .where(eq(mesas.id, evento.recursos.mesas));
    cookieMesa = `px_terminal=${token}`;
  }, 180_000);

  afterEach(() => {
    for (const conexion of abiertas.splice(0)) conexion.close();
  });

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function abrir(ruta: string, cookie: string, extra: Record<string, string> = {}) {
    const conexion = await ConexionSse.open(`${url}${ruta}`, { cookie, ...extra });
    abiertas.push(conexion);
    // El canal queda registrado apenas responde; un respiro para el LISTEN del primer test.
    await new Promise((r) => setTimeout(r, 100));
    return conexion;
  }

  async function avisar(tipo: string, payload: Record<string, unknown>): Promise<string> {
    const id = uuidv7();
    await base.sistema.db.insert(outbox).values({
      id,
      tipo,
      eventoId: evento.eventoId,
      payload: { eventoId: evento.eventoId, ...payload },
    });
    return id;
  }

  it('el panel recibe lo que pasa en el evento, con el formato SSE', async () => {
    const panel = await abrir(`/eventos/${evento.eventoId}/en-vivo`, dueno.cookie);
    expect(panel.status).toBe(200);
    expect(panel.tipo).toContain('text/event-stream');
    const id = await avisar('evento.pausado', {});
    const [recibido] = await panel.waitFor('evento.pausado');
    expect(recibido).toEqual({ id, evento: 'evento.pausado', datos: {} });
  });

  it('el registrador recibe los No fui yo y no las demás alertas', async () => {
    const puerta = await abrir(`/eventos/${evento.eventoId}/en-vivo`, registrador.cookie);
    await avisar('alerta.creada', { tipo: 'A1' });
    await avisar('alerta.creada', { tipo: 'no_fui_yo', alertaId: 'x' });
    await avisar('evento.reanudado', {});
    await puerta.waitFor('evento.reanudado');
    const alertas = puerta.eventos.filter((e) => e.evento === 'alerta.creada');
    expect(alertas.map((a) => (a.datos as { tipo: string }).tipo)).toEqual(['no_fui_yo']);
  });

  it('la mesa recibe sus canjes y no los de otra mesa; abrir el canal cuenta como latido', async () => {
    const canal = await abrir('/mesa/en-vivo', cookieMesa);
    expect(canal.status).toBe(200);
    await avisar('canje.confirmado', { mesaId: uuidv7(), comprobante: 'C-0001' });
    await avisar('canje.confirmado', { mesaId: evento.recursos.mesas, comprobante: 'C-0002' });
    const [canje] = await canal.waitFor('canje.confirmado');
    expect(canje?.datos).toMatchObject({ comprobante: 'C-0002' });
    await avisar('evento.pausado', {});
    await canal.waitFor('evento.pausado');
    expect(canal.eventos.filter((e) => e.evento === 'canje.confirmado')).toHaveLength(1);
    const [fila] = await base.sistema.db
      .select({ ultimo: mesas.ultimoContactoAt })
      .from(mesas)
      .where(eq(mesas.id, evento.recursos.mesas));
    expect(fila?.ultimo).not.toBeNull();
  });

  it('una mesa no abre el canal de la sala, y sin sesión responde 401', async () => {
    const otra = await ConexionSse.open(`${url}/sala/en-vivo`, { cookie: cookieMesa });
    expect(otra.status).toBe(401);
    const sin = await ConexionSse.open(`${url}/mesa/en-vivo`, {});
    expect(sin.status).toBe(401);
  });

  it('al reconectar con Last-Event-ID reenvía lo que se perdió', async () => {
    const desde = await avisar('evento.pausado', {});
    const perdido = await avisar('evento.reanudado', {});
    const canal = await abrir(`/eventos/${evento.eventoId}/en-vivo`, dueno.cookie, {
      'last-event-id': desde,
    });
    const [reenviado] = await canal.waitFor('evento.reanudado');
    expect(reenviado?.id).toBe(perdido);
    expect(canal.eventos.some((e) => e.id === desde)).toBe(false);
  });

  it('un Last-Event-ID de más de 5 minutos pide reiniciar', async () => {
    const viejo = '01890000-0000-7000-8000-000000000000';
    const canal = await abrir(`/eventos/${evento.eventoId}/en-vivo`, dueno.cookie, {
      'last-event-id': viejo,
    });
    await canal.waitFor('reiniciar');
  });

  it('alguien sin rol en el evento no abre el canal del panel', async () => {
    const ajena = await createPersonaConSesion(base, 'Ajena');
    const conexion = await ConexionSse.open(`${url}/eventos/${evento.eventoId}/en-vivo`, {
      cookie: ajena.cookie,
    });
    expect(conexion.status).toBe(404);
  });
});
