import { CORREOS, TIPOS_CORREO, type DatosCorreo } from './catalogo';
import { buildContenidoCorreo, VariableFaltanteError } from './contenido';
import { EJEMPLOS_CORREO } from './ejemplos';

const SISTEMA = { correoSoporte: 'soporte@example.com' };

describe('Catálogo de correos', () => {
  it.each(TIPOS_CORREO)('%s se arma con su ejemplo, sin variables sueltas', (tipo) => {
    const contenido = buildContenidoCorreo(tipo, EJEMPLOS_CORREO[tipo] as never, SISTEMA);
    const todo = [
      contenido.asunto,
      ...contenido.parrafos.flatMap((p) => [p.html, p.texto]),
      contenido.pie.html,
      contenido.pie.texto,
      contenido.boton?.texto ?? '',
      contenido.boton?.enlace ?? '',
      contenido.bajoBoton?.texto ?? '',
    ].join('\n');
    expect(todo).not.toMatch(/[{}[\]]|\*\*/);
    expect(contenido.asunto.length).toBeLessThanOrEqual(70);
    expect(contenido.parrafos.length).toBeGreaterThan(0);
    expect(contenido.prioridad).toBe(CORREOS[tipo].prioridad);
  });

  it('escapa los datos en el HTML y no deja que cambien el formato', () => {
    const contenido = buildContenidoCorreo('invitacion_equipo', {
      ...EJEMPLOS_CORREO.invitacion_equipo,
      evento: '<script>x</script> **gratis**',
    });
    const parrafo = contenido.parrafos[1];
    expect(parrafo?.html).toContain('<strong>&lt;script&gt;x&lt;/script&gt; **gratis**</strong>');
    expect(parrafo?.texto).toContain('<script>x</script> **gratis**');
    expect(contenido.asunto).toBe('Luis te invitó al equipo de <script>x</script> **gratis**');
  });

  it('muestra la parte opcional solo si tiene el dato', () => {
    const datos = EJEMPLOS_CORREO.invitacion_equipo;
    expect(buildContenidoCorreo('invitacion_equipo', datos).parrafos[0]?.texto).toBe('Hola, Ana.');
    const sinNombre: DatosCorreo<'invitacion_equipo'> = { ...datos };
    delete (sinNombre as { nombre?: string }).nombre;
    expect(buildContenidoCorreo('invitacion_equipo', sinNombre).parrafos[0]?.texto).toBe('Hola.');
  });

  it('falla si falta un dato obligatorio o la variable del sistema', () => {
    const incompleto = { nombre: 'Ana' } as unknown as DatosCorreo<'restablecer_password'>;
    expect(() => buildContenidoCorreo('restablecer_password', incompleto)).toThrow(
      VariableFaltanteError,
    );
    expect(() =>
      buildContenidoCorreo('password_cambiada', EJEMPLOS_CORREO.password_cambiada),
    ).toThrow('{correoSoporte}');
  });

  it('no acepta un enlace que no sea web', () => {
    expect(() =>
      buildContenidoCorreo('restablecer_password', {
        nombre: 'Ana',
        enlace: 'javascript:alert(1)',
      }),
    ).toThrow('no es una dirección web');
  });

  it('los tipos de las variables salen de los textos', () => {
    // Si alguien cambia un texto, estos objetos dejan de compilar.
    const datos: DatosCorreo<'restablecer_password'> = { nombre: 'Ana', enlace: 'https://x.y' };
    const opcional: DatosCorreo<'invitacion_equipo'> = {
      ...EJEMPLOS_CORREO.invitacion_equipo,
      nombre: undefined as unknown as string,
    };
    // @ts-expect-error correoSoporte la pone el trabajador, no quien encola
    const conSistema: DatosCorreo<'password_cambiada'> = { correoSoporte: 'x' };
    expect([datos, opcional, conSistema]).toHaveLength(3);
  });
});
