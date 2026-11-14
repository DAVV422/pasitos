//! Tipos del almacenamiento (Contrato y sellador §2.1).

use soroban_sdk::{contracttype, BytesN, Vec};

/// Lo que identifica al evento en la red. `id_hash` = SHA-256 del uuid del evento.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventoInfo {
    pub id_hash: BytesN<32>,
    pub inicio: u64,
    pub fin: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetoInfo {
    pub tope: u32,
    pub entregados: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PantallaInfo {
    /// P-256 sin comprimir.
    pub llave_publica: BytesN<65>,
    /// Hora del ledger en que se registró.
    pub registrada_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UltimoLote {
    pub n: u32,
    pub huella: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Estado {
    Activo,
    Pausado,
    Cerrado,
}

/// Totales del evento al cerrar.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Totales {
    /// Participaciones por número de reto.
    pub participaciones: Vec<(u32, u32)>,
    pub ganados: i128,
    pub canjeados: i128,
    pub ajustados: i128,
    pub vencidos: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CierreInfo {
    pub n_final: u32,
    pub huella_final: BytesN<32>,
    pub totales: Totales,
    pub cerrado_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Clave {
    Admin,
    Operador,
    Evento,
    Ultimo,
    Estado,
    Cierre,
    Reto(u32),
    Pantalla(u32),
}
