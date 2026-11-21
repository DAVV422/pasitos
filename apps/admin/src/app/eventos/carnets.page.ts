import { canDo } from '@pasitos/dominio';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { getMensajeError, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  IconoComponent,
  LectorQrComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { CarnetsApi, type FichaCarnet } from './carnets-api.service';
import { EventoActualService } from './evento.layout';

type Modo = 'inicio' | 'escanear' | 'buscar' | 'ficha';

/**
 * *Verificar carnet* (HU-321 §4), pensada para el celular: escanear *Mi entrada* o buscar, comparar
 * el carnet escrito con el físico y verificar, corregir o decir que no coincide.
 */
@Component({
  selector: 'adm-carnets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: '--alto-control: 48px; --alto-boton: 52px; --radio-control: 12px',
  },
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    EstadoComponent,
    IconoComponent,
    LectorQrComponent,
  ],
  template: `
    <section class="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 class="text-2xl font-extrabold">Verificar carnet</h1>
      @if (!activa()) {
        <px-aviso variante="advertencia">
          La verificación de carnet está apagada. Se activa en Configuración → Reglas y puerta.
        </px-aviso>
      }
      @if (error(); as e) {
        <px-aviso variante="peligro" role="alert">{{ e }}</px-aviso>
      }
      @if (resultado(); as r) {
        <px-aviso variante="ok" role="status">{{ r }}</px-aviso>
      }
      @switch (modo()) {
        @case ('escanear') {
          <px-lector-qr (leido)="onLeido($event)" />
          <p class="text-muted text-center">
            Apunta a <b>Mi entrada</b> en el celular de la persona.
          </p>
          <button pxBoton="secundario" type="button" (click)="modo.set('inicio')">Cancelar</button>
        }
        @case ('buscar') {
          <form class="flex flex-col gap-3" (submit)="search($event)" novalidate>
            <px-campo etiqueta="Nombre o código" #cq="pxCampo">
              <input
                [id]="cq.idControl"
                autocomplete="off"
                [value]="q()"
                (input)="q.set(valorDe($event))"
              />
            </px-campo>
            <button type="submit" pxBoton [cargando]="cargando()">Buscar</button>
          </form>
          @for (r of resultados(); track r.id) {
            <button
              type="button"
              class="border-line bg-surface rounded-xl border p-4 text-left"
              (click)="open(r)"
            >
              <b>{{ r.nombre }}</b> <span class="text-muted">· {{ r.codigo }}</span>
            </button>
          } @empty {
            @if (buscado()) {
              <px-estado tipo="vacio" titulo="Nadie coincide con la búsqueda" />
            }
          }
          <button pxBoton="secundario" type="button" (click)="modo.set('inicio')">Cancelar</button>
        }
        @case ('ficha') {
          @if (ficha(); as f) {
            <article class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-5">
              <p class="text-3xl font-extrabold" data-testid="nombre">{{ f.nombre }}</p>
              <p class="text-muted">{{ f.codigo }}</p>
              @if (f.verificacion; as v) {
                <p class="text-success flex items-center gap-2 text-lg font-bold">
                  <px-icono nombre="check" [tamano]="22" />Carnet verificado
                  @if (v.por) {
                    por {{ v.por }}
                  }
                </p>
              } @else {
                @if (f.ci) {
                  <p class="text-2xl">
                    Carnet escrito: <b data-testid="carnet">{{ f.ci }}</b>
                  </p>
                } @else {
                  <p class="text-xl">No escribió su carnet.</p>
                }
                <p class="text-muted">Compáralo con el carnet físico.</p>
              }
            </article>
            @if (f.verificacion && puedeDeshacer()) {
              @if (!deshaciendo()) {
                <button type="button" pxBoton="peligro-contorno" (click)="deshaciendo.set(true)">
                  Deshacer la verificación
                </button>
              } @else {
                <form class="flex flex-col gap-3" (submit)="cancel($event)" novalidate>
                  <px-campo
                    etiqueta="Motivo"
                    ayuda="Por ejemplo: Me equivoqué de persona. Se restan los puntos del reto."
                    #cd="pxCampo"
                  >
                    <input
                      [id]="cd.idControl"
                      [attr.aria-describedby]="cd.idDescripcion"
                      maxlength="300"
                      [value]="motivo()"
                      (input)="motivo.set(valorDe($event))"
                    />
                  </px-campo>
                  <button type="submit" pxBoton="peligro" [cargando]="cargando()">
                    Deshacer y restar los puntos
                  </button>
                </form>
              }
            }
            @if (!f.verificacion) {
              @if (f.ci && !corrigiendo()) {
                <button
                  type="button"
                  pxBoton
                  class="min-h-14 text-lg"
                  [cargando]="cargando()"
                  (click)="verify(null)"
                >
                  ✓ Coincide, verificar
                </button>
              }
              @if (corrigiendo() || !f.ci) {
                <form class="flex flex-col gap-3" (submit)="saveCorreccion($event)" novalidate>
                  <px-campo
                    etiqueta="Carnet del documento"
                    ayuda="Escríbelo tal como está en el carnet."
                    #cc="pxCampo"
                  >
                    <input
                      [id]="cc.idControl"
                      [attr.aria-describedby]="cc.idDescripcion"
                      maxlength="20"
                      autocomplete="off"
                      [value]="correccion()"
                      (input)="correccion.set(valorDe($event))"
                    />
                  </px-campo>
                  <button type="submit" pxBoton [cargando]="cargando()">
                    {{ f.ci ? 'Corregir y verificar' : 'Verificar' }}
                  </button>
                </form>
              } @else {
                <button type="button" pxBoton="secundario" (click)="startCorreccion(f)">
                  Corregir y verificar
                </button>
              }
              @if (!rechazando()) {
                <button type="button" pxBoton="peligro-contorno" (click)="rechazando.set(true)">
                  No coincide
                </button>
              } @else {
                <form class="flex flex-col gap-3" (submit)="reject($event)" novalidate>
                  <px-campo etiqueta="Nota" ayuda="Por ejemplo: Es otra persona." #cn="pxCampo">
                    <input
                      [id]="cn.idControl"
                      [attr.aria-describedby]="cn.idDescripcion"
                      maxlength="300"
                      [value]="nota()"
                      (input)="nota.set(valorDe($event))"
                    />
                  </px-campo>
                  <button type="submit" pxBoton="peligro" [cargando]="cargando()">Guardar</button>
                </form>
              }
            }
            <button pxBoton="secundario" type="button" (click)="reset()">Siguiente persona</button>
          }
        }
        @default {
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              pxBoton
              class="min-h-24 flex-col text-lg"
              (click)="modo.set('escanear')"
            >
              <px-icono nombre="scan" [tamano]="28" />Escanear Mi entrada
            </button>
            <button
              type="button"
              pxBoton="secundario"
              class="min-h-24 flex-col text-lg"
              (click)="modo.set('buscar')"
            >
              <px-icono nombre="search" [tamano]="28" />Buscar
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class CarnetsPage {
  private readonly api = inject(CarnetsApi);
  private readonly actual = inject(EventoActualService);

  protected readonly modo = signal<Modo>('inicio');
  protected readonly ficha = signal<FichaCarnet | null>(null);
  protected readonly resultados = signal<readonly FichaCarnet[]>([]);
  protected readonly buscado = signal(false);
  protected readonly q = signal('');
  protected readonly correccion = signal('');
  protected readonly corrigiendo = signal(false);
  protected readonly rechazando = signal(false);
  protected readonly nota = signal('');
  protected readonly deshaciendo = signal(false);
  protected readonly motivo = signal('');
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resultado = signal<string | null>(null);
  protected readonly valorDe = valorDe;

  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly activa = computed(
    () => this.actual.evento()?.reglas.verificacionCiActiva === true,
  );
  /** Deshacer mueve puntos: solo dueño y coorganizador (`puntos.ajustar`). */
  protected readonly puedeDeshacer = computed(() => {
    const evento = this.actual.evento();
    return !!evento && canDo(evento.miRol, 'puntos.ajustar');
  });
  private readonly nombrePuntos = computed(() => this.actual.evento()?.nombrePuntos ?? 'puntos');

  protected async onLeido(qr: string): Promise<void> {
    await this.run(async () => {
      const [ficha] = await this.api.search(this.eventoId(), { qr });
      if (ficha) this.open(ficha);
    });
  }

  protected async search(evento: Event): Promise<void> {
    evento.preventDefault();
    const q = this.q().trim();
    if (!q) return;
    await this.run(async () => {
      this.resultados.set(await this.api.search(this.eventoId(), { q }));
      this.buscado.set(true);
    });
  }

  protected open(ficha: FichaCarnet): void {
    this.ficha.set(ficha);
    this.corrigiendo.set(false);
    this.rechazando.set(false);
    this.deshaciendo.set(false);
    this.resultado.set(null);
    this.modo.set('ficha');
  }

  protected startCorreccion(ficha: FichaCarnet): void {
    this.correccion.set(ficha.ci ?? '');
    this.corrigiendo.set(true);
  }

  protected async saveCorreccion(evento: Event): Promise<void> {
    evento.preventDefault();
    const ci = this.correccion().trim();
    if (!ci) {
      this.error.set('Escribe el carnet tal como está en el documento.');
      return;
    }
    await this.verify(ci);
  }

  protected async verify(ci: string | null): Promise<void> {
    const ficha = this.ficha();
    if (!ficha) return;
    await this.run(async () => {
      try {
        const hecho = await this.api.verify(ficha.id, ci);
        this.ficha.set(hecho.ficha);
        this.corrigiendo.set(false);
        this.resultado.set(
          hecho.yaGanoAntes
            ? `Verificado ✓, sin ${this.nombrePuntos()}: ya los había ganado antes de que se deshiciera la verificación. Si corresponde devolvérselos, hazlo con un ajuste en Juego → Ajustes (dueño o coorganizador).`
            : hecho.puntos > 0
              ? `Verificado ✓ · +${hecho.puntos} ${this.nombrePuntos()}`
              : 'Verificado ✓',
        );
      } catch (error) {
        if (error instanceof ErrorApi && error.code === 'CI_VERIFICADO_EN_OTRA_CUENTA') {
          const meta = error.meta as { codigo?: string; nombre?: string; at?: string };
          const cuando = meta.at
            ? new Date(meta.at).toLocaleString('es-BO', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          throw new Error(
            `Este carnet ya se verificó en la cuenta ${meta.codigo ?? ''} (${meta.nombre ?? ''})${cuando ? ` el ${cuando}` : ''}.`,
          );
        }
        throw error;
      }
    });
  }

  protected async reject(evento: Event): Promise<void> {
    evento.preventDefault();
    const ficha = this.ficha();
    const nota = this.nota().trim();
    if (!ficha || nota.length < 3) {
      this.error.set('Cuenta qué pasó (al menos 3 letras).');
      return;
    }
    await this.run(async () => {
      await this.api.reject(ficha.id, nota);
      this.rechazando.set(false);
      this.resultado.set('Anotamos que el carnet no coincide.');
    });
  }

  protected async cancel(evento: Event): Promise<void> {
    evento.preventDefault();
    const ficha = this.ficha();
    const motivo = this.motivo().trim();
    if (!ficha || motivo.length < 5) {
      this.error.set('Cuenta el motivo (al menos 5 letras).');
      return;
    }
    await this.run(async () => {
      this.ficha.set(await this.api.cancel(ficha.id, motivo));
      this.deshaciendo.set(false);
      this.motivo.set('');
      this.resultado.set(
        `Deshicimos la verificación y restamos los ${this.nombrePuntos()} del reto. El carnet se puede volver a verificar.`,
      );
    });
  }

  protected reset(): void {
    this.deshaciendo.set(false);
    this.motivo.set('');
    this.ficha.set(null);
    this.resultados.set([]);
    this.buscado.set(false);
    this.q.set('');
    this.nota.set('');
    this.error.set(null);
    this.resultado.set(null);
    this.modo.set('inicio');
  }

  private async run(trabajo: () => Promise<void>): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      await trabajo();
    } catch (error) {
      this.error.set(error instanceof ErrorApi ? getMensajeError(error) : (error as Error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
