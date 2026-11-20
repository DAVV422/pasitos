import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvisosService, getMensajeError, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  IconoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { usePermisosConsola } from './consola.layout';
import { TEXTO_ESTADO_CONTACTO, textoAsistentes, textoTipoEvento } from './contactos.page';
import { PlataformaApi, type ContactoDetalle, type ContactoFila } from './plataforma-api.service';

/**
 * Un mensaje de contacto (HU-410 §5): los datos, el correo para responder, el estado y la nota
 * interna. Abrirlo queda en la bitácora: tiene datos personales.
 */
@Component({
  selector: 'plt-contacto-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    IconoComponent,
    TarjetaComponent,
  ],
  template: `
    <a routerLink="/contactos" class="text-muted inline-flex items-center gap-1 font-semibold">
      <px-icono nombre="back" [tamano]="18" />Contactos
    </a>
    @if (error(); as e) {
      <px-aviso variante="peligro">{{ e }}</px-aviso>
    }
    @if (contacto(); as c) {
      <h1 class="font-display text-3xl font-extrabold">{{ c.organizacion ?? c.nombre }}</h1>
      <p class="text-muted flex items-center gap-2">
        {{ c.createdAt | date: 'dd/MM/yyyy HH:mm' }}
        <px-chip [variante]="c.estado === 'nuevo' ? 'puntos' : 'atenuado'">{{
          textoEstado[c.estado]
        }}</px-chip>
      </p>
      <px-tarjeta>
        <dl class="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt class="text-muted">Nombre</dt>
          <dd>{{ c.nombre }}</dd>
          <dt class="text-muted">Correo</dt>
          <dd>
            <a class="underline" [href]="'mailto:' + c.email">{{ c.email }}</a>
          </dd>
          <dt class="text-muted">Organización</dt>
          <dd>{{ c.organizacion ?? '—' }}</dd>
          <dt class="text-muted">Tipo de evento</dt>
          <dd>{{ textoTipoEvento(c.tipoEvento) }}</dd>
          <dt class="text-muted">Asistentes</dt>
          <dd>{{ textoAsistentes(c.asistentesAprox) }}</dd>
        </dl>
        <p class="mt-4 whitespace-pre-line" data-testid="mensaje">{{ c.mensaje }}</p>
        <p class="text-muted mt-3 text-sm">Se borra el {{ c.borrarAt | date: 'dd/MM/yyyy' }}.</p>
      </px-tarjeta>
      @if (permisos.puedeEscribir()) {
        <px-tarjeta>
          <px-campo etiqueta="Nota interna" ayuda="Solo la ve el equipo de Pasitos." #cn="pxCampo">
            <textarea
              [id]="cn.idControl"
              [attr.aria-describedby]="cn.idDescripcion"
              rows="3"
              maxlength="2000"
              [value]="nota()"
              (input)="nota.set(valorDe($event))"
            ></textarea>
          </px-campo>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" pxBoton [cargando]="guardando()" (click)="save('respondido')">
              Marcar respondido
            </button>
            <button type="button" pxBoton="secundario" (click)="save('descartado')">
              Descartar
            </button>
            <button type="button" pxBoton="fantasma" (click)="save(null)">Guardar la nota</button>
          </div>
        </px-tarjeta>
      }
    } @else if (!error()) {
      <px-estado tipo="cargando" />
    }
  `,
})
export class ContactoPage implements OnInit {
  private readonly api = inject(PlataformaApi);
  private readonly avisos = inject(AvisosService);
  protected readonly permisos = usePermisosConsola();
  readonly id = input.required<string>();

  protected readonly valorDe = valorDe;
  protected readonly textoEstado = TEXTO_ESTADO_CONTACTO;
  protected readonly textoTipoEvento = textoTipoEvento;
  protected readonly textoAsistentes = textoAsistentes;
  protected readonly contacto = signal<ContactoDetalle | null>(null);
  protected readonly nota = signal('');
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const contacto = await this.api.getContacto(this.id());
      this.contacto.set(contacto);
      this.nota.set(contacto.notaInterna ?? '');
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  protected async save(estado: ContactoFila['estado'] | null): Promise<void> {
    const actual = this.contacto();
    if (!actual) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const nota = this.nota().trim();
      await this.api.updateContacto(actual.id, {
        ...(estado ? { estado } : {}),
        notaInterna: nota || null,
      });
      this.contacto.set({ ...actual, ...(estado ? { estado } : {}), notaInterna: nota || null });
      this.avisos.ok(
        estado ? `Marcado como ${TEXTO_ESTADO_CONTACTO[estado].toLowerCase()}.` : 'Nota guardada.',
      );
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }
}
