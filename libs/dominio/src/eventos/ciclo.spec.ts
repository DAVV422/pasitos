import { buildListaChequeo, canTransicion, esquemaCrearEvento, type DatosChequeo } from './ciclo';

const BASE: DatosChequeo = {
  inicioAt: new Date('2026-12-05T14:00:00Z'),
  finAt: new Date('2026-12-05T22:00:00Z'),
  ahora: new Date('2026-11-15T15:00:00Z'),
  retos: [{ nombre: 'Charla', tipo: 'qr', activo: true, tienePantalla: true, enHorario: true }],
  premiosActivos: 0,
  mesas: 0,
};

describe('Ciclo de vida del evento (HU-205)', () => {
  it('solo las transiciones del diagrama', () => {
    expect(canTransicion('borrador', 'publicar')).toBe(true);
    expect(canTransicion('publicado', 'abrir')).toBe(true);
    expect(canTransicion('en_curso', 'pausar')).toBe(true);
    expect(canTransicion('pausado', 'reanudar')).toBe(true);
    expect(canTransicion('publicado', 'publicar')).toBe(false);
    expect(canTransicion('borrador', 'abrir')).toBe(false);
    expect(canTransicion('cerrado', 'reanudar')).toBe(false);
  });

  it('la lista está completa con fechas futuras y un reto con pantalla', () => {
    expect(buildListaChequeo(BASE)).toMatchObject({ completa: true });
  });

  it('dice qué falta, uno por reto, con su enlace', () => {
    const lista = buildListaChequeo({
      ...BASE,
      finAt: new Date('2026-11-01T00:00:00Z'),
      inicioAt: new Date('2026-10-31T00:00:00Z'),
      retos: [
        { nombre: 'Stand A', tipo: 'qr', activo: true, tienePantalla: false, enHorario: false },
        {
          nombre: 'Otorgado',
          tipo: 'otorgado',
          activo: true,
          tienePantalla: false,
          enHorario: true,
        },
        { nombre: 'Inactivo', tipo: 'qr', activo: false, tienePantalla: false, enHorario: false },
      ],
      premiosActivos: 2,
    });
    expect(lista.completa).toBe(false);
    expect(lista.items.filter((i) => !i.ok).map((i) => [i.clave, i.texto, i.enlace])).toEqual([
      ['fechas', 'Revisa las fechas del evento', 'configuracion'],
      ['retos_con_pantalla', 'El reto «Stand A» no tiene pantalla', 'pantallas'],
      ['catalogo_con_mesa', 'Tienes premios pero ninguna mesa de canje', 'mesas'],
      ['retos_en_horario', 'El horario del reto «Stand A» queda fuera del evento', 'retos'],
    ]);
  });

  it('sin retos activos no se publica', () => {
    const lista = buildListaChequeo({ ...BASE, retos: [] });
    expect(lista.items.find((i) => i.clave === 'retos')?.ok).toBe(false);
  });

  it('crear: fechas en orden, hasta 7 días y zona horaria conocida', () => {
    const bien = {
      nombre: 'Meetup',
      inicioAt: '2026-12-05T14:00:00Z',
      finAt: '2026-12-05T22:00:00Z',
    };
    expect(esquemaCrearEvento.parse(bien).zonaHoraria).toBe('America/La_Paz');
    expect(esquemaCrearEvento.safeParse({ ...bien, finAt: '2026-12-05T10:00:00Z' }).success).toBe(
      false,
    );
    expect(esquemaCrearEvento.safeParse({ ...bien, finAt: '2026-12-15T10:00:00Z' }).success).toBe(
      false,
    );
    expect(esquemaCrearEvento.safeParse({ ...bien, zonaHoraria: 'Marte/Olimpo' }).success).toBe(
      false,
    );
  });
});
