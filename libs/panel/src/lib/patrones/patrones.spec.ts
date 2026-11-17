import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AvisosService } from './avisos';
import { DialogoComponent } from './dialogo.component';
import { EncabezadoPaginaComponent } from './encabezado-pagina.component';
import { FiltrosComponent } from './filtros.component';
import { MenuAccionesComponent } from './menu-acciones.component';
import { PanelLateralComponent, SeccionComponent } from './panel-lateral.component';
import { PestanasComponent } from './pestanas.component';

@Component({
  imports: [PestanasComponent],
  template: `<pnl-pestanas etiqueta="Secciones" [pestanas]="pestanas" [(activa)]="activa"
    ><p>Contenido de {{ activa() }}</p></pnl-pestanas
  >`,
})
class PestanasDePrueba {
  readonly pestanas = [
    { clave: 'datos', texto: 'Datos' },
    { clave: 'imagenes', texto: 'Imágenes' },
    { clave: 'reglas', texto: 'Reglas y puerta' },
  ];
  readonly activa = signal('datos');
}

@Component({
  imports: [PanelLateralComponent, SeccionComponent],
  template: `
    <pnl-panel-lateral
      titulo="Nuevo reto"
      [abierto]="abierto()"
      (guardar)="guardados.set(guardados() + 1)"
      (cerrado)="cerrados.set(cerrados() + 1)"
    >
      <pnl-seccion titulo="Básico"><input aria-label="Nombre" /></pnl-seccion>
      <pnl-seccion titulo="Avanzado" [plegable]="true" [abierta]="conError()">
        <input aria-label="Sponsor" />
      </pnl-seccion>
    </pnl-panel-lateral>
  `,
})
class PanelDePrueba {
  readonly abierto = signal(true);
  readonly conError = signal(false);
  readonly guardados = signal(0);
  readonly cerrados = signal(0);
}

@Component({
  imports: [EncabezadoPaginaComponent, MenuAccionesComponent],
  template: `
    <pnl-encabezado-pagina titulo="Invitados" descripcion="Quién viene al evento.">
      <button type="button">Agregar invitado</button>
      <pnl-menu-acciones texto="Más">
        <button type="button" (click)="elegido.set('importar')">Importar CSV</button>
        <button type="button" (click)="elegido.set('exportar')">Exportar</button>
      </pnl-menu-acciones>
    </pnl-encabezado-pagina>
    <pnl-menu-acciones etiqueta="Acciones de Taza Pasitos">
      <button type="button">Editar</button>
    </pnl-menu-acciones>
  `,
})
class EncabezadoDePrueba {
  readonly elegido = signal<string | null>(null);
}

@Component({
  imports: [FiltrosComponent],
  template: `<pnl-filtros [activos]="2">
    <input pnlBuscador type="search" aria-label="Buscar" />
    <select aria-label="Estado"></select>
  </pnl-filtros>`,
})
class FiltrosDePrueba {}

@Component({
  imports: [DialogoComponent],
  template: `<pnl-dialogo
    titulo="Conectar Tablet"
    [abierto]="abierto()"
    (cerrado)="cerrados.set(cerrados() + 1)"
  >
    <p>El QR</p>
    <button pnlPie type="button">Listo</button>
  </pnl-dialogo>`,
})
class DialogoDePrueba {
  readonly abierto = signal(true);
  readonly cerrados = signal(0);
}

describe('patrones de página del panel (Fase 3 de UI)', () => {
  afterEach(() => vi.useRealTimers());

  it('los avisos flotantes se van solos y el mismo texto no se apila', () => {
    vi.useFakeTimers();
    const avisos = TestBed.inject(AvisosService);
    avisos.ok('Guardado.');
    avisos.ok('Guardado.');
    avisos.ok('Quitamos a Luis de la lista.');
    expect(avisos.lista().map((a) => a.texto)).toEqual([
      'Guardado.',
      'Quitamos a Luis de la lista.',
    ]);
    vi.advanceTimersByTime(4_000);
    expect(avisos.lista()).toEqual([]);
  });

  it('las pestañas marcan la activa, cambian con clic, flechas y el select del celular', async () => {
    const fixture = TestBed.createComponent(PestanasDePrueba);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const pestanas = [...html.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    expect(pestanas.map((p) => p.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(pestanas.map((p) => p.tabIndex)).toEqual([0, -1, -1]);
    const panel = html.querySelector('[role=tabpanel]');
    expect(panel?.getAttribute('aria-labelledby')).toBe(pestanas[0]?.id);

    pestanas[1]?.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.activa()).toBe('imagenes');
    expect(html.textContent).toContain('Contenido de imagenes');

    pestanas[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.activa()).toBe('reglas');
    pestanas[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.activa()).toBe('datos');

    const select = html.querySelector('select') as HTMLSelectElement;
    select.value = 'reglas';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.activa()).toBe('reglas');
  });

  it('el panel lateral tiene título, Guardar y Cancelar abajo, y avisa al enviar', async () => {
    const fixture = TestBed.createComponent(PanelDePrueba);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const dialogo = html.querySelector('dialog') as HTMLDialogElement;
    const titulo = html.querySelector('h2');
    expect(titulo?.textContent?.trim()).toBe('Nuevo reto');
    expect(dialogo.getAttribute('aria-labelledby')).toBe(titulo?.id);
    const pie = [...html.querySelectorAll('.pnl-panel__pie button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(pie).toEqual(['Guardar', 'Cancelar']);

    const form = html.querySelector('form') as HTMLFormElement;
    const envio = new Event('submit', { cancelable: true });
    form.dispatchEvent(envio);
    expect(envio.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.guardados()).toBe(1);
  });

  it('una sección plegable empieza cerrada salvo que haya un error adentro', async () => {
    const fixture = TestBed.createComponent(PanelDePrueba);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('section h3')?.textContent).toBe('Básico');
    const plegable = html.querySelector('details') as HTMLDetailsElement;
    expect(plegable.querySelector('summary')?.textContent).toBe('Avanzado');
    expect(plegable.open).toBe(false);
    expect(plegable.querySelector('input[aria-label=Sponsor]')).not.toBeNull();
    fixture.componentInstance.conError.set(true);
    await fixture.whenStable();
    expect(plegable.open).toBe(true);
  });

  it('el encabezado de página lleva el título, la acción principal y el menú Más', async () => {
    const fixture = TestBed.createComponent(EncabezadoDePrueba);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('h1')?.textContent).toBe('Invitados');
    expect(html.querySelector('.pnl-pagina__descripcion')?.textContent).toBe(
      'Quién viene al evento.',
    );
    const [mas, puntos] = [...html.querySelectorAll<HTMLButtonElement>('[popovertarget]')];
    expect(mas?.textContent).toContain('Más');
    expect(mas?.getAttribute('aria-expanded')).toBe('false');
    const panel = html.querySelector(`#${mas?.getAttribute('popovertarget')}`);
    expect(panel?.getAttribute('popover')).toBe('auto');
    expect(panel?.textContent).toContain('Importar CSV');
    // Sin texto, el ⋯ se nombra con la etiqueta.
    expect(puntos?.getAttribute('aria-label')).toBe('Acciones de Taza Pasitos');

    (panel?.querySelector('button') as HTMLButtonElement).click();
    expect(fixture.componentInstance.elegido()).toBe('importar');
  });

  it('la barra de filtros dice cuántos hay y los muestra en el celular al tocar Filtros', async () => {
    const fixture = TestBed.createComponent(FiltrosDePrueba);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const filtros = html.querySelector('pnl-filtros') as HTMLElement;
    const boton = html.querySelector('.pnl-filtros__boton') as HTMLButtonElement;
    expect(boton.textContent).toContain('Filtros (2)');
    expect(html.querySelector('.pnl-filtros__buscador input')).not.toBeNull();
    expect(filtros.classList).not.toContain('pnl-filtros--abiertos');
    boton.click();
    await fixture.whenStable();
    expect(filtros.classList).toContain('pnl-filtros--abiertos');
    expect(boton.getAttribute('aria-expanded')).toBe('true');
  });

  it('el diálogo centrado tiene título, contenido y pie, y la × avisa que se cerró', async () => {
    const fixture = TestBed.createComponent(DialogoDePrueba);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const dialogo = html.querySelector('dialog') as HTMLDialogElement;
    const titulo = html.querySelector('h2');
    expect(titulo?.textContent?.trim()).toBe('Conectar Tablet');
    expect(dialogo.getAttribute('aria-labelledby')).toBe(titulo?.id);
    expect(html.querySelector('.pnl-dialogo__cuerpo')?.textContent).toContain('El QR');
    expect(html.querySelector('.pnl-dialogo__pie button')?.textContent).toBe('Listo');
    (html.querySelector('[aria-label=Cerrar]') as HTMLButtonElement).click();
    expect(fixture.componentInstance.cerrados()).toBe(1);
  });
});
