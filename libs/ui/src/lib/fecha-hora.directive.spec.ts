import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FechaHoraDirective,
  formatFechaHora,
  maskFechaHora,
  parseFechaHora,
} from './fecha-hora.directive';

@Component({
  imports: [FechaHoraDirective],
  template: `<input
    aria-label="Empieza"
    [pxFechaHora]="valor()"
    (fechaHora)="valor.set($event)"
  />`,
})
class FechaDePrueba {
  readonly valor = signal('2030-03-10T09:00');
}

describe('fecha y hora como en Bolivia (dd/mm/aaaa hh:mm)', () => {
  it('formatea, completa mientras se escribe y lee solo fechas reales', () => {
    expect(formatFechaHora('2030-03-10T09:00')).toBe('10/03/2030 09:00');
    expect(formatFechaHora('')).toBe('');
    expect(maskFechaHora('1003')).toBe('10/03');
    expect(maskFechaHora('100320300')).toBe('10/03/2030 0');
    expect(maskFechaHora('10/03/2030 09:00 extra 99')).toBe('10/03/2030 09:00');
    expect(parseFechaHora('10/03/2030 09:00')).toBe('2030-03-10T09:00');
    expect(parseFechaHora('100320300900')).toBe('2030-03-10T09:00');
    expect(parseFechaHora('31/02/2030 09:00')).toBeNull();
    expect(parseFechaHora('10/03/2030 24:00')).toBeNull();
    expect(parseFechaHora('10/03/2030')).toBeNull();
  });

  it('muestra el valor en dd/mm/aaaa y emite el formato de datetime-local', async () => {
    const fixture = TestBed.createComponent(FechaDePrueba);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('dd/mm/aaaa hh:mm');
    expect(input.value).toBe('10/03/2030 09:00');

    input.value = '2503203118';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('25/03/2031 18');
    expect(fixture.componentInstance.valor()).toBe('');

    input.value = '25/03/2031 1830';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.componentInstance.valor()).toBe('2031-03-25T18:30');
    expect(input.value).toBe('25/03/2031 18:30');

    fixture.componentInstance.valor.set('2030-12-01T08:05');
    await fixture.whenStable();
    expect(input.value).toBe('01/12/2030 08:05');
  });
});
