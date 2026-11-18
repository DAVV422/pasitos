import { Injectable, signal } from '@angular/core';

/** *Ver mejor* (mockup A17): texto más grande y tema. Viven en este navegador. */
export type Tema = 'claro' | 'oscuro';

const CLAVE = 'px_preferencias';

interface Guardadas {
  readonly tema?: Tema;
  readonly textoGrande?: boolean;
}

function read(): Guardadas {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Guardadas;
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class PreferenciasService {
  /** Tema claro por defecto (D36). */
  readonly tema = signal<Tema>(read().tema ?? 'claro');
  readonly textoGrande = signal(read().textoGrande ?? false);

  constructor() {
    this.apply();
  }

  setTema(tema: Tema): void {
    this.tema.set(tema);
    this.save();
  }

  setTextoGrande(grande: boolean): void {
    this.textoGrande.set(grande);
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(
        CLAVE,
        JSON.stringify({ tema: this.tema(), textoGrande: this.textoGrande() }),
      );
    } catch {
      // Sin localStorage: vale hasta cerrar la pestaña.
    }
    this.apply();
  }

  private apply(): void {
    const raiz = document.documentElement;
    raiz.dataset['tema'] = this.tema();
    if (this.textoGrande()) raiz.dataset['texto'] = 'grande';
    else delete raiz.dataset['texto'];
  }
}
