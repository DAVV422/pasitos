import { crc32 } from 'node:zlib';

/**
 * Un ZIP mínimo, **sin comprimir** (método 0): las fotos ya vienen en WebP y comprimirlas de nuevo
 * no ahorra nada. Alcanza para el ZIP de *Descargar para redes* (HU-324), sin otra librería.
 */
export interface EntradaZip {
  readonly nombre: string;
  readonly datos: Buffer;
}

function getFechaDos(fecha: Date): { hora: number; dia: number } {
  return {
    hora: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
    dia: ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
  };
}

export function buildZip(entradas: readonly EntradaZip[], fecha = new Date()): Buffer {
  const { hora, dia } = getFechaDos(fecha);
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const entrada of entradas) {
    const nombre = Buffer.from(entrada.nombre, 'utf8');
    const crc = crc32(entrada.datos) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(0, 8); // sin comprimir
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entrada.datos.length, 18);
    local.writeUInt32LE(entrada.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombre, entrada.datos);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(dia, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entrada.datos.length, 20);
    central.writeUInt32LE(entrada.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombre);
    desplazamiento += local.length + nombre.length + entrada.datos.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

/** Lee los nombres y datos de un ZIP sin comprimir (para las pruebas). */
export function readZip(zip: Buffer): EntradaZip[] {
  const entradas: EntradaZip[] = [];
  let i = 0;
  while (zip.readUInt32LE(i) === 0x04034b50) {
    const tamano = zip.readUInt32LE(i + 18);
    const largoNombre = zip.readUInt16LE(i + 26);
    const extra = zip.readUInt16LE(i + 28);
    const nombre = zip.subarray(i + 30, i + 30 + largoNombre).toString('utf8');
    const desde = i + 30 + largoNombre + extra;
    entradas.push({ nombre, datos: zip.subarray(desde, desde + tamano) });
    i = desde + tamano;
  }
  return entradas;
}
