import { TestBed } from '@angular/core/testing';
import { ASISTENTES_CONTACTO, TIPOS_EVENTO_CONTACTO } from '@pasitos/dominio/esquemas';
import { ASISTENTES, TIPOS_EVENTO } from './contacto';
import { ContactoFormComponent } from './contacto-form.component';

function responder(estado: number, cuerpo: object = {}) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: estado }));
}

async function render() {
  const fixture = TestBed.createComponent(ContactoFormComponent);
  await fixture.whenStable();
  return fixture;
}

function escribir(html: HTMLElement, nombre: string, valor: string) {
  const campo = html.querySelector<HTMLInputElement>(`[name="${nombre}"]`);
  if (!campo) throw new Error(`Falta el campo ${nombre}`);
  campo.value = valor;
}

async function llenarYEnviar(fixture: Awaited<ReturnType<typeof render>>) {
  const html = fixture.nativeElement as HTMLElement;
  escribir(html, 'nombre', 'Carla Rojas');
  escribir(html, 'email', 'carla@example.com');
  escribir(html, 'mensaje', 'Queremos usar Pasitos en nuestro meetup.');
  const acepta = html.querySelector<HTMLInputElement>('[name="aceptaPrivacidad"]');
  if (acepta) acepta.checked = true;
  await fixture.whenStable();
  html.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  await fixture.whenStable();
  return html;
}

describe('formulario de contacto (HU-410)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('las opciones son las mismas del dominio', () => {
    expect(TIPOS_EVENTO.map((t) => t.valor)).toEqual(Object.keys(TIPOS_EVENTO_CONTACTO));
    expect(ASISTENTES.map((a) => a.valor)).toEqual(Object.keys(ASISTENTES_CONTACTO));
  });

  it('envía los datos con la trampa vacía y agradece', async () => {
    const fetch = responder(201);
    const html = await llenarYEnviar(await render());
    const cuerpo = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      nombre: 'Carla Rojas',
      email: 'carla@example.com',
      aceptaPrivacidad: true,
      sitioWeb: '',
    });
    expect(html.querySelector('[data-testid="contacto-enviado"]')?.textContent).toContain(
      'Gracias, te escribiremos pronto.',
    );
  });

  it('muestra el error del servidor y los de cada campo', async () => {
    responder(400, {
      detail: 'Revisa los campos marcados.',
      errors: [{ field: 'mensaje', message: 'Cuéntanos un poco más (al menos 10 letras).' }],
    });
    const html = await llenarYEnviar(await render());
    expect(html.querySelector('[role="alert"]')?.textContent).toContain('Revisa los campos');
    expect(html.textContent).toContain('Cuéntanos un poco más');
    expect(html.querySelector('[data-testid="contacto-enviado"]')).toBeNull();
  });
});
