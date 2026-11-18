import { eq } from 'drizzle-orm';
import {
  asistentes,
  canjes,
  invitaciones,
  mesas,
  movimientos,
  outbox,
  premios,
  saldos,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import { createParLlaves, exportLlavePublica, hashCuerpo, signPedido } from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createEventoDePrueba, type EventoDePrueba } from '../../pruebas/equipo-de-prueba';
import { createTokenAleatorio } from '../auth/auth.repository';
import { VIGENCIA_COBRO_MS } from './mesa.service';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

interface Celular {
  readonly asistenteId: string;
  readonly par: CryptoKeyPair;
  readonly cookie: string;
}

/** La mesa de canje (HU-316) y pagar desde el celular (HU-313). Requiere Docker. */
describe('Mesa de canje y canjear (HU-316, HU-313)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let mesa1: string;
  let mesa2: string;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    mesa1 = await newMesa('Mesa 1');
    mesa2 = await newMesa('Mesa 2');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function newMesa(nombre: string): Promise<string> {
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db.insert(mesas).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre,
      estado: 'activa',
      sessionTokenHash: hash,
    });
    return `px_terminal=${token}`;
  }

  async function newPremio(datos: Partial<typeof premios.$inferInsert> = {}) {
    const id = uuidv7();
    await base.sistema.db.insert(premios).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Taza ${id.slice(-4)}`,
      puntos: 50,
      stockTotal: 10,
      ...datos,
    });
    return id;
  }

  async function getPremio(id: string) {
    const [fila] = await base.sistema.db.select().from(premios).where(eq(premios.id, id));
    return fila;
  }

  async function newCelular(saldo = 100): Promise<Celular> {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Valeria ${asistenteId.slice(-5)}`,
      estado: 'presente',
    });
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db.insert(invitaciones).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId,
      tokenHash: hash,
      tokenCifrado: Buffer.from('cifrado-de-prueba'),
      estado: 'enviada',
    });
    const par = await createParLlaves();
    ip++;
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: `10.4.${Math.floor(ip / 250)}.${(ip % 250) + 1}`,
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo: 'invitacion',
        token,
        llavePublica: await exportLlavePublica(par),
        deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
    expect(respuesta.statusCode).toBe(201);
    await base.sistema.db
      .update(saldos)
      .set({ puntos: saldo })
      .where(eq(saldos.asistenteId, asistenteId));
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? '';
    return { asistenteId, par, cookie: `px_asistente=${cookie}` };
  }

  function cobrar(mesa: string, items: { premioId: string; cantidad: number }[], clave = uuidv7()) {
    return api.app.inject({
      method: 'POST',
      url: '/api/v1/mesa/cobros',
      headers: { cookie: mesa, 'content-type': 'application/json', 'idempotency-key': clave },
      payload: JSON.stringify({ items }),
    });
  }

  function getMesa(mesa: string, url: string) {
    return api.app.inject({ method: 'GET', url: `/api/v1/mesa/${url}`, headers: { cookie: mesa } });
  }

  const tokenDe = (qr: string) => qr.split('/app/cobro/')[1] ?? '';

  async function confirmar(celular: Celular, token: string, clave = uuidv7()) {
    const ruta = `/api/v1/app/cobros/${token}/confirmar`;
    const pedido = {
      metodo: 'POST',
      ruta,
      clave,
      timestamp: api.reloj.now().getTime(),
      hashCuerpo: await hashCuerpo(''),
    };
    return api.app.inject({
      method: 'POST',
      url: ruta,
      headers: {
        cookie: celular.cookie,
        'idempotency-key': clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': await signPedido(celular.par.privateKey, pedido),
      },
    });
  }

  describe('la mesa (HU-316)', () => {
    it('el catálogo y el cobro que reserva el stock, con comprobante C-XXXX', async () => {
      const premioId = await newPremio({ puntos: 30 });
      const catalogo = await getMesa(mesa1, 'catalogo');
      expect(catalogo.json().items).toContainEqual(
        expect.objectContaining({ id: premioId, puntos: 30, disponible: 10 }),
      );
      const respuesta = await cobrar(mesa1, [{ premioId, cantidad: 2 }]);
      expect(respuesta.statusCode).toBe(201);
      const cobro = respuesta.json();
      expect(cobro).toMatchObject({ total: 60, items: [{ premioId, cantidad: 2 }] });
      expect(cobro.comprobante).toMatch(/^C-\d{4}$/);
      expect(cobro.qr).toMatch(/\/app\/cobro\/[\w-]{43}$/);
      expect((await getPremio(premioId))?.stockReservado).toBe(2);
      expect((await getMesa(mesa1, `cobros/${cobro.id}`)).json()).toMatchObject({
        estado: 'pendiente',
      });
      // Otra mesa no ve este cobro.
      expect((await getMesa(mesa2, `cobros/${cobro.id}`)).statusCode).toBe(404);
    });

    it('V7: dos mesas no reservan la última unidad a la vez', async () => {
      const premioId = await newPremio({ stockTotal: 1 });
      const [a, b] = await Promise.all([
        cobrar(mesa1, [{ premioId, cantidad: 1 }]),
        cobrar(mesa2, [{ premioId, cantidad: 1 }]),
      ]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
      const perdio = a.statusCode === 409 ? a : b;
      expect(perdio.json()).toMatchObject({
        code: 'PREMIO_AGOTADO',
        meta: { premio: { id: premioId } },
      });
      expect((await getPremio(premioId))?.stockReservado).toBe(1);
    });

    it('cancelar libera el stock; un doble toque en Cobrar crea un solo cobro', async () => {
      const premioId = await newPremio();
      const clave = uuidv7();
      const primero = await cobrar(mesa1, [{ premioId, cantidad: 3 }], clave);
      const repetido = await cobrar(mesa1, [{ premioId, cantidad: 3 }], clave);
      expect(repetido.json()).toEqual(primero.json());
      expect((await getPremio(premioId))?.stockReservado).toBe(3);
      const cancelado = await api.app.inject({
        method: 'POST',
        url: `/api/v1/mesa/cobros/${primero.json().id}/cancelar`,
        headers: { cookie: mesa1 },
      });
      expect(cancelado.json()).toMatchObject({ estado: 'cancelado' });
      expect((await getPremio(premioId))?.stockReservado).toBe(0);
    });

    it('el cobro vence a los 2 minutos aunque el trabajo se atrase', async () => {
      const premioId = await newPremio();
      const cobro = (await cobrar(mesa1, [{ premioId, cantidad: 1 }])).json();
      api.reloj.advance(VIGENCIA_COBRO_MS + 1_000);
      expect((await getMesa(mesa1, `cobros/${cobro.id}`)).json()).toMatchObject({
        estado: 'vencido',
      });
      const celular = await newCelular();
      expect((await confirmar(celular, tokenDe(cobro.qr))).json().code).toBe('CANJE_VENCIDO');
      const [saldo] = await base.sistema.db
        .select()
        .from(saldos)
        .where(eq(saldos.asistenteId, celular.asistenteId));
      expect(saldo?.puntos).toBe(100);
    });
  });

  describe('canjear desde el celular (HU-313)', () => {
    it('la vista previa, confirmar, y la mesa ve el mismo comprobante con la persona', async () => {
      const premioId = await newPremio({ puntos: 50, stockTotal: 4 });
      const cobro = (await cobrar(mesa1, [{ premioId, cantidad: 1 }])).json();
      const celular = await newCelular(80);
      const vista = await api.app.inject({
        method: 'GET',
        url: `/api/v1/app/cobros/${tokenDe(cobro.qr)}`,
        headers: { cookie: celular.cookie },
      });
      expect(vista.json()).toMatchObject({
        mesa: 'Mesa 1',
        total: 50,
        saldo: 80,
        saldoDespues: 30,
        estado: 'pendiente',
        items: [{ cantidad: 1, puntos: 50 }],
      });
      const confirmado = await confirmar(celular, tokenDe(cobro.qr));
      expect(confirmado.statusCode).toBe(201);
      expect(confirmado.json()).toMatchObject({
        comprobante: cobro.comprobante,
        total: 50,
        saldo: 30,
      });

      const enLaMesa = (await getMesa(mesa1, `cobros/${cobro.id}`)).json();
      expect(enLaMesa).toMatchObject({ estado: 'confirmado', comprobante: cobro.comprobante });
      expect(enLaMesa.asistente.nombre).toMatch(/^Valeria/);
      expect(await getPremio(premioId)).toMatchObject({ stockReservado: 0, stockEntregado: 1 });
      const [mov] = await base.sistema.db
        .select()
        .from(movimientos)
        .where(eq(movimientos.canjeId, cobro.id));
      expect(mov).toMatchObject({ tipo: 'canje', puntos: -50 });
      const avisos = await base.sistema.db
        .select({ payload: outbox.payload })
        .from(outbox)
        .where(eq(outbox.tipo, 'canje.confirmado'));
      expect(avisos.map((a) => (a.payload as { canjeId: string }).canjeId)).toContain(cobro.id);
      // Cancelar ya confirmado no deja.
      const cancelar = await api.app.inject({
        method: 'POST',
        url: `/api/v1/mesa/cobros/${cobro.id}/cancelar`,
        headers: { cookie: mesa1 },
      });
      expect(cancelar.json().code).toBe('CANJE_YA_CONFIRMADO');
    });

    it('V8: dos celulares con el mismo cobro: uno paga y el otro ve "ya fue pagado"; doble toque cobra una vez', async () => {
      const premioId = await newPremio();
      const cobro = (await cobrar(mesa1, [{ premioId, cantidad: 1 }])).json();
      const [uno, dos] = await Promise.all([newCelular(), newCelular()]);
      const [a, b] = await Promise.all([
        confirmar(uno, tokenDe(cobro.qr)),
        confirmar(dos, tokenDe(cobro.qr)),
      ]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
      const perdio = a.statusCode === 409 ? a : b;
      expect(perdio.json()).toMatchObject({
        code: 'CANJE_YA_CONFIRMADO',
        detail: 'Este cobro ya fue pagado.',
      });

      const otro = (await cobrar(mesa1, [{ premioId, cantidad: 1 }])).json();
      const celular = await newCelular();
      const clave = uuidv7();
      const primero = await confirmar(celular, tokenDe(otro.qr), clave);
      const segundo = await confirmar(celular, tokenDe(otro.qr), clave);
      expect(segundo.json()).toEqual(primero.json());
      const cobros = await base.sistema.db
        .select()
        .from(movimientos)
        .where(eq(movimientos.canjeId, otro.id));
      expect(cobros).toHaveLength(1);
    });

    it('sin saldo suficiente no cambia nada; el máximo por persona se respeta', async () => {
      const caro = await newPremio({ puntos: 500 });
      const cobro = (await cobrar(mesa1, [{ premioId: caro, cantidad: 1 }])).json();
      const celular = await newCelular(100);
      const sinSaldo = await confirmar(celular, tokenDe(cobro.qr));
      expect(sinSaldo.json().code).toBe('SALDO_INSUFICIENTE');
      const [canje] = await base.sistema.db.select().from(canjes).where(eq(canjes.id, cobro.id));
      expect(canje?.estado).toBe('pendiente');
      expect(await getPremio(caro)).toMatchObject({ stockReservado: 1, stockEntregado: 0 });

      const uno = await newPremio({ puntos: 10, maxPorPersona: 1, nombre: 'Taza' });
      const persona = await newCelular(100);
      const primero = (await cobrar(mesa1, [{ premioId: uno, cantidad: 1 }])).json();
      expect((await confirmar(persona, tokenDe(primero.qr))).statusCode).toBe(201);
      const segundo = (await cobrar(mesa1, [{ premioId: uno, cantidad: 1 }])).json();
      const otraVez = await confirmar(persona, tokenDe(segundo.qr));
      expect(otraVez.json()).toMatchObject({
        code: 'MAXIMO_POR_PERSONA',
        detail: 'Puedes canjear 1 taza por persona.',
        meta: { maximo: 1 },
      });
    });

    it('la mesa cancelando y el celular confirmando a la vez no se traban', async () => {
      const premioId = await newPremio();
      for (let i = 0; i < 3; i++) {
        const cobro = (await cobrar(mesa1, [{ premioId, cantidad: 1 }])).json();
        const celular = await newCelular();
        const [cancelado, confirmado] = await Promise.all([
          api.app.inject({
            method: 'POST',
            url: `/api/v1/mesa/cobros/${cobro.id}/cancelar`,
            headers: { cookie: mesa1 },
          }),
          confirmar(celular, tokenDe(cobro.qr)),
        ]);
        // Uno gana: o se canceló (y el celular ve vencido) o se pagó (y la mesa no puede cancelar).
        const ok = [cancelado.statusCode, confirmado.statusCode];
        expect(ok.includes(200) || ok.includes(201)).toBe(true);
      }
      const premio = await getPremio(premioId);
      expect((premio?.stockReservado ?? 0) + (premio?.stockEntregado ?? 0)).toBeLessThanOrEqual(3);
      expect(premio?.stockReservado).toBe(0);
    });

    it('un token inventado responde como vencido', async () => {
      const celular = await newCelular();
      const vista = await api.app.inject({
        method: 'GET',
        url: '/api/v1/app/cobros/inventado1234567890',
        headers: { cookie: celular.cookie },
      });
      expect(vista.json().code).toBe('CANJE_VENCIDO');
    });
  });
});
