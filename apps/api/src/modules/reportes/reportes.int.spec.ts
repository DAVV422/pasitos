import { eq } from 'drizzle-orm';
import { asistentes, bitacora, checkIns, eventos, movimientos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import type { DatosReporte, ReportePanel } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

const INICIO = Date.parse('2026-12-01T13:00:00Z');
const MIN = 60_000;
const at = (minutos: number) => new Date(INICIO + minutos * MIN);

/** El reporte del evento (HU-402), con PostgreSQL real. Requiere Docker. */
describe('Reporte del evento (HU-402)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let dueno: PersonaDePrueba;
  let coorganizador: PersonaDePrueba;
  let financiador: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña reporte');
    coorganizador = await createPersonaConSesion(base, 'Coorganizador reporte');
    financiador = await createPersonaConSesion(base, 'Financiador reporte');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  function pedir(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    quien: PersonaDePrueba | null,
    body?: object,
  ) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: quien ? { cookie: quien.cookie } : {},
      ...(body ? { payload: body } : {}),
    });
  }

  async function newEvento(estado = 'cerrado', tipo = 'real'): Promise<EventoDePrueba> {
    const evento = await createEventoDePrueba(base, { estado, nombre: 'Feria del reporte' });
    await base.sistema.db
      .update(eventos)
      .set({ tipo, cerradoAt: estado === 'cerrado' ? at(8 * 60 + 30) : null })
      .where(eq(eventos.id, evento.eventoId));
    await addRol(base, evento, dueno, 'dueno');
    await addRol(base, evento, coorganizador, 'coorganizador');
    await addRol(base, evento, financiador, 'financiador');
    return evento;
  }

  async function addMovimiento(
    evento: EventoDePrueba,
    asistenteId: string,
    tipo: string,
    puntos: number,
    minuto: number,
    extra: Partial<typeof movimientos.$inferInsert> = {},
  ): Promise<string> {
    const id = uuidv7();
    await base.sistema.db.insert(movimientos).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId,
      tipo,
      puntos,
      origen: 'equipo',
      createdAt: at(minuto),
      ...extra,
    });
    return id;
  }

  /** Una persona de la lista que entró a los `minuto` minutos del inicio. */
  async function addPresente(
    evento: EventoDePrueba,
    minuto: number,
    opciones: { metodo?: string; nombre?: string; registradorId?: string } = {},
  ): Promise<string> {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: opciones.nombre ?? `Persona ${id.slice(-6)}`,
      estado: 'presente',
      origen: opciones.metodo === 'registro_puerta' ? 'puerta' : 'lista',
    });
    const movimientoId = await addMovimiento(evento, id, 'checkin', 5, minuto);
    await base.sistema.db.insert(checkIns).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId: id,
      metodo: opciones.metodo ?? 'escaneo_entrada',
      registradorId: opciones.registradorId ?? null,
      movimientoId,
      createdAt: at(minuto),
    });
    return id;
  }

  /**
   * 35 presentes (5 registrados en la puerta), 10 participaciones del reto a las 14:30 (una
   * anulada) y una justo a las 15:00, y un ajuste.
   */
  async function newEventoConDatos(estado = 'cerrado', tipo = 'real') {
    const evento = await newEvento(estado, tipo);
    const personas: string[] = [];
    for (let i = 0; i < 35; i++) {
      personas.push(
        await addPresente(evento, 5 + i, {
          nombre: `Participante Secreta ${i}`,
          ...(i < 5 ? { metodo: 'registro_puerta', registradorId: dueno.usuarioId } : {}),
        }),
      );
    }
    const retos: string[] = [];
    for (let i = 0; i < 10; i++) {
      retos.push(
        await addMovimiento(evento, personas[i] ?? '', 'reto', 10, 90, { retoId: evento.retoId }),
      );
    }
    await addMovimiento(evento, personas[0] ?? '', 'anulacion', -10, 100, {
      anulaMovimientoId: retos[0],
      motivo: 'Error',
      autorId: dueno.usuarioId,
    });
    await addMovimiento(evento, personas[11] ?? '', 'reto', 10, 120, { retoId: evento.retoId });
    await addMovimiento(evento, personas[12] ?? '', 'ajuste', 7, 130, {
      motivo: 'Compensación',
      autorId: dueno.usuarioId,
    });
    return { evento, personas };
  }

  it('con el evento abierto, el reporte no está: 409 REPORTE_NO_DISPONIBLE', async () => {
    const evento = await newEvento('en_curso');
    const respuesta = await pedir('GET', `/eventos/${evento.eventoId}/reporte`, dueno);
    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().code).toBe('REPORTE_NO_DISPONIBLE');
  });

  it('el evento completo: asistencia, participaciones sin las anuladas, puntos y retención', async () => {
    const { evento } = await newEventoConDatos();
    const respuesta = await pedir('GET', `/eventos/${evento.eventoId}/reporte`, financiador);
    expect(respuesta.statusCode).toBe(200);
    const { datos, stellar, publico } = respuesta.json<ReportePanel>();
    expect(publico).toBe(false);
    expect(datos.pequeno).toBe(false);
    expect(datos.tramo).toBeNull();
    // 30 de la lista + la invitada del fixture, que no vino.
    expect(datos.asistencia.invitados).toBe(31);
    expect(datos.asistencia.presentes).toBe(35);
    expect(datos.asistencia.presentesDeLista).toBe(30);
    expect(datos.asistencia.tasa).toBeCloseTo(30 / 31);
    expect(datos.asistencia.porForma).toEqual([
      { forma: 'escaneo', total: 30 },
      { forma: 'puerta', total: 5 },
    ]);
    expect(datos.asistencia.porRegistrador).toEqual([{ nombre: 'Dueña reporte', total: 5 }]);
    // 10 a las 14:30, una anulada, y una a las 15:00.
    expect(datos.participacion.participaciones).toBe(10);
    expect(datos.participacion.porReto[0]).toMatchObject({
      nombre: 'Reto',
      participaciones: 10,
      tope: 100,
      lugar: 'Sala A',
    });
    expect(datos.participacion.porLugar).toEqual([{ nombre: 'Sala A', participaciones: 10 }]);
    expect(datos.puntos).toMatchObject({
      ganados: 35 * 5 + 11 * 10,
      ajustados: 7 - 10,
      vencidos: 0,
      ajustes: [{ categoria: 'Compensación', total: 1 }],
      anulaciones: 1,
    });
    // La primera hora (13:00 a 14:00): los 35 check-ins. La última (20:00 a 21:00): nadie.
    expect(datos.asistencia.retencion).toMatchObject({ primeraHora: 35, ultimaHora: 0 });
    expect(datos.asistencia.franjas?.map((f) => f.activos)).toEqual([35, 10, 1]);
    expect(stellar).toMatchObject({ red: 'local', estado: 'pendiente', lotes: [] });
  });

  it('por tramo: solo lo de adentro; Hasta no se incluye; menos de 5 activos, solo totales', async () => {
    const { evento } = await newEventoConDatos();
    const tramo = (desde: number, hasta: number) =>
      pedir(
        'GET',
        `/eventos/${evento.eventoId}/reporte/tramo?desde=${at(desde).toISOString()}&hasta=${at(hasta).toISOString()}`,
        coorganizador,
      );
    const manana = (await tramo(0, 60)).json<DatosReporte>();
    expect(manana.participacion.participaciones).toBe(0);
    expect(manana.asistencia.presentes).toBe(35);
    expect(manana.asistencia.activos).toBe(35);

    // 14:00 a 15:00: las 9 de las 14:30, sin la de las 15:00 justas.
    const tarde = (await tramo(60, 120)).json<DatosReporte>();
    expect(tarde.participacion.participaciones).toBe(9);
    expect(tarde.soloTotales).toBe(false);
    expect(tarde.asistencia.retencion).toMatchObject({ primeraHora: 10, ultimaHora: 10 });

    // 15:00 a 15:15: una persona activa.
    const chico = (await tramo(120, 135)).json<DatosReporte>();
    expect(chico.participacion.participaciones).toBe(1);
    expect(chico.soloTotales).toBe(true);
    expect(chico.asistencia.franjas).toBeNull();
    expect(chico.asistencia.porRegistrador).toBeNull();

    // El tramo del evento completo da lo mismo que el reporte.
    const completo = (
      await pedir('GET', `/eventos/${evento.eventoId}/reporte`, dueno)
    ).json<ReportePanel>().datos;
    const todo = (
      await pedir(
        'GET',
        `/eventos/${evento.eventoId}/reporte/tramo?desde=${completo.limites.desde}&hasta=${completo.limites.hasta}`,
        dueno,
      )
    ).json<DatosReporte>();
    // La foto del fixture es de hoy, fuera del evento: no entra en ningún tramo.
    expect({ ...todo.participacion, fotos: null }).toEqual({
      ...completo.participacion,
      fotos: null,
    });
    expect(todo.puntos).toEqual(completo.puntos);
    expect(todo.asistencia.presentes).toBe(completo.asistencia.presentes);

    const alReves = await tramo(120, 60);
    expect(alReves.statusCode).toBe(400);
    expect(alReves.json().code).toBe('VALIDACION');
    const fueraDePaso = await tramo(7, 60);
    expect(fueraDePaso.statusCode).toBe(400);
  });

  it('un evento de menos de 30 presentes muestra solo totales', async () => {
    const evento = await newEvento();
    for (let i = 0; i < 4; i++) await addPresente(evento, 10 + i);
    const { datos } = (
      await pedir('GET', `/eventos/${evento.eventoId}/reporte`, dueno)
    ).json<ReportePanel>();
    expect(datos.pequeno).toBe(true);
    expect(datos.soloTotales).toBe(true);
    expect(datos.asistencia.presentes).toBe(4);
    expect(datos.asistencia.franjas).toBeNull();
    expect(datos.asistencia.retencion).toBeNull();
    expect(datos.participacion.porGrupo).toBeNull();
  });

  it('compartir: el enlace muestra el reporte sin datos de las personas; dejar de compartir da 404', async () => {
    const { evento } = await newEventoConDatos();
    const url = `/eventos/${evento.eventoId}/reporte`;
    expect((await pedir('PATCH', url, financiador, { publico: true })).statusCode).toBe(403);
    expect((await pedir('PATCH', url, coorganizador, { publico: true })).statusCode).toBe(403);

    const compartido = await pedir('PATCH', url, dueno, { publico: true });
    expect(compartido.statusCode).toBe(200);
    const { enlacePublico } = compartido.json<ReportePanel>();
    expect(enlacePublico).toMatch(/\/reporte\/[A-Za-z0-9_-]{43}$/);
    const token = enlacePublico?.split('/').at(-1) ?? '';

    const publico = await pedir('GET', `/publico/reportes/${token}`, null);
    expect(publico.statusCode).toBe(200);
    expect(publico.headers['cache-control']).toContain('max-age=300');
    expect(publico.body).not.toContain('Participante Secreta');
    expect(publico.body).not.toContain('Dueña reporte');
    expect(publico.json().datos.asistencia.porRegistrador).toEqual([
      { nombre: 'Registrador 1', total: 5 },
    ]);
    const filas = await base.sistema.db
      .select({ nombre: asistentes.nombre, codigo: asistentes.codigoAsistente })
      .from(asistentes)
      .where(eq(asistentes.eventoId, evento.eventoId));
    for (const fila of filas) {
      expect(publico.body).not.toContain(fila.nombre);
      if (fila.codigo) expect(publico.body).not.toContain(fila.codigo);
    }

    // Dejar de compartir: 404. Volver a compartir: el mismo enlace.
    await pedir('PATCH', url, dueno, { publico: false });
    expect((await pedir('GET', `/publico/reportes/${token}`, null)).statusCode).toBe(404);
    const otraVez = await pedir('PATCH', url, dueno, { publico: true });
    expect(otraVez.json<ReportePanel>().enlacePublico).toBe(enlacePublico);

    // Cambiar el enlace: el anterior deja de servir.
    const nuevo = await pedir('PATCH', url, dueno, { publico: true, cambiarEnlace: true });
    const enlaceNuevo = nuevo.json<ReportePanel>().enlacePublico ?? '';
    expect(enlaceNuevo).not.toBe(enlacePublico);
    expect((await pedir('GET', `/publico/reportes/${token}`, null)).statusCode).toBe(404);
    expect(
      (await pedir('GET', `/publico/reportes/${enlaceNuevo.split('/').at(-1)}`, null)).statusCode,
    ).toBe(200);

    const acciones = await base.sistema.db
      .select({ accion: bitacora.accion })
      .from(bitacora)
      .where(eq(bitacora.eventoId, evento.eventoId));
    expect(acciones.map((a) => a.accion)).toEqual(
      expect.arrayContaining(['reporte.publicar', 'reporte.despublicar', 'reporte.cambiar_enlace']),
    );
  });

  it('un token inventado responde 404; un evento demo no se comparte', async () => {
    expect((await pedir('GET', `/publico/reportes/${'a'.repeat(43)}`, null)).statusCode).toBe(404);
    expect((await pedir('GET', '/publico/reportes/corto', null)).statusCode).toBe(404);
    const demo = await newEvento('cerrado', 'demo');
    const respuesta = await pedir('PATCH', `/eventos/${demo.eventoId}/reporte`, dueno, {
      publico: true,
    });
    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().code).toBe('REPORTE_NO_COMPARTIBLE');
  });

  it('PDF de una página y CSV con BOM, del tramo si se pide; quedan en la bitácora', async () => {
    const { evento } = await newEventoConDatos();
    const pdf = await pedir('GET', `/eventos/${evento.eventoId}/reporte/pdf`, financiador);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.rawPayload.toString('latin1')).toContain('/Count 1');

    const csv = await pedir('GET', `/eventos/${evento.eventoId}/reporte/csv`, financiador);
    expect(csv.statusCode).toBe(200);
    expect(csv.body.startsWith('﻿seccion,indicador,detalle,valor')).toBe(true);
    expect(csv.body).toContain('retos,participaciones,Reto,10');
    expect(csv.body).toContain('puntos,ajustes,Compensación,1');

    const csvTramo = await pedir(
      'GET',
      `/eventos/${evento.eventoId}/reporte/csv?desde=${at(0).toISOString()}&hasta=${at(60).toISOString()}`,
      financiador,
    );
    expect(csvTramo.body).toContain('retos,participaciones,Reto,0');
    expect(csvTramo.body).toContain(
      `evento,tramo,,${at(0).toISOString()} a ${at(60).toISOString()}`,
    );

    const descargas = await base.sistema.db
      .select({ accion: bitacora.accion })
      .from(bitacora)
      .where(eq(bitacora.eventoId, evento.eventoId));
    expect(descargas.filter((d) => d.accion === 'reporte.descargar')).toHaveLength(3);
  });

  it('regenerar: D y C sí, el financiador no; da lo mismo', async () => {
    const { evento } = await newEventoConDatos();
    const url = `/eventos/${evento.eventoId}/reporte`;
    const antes = (await pedir('GET', url, dueno)).json<ReportePanel>().datos;
    expect((await pedir('POST', `${url}/regenerar`, financiador)).statusCode).toBe(403);
    const regenerado = await pedir('POST', `${url}/regenerar`, coorganizador);
    expect(regenerado.statusCode).toBe(200);
    const despues = regenerado.json<ReportePanel>().datos;
    expect({ ...despues, generadoAt: '' }).toEqual({ ...antes, generadoAt: '' });
  });
});
