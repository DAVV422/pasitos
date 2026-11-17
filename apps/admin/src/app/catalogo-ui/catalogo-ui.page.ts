import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AvisosComponent,
  AvisosService,
  EncabezadoPaginaComponent,
  FiltrosComponent,
  MenuAccionesComponent,
  PanelLateralComponent,
  PestanasComponent,
  SeccionComponent,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  CuentaRegresivaComponent,
  EncabezadoComponent,
  EstadoComponent,
  FilaDatoComponent,
  IconoComponent,
  OpcionComponent,
  QrComponent,
  TarjetaComponent,
} from '@pasitos/ui';

/**
 * Catálogo del design system (T-004 §6). Solo en desarrollo: `/admin/_ui`.
 * Muestra cada componente con sus variantes y permite cambiar de tema.
 */
@Component({
  selector: 'adm-catalogo-ui',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    CuentaRegresivaComponent,
    EncabezadoComponent,
    EstadoComponent,
    FilaDatoComponent,
    IconoComponent,
    OpcionComponent,
    QrComponent,
    TarjetaComponent,
    AvisosComponent,
    EncabezadoPaginaComponent,
    FiltrosComponent,
    MenuAccionesComponent,
    PanelLateralComponent,
    PestanasComponent,
    SeccionComponent,
  ],
  template: `
    <section class="flex flex-col gap-6 pb-16">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-2xl font-extrabold">Catálogo del design system</h2>
        <button pxBoton="secundario" [chico]="true" type="button" (click)="cambiarTema()">
          Tema {{ tema() === 'claro' ? 'oscuro' : 'claro' }}
        </button>
      </div>

      <h3 class="text-lg font-bold">Encabezado</h3>
      <div class="rounded-grande border border-line">
        <px-encabezado tipoEvento="demo" />
        <px-encabezado volverA="Puerta" />
      </div>

      <h3 class="text-lg font-bold">Botones</h3>
      <div class="flex flex-col gap-3">
        <button pxBoton type="button"><px-icono nombre="scan" />Escanear entrada</button>
        <button pxBoton="secundario" type="button">
          <px-icono nombre="plus" />Registrar a alguien nuevo
        </button>
        <button pxBoton="peligro" type="button">Cerrar el evento</button>
        <button pxBoton type="button" [cargando]="true">Confirmando…</button>
        <button pxBoton type="button" disabled>Deshabilitado</button>
        <div class="flex flex-wrap gap-2">
          <button pxBoton [chico]="true" type="button">Chico</button>
          <button pxBoton="secundario" [chico]="true" type="button">Chico secundario</button>
          <button pxBoton="fantasma" [chico]="true" type="button">Fantasma</button>
          <button pxBoton="peligro-contorno" [chico]="true" type="button">Quitar</button>
        </div>
        <button pxBoton [bloque]="true" type="button">De punta a punta</button>
      </div>

      <h3 class="text-lg font-bold">Chips</h3>
      <div class="flex flex-wrap gap-2">
        <px-chip variante="testnet">Testnet</px-chip>
        <px-chip variante="puntos">+20 pts</px-chip>
        <px-chip variante="ok">Presente</px-chip>
        <px-chip variante="atenuado">Invitada</px-chip>
        <px-chip variante="peligro">No fui yo</px-chip>
      </div>

      <h3 class="text-lg font-bold">Avisos</h3>
      <px-aviso variante="info">Cada movimiento queda registrado en Stellar.</px-aviso>
      <px-aviso variante="advertencia"
        >¿Es <b>Valeria Quispe · A-0231</b>, que ya está en la lista?</px-aviso
      >
      <px-aviso variante="ok">Canje confirmado.</px-aviso>
      <px-aviso variante="peligro">
        <b>No fui yo</b> · Valeria Quispe · A-0231
        <button pxAvisoAccion pxBoton="peligro" [chico]="true" type="button">Atender</button>
      </px-aviso>

      <h3 class="text-lg font-bold">Tarjeta y filas de datos</h3>
      <px-tarjeta>
        <px-fila-dato etiqueta="Dispositivo">Samsung A14 · Chrome</px-fila-dato>
        <px-fila-dato etiqueta="Hora">10:51</px-fila-dato>
        <px-fila-dato etiqueta="Código"><span class="px-codigo">A-0412</span></px-fila-dato>
      </px-tarjeta>

      <h3 class="text-lg font-bold">Campos</h3>
      <px-campo etiqueta="Nombre y apellido" #nombre="pxCampo">
        <input
          [id]="nombre.idControl"
          [attr.aria-describedby]="nombre.idDescripcion"
          value="Valeria Quispe"
        />
      </px-campo>
      <px-campo
        etiqueta="Correo"
        [opcional]="true"
        ayuda="Para enviarle su código"
        #correo="pxCampo"
      >
        <input
          type="email"
          [id]="correo.idControl"
          [attr.aria-describedby]="correo.idDescripcion"
        />
      </px-campo>
      <px-campo etiqueta="Correo" error="El correo no tiene un formato válido." #malo="pxCampo">
        <input
          type="email"
          [id]="malo.idControl"
          [attr.aria-describedby]="malo.idDescripcion"
          value="valeria@"
        />
      </px-campo>

      <h3 class="text-lg font-bold">Opciones</h3>
      <div class="flex flex-col gap-3">
        <px-opcion
          grupo="no-fui-yo"
          valor="intento"
          titulo="Un intento desde otro dispositivo"
          detalle="21/11 · 09:15 · iPhone"
          [(seleccionado)]="opcion"
        />
        <px-opcion
          grupo="no-fui-yo"
          valor="cambio"
          titulo="Un cambio de celular"
          detalle="Una vinculación que no hiciste"
          [(seleccionado)]="opcion"
        />
      </div>

      <h3 class="text-lg font-bold">QR y cuenta regresiva</h3>
      <div class="flex flex-col items-center gap-3">
        <px-qr texto="https://pasitos.app/v/K7Q2-M9XD" descripcion="QR de asistente de ejemplo" />
        <px-cuenta-regresiva [hasta]="vence" />
      </div>

      <h3 class="text-lg font-bold">Estados</h3>
      <px-estado tipo="cargando" />
      <px-estado tipo="vacio" titulo="Todavía no completaste retos"
        >Escanea el QR de una charla.</px-estado
      >
      <px-estado tipo="error" titulo="Algo salió mal" traceId="01a1d7c0-8672-75a4"
        >Intenta de nuevo.</px-estado
      >

      <h2 class="text-2xl font-extrabold">Patrones de página del panel</h2>
      <pnl-encabezado-pagina
        titulo="Invitados"
        descripcion="Quién viene al evento y su invitación."
      >
        <button type="button" pxBoton (click)="panelAbierto.set(true)">Agregar invitado</button>
        <pnl-menu-acciones texto="Más">
          <button type="button" (click)="avisos.ok('Importamos 12 invitados.')">
            Importar CSV
          </button>
          <button type="button" (click)="avisos.ok('Descargamos la lista.')">Exportar</button>
          <hr />
          <button type="button" class="pnl-acciones__peligro">Borrar todo</button>
        </pnl-menu-acciones>
      </pnl-encabezado-pagina>

      <pnl-filtros [activos]="1">
        <input pnlBuscador type="search" aria-label="Buscar" placeholder="Buscar por nombre" />
        <select aria-label="Invitación">
          <option>Todas las invitaciones</option>
          <option>Pendientes</option>
        </select>
      </pnl-filtros>

      <table class="pnl-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Código</th>
            <th>Invitación</th>
            <th><span class="px-sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (fila of filas; track fila.codigo) {
            <tr>
              <td>{{ fila.nombre }}</td>
              <td data-etiqueta="Código">{{ fila.codigo }}</td>
              <td data-etiqueta="Invitación">{{ fila.invitacion }}</td>
              <td class="pnl-tabla__acciones">
                <pnl-menu-acciones [etiqueta]="'Acciones de ' + fila.nombre">
                  <button type="button">Editar</button>
                  <button type="button">Reenviar invitación</button>
                  <button type="button" class="pnl-acciones__peligro">Quitar</button>
                </pnl-menu-acciones>
              </td>
            </tr>
          }
        </tbody>
      </table>

      <pnl-pestanas etiqueta="Ejemplo de pestañas" [pestanas]="pestanas" [(activa)]="pestana">
        <px-tarjeta>Contenido de la pestaña «{{ pestana() }}».</px-tarjeta>
      </pnl-pestanas>

      <pnl-panel-lateral
        titulo="Nuevo invitado"
        [abierto]="panelAbierto()"
        (guardar)="panelAbierto.set(false); avisos.ok('Guardado.')"
        (cerrado)="panelAbierto.set(false)"
      >
        <pnl-seccion titulo="Básico">
          <px-campo etiqueta="Nombre" #n="pxCampo">
            <input [id]="n.idControl" [attr.aria-describedby]="n.idDescripcion" />
          </px-campo>
        </pnl-seccion>
        <pnl-seccion titulo="Avanzado" [plegable]="true">
          <px-campo etiqueta="Código externo" [opcional]="true" #c="pxCampo">
            <input [id]="c.idControl" [attr.aria-describedby]="c.idDescripcion" />
          </px-campo>
        </pnl-seccion>
      </pnl-panel-lateral>
      <!-- Fuera de pnl-layout: los avisos flotantes van aquí. -->
      <pnl-avisos />
    </section>
  `,
})
export class CatalogoUiPage {
  protected readonly tema = signal<'claro' | 'oscuro'>('claro');
  protected readonly opcion = signal<string | null>('intento');
  protected readonly vence = new Date(Date.now() + 102_000);
  protected readonly avisos = inject(AvisosService);
  protected readonly panelAbierto = signal(false);
  protected readonly pestanas = [
    { clave: 'datos', texto: 'Datos' },
    { clave: 'imagenes', texto: 'Imágenes' },
    { clave: 'ubicacion', texto: 'Ubicación' },
    { clave: 'visibilidad', texto: 'Visibilidad' },
    { clave: 'reglas', texto: 'Reglas y puerta' },
  ];
  protected readonly pestana = signal('datos');
  protected readonly filas = [
    { nombre: 'Valeria Quispe', codigo: 'A-0001', invitacion: 'Enviada' },
    { nombre: 'Luis Mamani', codigo: 'A-0002', invitacion: 'Pendiente' },
  ];

  protected cambiarTema(): void {
    const siguiente = this.tema() === 'claro' ? 'oscuro' : 'claro';
    this.tema.set(siguiente);
    document.documentElement.dataset['tema'] = siguiente;
  }
}
