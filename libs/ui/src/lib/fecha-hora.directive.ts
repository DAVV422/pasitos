import { Directive, effect, ElementRef, inject, input, output } from '@angular/core';

/** `2030-03-10T09:00` → `10/03/2030 09:00`. Vacío o inválido: vacío. */
export function formatFechaHora(valor: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '';
}

/** `10/03/2030 09:00` (o solo sus 12 dígitos) → `2030-03-10T09:00`; `null` si no es una fecha real. */
export function parseFechaHora(texto: string): string | null {
  const d = texto.replace(/\D/g, '');
  if (d.length !== 12) return null;
  const [dia, mes, anio, hora, minuto] = [
    d.slice(0, 2),
    d.slice(2, 4),
    d.slice(4, 8),
    d.slice(8, 10),
    d.slice(10, 12),
  ];
  const fecha = new Date(Date.UTC(+anio, +mes - 1, +dia));
  const real =
    fecha.getUTCFullYear() === +anio &&
    fecha.getUTCMonth() === +mes - 1 &&
    fecha.getUTCDate() === +dia &&
    +hora < 24 &&
    +minuto < 60;
  return real ? `${anio}-${mes}-${dia}T${hora}:${minuto}` : null;
}

/** Pone las barras, el espacio y los dos puntos mientras se escribe: `100320300900` → `10/03/2030 09:00`. */
export function maskFechaHora(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 12);
  const partes = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
  const hora = [d.slice(8, 10), d.slice(10, 12)].filter(Boolean).join(':');
  return hora ? `${partes} ${hora}` : partes;
}

/**
 * Fecha y hora escritas como en Bolivia, `dd/mm/aaaa hh:mm` (Fase 4 de UI). El
 * `datetime-local` del navegador sigue el formato del sistema operativo (a veces `mm/dd/yyyy`).
 * El valor que entra y sale es el mismo de un `datetime-local` (`2030-03-10T09:00`), o vacío
 * mientras la fecha está incompleta o no existe.
 *
 *   <input [id]="c.idControl" [pxFechaHora]="inicio()" (fechaHora)="inicio.set($event)" />
 */
@Directive({
  selector: 'input[pxFechaHora]',
  host: {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    placeholder: 'dd/mm/aaaa hh:mm',
    maxlength: '16',
    '(input)': 'onInput()',
    '(blur)': 'onBlur()',
  },
})
export class FechaHoraDirective {
  readonly pxFechaHora = input<string>('');
  readonly fechaHora = output<string>();

  private readonly elemento = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private ultimo: string | null = null;

  constructor() {
    effect(() => {
      const valor = this.pxFechaHora();
      // Lo que se acaba de emitir no se vuelve a escribir (no mueve el cursor al escribir). Un
      // vacío con una fecha completa escrita es que el formulario se limpió desde afuera.
      const limpiado = valor === '' && parseFechaHora(this.elemento.value) !== null;
      if (valor === this.ultimo && !limpiado) return;
      this.ultimo = valor;
      this.elemento.value = formatFechaHora(valor);
    });
  }

  protected onInput(): void {
    const el = this.elemento;
    // Solo se completa el formato si se escribe al final (corregir en el medio no salta).
    if (el.selectionStart === el.value.length) el.value = maskFechaHora(el.value);
    this.emit(parseFechaHora(el.value) ?? '');
  }

  protected onBlur(): void {
    const valor = parseFechaHora(this.elemento.value);
    if (valor) this.elemento.value = formatFechaHora(valor);
  }

  private emit(valor: string): void {
    if (valor === this.ultimo) return;
    this.ultimo = valor;
    this.fechaHora.emit(valor);
  }
}
