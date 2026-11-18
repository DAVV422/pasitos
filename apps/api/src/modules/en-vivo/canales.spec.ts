import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { Suscriptor } from './audiencias';
import { AGRUPAR_MS, CanalSse, CanalesEnVivo, HEARTBEAT_MS, MAXIMO_POR_SESION } from './canales';

/** Una respuesta HTTP falsa que junta lo escrito. */
class RespuestaFalsa extends EventEmitter {
  texto = '';
  writableEnded = false;
  write(parte: string): boolean {
    this.texto += parte;
    return true;
  }
  end(): void {
    this.writableEnded = true;
  }
}

const PANTALLA: Suscriptor = { tipo: 'pantalla', eventoId: 'e-1', pantallaId: 'p-1' };

function newCanal(canales: CanalesEnVivo, sesion = 's-1') {
  const respuesta = new RespuestaFalsa();
  const canal = new CanalSse(respuesta as unknown as ServerResponse, PANTALLA, sesion, (c) =>
    canales.remove(c),
  );
  canales.add(canal);
  return { canal, respuesta };
}

describe('Canales SSE (T-301)', () => {
  afterEach(() => vi.useRealTimers());

  it('escribe id, event y data en JSON', () => {
    const canales = new CanalesEnVivo();
    const { respuesta } = newCanal(canales);
    canales.dispatch({
      id: '01J0',
      tipo: 'pantalla.pausada',
      eventoId: 'e-1',
      payload: { eventoId: 'e-1', pantallaId: 'p-1' },
    });
    expect(respuesta.texto).toBe(
      'id: 01J0\nevent: pantalla.pausada\ndata: {"pantallaId":"p-1"}\n\n',
    );
  });

  it('agrupa los contadores: como mucho uno por segundo, y sale el último', () => {
    vi.useFakeTimers();
    const canales = new CanalesEnVivo();
    const { respuesta } = newCanal(canales);
    const contador = (id: string, entregados: number) =>
      canales.dispatch({
        id,
        tipo: 'contador.actualizado',
        eventoId: 'e-1',
        payload: { eventoId: 'e-1', pantallaId: 'p-1', entregados },
      });
    contador('1', 1);
    contador('2', 2);
    contador('3', 3);
    expect(respuesta.texto.match(/event: contador/g)).toHaveLength(1);
    vi.advanceTimersByTime(AGRUPAR_MS);
    expect(respuesta.texto.match(/event: contador/g)).toHaveLength(2);
    expect(respuesta.texto).toContain('id: 3\n');
    expect(respuesta.texto).not.toContain('id: 2\n');
  });

  it('manda un ping cada 25 s y deja de mandarlo al cerrarse', () => {
    vi.useFakeTimers();
    const canales = new CanalesEnVivo();
    const { canal, respuesta } = newCanal(canales);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(respuesta.texto).toBe(': ping\n\n');
    respuesta.emit('close');
    expect(canal.isCerrado).toBe(true);
    expect(canales.size).toBe(0);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(respuesta.texto).toBe(': ping\n\n');
  });

  it('una sesión tiene como mucho 3 conexiones: la cuarta cierra la más vieja', () => {
    const canales = new CanalesEnVivo();
    const abiertas = Array.from({ length: MAXIMO_POR_SESION + 1 }, () => newCanal(canales));
    expect(abiertas[0]?.canal.isCerrado).toBe(true);
    expect(abiertas.slice(1).every((a) => !a.canal.isCerrado)).toBe(true);
    newCanal(canales, 'otra-sesion');
    expect(canales.size).toBe(MAXIMO_POR_SESION + 1);
  });
});
