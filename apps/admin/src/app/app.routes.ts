import { Route } from '@angular/router';
import { canDoActivate, RUTAS_ACCESO, sesionGuard } from '@pasitos/panel';
import { eventoGuard } from './eventos/evento.layout';

declare const ngDevMode: boolean | undefined;

/**
 * Rutas del panel. El acceso (HU-201) viene de libs/panel. Las pantallas del evento llevan el
 * permiso de su rol: una pantalla que el rol no usa ni se descarga (HU-204 §5). `/_ui` es el
 * catálogo del design system (T-004 §6): solo existe en desarrollo.
 */
export const appRoutes: Route[] = [
  ...RUTAS_ACCESO,
  { path: '', pathMatch: 'full', redirectTo: 'eventos' },
  {
    path: 'eventos',
    canActivate: [sesionGuard],
    title: 'Mis eventos · Pasitos',
    loadComponent: () => import('./eventos/mis-eventos.page').then((m) => m.MisEventosPage),
  },
  {
    path: 'eventos/:id',
    canActivate: [sesionGuard, eventoGuard],
    loadComponent: () => import('./eventos/evento.layout').then((m) => m.EventoLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Resumen · Pasitos',
        loadComponent: () => import('./eventos/resumen.page').then((m) => m.ResumenPage),
      },
      {
        path: 'configuracion',
        canActivate: [canDoActivate('evento.update')],
        title: 'Configuración · Pasitos',
        loadComponent: () =>
          import('./eventos/configuracion.page').then((m) => m.ConfiguracionPage),
      },
      {
        path: 'retos',
        canActivate: [canDoActivate('contenido.read')],
        title: 'Retos · Pasitos',
        loadComponent: () => import('./eventos/retos.page').then((m) => m.RetosPage),
      },
      {
        path: 'catalogo',
        canActivate: [canDoActivate('contenido.read')],
        title: 'Catálogo · Pasitos',
        loadComponent: () => import('./eventos/catalogo.page').then((m) => m.CatalogoPage),
      },
      ...(['pantalla', 'mesa'] as const).map((tipo) => ({
        path: tipo === 'pantalla' ? 'pantallas' : 'mesas',
        canActivate: [canDoActivate('terminales.read')],
        title: `${tipo === 'pantalla' ? 'Pantallas' : 'Mesas'} · Pasitos`,
        data: { tipo },
        loadComponent: () => import('./eventos/terminales.page').then((m) => m.TerminalesPage),
      })),
      ...(['lugares', 'agenda', 'sponsors', 'preguntas'] as const).map((ruta) => ({
        path: ruta,
        canActivate: [canDoActivate('contenido.read')],
        title: 'Contenido · Pasitos',
        data: { recurso: ruta === 'agenda' ? 'actividades' : ruta },
        loadComponent: () => import('./eventos/contenido.page').then((m) => m.ContenidoPage),
      })),
      {
        path: 'alertas',
        canActivate: [canDoActivate('bitacora.read')],
        title: 'Alertas · Pasitos',
        loadComponent: () => import('./eventos/alertas.page').then((m) => m.AlertasPage),
      },
      {
        path: 'ajustes',
        canActivate: [canDoActivate('puntos.ajustar')],
        title: 'Ajustes · Pasitos',
        loadComponent: () => import('./eventos/ajustes.page').then((m) => m.AjustesPage),
      },
      {
        path: 'mis-pantallas',
        canActivate: [canDoActivate('pantallas.control')],
        title: 'Mis pantallas · Pasitos',
        loadComponent: () => import('./eventos/mis-pantallas.page').then((m) => m.MisPantallasPage),
      },
      {
        path: 'puerta',
        canActivate: [canDoActivate('puerta.use')],
        title: 'Puerta · Pasitos',
        loadComponent: () => import('./eventos/puerta.page').then((m) => m.PuertaPage),
      },
      {
        path: 'puerta/activar',
        canActivate: [canDoActivate('puerta.activar')],
        title: 'Activar cuentas · Pasitos',
        loadComponent: () =>
          import('./eventos/activar-cuentas.page').then((m) => m.ActivarCuentasPage),
      },
      {
        // HU-323: D y C, y los responsables de cada reto (el servidor filtra sus retos).
        path: 'fotos/revisar',
        canActivate: [canDoActivate('evento.read')],
        title: 'Fotos por revisar · Pasitos',
        loadComponent: () => import('./eventos/fotos-revisar.page').then((m) => m.FotosRevisarPage),
      },
      {
        path: 'carnets',
        canActivate: [canDoActivate('ci.verify')],
        title: 'Verificar carnet · Pasitos',
        loadComponent: () => import('./eventos/carnets.page').then((m) => m.CarnetsPage),
      },
      {
        path: 'qr-registro',
        canActivate: [canDoActivate('qr_registro.read')],
        title: 'QR de registro · Pasitos',
        loadComponent: () => import('./eventos/qr-registro.page').then((m) => m.QrRegistroPage),
      },
      {
        path: 'puerta/tarjeta/:asistenteId',
        canActivate: [canDoActivate('puerta.use')],
        title: 'Tarjeta de entrada · Pasitos',
        loadComponent: () =>
          import('./eventos/imprimir-tarjeta.page').then((m) => m.ImprimirTarjetaPage),
      },
      {
        path: 'invitados',
        canActivate: [canDoActivate('invitados.update')],
        title: 'Invitados · Pasitos',
        loadComponent: () => import('./eventos/invitados.page').then((m) => m.InvitadosPage),
      },
      {
        path: 'invitados/imprimir',
        canActivate: [canDoActivate('invitados.update')],
        title: 'Tarjetas de invitación · Pasitos',
        loadComponent: () =>
          import('./eventos/imprimir-invitaciones.page').then((m) => m.ImprimirInvitacionesPage),
      },
      {
        path: 'equipo',
        canActivate: [canDoActivate('equipo.read')],
        title: 'Equipo · Pasitos',
        loadComponent: () => import('./eventos/equipo.page').then((m) => m.EquipoPage),
      },
      {
        path: 'bitacora',
        canActivate: [canDoActivate('bitacora.read')],
        title: 'Bitácora · Pasitos',
        loadComponent: () => import('./eventos/bitacora.page').then((m) => m.BitacoraPage),
      },
    ],
  },
  ...(typeof ngDevMode !== 'undefined' && ngDevMode
    ? [
        {
          path: '_ui',
          loadComponent: () =>
            import('./catalogo-ui/catalogo-ui.page').then((modulo) => modulo.CatalogoUiPage),
        },
      ]
    : []),
  { path: '**', redirectTo: 'eventos' },
];
