# panel

Lo común de `/admin` y `/plataforma` (ajuste 12 de la fase 2): el acceso del equipo de HU-201.

- `RUTAS_ACCESO`: `entrar`, `recuperar`, `restablecer/:token`, `segundo-factor`, `segundo-factor/configurar` y `cuenta`. Cada pantalla se descarga al abrirla.
- `SesionService` (signals) con `GET /auth/yo`; `sesionGuard` para las pantallas del panel.
- `sesionInterceptor`: sesión vencida → `entrar?volver=…`; segundo factor pendiente → `segundo-factor?volver=…`. Se registra con `provideWebCore([sesionInterceptor])`.
- `APP_EQUIPO`: `'admin'` o `'plataforma'`, para los enlaces de los correos.

Las passkeys usan `@simplewebauthn/browser`, que solo se carga en las pantallas del segundo factor. Los componentes no usan `HttpClient`: usan `AuthApi`.
