import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  makeStateKey,
  TransferState,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import type { DocumentoLegal, TipoDocumentoLegal } from '@pasitos/dominio/legal';
import { FUENTE_LEGAL } from './fuente-legal';

/**
 * *Términos y condiciones* y *Política de privacidad* (HU-407): el texto aprobado, con su versión y
 * fecha. Se prerenderiza: la página no necesita JavaScript propio. Los correos y la fecha salen de
 * `CONFIG_LEGAL` (`libs/dominio/src/legal/config.ts`).
 */
@Component({
  selector: 'sit-documento-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El texto llega como HTML: los estilos tienen que alcanzar a sus elementos.
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (documento(); as d) {
      <article class="sit-legal" [attr.aria-labelledby]="'titulo-' + d.tipo">
        <h1 [id]="'titulo-' + d.tipo" class="text-4xl font-extrabold tracking-tight">
          {{ d.titulo }}
        </h1>
        <p class="text-muted" data-testid="version">
          Versión {{ d.version }} · vigente desde el {{ d.vigenteDesde }}
        </p>
        <div class="sit-legal__texto" [innerHTML]="html()"></div>
      </article>
    } @else {
      <p>No pudimos mostrar este documento. <a href="" class="underline">Recarga la página</a>.</p>
    }
  `,
  styles: `
    .sit-legal {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-width: 44rem;
    }
    .sit-legal__texto {
      line-height: 1.65;
    }
    .sit-legal__texto h2 {
      margin: 2rem 0 0.5rem;
      font-size: 1.5rem;
      font-weight: 800;
      scroll-margin-top: 1rem;
    }
    .sit-legal__texto h3 {
      margin: 1.5rem 0 0.25rem;
      font-size: 1.15rem;
      font-weight: 700;
      scroll-margin-top: 1rem;
    }
    .sit-legal__texto p,
    .sit-legal__texto ul,
    .sit-legal__texto ol,
    .sit-legal__texto table {
      margin: 0.5rem 0;
    }
    .sit-legal__texto ul {
      padding-left: 1.25rem;
      list-style: disc;
    }
    .sit-legal__texto ol {
      padding-left: 1.25rem;
      list-style: decimal;
    }
    .sit-legal__texto li {
      margin: 0.25rem 0;
    }
    .sit-legal__texto a {
      color: var(--focus);
      text-decoration: underline;
    }
    .sit-legal__texto table {
      display: block;
      overflow-x: auto;
      border-collapse: collapse;
    }
    .sit-legal__texto th,
    .sit-legal__texto td {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    .sit-legal__texto th {
      background: var(--surface2);
    }
    .sit-legal__texto code {
      padding: 0 0.25rem;
      border-radius: 0.25rem;
      background: var(--code-bg);
    }
    @media print {
      .sit-legal__texto a {
        color: inherit;
      }
    }
  `,
})
export class DocumentoLegalPage {
  /** Viene de la ruta (`data.tipo`). */
  private readonly tipo = inject(ActivatedRoute).snapshot.data['tipo'] as TipoDocumentoLegal;
  private readonly fuente = inject(FUENTE_LEGAL);
  private readonly estado = inject(TransferState);
  /**
   * En el prerender sale de `FUENTE_LEGAL` y se guarda en el estado transferido; en el navegador se
   * lee de ahí. Las páginas del sitio se abren con enlaces normales (carga completa), así que el
   * estado siempre está.
   */
  protected readonly documento = computed<DocumentoLegal | null>(() => {
    const clave = makeStateKey<DocumentoLegal>(`legal-${this.tipo}`);
    const fuente = this.fuente;
    if (fuente) {
      const documento = fuente(this.tipo);
      this.estado.set(clave, documento);
      return documento;
    }
    return this.estado.get(clave, null);
  });
  private readonly sanitizer = inject(DomSanitizer);
  /**
   * Confiable: sale en el build de los documentos aprobados (tools/legal.mjs) y los valores de
   * `CONFIG_LEGAL` van escapados. Sin esto, Angular borra los `id` de los títulos y los enlaces a
   * cada sección (por ejemplo `/privacidad#3-datos-técnicos-de-tu-dispositivo`) no llegan.
   */
  protected readonly html = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.documento()?.html ?? ''),
  );
}
