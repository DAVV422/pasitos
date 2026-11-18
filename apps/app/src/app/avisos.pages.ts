import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AvisoComponent, BotonDirective, IconoComponent } from '@pasitos/ui';
import { loadCopia } from './copia-local';
import { formatHora } from './formato';
import { NoFuiYoService } from './no-fui-yo.service';
import { SesionAsistente, type Anulacion } from './sesion-asistente';

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
 * El dispositivo anulado (HU-312 §2): este celular perdió la entrada porque se abrió en otro
 * (V17). Ocupa la pantalla completa (sin barra) y se recuerda en IndexedDB para mostrarlo aunque
 * abra sin conexión. **No fui yo** avisa a la puerta, firmado con la llave de este celular.
 */
@Component({
  selector: 'app-anulado-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, IconoComponent],
  template: `
    <section class="flex flex-col items-center gap-5 pt-8 text-center" role="alert">
      <px-icono nombre="shieldx" [tamano]="72" />
      <h1 class="text-3xl font-extrabold">Tu entrada se abrió en otro celular</h1>
      @if (cuando(); as texto) {
        <p class="text-lg">Fue el {{ texto }}.</p>
      }
      @if (noFuiYo.enviado()) {
        <px-aviso variante="info">Avisamos a la puerta. Acércate con este celular.</px-aviso>
      } @else {
        <p class="text-lg">Si no fuiste tú, ve a la puerta.</p>
        <button
          pxBoton="peligro"
          type="button"
          [bloque]="true"
          [cargando]="noFuiYo.enviando()"
          (click)="report()"
        >
          No fui yo
        </button>
      }
      @if (noFuiYo.error(); as e) {
        <px-aviso variante="peligro">{{ e }}</px-aviso>
      }
    </section>
  `,
})
export class AnuladoPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly noFuiYo = inject(NoFuiYoService);

  /** *"21/11 a las 10:42"*, en la hora del evento. */
  protected readonly cuando = computed(() => {
    const anulacion = this.sesion.anulacion();
    if (!anulacion?.anuladaAt) return null;
    const dia = new Intl.DateTimeFormat('es-BO', {
      day: '2-digit',
      month: '2-digit',
      timeZone: anulacion.zonaHoraria,
    }).format(new Date(anulacion.anuladaAt));
    return `${dia} a las ${formatHora(anulacion.anuladaAt, anulacion.zonaHoraria)}`;
  });

  constructor() {
    // Abierta directo (sin pasar por el guard): la anulación guardada.
    if (!this.sesion.anulacion()) {
      void loadCopia<Anulacion>('anulacion').then((copia) => {
        if (copia) this.sesion.anulacion.set(copia.valor);
      });
    }
  }

  protected async report(): Promise<void> {
    await this.noFuiYo.send('dispositivo');
  }
}

/** Sin red y sin copia guardada: la primera vez que se abre la app sin conexión (HU-308 §4). */
@Component({
  selector: 'app-sin-conexion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective],
  template: `
    <section class="flex flex-col gap-4">
      <h1 class="text-2xl font-extrabold">Sin conexión</h1>
      <p>No pudimos abrir tu entrada. Tus puntos están a salvo.</p>
      <button pxBoton type="button" (click)="retry()">Intentar de nuevo</button>
    </section>
  `,
})
export class SinConexionPage {
  private readonly router = inject(Router);

  protected retry(): void {
    void this.router.navigate(['/inicio']);
  }
}
