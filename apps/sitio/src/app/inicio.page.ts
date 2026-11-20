import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CONFIG_LEGAL } from '@pasitos/dominio/legal';
import { BotonDirective, IconoComponent, type NombreIcono } from '@pasitos/ui';
import { ContactoFormComponent } from './landing/contacto-form.component';
import { TEXTOS_LANDING } from './landing/textos';

const ICONOS_PROBLEMA: readonly NombreIcono[] = ['clock', 'gift', 'image'];
const ICONOS_PASOS: readonly NombreIcono[] = ['scan', 'puntos', 'check'];

/**
 * Landing de Pasitos (HU-404, inventario P1): qué es, el problema, cómo funciona, por qué el
 * reporte es verificable, preguntas y contacto. Se prerenderiza. Los textos están en
 * `landing/textos.ts`.
 */
@Component({
  selector: 'sit-inicio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-16' },
  imports: [BotonDirective, ContactoFormComponent, IconoComponent],
  template: `
    <section class="grid items-center gap-8 md:grid-cols-[1fr_auto]" aria-labelledby="portada">
      <div class="flex flex-col gap-5">
        <h1 id="portada" class="text-5xl font-extrabold tracking-tight">{{ t.portada.slogan }}</h1>
        <p class="text-points text-2xl font-bold">{{ t.portada.apoyo }}</p>
        <p class="text-muted text-lg">{{ t.portada.bajada }}</p>
        <div class="flex flex-wrap gap-3">
          <a pxBoton href="/#contacto">{{ t.portada.principal }}</a>
          <a pxBoton="secundario" href="/eventos">{{ t.portada.secundario }}</a>
        </div>
      </div>
      <div
        class="border-line bg-surface mx-auto flex w-60 flex-col gap-3 rounded-[2rem] border-4 p-4 shadow-sm"
        aria-hidden="true"
      >
        <p class="text-muted text-xs">Inicio</p>
        <div class="bg-surface2 rounded-xl p-3">
          <p class="text-muted text-xs">Tu saldo</p>
          <p class="text-points text-3xl font-extrabold">120 pasos</p>
        </div>
        <div class="border-line flex items-center justify-between rounded-xl border p-3">
          <span class="text-sm font-bold">Charla de apertura</span>
          <span class="text-success text-sm font-bold">+20</span>
        </div>
        <div class="border-line flex items-center justify-between rounded-xl border p-3">
          <span class="text-sm font-bold">Stand del sponsor</span>
          <span class="text-success text-sm font-bold">+15</span>
        </div>
        <div class="bg-points-fill text-on-points rounded-xl p-3 text-center text-sm font-bold">
          Canjear
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-4" aria-labelledby="problema">
      <h2 id="problema" class="text-3xl font-extrabold">{{ t.problema.titulo }}</h2>
      <ul class="grid gap-3 sm:grid-cols-3">
        @for (item of t.problema.items; track item; let i = $index) {
          <li class="border-line bg-surface flex items-center gap-3 rounded-xl border p-4">
            <px-icono [nombre]="iconosProblema[i] ?? 'info'" [tamano]="24" />
            <span class="font-semibold">{{ item }}</span>
          </li>
        }
      </ul>
    </section>

    <section
      id="como-funciona"
      class="flex scroll-mt-4 flex-col gap-6"
      aria-labelledby="titulo-como"
    >
      <h2 id="titulo-como" class="text-3xl font-extrabold">{{ t.comoFunciona.titulo }}</h2>
      <ol class="grid gap-4 sm:grid-cols-3">
        @for (paso of t.comoFunciona.pasos; track paso.titulo; let i = $index) {
          <li class="flex flex-col gap-2">
            <span class="text-points flex items-center gap-2 text-lg font-extrabold">
              <px-icono [nombre]="iconosPasos[i] ?? 'info'" [tamano]="22" />{{ i + 1 }}.
              {{ paso.titulo }}
            </span>
            <p class="text-muted">{{ paso.texto }}</p>
          </li>
        }
      </ol>
      <div class="grid gap-4 md:grid-cols-3">
        @for (rol of t.comoFunciona.roles; track rol.para) {
          <article class="border-line bg-surface flex flex-col gap-2 rounded-xl border p-5">
            <p class="text-muted text-sm font-bold uppercase">{{ rol.para }}</p>
            <h3 class="text-xl font-bold">{{ rol.titulo }}</h3>
            <p class="text-muted">{{ rol.texto }}</p>
          </article>
        }
      </div>
    </section>

    <section class="bg-surface2 flex flex-col gap-3 rounded-2xl p-6" aria-labelledby="verificable">
      <h2 id="verificable" class="text-3xl font-extrabold">{{ t.verificable.titulo }}</h2>
      <p class="text-lg">{{ t.verificable.texto }}</p>
      <p class="text-muted text-sm">{{ t.verificable.nota }}</p>
    </section>

    <section
      id="preguntas"
      class="flex scroll-mt-4 flex-col gap-3"
      aria-labelledby="titulo-preguntas"
    >
      <h2 id="titulo-preguntas" class="text-3xl font-extrabold">{{ t.preguntas.titulo }}</h2>
      @for (item of t.preguntas.items; track item.pregunta) {
        <details class="border-line bg-surface rounded-xl border p-4">
          <summary class="cursor-pointer font-bold">{{ item.pregunta }}</summary>
          <p class="text-muted mt-2">{{ item.respuesta }}</p>
        </details>
      }
      <p class="text-sm">
        Más detalle en los <a href="/terminos" class="underline">términos</a> y la
        <a href="/privacidad" class="underline">política de privacidad</a>.
      </p>
    </section>

    <section
      id="contacto"
      class="border-points flex scroll-mt-4 flex-col gap-3 rounded-2xl border-2 p-6"
      aria-labelledby="titulo-contacto"
    >
      <h2 id="titulo-contacto" class="text-3xl font-extrabold">{{ t.contacto.titulo }}</h2>
      <p class="text-lg">{{ t.contacto.bajada }}</p>
      <!-- HU-410: el formulario de contacto. -->
      <sit-contacto-form />
      @if (correo) {
        <p class="text-muted text-sm">
          También puedes escribirnos a
          <a class="underline" [attr.href]="'mailto:' + correo">{{ correo }}</a>.
        </p>
      }
    </section>
  `,
})
export class InicioPage {
  protected readonly t = TEXTOS_LANDING;
  protected readonly iconosProblema = ICONOS_PROBLEMA;
  protected readonly iconosPasos = ICONOS_PASOS;
  /** El correo de contacto, si ya se publicó (`CONFIG_LEGAL`), además del formulario. */
  protected readonly correo = CONFIG_LEGAL.correoContacto.trim();
}
