//! Contrato del evento de Pasitos.
//!
//! Esqueleto de la fase 0 (T-001): solo expone la versión del contrato.
//! Las funciones del anclaje (`anchor`, `close`, `add_retos`…) se agregan en HU-102,
//! según docs/version-piloto/07-contrato-y-sellador.md.
#![no_std]

use soroban_sdk::{contract, contractimpl, Env};

/// Versión del formato del contrato. Sube cuando cambia su interfaz.
pub const VERSION: u32 = 0;

#[contract]
pub struct EventoContract;

#[contractimpl]
impl EventoContract {
    /// Devuelve la versión del contrato.
    pub fn version(_env: Env) -> u32 {
        VERSION
    }
}

#[cfg(test)]
mod test;
