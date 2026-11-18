import {
  buildTextoFirmado,
  hashCuerpo,
  importLlavePublica,
  signPedido,
  verifyPedido,
  type PedidoFirmado,
} from './firma-dispositivo';
import { createParLlaves, exportLlavePublica, toLlaveCruda } from './llaves';

async function newPar() {
  const par = await createParLlaves();
  const cruda = toLlaveCruda(await exportLlavePublica(par));
  return { par, publica: await importLlavePublica(cruda) };
}

describe('Firma del dispositivo (API §2.1)', () => {
  const base = async (): Promise<PedidoFirmado> => ({
    metodo: 'post',
    ruta: '/api/v1/app/reclamos',
    clave: '0192f0e5-7a3c-7b1e-9f00-000000000001',
    timestamp: 1_794_923_850_553,
    hashCuerpo: await hashCuerpo('{"qr":"PX1.abc"}'),
  });

  it('arma el texto con el método en mayúsculas y un salto de línea entre partes', async () => {
    const pedido = await base();
    expect(buildTextoFirmado(pedido)).toBe(
      `POST\n/api/v1/app/reclamos\n${pedido.clave}\n1794923850553\n${pedido.hashCuerpo}`,
    );
  });

  it('el hash del cuerpo vacío es el de la cadena vacía', async () => {
    expect(await hashCuerpo('')).toBe(await hashCuerpo(undefined));
    expect(await hashCuerpo('')).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU');
  });

  it('verifica la firma de su llave y rechaza la de otra, otro cuerpo u otra hora', async () => {
    const { par, publica } = await newPar();
    const otro = await newPar();
    const pedido = await base();
    const firma = await signPedido(par.privateKey, pedido);
    expect(await verifyPedido(publica, pedido, firma)).toBe(true);
    expect(await verifyPedido(otro.publica, pedido, firma)).toBe(false);
    expect(
      await verifyPedido(publica, { ...pedido, hashCuerpo: await hashCuerpo('{}') }, firma),
    ).toBe(false);
    expect(await verifyPedido(publica, { ...pedido, timestamp: pedido.timestamp + 1 }, firma)).toBe(
      false,
    );
    expect(await verifyPedido(publica, pedido, 'no-es-una-firma')).toBe(false);
  });
});
