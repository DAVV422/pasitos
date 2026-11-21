import {
  buildCsv,
  escapeCeldaCsv,
  mapColumnas,
  maskEmail,
  parseCsv,
  readFilas,
  hasColumnaNombre,
} from './csv';

describe('CSV de invitados (HU-210)', () => {
  it('lee comas, comillas, comillas dobles adentro y saltos de línea en una celda', () => {
    const filas = parseCsv(
      'nombre,correo\r\n"Quispe, Valeria","va@example.com"\n"Dijo ""hola""\notra",\n',
    );
    expect(filas).toEqual([
      ['nombre', 'correo'],
      ['Quispe, Valeria', 'va@example.com'],
      ['Dijo "hola"\notra', ''],
    ]);
  });

  it('detecta el punto y coma y quita el BOM', () => {
    expect(parseCsv('\uFEFFnombre;correo\nAna;ana@example.com')).toEqual([
      ['nombre', 'correo'],
      ['Ana', 'ana@example.com'],
    ]);
  });

  it('ignora las filas vacías', () => {
    expect(parseCsv('nombre\n\nAna\n,\n ,\nLuis\n')).toHaveLength(3);
  });

  it('reconoce las columnas sin importar mayúsculas, tildes ni el orden', () => {
    const columnas = mapColumnas(['Ticket', 'Correo Electrónico', 'NOMBRE COMPLETO', 'Empresa']);
    expect(columnas.indices).toEqual({ codigoExterno: 0, email: 1, nombre: 2 });
    expect(columnas.ignoradas).toEqual(['Empresa']);
    expect(hasColumnaNombre(mapColumnas(['correo']))).toBe(false);
  });

  it('junta nombres y apellidos, y numera las filas como la planilla', () => {
    const columnas = mapColumnas(['Nombres', 'Apellidos', 'Email']);
    expect(readFilas([['Valeria ', ' Quispe', 'va@example.com'.toUpperCase()]], columnas)).toEqual([
      {
        fila: 2,
        nombre: 'Valeria Quispe',
        email: 'va@example.com',
        codigoExterno: null,
        celular: null,
      },
    ]);
  });

  it('escapa las celdas que Excel tomaría como fórmula', () => {
    expect(escapeCeldaCsv('=HYPERLINK("http://x","clic")')).toBe(
      `"'=HYPERLINK(""http://x"",""clic"")"`,
    );
    for (const inicio of ['+1', '-2', '@SUM(A1)', '\tx', '\rx']) {
      expect(escapeCeldaCsv(inicio).replace(/^"/, '').startsWith(`'`)).toBe(true);
    }
    expect(escapeCeldaCsv('Ana')).toBe('Ana');
    expect(escapeCeldaCsv(null)).toBe('');
  });

  it('el CSV exportado lleva BOM y CRLF', () => {
    expect(buildCsv(['a', 'b'], [[1, 'x;y']])).toBe('\uFEFFa,b\r\n1,"x;y"\r\n');
  });

  it('enmascara el correo', () => {
    expect(maskEmail('valeria@example.com')).toBe('va•••@example.com');
    expect(maskEmail(null)).toBeNull();
  });
});
