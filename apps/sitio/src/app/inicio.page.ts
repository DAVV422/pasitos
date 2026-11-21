import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CONFIG_LEGAL } from '@pasitos/dominio/legal';
import { BotonDirective, ChipComponent, IconoComponent, type NombreIcono } from '@pasitos/ui';
import { ContactoFormComponent } from './landing/contacto-form.component';
import { TEXTOS_LANDING } from './landing/textos';

const ICONOS_PROBLEMA: readonly NombreIcono[] = ['clock', 'gift', 'image'];
const ICONOS_PASOS: readonly NombreIcono[] = ['scan', 'puntos', 'check'];
const RETOS_MOCK: readonly {
  readonly icono: NombreIcono;
  readonly titulo: string;
  readonly puntos: string;
  readonly ok?: boolean;
}[] = [
  { icono: 'check', titulo: 'Charla de apertura', puntos: '+20', ok: true },
  { icono: 'scan', titulo: 'Stand del sponsor', puntos: '+15' },
];
const KPIS_MOCK = [
  { valor: '240', etiqueta: 'Presentes' },
  { valor: '84 %', etiqueta: 'Con reto' },
  { valor: '195', etiqueta: 'Canjes' },
] as const;
const BENEFICIOS_PILOTO = [
  // 'Gratis durante el piloto para los primeros eventos.',
  'Los asistentes participan desde el navegador, sin instalar nada.',
  'Reporte verificable en Stellar listo para compartir con tus sponsors.',
] as const;

/**
 * Landing de Pasitos (HU-404, inventario P1): qué es, el problema, cómo funciona, por qué el
 * reporte es verificable, preguntas y contacto. Se prerenderiza. Los textos están en
 * `landing/textos.ts`.
 */
@Component({
  selector: 'sit-inicio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-16 sm:gap-20' },
  imports: [BotonDirective, ChipComponent, ContactoFormComponent, IconoComponent],
  template: `
    <section class="grid items-center gap-10 md:grid-cols-[1.15fr_auto]" aria-labelledby="portada">
      <div class="flex flex-col items-start gap-5">
        <px-chip variante="puntos">Sin descargar apps · Reportes en Stellar</px-chip>
        <h1 id="portada" class="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
          {{ t.portada.slogan }}
        </h1>
        <p class="text-points text-xl font-bold sm:text-2xl">{{ t.portada.apoyo }}</p>
        <p class="text-muted max-w-xl text-lg leading-relaxed">{{ t.portada.bajada }}</p>
        <div class="flex w-full flex-wrap gap-3 pt-1 sm:w-auto">
          <a pxBoton class="w-full sm:w-auto" href="/#contacto">{{ t.portada.principal }}</a>
          <a pxBoton="secundario" class="w-full sm:w-auto" href="/eventos">{{
            t.portada.secundario
          }}</a>
        </div>
      </div>

      <div
        class="border-line bg-surface mx-auto flex w-72 flex-col gap-3 rounded-[2.25rem] border-4 p-4 shadow-md"
        aria-hidden="true"
      >
        <div class="bg-surface2 mx-auto h-1.5 w-14 rounded-full"></div>
        <div class="flex items-center justify-between px-1">
          <span class="text-xs font-extrabold">Pasitos</span>
          <px-chip variante="ok">En curso</px-chip>
        </div>
        <div class="border-points bg-pts-bg/35 flex flex-col gap-1.5 rounded-2xl border p-3.5">
          <div class="text-muted flex items-center justify-between text-xs">
            <span class="font-semibold">Tu saldo</span>
            <span>Vence al cierre</span>
          </div>
          <p class="text-points text-3xl font-extrabold tabular-nums">120 pasos</p>
          <div class="bg-track mt-1 h-1.5 overflow-hidden rounded-full">
            <div class="bg-points-fill h-full w-2/3 rounded-full"></div>
          </div>
          <p class="text-muted text-xs">2 de 3 retos completados</p>
        </div>
        @for (r of retosMock; track r.titulo) {
          <div
            class="border-line flex items-center justify-between rounded-xl border p-3 text-sm font-bold"
          >
            <span class="flex items-center gap-2.5">
              <span
                class="flex h-7 w-7 items-center justify-center rounded-lg"
                [class]="r.ok ? 'bg-ok-bg text-ok-fg' : 'bg-pts-bg text-pts-fg'"
              >
                <px-icono [nombre]="r.icono" [tamano]="16" />
              </span>
              {{ r.titulo }}
            </span>
            <span [class]="r.ok ? 'text-success' : 'text-points'">{{ r.puntos }}</span>
          </div>
        }
        <div
          class="border-line bg-surface2 mt-1 grid grid-cols-3 items-center gap-1 rounded-xl border p-1.5 text-center text-xs font-semibold"
        >
          <span class="text-points py-1">Inicio</span>
          <span class="bg-points-fill text-on-points rounded-lg py-1.5 font-bold">Escanear</span>
          <span class="text-muted py-1">Canjear</span>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-5" aria-labelledby="problema">
      <h2 id="problema" class="text-2xl font-extrabold sm:text-3xl">{{ t.problema.titulo }}</h2>
      <ul class="grid gap-4 sm:grid-cols-3">
        @for (item of t.problema.items; track item; let i = $index) {
          <li class="border-line bg-surface flex items-start gap-3.5 rounded-2xl border p-5">
            <span
              class="bg-warn-bg text-warn-fg flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            >
              <px-icono [nombre]="iconosProblema[i] ?? 'info'" [tamano]="22" />
            </span>
            <span class="pt-1 font-semibold">{{ item }}</span>
          </li>
        }
      </ul>
    </section>

    <section
      id="como-funciona"
      class="flex scroll-mt-14 flex-col gap-6"
      aria-labelledby="titulo-como"
    >
      <h2 id="titulo-como" class="text-2xl font-extrabold sm:text-3xl">
        {{ t.comoFunciona.titulo }}
      </h2>
      <ol class="grid gap-4 sm:grid-cols-3">
        @for (paso of t.comoFunciona.pasos; track paso.titulo; let i = $index) {
          <li class="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-5">
            <div class="flex items-center justify-between">
              <span
                class="bg-points-fill text-on-points flex h-8 w-8 items-center justify-center rounded-lg text-sm font-extrabold"
              >
                {{ i + 1 }}
              </span>
              <span
                class="bg-pts-bg text-pts-fg flex h-9 w-9 items-center justify-center rounded-xl"
              >
                <px-icono [nombre]="iconosPasos[i] ?? 'info'" [tamano]="20" />
              </span>
            </div>
            <b class="text-lg">{{ paso.titulo }}</b>
            <p class="text-muted text-sm leading-relaxed">{{ paso.texto }}</p>
          </li>
        }
      </ol>
      <div class="grid gap-4 md:grid-cols-3">
        @for (rol of t.comoFunciona.roles; track rol.para) {
          <article
            class="border-line bg-surface2/70 flex flex-col items-start gap-2.5 rounded-2xl border p-5"
          >
            <px-chip variante="puntos">{{ rol.para }}</px-chip>
            <h3 class="text-xl font-bold">{{ rol.titulo }}</h3>
            <p class="text-muted text-sm leading-relaxed">{{ rol.texto }}</p>
          </article>
        }
      </div>
    </section>

    <section
      class="border-points bg-surface grid items-center gap-6 rounded-2xl border-2 p-6 sm:p-8 md:grid-cols-[1.15fr_1fr]"
      aria-labelledby="verificable"
    >
      <div class="flex flex-col items-start gap-3">
        <px-chip variante="ok">Auditoría pública en Stellar</px-chip>
        <h2 id="verificable" class="text-2xl font-extrabold sm:text-3xl">
          {{ t.verificable.titulo }}
        </h2>
        <p class="text-lg leading-relaxed">{{ t.verificable.texto }}</p>
        <p class="text-muted text-sm">{{ t.verificable.nota }}</p>
      </div>

      <div
        class="border-line bg-surface2 flex flex-col gap-3 rounded-xl border p-4"
        aria-hidden="true"
      >
        <div class="flex items-center justify-between text-sm">
          <b>Vista previa del reporte</b>
          <px-chip variante="ok">Sellado</px-chip>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center">
          @for (k of kpisMock; track k.etiqueta) {
            <div class="border-line bg-surface rounded-lg border p-2.5">
              <p class="text-xl font-extrabold tabular-nums">{{ k.valor }}</p>
              <p class="text-muted text-xs">{{ k.etiqueta }}</p>
            </div>
          }
        </div>
        <div class="flex flex-col gap-1 text-xs">
          <div class="flex justify-between font-semibold">
            <span>Stand principal del sponsor</span>
            <span class="tabular-nums">142 visitas</span>
          </div>
          <div class="bg-track h-2 overflow-hidden rounded-full">
            <div class="bg-points-fill h-full w-4/5 rounded-full"></div>
          </div>
        </div>
        <code class="px-codigo bg-code-bg text-muted block rounded-lg p-2 text-xs break-all">
          stellar.expert · huella 7f8c9a…4e2b1d · 6 lotes anclados
        </code>
      </div>
    </section>

    <section
      id="preguntas"
      class="flex scroll-mt-14 flex-col gap-3"
      aria-labelledby="titulo-preguntas"
    >
      <h2 id="titulo-preguntas" class="text-2xl font-extrabold sm:text-3xl">
        {{ t.preguntas.titulo }}
      </h2>
      @for (item of t.preguntas.items; track item.pregunta) {
        <details
          class="border-line bg-surface open:border-points group rounded-xl border p-4 transition-colors"
        >
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-3 font-bold"
          >
            <span>{{ item.pregunta }}</span>
            <span
              class="text-points text-lg font-extrabold transition-transform group-open:rotate-45"
              >+</span
            >
          </summary>
          <p class="text-muted mt-2.5 leading-relaxed">{{ item.respuesta }}</p>
        </details>
      }
      <p class="text-muted pt-1 text-sm">
        Más detalle en los <a href="/terminos" class="text-text underline">términos</a> y la
        <a href="/privacidad" class="text-text underline">política de privacidad</a>.
      </p>
    </section>

    <section
      id="contacto"
      class="border-line bg-surface2/70 grid scroll-mt-14 gap-8 rounded-2xl border p-6 sm:p-8 md:grid-cols-[1fr_1.25fr]"
      aria-labelledby="titulo-contacto"
    >
      <div class="flex flex-col items-start gap-4">
        <h2 id="titulo-contacto" class="text-2xl font-extrabold sm:text-3xl">
          {{ t.contacto.titulo }}
        </h2>
        <p class="text-muted text-lg leading-relaxed">{{ t.contacto.bajada }}</p>
        <ul class="flex flex-col gap-2.5 pt-1 text-sm">
          @for (b of beneficios; track b) {
            <li class="flex items-center gap-2.5">
              <span
                class="bg-ok-bg text-ok-fg flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              >
                <px-icono nombre="check" [tamano]="14" />
              </span>
              <span>{{ b }}</span>
            </li>
          }
        </ul>
        @if (correo) {
          <p class="text-muted pt-2 text-sm">
            También puedes escribirnos a
            <a class="text-text font-semibold underline" [attr.href]="'mailto:' + correo">{{
              correo
            }}</a>.
          </p>
        }
      </div>

      <div class="border-line bg-surface rounded-2xl border p-5 shadow-xs sm:p-6">
        <!-- HU-410: el formulario de contacto. -->
        <sit-contacto-form />
      </div>
    </section>
  `,
})
export class InicioPage {
  protected readonly t = TEXTOS_LANDING;
  protected readonly iconosProblema = ICONOS_PROBLEMA;
  protected readonly iconosPasos = ICONOS_PASOS;
  protected readonly retosMock = RETOS_MOCK;
  protected readonly kpisMock = KPIS_MOCK;
  protected readonly beneficios = BENEFICIOS_PILOTO;
  /** El correo de contacto, si ya se publicó (`CONFIG_LEGAL`), además del formulario. */
  protected readonly correo = CONFIG_LEGAL.correoContacto.trim();
}
