import { toAvisoEnVivo, type AvisoOutbox, type Suscriptor } from './audiencias';

const EVENTO = 'evento-1';

function aviso(tipo: string, payload: Record<string, unknown>, eventoId = EVENTO): AvisoOutbox {
  return { id: 'id-1', tipo, eventoId, payload: { eventoId, ...payload } };
}

const equipo = (
  rol: Extract<Suscriptor, { tipo: 'equipo' }>['rol'],
  extra: Partial<Extract<Suscriptor, { tipo: 'equipo' }>> = {},
): Suscriptor => ({
  tipo: 'equipo',
  eventoId: EVENTO,
  usuarioId: 'u-1',
  rol,
  pantallas: [],
  mesas: [],
  ...extra,
});
const asistente = (asistenteId = 'a-1', dispositivoId = 'd-1'): Suscriptor => ({
  tipo: 'asistente',
  eventoId: EVENTO,
  asistenteId,
  dispositivoId,
});
const pantalla = (pantallaId = 'p-1'): Suscriptor => ({
  tipo: 'pantalla',
  eventoId: EVENTO,
  pantallaId,
});
const mesa = (mesaId = 'm-1'): Suscriptor => ({ tipo: 'mesa', eventoId: EVENTO, mesaId });

describe('Audiencias de los avisos en vivo (T-301)', () => {
  it('nada de otro evento', () => {
    expect(toAvisoEnVivo(aviso('evento.pausado', {}, 'otro'), equipo('dueno'))).toBeNull();
  });

  it('el saldo llega solo a su dueño, como saldo.actualizado y sin el resto del movimiento', () => {
    const movimiento = aviso('movimiento.creado', {
      asistenteId: 'a-1',
      movimientoId: 'mov-1',
      saldo: 80,
    });
    expect(toAvisoEnVivo(movimiento, asistente('a-1'))).toEqual({
      evento: 'saldo.actualizado',
      datos: { saldo: 80 },
    });
    expect(toAvisoEnVivo(movimiento, asistente('a-2'))).toBeNull();
    expect(toAvisoEnVivo(movimiento, equipo('dueno'))).toBeNull();
    expect(toAvisoEnVivo(movimiento, pantalla())).toBeNull();
  });

  it('el contador va a su pantalla, a los organizadores y al operador de esa pantalla, agrupado', () => {
    const contador = aviso('contador.actualizado', { pantallaId: 'p-1', entregados: 47 });
    expect(toAvisoEnVivo(contador, pantalla('p-1'))).toMatchObject({
      evento: 'contador.actualizado',
      datos: { pantallaId: 'p-1', entregados: 47 },
      agrupar: 'contador:p-1',
    });
    expect(toAvisoEnVivo(contador, pantalla('p-2'))).toBeNull();
    expect(toAvisoEnVivo(contador, equipo('financiador'))).not.toBeNull();
    expect(
      toAvisoEnVivo(contador, equipo('operador_stand', { pantallas: ['p-1'] })),
    ).not.toBeNull();
    expect(toAvisoEnVivo(contador, equipo('operador_stand', { pantallas: ['p-9'] }))).toBeNull();
    expect(toAvisoEnVivo(contador, equipo('registrador'))).toBeNull();
    expect(toAvisoEnVivo(contador, mesa())).toBeNull();
  });

  it('un canje confirmado llega a su mesa y no a las otras', () => {
    const canje = aviso('canje.confirmado', { mesaId: 'm-1', comprobante: 'C-4821' });
    expect(toAvisoEnVivo(canje, mesa('m-1'))?.datos).toEqual({
      mesaId: 'm-1',
      comprobante: 'C-4821',
    });
    expect(toAvisoEnVivo(canje, mesa('m-2'))).toBeNull();
    expect(toAvisoEnVivo(canje, equipo('operador_mesa', { mesas: ['m-1'] }))).not.toBeNull();
    expect(toAvisoEnVivo(canje, equipo('operador_mesa', { mesas: ['m-2'] }))).toBeNull();
    expect(toAvisoEnVivo(canje, asistente())).toBeNull();
  });

  it('el registrador recibe solo los avisos No fui yo', () => {
    expect(
      toAvisoEnVivo(aviso('alerta.creada', { tipo: 'no_fui_yo' }), equipo('registrador')),
    ).not.toBeNull();
    expect(toAvisoEnVivo(aviso('alerta.creada', { tipo: 'A1' }), equipo('registrador'))).toBeNull();
    expect(
      toAvisoEnVivo(aviso('alerta.creada', { tipo: 'A1' }), equipo('coorganizador')),
    ).not.toBeNull();
  });

  it('el QR de asistente vinculado llega solo a quien lo generó', () => {
    const vinculado = aviso('acceso.vinculado', { creadoPor: 'u-1', modelo: 'Samsung A14' });
    expect(toAvisoEnVivo(vinculado, equipo('registrador', { usuarioId: 'u-1' }))).not.toBeNull();
    expect(toAvisoEnVivo(vinculado, equipo('registrador', { usuarioId: 'u-2' }))).toBeNull();
  });

  it('un dispositivo anulado recibe el aviso y su canal se cierra', () => {
    const anulado = aviso('dispositivo.anulado', { dispositivoId: 'd-1' });
    expect(toAvisoEnVivo(anulado, asistente('a-1', 'd-1'))).toMatchObject({ cerrar: true });
    expect(toAvisoEnVivo(anulado, asistente('a-1', 'd-2'))).toBeNull();
  });

  it('desconectar una terminal cierra su canal y avisa a los organizadores', () => {
    const desconectada = aviso('terminal.desconectada', { tipo: 'mesa', id: 'm-1' });
    expect(toAvisoEnVivo(desconectada, mesa('m-1'))).toMatchObject({ cerrar: true });
    expect(toAvisoEnVivo(desconectada, mesa('m-2'))).toBeNull();
    expect(toAvisoEnVivo(desconectada, pantalla('m-1'))).toBeNull();
    expect(toAvisoEnVivo(desconectada, equipo('dueno'))).not.toHaveProperty('cerrar');
  });

  it('pausar, reanudar, abrir y cerrar el evento llega a todos los canales', () => {
    for (const s of [equipo('registrador'), asistente(), pantalla(), mesa()]) {
      expect(toAvisoEnVivo(aviso('evento.pausado', {}), s)?.evento).toBe('evento.pausado');
    }
  });

  it('los avisos de Stellar y del contenido no salen por los canales', () => {
    for (const tipo of ['evento.publicado', 'reto.cambiado', 'evento.contenido_actualizado']) {
      expect(toAvisoEnVivo(aviso(tipo, {}), equipo('dueno'))).toBeNull();
    }
  });
});
