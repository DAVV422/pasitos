import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BotonDirective } from './boton.directive';
import { formatCuentaRegresiva } from './cuenta-regresiva.component';
import { EncabezadoComponent } from './encabezado.component';
import { EstadoComponent } from './estado.component';
import { QrComponent } from './qr.component';

@Component({
  imports: [BotonDirective],
  template: `<button pxBoton="secundario" [cargando]="cargando()">Confirmando…</button>`,
})
class BotonDePrueba {
  readonly cargando = signal(false);
}

describe('componentes base', () => {
  it('el botón aplica la variante y se deshabilita mientras carga', async () => {
    const fixture = TestBed.createComponent(BotonDePrueba);
    await fixture.whenStable();
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(boton.className).toContain('px-boton--secundario');
    expect(boton.disabled).toBe(false);

    fixture.componentInstance.cargando.set(true);
    await fixture.whenStable();
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
  });

  it('formatea la cuenta regresiva como m:ss y nunca en negativo', () => {
    expect(formatCuentaRegresiva(102)).toBe('1:42');
    expect(formatCuentaRegresiva(9.2)).toBe('0:10');
    expect(formatCuentaRegresiva(-5)).toBe('0:00');
  });

  it('el QR genera un SVG con su descripción', async () => {
    const fixture = TestBed.createComponent(QrComponent);
    fixture.componentRef.setInput('texto', 'https://pasitos.app/v/K7Q2-M9XD');
    fixture.componentRef.setInput('descripcion', 'QR de asistente para Carla Mendoza');
    await fixture.whenStable();
    const elemento: HTMLElement = fixture.nativeElement;
    expect(elemento.querySelector('svg')).not.toBeNull();
    expect(elemento.getAttribute('aria-label')).toBe('QR de asistente para Carla Mendoza');
  });

  it('el estado de error muestra el código de soporte con 8 caracteres', async () => {
    const fixture = TestBed.createComponent(EstadoComponent);
    fixture.componentRef.setInput('tipo', 'error');
    fixture.componentRef.setInput('titulo', 'Algo salió mal');
    fixture.componentRef.setInput('traceId', '01a1d7c0-8672-75a4');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('01a1d7c0');
    expect(fixture.nativeElement.textContent).not.toContain('8672');
  });

  it('el encabezado muestra DEMO solo en eventos demo', async () => {
    const fixture = TestBed.createComponent(EncabezadoComponent);
    fixture.componentRef.setInput('tipoEvento', 'demo');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Demo');

    fixture.componentRef.setInput('tipoEvento', 'real');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Demo');
    expect(fixture.nativeElement.textContent).toContain('Testnet');
  });
});
