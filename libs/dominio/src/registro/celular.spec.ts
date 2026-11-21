import { formatCelular, getEnlaceWhatsapp, maskCelular, normalizeCelular } from './celular';
import { esquemaCelularONulo } from './esquemas';
import { mapColumnas, readFilas } from '../invitados/csv';

describe('celular del asistente (HU-411)', () => {
  it.each([
    ['71234567', '+59171234567'],
    ['7123 4567', '+59171234567'],
    ['6-123-4567', '+59161234567'],
    ['+591 71234567', '+59171234567'],
    ['00591 71234567', '+59171234567'],
    ['+54 9 11 2345-6789', '+5491123456789'],
    ['(+1) 202.555.0123', '+12025550123'],
  ])('%s → %s', (texto, esperado) => {
    expect(normalizeCelular(texto)).toBe(esperado);
  });

  it.each(['12345', '81234567', '+0123456789', 'setenta', '+1234567890123456', ''])(
    '%s no sirve',
    (texto) => {
      expect(normalizeCelular(texto)).toBeNull();
    },
  );

  it('se muestra con espacios, oculto para el registrador y con su enlace de WhatsApp', () => {
    expect(formatCelular('+59171234567')).toBe('+591 7123 4567');
    expect(formatCelular('+5491123456789')).toBe('+5491123456789');
    expect(formatCelular(null)).toBeNull();
    expect(maskCelular('+59171234567')).toBe('•••• 4567');
    expect(getEnlaceWhatsapp('+59171234567')).toBe('https://wa.me/59171234567');
  });

  it('el esquema: vacío es null; inválido, el mensaje del campo', () => {
    expect(esquemaCelularONulo.parse('')).toBeNull();
    expect(esquemaCelularONulo.parse(null)).toBeNull();
    expect(esquemaCelularONulo.parse('7123-4567')).toBe('+59171234567');
    const malo = esquemaCelularONulo.safeParse('123');
    expect(malo.success).toBe(false);
    expect(malo.error?.issues[0]?.message).toMatch(/Revisa el número/);
  });

  it('el CSV reconoce la columna y normaliza; lo inválido queda como vino', () => {
    const columnas = mapColumnas(['Nombre', 'Teléfono']);
    expect(columnas.indices.celular).toBe(1);
    const [buena, mala] = readFilas(
      [
        ['Ana Ejemplo', '71234567'],
        ['Beto Ejemplo', '123'],
      ],
      columnas,
    );
    expect(buena?.celular).toBe('+59171234567');
    expect(mala?.celular).toBe('123');
  });
});
