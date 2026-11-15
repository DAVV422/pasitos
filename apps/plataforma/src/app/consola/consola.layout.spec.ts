import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SesionService, type Yo } from '@pasitos/panel';
import { usePermisosConsola } from './consola.layout';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ permisos.puedeEscribir() }} {{ permisos.esPrincipal() }}`,
})
class PruebaComponent {
  readonly permisos = usePermisosConsola();
}

function buildYo(rolPlataforma: Yo['usuario']['rolPlataforma']): Yo {
  return {
    usuario: { id: '1', email: 'ana@example.com', nombre: 'Ana', rolPlataforma },
    segundoFactor: {
      requerido: true,
      configurado: true,
      metodos: ['totp'],
      estado: 'ok',
      verificadoAt: null,
    },
  };
}

describe('Permisos de la consola en la interfaz (HU-202)', () => {
  it.each([
    ['superadmin', 'true true'],
    ['admin', 'true false'],
    ['soporte', 'false false'],
  ] as const)('%s → escribir y nombrar: %s', async (rol, esperado) => {
    TestBed.inject(SesionService).set(buildYo(rol));
    const fixture = TestBed.createComponent(PruebaComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe(esperado);
  });
});
