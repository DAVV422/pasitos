import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AvisoComponent } from '@pasitos/ui';
import { EnVivoService } from '@pasitos/web-core';
import { SesionAsistente } from '../sesion-asistente';

/**
 * Inicio (HU-306: la base). Muestra quién es, el saldo que confirma el servidor y si falta pasar
 * por la puerta; el saldo cambia en vivo. HU-308 suma *Ahora y a continuación*, los retos y los
 * estados del evento.
 */
@Component({
  selector: 'app-inicio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent],
  template: `
    @if (sesion.estado(); as e) {
      <section class="flex flex-col gap-4">
        <p class="text-muted">{{ e.evento.nombre }}</p>
        <h1 class="text-3xl font-extrabold">Hola, {{ primerNombre() }}</h1>
        <div class="border-line bg-surface rounded-xl border p-5" aria-live="polite">
          <p class="text-muted text-sm">Tus {{ e.evento.nombrePuntos }}</p>
          <p class="font-display text-5xl font-extrabold">{{ e.saldo }}</p>
        </div>
        @if (e.evento.requiereCheckIn && e.asistente.estado !== 'presente') {
          <px-aviso variante="info">Pasa por la puerta para empezar a ganar puntos.</px-aviso>
        }
        <p class="text-muted text-sm">
          Tu código de asistente: <b>{{ e.asistente.codigo }}</b>
        </p>
      </section>
    }
  `,
})
export class InicioPage {
  protected readonly sesion = inject(SesionAsistente);
  private readonly router = inject(Router);

  protected readonly primerNombre = computed(
    () => this.sesion.estado()?.asistente.nombre.split(' ')[0] ?? '',
  );

  constructor() {
    const canal = inject(EnVivoService).connect(
      '/api/v1/app/en-vivo',
      [
        'saldo.actualizado',
        'dispositivo.anulado',
        'evento.abierto',
        'evento.pausado',
        'evento.reanudado',
        'evento.cerrado',
      ],
      inject(DestroyRef),
    );
    canal.on('saldo.actualizado', (aviso) => {
      const saldo = (aviso.datos as { saldo?: unknown } | null)?.saldo;
      const estado = this.sesion.estado();
      if (estado && typeof saldo === 'number') {
        this.sesion.estado.set({ ...estado, saldo });
      }
    });
    canal.on('dispositivo.anulado', () => {
      this.sesion.estado.set(null);
      void this.sesion.load().then(() => this.router.navigate(['/anulado']));
    });
    for (const evento of [
      'evento.abierto',
      'evento.pausado',
      'evento.reanudado',
      'evento.cerrado',
    ]) {
      canal.on(evento, () => void this.sesion.load());
    }
    canal.on('reiniciar', () => void this.sesion.load());
  }
}
