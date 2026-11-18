import { inject, Injectable, signal } from '@angular/core';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi } from './asistente-api.service';

/**
 * *No fui yo* (HU-312 §3): firmado e idempotente, también desde el celular anulado. La clave se
 * crea al tocar el botón, así un reintento no crea otro aviso.
 */
@Injectable({ providedIn: 'root' })
export class NoFuiYoService {
  private readonly api = inject(AsistenteApi);
  readonly enviando = signal(false);
  readonly enviado = signal(false);
  readonly error = signal<string | null>(null);

  async send(sobre: 'dispositivo' | 'intento' | 'canje', refId?: string): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.api.noFuiYo({ sobre, ...(refId ? { refId } : {}) }, crypto.randomUUID());
      this.enviado.set(true);
    } catch (error) {
      this.error.set(
        error instanceof ErrorApi ? error.detail : 'No pudimos avisar. Intenta de nuevo.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
