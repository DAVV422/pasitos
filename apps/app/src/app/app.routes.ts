import { Route } from '@angular/router';
import { RegistroPage } from './acceso/registro.page';
import { sesionGuard } from './sesion-asistente';

/** Rutas de la app del asistente (Aplicaciones web §2.1). */
export const appRoutes: Route[] = [
  {
    path: 'acceso/:tipo/:token',
    loadComponent: () => import('./acceso/acceso.page').then((m) => m.AccesoPage),
  },
  {
    // HU-320: el autorregistro va en el paquete inicial (es lo primero que ve la persona).
    path: 'registro/:tipo/:codigo',
    component: RegistroPage,
  },
  {
    path: '',
    canActivateChild: [sesionGuard],
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./inicio/inicio.page').then((m) => m.InicioPage),
      },
      {
        path: 'retos',
        loadComponent: () => import('./retos/retos.page').then((m) => m.RetosPage),
      },
      {
        path: 'retos/:id',
        loadComponent: () => import('./retos/reto-detalle.page').then((m) => m.RetoDetallePage),
      },
      {
        path: 'agenda',
        loadComponent: () => import('./contenido/agenda.page').then((m) => m.AgendaPage),
      },
      {
        path: 'mapa',
        loadComponent: () => import('./contenido/mapa.page').then((m) => m.MapaPage),
      },
      {
        path: 'sponsors',
        loadComponent: () => import('./contenido/sponsors.page').then((m) => m.SponsorsPage),
      },
      {
        path: 'info',
        loadComponent: () => import('./contenido/info.page').then((m) => m.InfoPage),
      },
      {
        path: 'escanear',
        loadComponent: () => import('./escanear/escanear.page').then((m) => m.EscanearPage),
      },
      {
        path: 'canjear',
        loadComponent: () => import('./canjear/canjear.page').then((m) => m.CanjearPage),
      },
      {
        path: 'cobro/:token',
        loadComponent: () => import('./canjear/cobro.page').then((m) => m.CobroPage),
      },
      {
        path: 'mi-entrada',
        loadComponent: () => import('./mi-entrada/mi-entrada.page').then((m) => m.MiEntradaPage),
      },
      {
        path: 'historial',
        loadComponent: () => import('./historial/historial.page').then((m) => m.HistorialPage),
      },
      {
        path: 'cuenta',
        loadComponent: () => import('./cuenta/cuenta.page').then((m) => m.CuentaPage),
      },
      {
        path: 'cuenta/datos',
        loadComponent: () => import('./cuenta/mis-datos.page').then((m) => m.MisDatosPage),
      },
      {
        path: 'cuenta/fotos',
        loadComponent: () => import('./cuenta/mis-fotos.page').then((m) => m.MisFotosPage),
      },
      {
        path: 'cuenta/dispositivo',
        loadComponent: () => import('./cuenta/dispositivo.page').then((m) => m.DispositivoPage),
      },
      { path: 'mas', pathMatch: 'full', redirectTo: 'cuenta' },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
  },
  {
    // HU-310 §3: el QR de reto abierto con la cámara del sistema (revisa la sesión adentro).
    path: 'r/:qr',
    loadComponent: () => import('./escanear/qr-directo.page').then((m) => m.QrDirectoPage),
  },
  {
    path: 'sin-acceso',
    loadComponent: () => import('./avisos.pages').then((m) => m.SinAccesoPage),
  },
  {
    path: 'anulado',
    loadComponent: () => import('./avisos.pages').then((m) => m.AnuladoPage),
  },
  {
    path: 'sin-conexion',
    loadComponent: () => import('./avisos.pages').then((m) => m.SinConexionPage),
  },
  { path: '**', redirectTo: 'inicio' },
];
