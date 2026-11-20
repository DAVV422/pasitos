import { Route } from '@angular/router';
import { RUTAS_ACCESO, sesionGuard } from '@pasitos/panel';

/** Rutas de la consola (HU-202). El acceso (HU-201) y las invitaciones vienen de libs/panel. */
export const appRoutes: Route[] = [
  ...RUTAS_ACCESO,
  {
    path: '',
    canActivate: [sesionGuard],
    loadComponent: () => import('./consola/consola.layout').then((m) => m.ConsolaLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'organizaciones' },
      {
        path: 'organizaciones',
        title: 'Organizaciones · Consola',
        loadComponent: () =>
          import('./consola/organizaciones.page').then((m) => m.OrganizacionesPage),
      },
      {
        path: 'organizaciones/:id',
        title: 'Organización · Consola',
        loadComponent: () => import('./consola/organizacion.page').then((m) => m.OrganizacionPage),
      },
      {
        path: 'eventos',
        title: 'Eventos · Consola',
        loadComponent: () => import('./consola/eventos.page').then((m) => m.EventosPage),
      },
      {
        path: 'costo-red',
        title: 'Costo de red · Consola',
        loadComponent: () => import('./consola/costo-red.page').then((m) => m.CostoRedPage),
      },
      {
        path: 'usuarios',
        title: 'Personas · Consola',
        loadComponent: () => import('./consola/usuarios.page').then((m) => m.UsuariosPage),
      },
      {
        path: 'contactos',
        title: 'Contactos · Consola',
        loadComponent: () => import('./consola/contactos.page').then((m) => m.ContactosPage),
      },
      {
        path: 'contactos/:id',
        title: 'Contacto · Consola',
        loadComponent: () => import('./consola/contacto.page').then((m) => m.ContactoPage),
      },
      {
        path: 'bitacora',
        title: 'Bitácora · Consola',
        loadComponent: () => import('./consola/bitacora.page').then((m) => m.BitacoraPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
