// Se importa desde `@pasitos/dominio/legal`: así los textos largos no entran en las apps que no los muestran.
export { CONFIG_LEGAL, type ConfigLegal } from './config';
export {
  CORREO_POR_PUBLICAR,
  formatFechaLegal,
  getDocumentoLegal,
  type DocumentoLegal,
  type TipoDocumentoLegal,
} from './documentos';
