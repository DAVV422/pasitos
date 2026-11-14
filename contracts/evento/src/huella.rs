//! Huellas encadenadas (Contrato y sellador §4.2). libs/firmas hace el mismo cálculo en TypeScript;
//! los dos se prueban con libs/firmas/vectores/huellas.json.
//!
//! ```text
//! huella_génesis = SHA-256("PASITOS-GENESIS-v1" ‖ evento_id_hash)
//! huella_n       = SHA-256("PASITOS-LOTE-v1" ‖ evento_id_hash ‖ u32(n) ‖ huella_(n-1) ‖ raiz_n ‖ conteos_n)
//! ```

use soroban_sdk::{Bytes, BytesN, Env, Vec};

const ETIQUETA_GENESIS: &[u8] = b"PASITOS-GENESIS-v1";
const ETIQUETA_LOTE: &[u8] = b"PASITOS-LOTE-v1";

pub fn build_genesis(env: &Env, id_hash: &BytesN<32>) -> BytesN<32> {
    let mut datos = Bytes::from_slice(env, ETIQUETA_GENESIS);
    datos.append(&Bytes::from(id_hash));
    env.crypto().sha256(&datos).to_bytes()
}

/// Los conteos ya vienen validados (ordenados por reto y sin repetidos).
pub fn build_huella(
    env: &Env,
    id_hash: &BytesN<32>,
    n: u32,
    huella_anterior: &BytesN<32>,
    raiz: &BytesN<32>,
    conteos: &Vec<(u32, u32)>,
) -> BytesN<32> {
    let mut datos = Bytes::from_slice(env, ETIQUETA_LOTE);
    datos.append(&Bytes::from(id_hash));
    datos.extend_from_array(&n.to_be_bytes());
    datos.append(&Bytes::from(huella_anterior));
    datos.append(&Bytes::from(raiz));
    for (reto, conteo) in conteos.iter() {
        datos.extend_from_array(&reto.to_be_bytes());
        datos.extend_from_array(&conteo.to_be_bytes());
    }
    env.crypto().sha256(&datos).to_bytes()
}
