import { Module } from '@nestjs/common';
import { LibroRepository, LibroService } from '@pasitos/libro';
import { AnulacionesService } from './anulaciones.service';

/**
 * Libro de movimientos (HU-101). Las reglas viven en libs/libro porque el trabajador las comparte.
 * Los módulos que mueven puntos (check-in, retos, canjes, ajustes) importan este módulo
 * y llaman a LibroService.addMovimiento() dentro de su propia transacción.
 */
@Module({
  providers: [
    LibroRepository,
    {
      provide: LibroService,
      useFactory: (repositorio: LibroRepository) => new LibroService(repositorio),
      inject: [LibroRepository],
    },
    {
      provide: AnulacionesService,
      inject: [LibroService],
      useFactory: (libro: LibroService) => new AnulacionesService(libro),
    },
  ],
  exports: [LibroService, AnulacionesService],
})
export class MovimientosModule {}
