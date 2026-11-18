import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SesionAsistente } from './sesion-asistente';

/** Sin sesión en este navegador (HU-306 §6). */
@Component({
  selector: 'app-sin-acceso-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-4">
      <h1 class="text-2xl font-extrabold">Tu entrada a Pasitos</h1>
      <p>Abre el enlace de tu invitación en este celular, o pasa por la puerta del evento.</p>
      <p class="text-muted text-sm">
        Si ya entraste antes, abre Pasitos en el mismo navegador donde lo hiciste.
      </p>
    </section>
  `,
})
export class SinAccesoPage {}

/**
 * Este celular perdió la entrada porque se abrió en otro (V17). HU-312 suma el historial y el
 * botón *No fui yo*.
 */
@Component({
  selector: 'app-anulado-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <section class="flex flex-col gap-4">
      <h1 class="text-2xl font-extrabold">Tu entrada se abrió en otro celular</h1>
      @if (sesion.anulacion()?.anuladaAt; as cuando) {
        <p>
          Fue el {{ cuando | date: 'dd/MM' : '-0400' }} a las
          {{ cuando | date: 'HH:mm' : '-0400' }}.
        </p>
      }
      <p>Si no fuiste tú, ve a la puerta del evento.</p>
    </section>
  `,
})
export class AnuladoPage {
  protected readonly sesion = inject(SesionAsistente);
}
