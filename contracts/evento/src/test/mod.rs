//! Tests del contrato (Contrato y sellador §8).

mod funciones;
mod propiedades;
mod vectores;

use crate::{EventoContract, EventoContractClient, EventoInfo};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

pub struct Escenario<'a> {
    pub env: Env,
    pub cliente: EventoContractClient<'a>,
    pub admin: Address,
    pub operador: Address,
    pub id_hash: BytesN<32>,
}

/// Contrato con todas las firmas simuladas: para probar la lógica, no los permisos.
pub fn crear(retos: &[(u32, u32)]) -> Escenario<'static> {
    let env = Env::default();
    env.mock_all_auths();
    crear_en(env, [7; 32], retos)
}

pub fn crear_en(env: Env, id_hash: [u8; 32], retos: &[(u32, u32)]) -> Escenario<'static> {
    let admin = Address::generate(&env);
    let operador = Address::generate(&env);
    let id_hash = BytesN::from_array(&env, &id_hash);
    let evento = EventoInfo {
        id_hash: id_hash.clone(),
        inicio: 1_000,
        fin: 2_000,
    };
    let mut lista = Vec::new(&env);
    for par in retos {
        lista.push_back(*par);
    }
    let contrato = env.register(EventoContract, (&admin, &operador, evento, lista));
    let cliente = EventoContractClient::new(&env, &contrato);
    Escenario {
        env,
        cliente,
        admin,
        operador,
        id_hash,
    }
}

pub const RETOS_BASE: &[(u32, u32)] = &[(1, 10), (2, 5)];

pub fn raiz(env: &Env, semilla: u8) -> BytesN<32> {
    BytesN::from_array(env, &[semilla; 32])
}
