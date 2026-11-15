import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { asistentes, bitacora, operaciones } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { buildMultipart } from '../archivos/pruebas/archivos-de-prueba';

/** La lista de invitados con PostgreSQL real (HU-210). Requiere Docker. */
describe('Lista de invitados (HU-210)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let carpeta: string;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let registrador: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    carpeta = await mkdtemp(join(tmpdir(), 'pasitos-invitados-'));
    api = await startApiDePrueba(base, { archivosDir: carpeta });
    evento = await createEventoDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña');
    registrador = await createPersonaConSesion(base, 'Registrador');
    await addRol(base, evento, dueno, 'dueno');
    await addRol(base, evento, registrador, 'registrador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
    await rm(carpeta, { recursive: true, force: true });
  });

  function pedir(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    body?: object,
    persona: PersonaDePrueba = dueno,
  ) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: persona.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  // El evento de prueba ya trae una invitada (A-0001, para V9): los de este test empiezan en A-0002.
  const agregar = (datos: object) => pedir('POST', `/eventos/${evento.eventoId}/asistentes`, datos);

  it('cargar a mano asigna el código siguiente; el correo repetido se rechaza', async () => {
    const valeria = await agregar({
      nombre: '  Valeria   Quispe ',
      email: 'valeria@example.com'.toUpperCase(),
    });
    expect(valeria.statusCode).toBe(201);
    expect(valeria.json()).toMatchObject({
      codigo: 'A-0002',
      nombre: 'Valeria Quispe',
      email: 'valeria@example.com',
      origen: 'lista',
      estado: 'invitado',
      emailEstado: 'pendiente',
    });
    const luis = await agregar({ nombre: 'Luis Fernández' });
    expect(luis.json()).toMatchObject({ codigo: 'A-0003', emailEstado: 'sin_correo' });

    const repetido = await agregar({ nombre: 'Otra', email: 'VALERIA@example.com' });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json()).toMatchObject({
      code: 'ASISTENTE_YA_REGISTRADO',
      meta: { asistente: { codigo: 'A-0002', nombre: 'Valeria Quispe' } },
    });
  });

  it('un nombre parecido avisa con los candidatos; con confirmarDuplicado se agrega igual', async () => {
    const parecido = await agregar({ nombre: 'Valeria Quispe', email: 'otra.valeria@example.com' });
    expect(parecido.statusCode).toBe(409);
    expect(parecido.json()).toMatchObject({
      code: 'ASISTENTE_POSIBLE_DUPLICADO',
      meta: { candidatos: [{ codigo: 'A-0002', email: 'va•••@example.com' }] },
    });
    const igual = await agregar({
      nombre: 'Valeria Quispe',
      email: 'otra.valeria@example.com',
      confirmarDuplicado: true,
    });
    expect(igual.json().codigo).toBe('A-0004');
  });

  it('busca por 3 letras sin tildes, por código y por correo; con menos de 3, VALIDACION', async () => {
    const buscar = async (q: string) =>
      (
        await pedir('GET', `/eventos/${evento.eventoId}/asistentes?q=${encodeURIComponent(q)}`)
      ).json();
    expect((await buscar('quis')).items[0].nombre).toBe('Valeria Quispe');
    expect((await buscar('FERNAN')).items.map((a: { codigo: string }) => a.codigo)).toEqual([
      'A-0003',
    ]);
    expect((await buscar('a-0002')).items).toHaveLength(1);
    expect((await buscar('valeria@example.com')).items[0].codigo).toBe('A-0002');
    expect((await buscar('qu')).code).toBe('VALIDACION');
  });

  it('la lista pagina por código, y el registrador ve el correo enmascarado', async () => {
    const primera = (await pedir('GET', `/eventos/${evento.eventoId}/asistentes?limit=2`)).json();
    expect(primera.items.map((a: { codigo: string }) => a.codigo)).toEqual(['A-0001', 'A-0002']);
    const segunda = (
      await pedir(
        'GET',
        `/eventos/${evento.eventoId}/asistentes?limit=2&cursor=${primera.pagination.nextCursor}`,
      )
    ).json();
    expect(segunda.items[0].codigo).toBe('A-0003');
    const comoRegistrador = (
      await pedir('GET', `/eventos/${evento.eventoId}/asistentes`, undefined, registrador)
    ).json();
    expect(comoRegistrador.items[1].email).toBe('va•••@example.com');
  });

  it('corregir, quitar de la lista y contar; la bitácora guarda el correo enmascarado', async () => {
    const luis = (await pedir('GET', `/eventos/${evento.eventoId}/asistentes?q=A-0003`)).json()
      .items[0];
    const corregido = await pedir('PATCH', `/asistentes/${luis.id}`, {
      email: 'luis@example.com',
    });
    expect(corregido.json()).toMatchObject({ email: 'luis@example.com', emailEstado: 'pendiente' });
    const quitado = await pedir('POST', `/asistentes/${luis.id}/cancelar`, { motivo: 'No viene' });
    expect(quitado.json().estado).toBe('cancelado');
    expect(await base.sistema.db.$count(asistentes, eq(asistentes.id, luis.id))).toBe(1);

    const contadores = (
      await pedir('GET', `/eventos/${evento.eventoId}/asistentes/contadores`)
    ).json();
    expect(contadores).toMatchObject({ invitados: 3, cancelados: 1, total: 4 });

    const [fila] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, luis.id), eq(bitacora.accion, 'asistente.update')));
    expect(fila?.despues).toEqual({ email: 'lu•••@example.com' });
    expect(JSON.stringify(fila)).not.toContain('luis@example.com');
  });

  /** Lo que haría el trabajador: deja la operación lista con su vista previa. */
  async function simularVistaPrevia(id: string, validas: object[], posibles: object[] = []) {
    await base.sistema.db
      .update(operaciones)
      .set({
        estado: 'lista',
        progreso: 100,
        resultado: { totales: { filas: validas.length + posibles.length + 1 } },
        datos: { validas, posiblesDuplicadas: posibles },
      })
      .where(eq(operaciones.id, id));
  }

  it('importar: sube el CSV, confirma una vez y la segunda responde lo mismo', async () => {
    const { payload, contentType } = buildMultipart(
      'invitados.csv',
      'text/csv',
      Buffer.from('nombre,correo\nCarla Rojas,carla@example.com\n'),
    );
    const subida = await api.app.inject({
      method: 'POST',
      url: `/api/v1/eventos/${evento.eventoId}/importaciones`,
      headers: { cookie: dueno.cookie, 'content-type': contentType },
      payload,
    });
    expect(subida.statusCode).toBe(202);
    const { operacionId } = subida.json();
    expect((await pedir('GET', `/operaciones/${operacionId}`)).json()).toMatchObject({
      estado: 'en_cola',
    });
    // Sin vista previa todavía, no se confirma.
    expect((await pedir('POST', `/importaciones/${operacionId}/confirmar`, {})).json().code).toBe(
      'OPERACION_NO_LISTA',
    );

    await simularVistaPrevia(
      operacionId,
      [
        { fila: 2, nombre: 'Carla Rojas', email: 'carla@example.com', codigoExterno: null },
        { fila: 3, nombre: 'Pedro Mamani', email: 'pedro@example.com', codigoExterno: 'T-9' },
      ],
      [{ fila: 4, nombre: 'Valeria Quispe', email: null, codigoExterno: null }],
    );
    // Entre la vista previa y la confirmación, alguien carga a Pedro a mano.
    await agregar({ nombre: 'Pedro M.', email: 'pedro@example.com', confirmarDuplicado: true });

    const confirmada = await pedir('POST', `/importaciones/${operacionId}/confirmar`, {
      incluirPosiblesDuplicadas: [4],
    });
    expect(confirmada.json()).toMatchObject({
      importadas: 2,
      duplicadasNuevas: [{ fila: 3, motivo: expect.stringContaining('Ya está en la lista como') }],
    });
    const otraVez = await pedir('POST', `/importaciones/${operacionId}/confirmar`, {
      incluirPosiblesDuplicadas: [4],
    });
    expect(otraVez.json()).toEqual(confirmada.json());
    expect(
      await base.sistema.db.$count(
        asistentes,
        and(eq(asistentes.eventoId, evento.eventoId), eq(asistentes.origen, 'csv')),
      ),
    ).toBe(2);
    // El CSV se borró de cuarentena.
    expect(await readdir(join(carpeta, 'cuarentena'))).toEqual([]);
    const [registro] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, operacionId), eq(bitacora.accion, 'importacion.confirm')));
    expect(registro?.despues).toEqual({ importadas: 2, omitidas: 2 });
  });

  it('exportar: un enlace de un solo uso y la descarga queda en la bitácora', async () => {
    const pedido = await pedir('POST', `/eventos/${evento.eventoId}/exportaciones`, {});
    expect(pedido.statusCode).toBe(202);
    const { operacionId } = pedido.json();
    // Lo que haría el trabajador.
    await mkdir(join(carpeta, 'exportaciones'), { recursive: true });
    await writeFile(join(carpeta, 'exportaciones', `${operacionId}.csv`), '\uFEFFCódigo\r\n');
    await base.sistema.db
      .update(operaciones)
      .set({ estado: 'lista', progreso: 100, resultado: { filas: 6 } })
      .where(eq(operaciones.id, operacionId));

    const { descarga } = (await pedir('GET', `/operaciones/${operacionId}`)).json();
    expect(descarga.url).toContain(`/operaciones/${operacionId}/descarga?token=`);
    const archivo = await pedir('GET', descarga.url.replace('/api/v1', ''));
    expect(archivo.statusCode).toBe(200);
    expect(archivo.headers['content-disposition']).toContain('attachment');
    expect(archivo.body).toContain('Código');
    expect((await pedir('GET', descarga.url.replace('/api/v1', ''))).json().code).toBe(
      'ENLACE_YA_USADO',
    );
    const [registro] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, operacionId), eq(bitacora.accion, 'invitados.export')));
    expect(registro?.despues).toEqual({ filas: 6 });
    // El registrador no exporta.
    const comoRegistrador = await pedir(
      'POST',
      `/eventos/${evento.eventoId}/exportaciones`,
      {},
      registrador,
    );
    expect(comoRegistrador.statusCode).toBe(403);
  });
});
