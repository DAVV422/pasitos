import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import {
  esquemaEditarEvento,
  NOMBRES_SECCION,
  SECCIONES_PUBLICAS,
  type SeccionPublica,
} from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getErrorCampo,
  getMensajeError,
  PestanasComponent,
  SubidaImagenComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  TarjetaComponent,
  FechaHoraDirective,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { EventosApi, type EventoDetalle } from './eventos-api.service';
import { ReglasPuertaComponent } from './reglas-puerta.component';

type Pestana = 'datos' | 'imagenes' | 'ubicacion' | 'visibilidad' | 'reglas';

const VISIBILIDADES = [
  {
    valor: 'privado',
    titulo: 'Privado',
    detalle: 'Solo los invitados con su enlace ven el evento. No hay página pública.',
  },
  {
    valor: 'solo_enlace',
    titulo: 'Solo con enlace',
    detalle: 'Quien tenga el enlace ve las secciones públicas. No aparece en buscadores.',
  },
  {
    valor: 'publico',
    titulo: 'Público',
    detalle: 'Cualquiera ve las secciones públicas y puede llegar desde buscadores.',
  },
] as const;

/** Bolivia (UTC−4): de ISO a `datetime-local` y de vuelta. */
function toLocal(iso: string | null): string {
  if (!iso) return '';
  const fecha = new Date(new Date(iso).getTime() - 4 * 3_600_000);
  return fecha.toISOString().slice(0, 16);
}
function toIso(local: string): string {
  return local ? new Date(`${local}:00-04:00`).toISOString() : '';
}

/** Configuración del evento (O3, HU-206 §1 y §4): datos, imágenes, ubicación y visibilidad. */
@Component({
  selector: 'adm-configuracion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    FechaHoraDirective,
    CampoComponent,
    TarjetaComponent,
    SubidaImagenComponent,
    ReglasPuertaComponent,
    EncabezadoPaginaComponent,
    PestanasComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Configuración"
      descripcion="Los datos del evento, cómo se ve y las reglas de la puerta."
    />
    <pnl-pestanas
      etiqueta="Secciones de la configuración"
      [pestanas]="pestanas"
      [(activa)]="pestana"
    >
      @if (mensaje(); as aviso) {
        <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
      }

      @if (evento(); as e) {
        @switch (pestana()) {
          @case ('datos') {
            <px-tarjeta>
              <form class="flex flex-col gap-4" (submit)="saveDatos($event)" novalidate>
                <px-campo etiqueta="Nombre" [error]="errores()['nombre'] ?? null" #c1="pxCampo">
                  <input
                    [id]="c1.idControl"
                    [attr.aria-describedby]="c1.idDescripcion"
                    maxlength="120"
                    [value]="datos().nombre"
                    (input)="setDato('nombre', valorDe($event))"
                  />
                </px-campo>
                <div class="grid gap-4 md:grid-cols-2">
                  <px-campo
                    etiqueta="Empieza"
                    [error]="errores()['inicioAt'] ?? null"
                    #c2="pxCampo"
                  >
                    <input
                      [id]="c2.idControl"
                      [attr.aria-describedby]="c2.idDescripcion"
                      [pxFechaHora]="datos().inicio"
                      (fechaHora)="setDato('inicio', $event)"
                    />
                  </px-campo>
                  <px-campo etiqueta="Termina" [error]="errores()['finAt'] ?? null" #c3="pxCampo">
                    <input
                      [id]="c3.idControl"
                      [attr.aria-describedby]="c3.idDescripcion"
                      [pxFechaHora]="datos().fin"
                      (fechaHora)="setDato('fin', $event)"
                    />
                  </px-campo>
                </div>
                <px-campo
                  etiqueta="Descripción"
                  [opcional]="true"
                  ayuda="Texto simple, hasta 4000 caracteres."
                  [error]="errores()['descripcion'] ?? null"
                  #c4="pxCampo"
                >
                  <textarea
                    [id]="c4.idControl"
                    [attr.aria-describedby]="c4.idDescripcion"
                    rows="6"
                    maxlength="4000"
                    [value]="datos().descripcion"
                    (input)="setDato('descripcion', valorDe($event))"
                  ></textarea>
                </px-campo>
                <px-campo
                  etiqueta="Nombre de los puntos"
                  ayuda="Por ejemplo: puntos, pasos, estrellas."
                  [error]="errores()['nombrePuntos'] ?? null"
                  #c5="pxCampo"
                >
                  <input
                    [id]="c5.idControl"
                    [attr.aria-describedby]="c5.idDescripcion"
                    maxlength="20"
                    [value]="datos().nombrePuntos"
                    (input)="setDato('nombrePuntos', valorDe($event))"
                  />
                </px-campo>
                <px-campo
                  etiqueta="Contacto"
                  [opcional]="true"
                  ayuda="Cómo comunicarse con la organización."
                  #c6="pxCampo"
                >
                  <textarea
                    [id]="c6.idControl"
                    [attr.aria-describedby]="c6.idDescripcion"
                    rows="2"
                    maxlength="500"
                    [value]="datos().contacto"
                    (input)="setDato('contacto', valorDe($event))"
                  ></textarea>
                </px-campo>
                <px-campo
                  etiqueta="Wifi"
                  [opcional]="true"
                  ayuda="Solo para asistentes: nunca es público."
                  #c7="pxCampo"
                >
                  <input
                    [id]="c7.idControl"
                    [attr.aria-describedby]="c7.idDescripcion"
                    maxlength="200"
                    [value]="datos().wifi"
                    (input)="setDato('wifi', valorDe($event))"
                  />
                </px-campo>
                <div class="pnl-pie-fijo">
                  <button type="submit" pxBoton [cargando]="guardando()">Guardar</button>
                </div>
              </form>
            </px-tarjeta>
          }
          @case ('imagenes') {
            <px-tarjeta>
              <div class="flex flex-col gap-6">
                <pnl-subida-imagen
                  [eventoId]="e.id"
                  proposito="logo_evento"
                  etiqueta="Logo"
                  [valor]="e.imagenes.logoArchivoId"
                  (valorChange)="saveImagen('logoArchivoId', $event)"
                />
                <pnl-subida-imagen
                  [eventoId]="e.id"
                  proposito="portada"
                  etiqueta="Portada"
                  [valor]="e.imagenes.portadaArchivoId"
                  (valorChange)="saveImagen('portadaArchivoId', $event)"
                />
                <pnl-subida-imagen
                  [eventoId]="e.id"
                  proposito="plano"
                  etiqueta="Plano del lugar"
                  [valor]="e.imagenes.planoArchivoId"
                  (valorChange)="saveImagen('planoArchivoId', $event)"
                />
                <p class="text-muted text-sm">
                  En el plano, dibuja los números de cada lugar; en <b>Lugares</b> pones a cada uno
                  su número del plano.
                </p>
              </div>
            </px-tarjeta>
          }
          @case ('ubicacion') {
            <px-tarjeta>
              <form class="flex flex-col gap-4" (submit)="saveUbicacion($event)" novalidate>
                <px-campo etiqueta="Nombre del lugar" #u1="pxCampo">
                  <input
                    [id]="u1.idControl"
                    [attr.aria-describedby]="u1.idDescripcion"
                    maxlength="120"
                    [value]="ubicacion().nombre"
                    (input)="setUbicacion('nombre', valorDe($event))"
                  />
                </px-campo>
                <px-campo etiqueta="Dirección" [opcional]="true" #u2="pxCampo">
                  <input
                    [id]="u2.idControl"
                    [attr.aria-describedby]="u2.idDescripcion"
                    maxlength="300"
                    [value]="ubicacion().direccion"
                    (input)="setUbicacion('direccion', valorDe($event))"
                  />
                </px-campo>
                <p class="text-muted text-sm">
                  El punto en el mapa: copia la latitud y la longitud de Google Maps (clic derecho
                  sobre el lugar). Con las llaves de Google, aquí se marcará en el mapa.
                </p>
                <div class="grid gap-4 md:grid-cols-2">
                  <px-campo
                    etiqueta="Latitud"
                    [opcional]="true"
                    [error]="errores()['lat'] ?? null"
                    #u3="pxCampo"
                  >
                    <input
                      [id]="u3.idControl"
                      [attr.aria-describedby]="u3.idDescripcion"
                      inputmode="decimal"
                      placeholder="-16.5000"
                      [value]="ubicacion().lat"
                      (input)="setUbicacion('lat', valorDe($event))"
                    />
                  </px-campo>
                  <px-campo etiqueta="Longitud" [opcional]="true" #u4="pxCampo">
                    <input
                      [id]="u4.idControl"
                      [attr.aria-describedby]="u4.idDescripcion"
                      inputmode="decimal"
                      placeholder="-68.1500"
                      [value]="ubicacion().lng"
                      (input)="setUbicacion('lng', valorDe($event))"
                    />
                  </px-campo>
                </div>
                @if (e.ubicacion.mapaEstaticoArchivoId; as mapa) {
                  <img
                    [src]="'/api/v1/archivos/' + mapa + '/1200'"
                    alt="Mapa del lugar del evento"
                    class="rounded-medio"
                  />
                }
                <div class="pnl-pie-fijo">
                  <button type="submit" pxBoton [cargando]="guardando()">Guardar</button>
                </div>
              </form>
            </px-tarjeta>
          }
          @case ('visibilidad') {
            <px-tarjeta>
              <form class="flex flex-col gap-4" (submit)="saveVisibilidad($event)" novalidate>
                <fieldset class="flex flex-col gap-2">
                  <legend class="mb-1 font-bold">Quién ve el evento</legend>
                  @for (v of visibilidades; track v.valor) {
                    <label class="px-opcion">
                      <input
                        type="radio"
                        name="visibilidad"
                        [checked]="visibilidad() === v.valor"
                        (change)="visibilidad.set(v.valor)"
                      />
                      <span
                        ><span class="px-opcion__titulo">{{ v.titulo }}</span
                        ><span class="px-opcion__detalle">{{ v.detalle }}</span></span
                      >
                    </label>
                  }
                </fieldset>
                @if (visibilidad() !== 'privado' && e.visibilidad === 'privado') {
                  <px-aviso variante="advertencia"
                    >La información de las secciones públicas va a poder verla cualquiera con el
                    enlace.</px-aviso
                  >
                }
                <fieldset class="flex flex-col gap-2">
                  <legend class="mb-1 font-bold">Secciones públicas</legend>
                  @for (seccion of secciones; track seccion) {
                    <label class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        [checked]="seccionesMarcadas().includes(seccion)"
                        (change)="toggleSeccion(seccion)"
                      />
                      {{ nombreSeccion(seccion) }}
                    </label>
                  }
                  <label class="text-muted flex items-center gap-2"
                    ><input type="checkbox" disabled /> Wifi: solo para asistentes</label
                  >
                </fieldset>
                <div class="pnl-pie-fijo">
                  <button type="submit" pxBoton [cargando]="guardando()">Guardar</button>
                </div>
              </form>
            </px-tarjeta>
          }
          @case ('reglas') {
            <adm-reglas-puerta />
          }
        }
      }
    </pnl-pestanas>
  `,
})
export class ConfiguracionPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly actual = inject(EventoActualService);
  private readonly avisos = inject(AvisosService);

  protected readonly pestanas: readonly { clave: Pestana; texto: string }[] = [
    { clave: 'datos', texto: 'Datos' },
    { clave: 'imagenes', texto: 'Imágenes' },
    { clave: 'ubicacion', texto: 'Ubicación' },
    { clave: 'visibilidad', texto: 'Visibilidad' },
    { clave: 'reglas', texto: 'Reglas y puerta' },
  ];
  protected readonly visibilidades = VISIBILIDADES;
  protected readonly secciones = SECCIONES_PUBLICAS;
  protected readonly pestana = signal<string>('datos');
  protected readonly evento = computed(() => this.actual.evento());
  protected readonly datos = signal({
    nombre: '',
    inicio: '',
    fin: '',
    descripcion: '',
    nombrePuntos: '',
    contacto: '',
    wifi: '',
  });
  protected readonly ubicacion = signal({ nombre: '', direccion: '', lat: '', lng: '' });
  protected readonly visibilidad = signal<string>('privado');
  protected readonly seccionesMarcadas = signal<readonly string[]>([]);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{ variante: 'peligro'; texto: string } | null>(null);
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    const e = this.actual.evento();
    if (e) this.fill(e);
  }

  protected nombreSeccion(seccion: SeccionPublica): string {
    return NOMBRES_SECCION[seccion];
  }

  protected setDato(campo: keyof ReturnType<typeof this.datos>, valor: string): void {
    this.datos.set({ ...this.datos(), [campo]: valor });
  }

  protected setUbicacion(campo: keyof ReturnType<typeof this.ubicacion>, valor: string): void {
    this.ubicacion.set({ ...this.ubicacion(), [campo]: valor });
  }

  protected toggleSeccion(seccion: string): void {
    const actuales = this.seccionesMarcadas();
    this.seccionesMarcadas.set(
      actuales.includes(seccion) ? actuales.filter((s) => s !== seccion) : [...actuales, seccion],
    );
  }

  protected async saveDatos(evento: Event): Promise<void> {
    evento.preventDefault();
    const d = this.datos();
    const cambios = {
      nombre: d.nombre.trim(),
      inicioAt: toIso(d.inicio),
      finAt: toIso(d.fin),
      descripcion: d.descripcion,
      nombrePuntos: d.nombrePuntos.trim(),
      contacto: d.contacto,
      wifi: d.wifi,
    };
    const validado = esquemaEditarEvento.safeParse(cambios);
    if (!validado.success) {
      this.errores.set(
        Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
      return;
    }
    await this.save(cambios);
  }

  protected async saveImagen(campo: string, id: string | null): Promise<void> {
    await this.save({ [campo]: id });
  }

  protected async saveVisibilidad(evento: Event): Promise<void> {
    evento.preventDefault();
    await this.save({
      visibilidad: this.visibilidad(),
      seccionesPublicas: this.seccionesMarcadas(),
    });
  }

  protected async saveUbicacion(evento: Event): Promise<void> {
    evento.preventDefault();
    const e = this.actual.evento();
    if (!e) return;
    const u = this.ubicacion();
    const lat = u.lat.trim() ? Number(u.lat.replace(',', '.')) : null;
    const lng = u.lng.trim() ? Number(u.lng.replace(',', '.')) : null;
    await this.run(async () => {
      await this.api.updateUbicacion(e.id, {
        nombre: u.nombre.trim(),
        direccion: u.direccion.trim(),
        lat,
        lng,
      });
      await this.actual.load(e.id);
    });
  }

  private async save(cambios: Record<string, unknown>): Promise<void> {
    const e = this.actual.evento();
    if (!e) return;
    await this.run(async () => {
      const actualizado = await this.api.updateEvento(e.id, cambios);
      this.actual.set(actualizado);
      this.fill(actualizado);
    });
  }

  private async run(paso: () => Promise<void>): Promise<void> {
    this.guardando.set(true);
    this.errores.set({});
    this.mensaje.set(null);
    try {
      await paso();
      this.avisos.ok('Guardado.');
    } catch (error) {
      const campos = ['nombre', 'inicioAt', 'finAt', 'descripcion', 'nombrePuntos', 'slug', 'lat'];
      this.errores.set(Object.fromEntries(campos.map((c) => [c, getErrorCampo(error, c)])));
      const deCampo = error instanceof ErrorApi ? error.errors[0]?.message : undefined;
      this.mensaje.set({ variante: 'peligro', texto: deCampo ?? getMensajeError(error) });
    } finally {
      this.guardando.set(false);
    }
  }

  private fill(e: EventoDetalle): void {
    this.datos.set({
      nombre: e.nombre,
      inicio: toLocal(e.inicioAt),
      fin: toLocal(e.finAt),
      descripcion: e.descripcion ?? '',
      nombrePuntos: e.nombrePuntos,
      contacto: e.contacto ?? '',
      wifi: e.wifi ?? '',
    });
    this.ubicacion.set({
      nombre: e.ubicacion.nombre ?? '',
      direccion: e.ubicacion.direccion ?? '',
      lat: e.ubicacion.lat === null ? '' : String(e.ubicacion.lat),
      lng: e.ubicacion.lng === null ? '' : String(e.ubicacion.lng),
    });
    this.visibilidad.set(e.visibilidad);
    this.seccionesMarcadas.set(e.seccionesPublicas);
  }
}
