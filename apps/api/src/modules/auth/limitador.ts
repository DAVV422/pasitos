/**
 * Límite de pedidos por clave en memoria (API §11): hay un solo proceso del API en el piloto.
 * Ventanas deslizantes: por ejemplo, 5 por minuto y 20 por hora para entrar, por IP y por correo.
 */
export interface Ventana {
  readonly maximo: number;
  readonly ms: number;
}

export class Limitador {
  private readonly marcas = new Map<string, number[]>();
  private readonly mayorVentana: number;

  constructor(
    private readonly ventanas: readonly Ventana[],
    private readonly ahora: () => number = Date.now,
  ) {
    this.mayorVentana = Math.max(...ventanas.map((v) => v.ms));
  }

  /** Registra un pedido. Devuelve los segundos que hay que esperar, o 0 si se puede seguir. */
  hit(clave: string): number {
    const ahora = this.ahora();
    const marcas = (this.marcas.get(clave) ?? []).filter((t) => t > ahora - this.mayorVentana);
    for (const ventana of this.ventanas) {
      const dentro = marcas.filter((t) => t > ahora - ventana.ms);
      if (dentro.length >= ventana.maximo) {
        this.marcas.set(clave, marcas);
        const masVieja = dentro[dentro.length - ventana.maximo] ?? ahora;
        return Math.max(1, Math.ceil((masVieja + ventana.ms - ahora) / 1000));
      }
    }
    marcas.push(ahora);
    this.marcas.set(clave, marcas);
    this.purge(ahora);
    return 0;
  }

  /** Cuánto falta esperar, sin registrar un pedido (para contar solo los fallidos). */
  check(clave: string): number {
    const ahora = this.ahora();
    const marcas = this.marcas.get(clave) ?? [];
    for (const ventana of this.ventanas) {
      const dentro = marcas.filter((t) => t > ahora - ventana.ms);
      if (dentro.length >= ventana.maximo) {
        const masVieja = dentro[dentro.length - ventana.maximo] ?? ahora;
        return Math.max(1, Math.ceil((masVieja + ventana.ms - ahora) / 1000));
      }
    }
    return 0;
  }

  reset(clave: string): void {
    this.marcas.delete(clave);
  }

  /** Cada tanto, borra las claves sin pedidos recientes para no crecer sin límite. */
  private purge(ahora: number): void {
    if (this.marcas.size < 5_000) {
      return;
    }
    for (const [clave, marcas] of this.marcas) {
      if ((marcas[marcas.length - 1] ?? 0) <= ahora - this.mayorVentana) {
        this.marcas.delete(clave);
      }
    }
  }
}
