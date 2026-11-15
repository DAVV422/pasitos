import type { Route } from '@angular/router';
import { configurarGuard, sesionGuard, sinSesionGuard, verificarGuard } from '../sesion/guards';

/**
 * Pantallas de acceso compartidas por `/admin` y `/plataforma` (HU-201 §7). Cada pantalla se
 * carga al abrirla: quien solo entra no descarga *Mi cuenta*.
 */
export const RUTAS_ACCESO: Route[] = [
  {
    path: 'entrar',
    canActivate: [sinSesionGuard],
    title: 'Entrar · Pasitos',
    loadComponent: () => import('./entrar.page').then((m) => m.EntrarPage),
  },
  {
    path: 'recuperar',
    canActivate: [sinSesionGuard],
    title: 'Recuperar la contraseña · Pasitos',
    loadComponent: () => import('./recuperar.page').then((m) => m.RecuperarPage),
  },
  {
    path: 'restablecer/:token',
    title: 'Contraseña nueva · Pasitos',
    loadComponent: () => import('./restablecer.page').then((m) => m.RestablecerPage),
  },
  {
    path: 'segundo-factor',
    canActivate: [verificarGuard],
    title: 'Segundo factor · Pasitos',
    loadComponent: () => import('./segundo-factor.page').then((m) => m.SegundoFactorPage),
  },
  {
    path: 'segundo-factor/configurar',
    canActivate: [configurarGuard],
    title: 'Configurar el segundo factor · Pasitos',
    loadComponent: () => import('./configurar.page').then((m) => m.ConfigurarPage),
  },
  {
    path: 'invitacion/:token',
    title: 'Invitación · Pasitos',
    loadComponent: () => import('./invitacion.page').then((m) => m.InvitacionPage),
  },
  {
    path: 'cuenta',
    canActivate: [sesionGuard],
    title: 'Mi cuenta · Pasitos',
    loadComponent: () => import('./cuenta.page').then((m) => m.CuentaPage),
  },
];
