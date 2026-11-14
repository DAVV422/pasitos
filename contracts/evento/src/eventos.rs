//! Eventos del contrato (Contrato y sellador §2.5), para el explorador y quien verifica.
//! El primer tema de cada evento es el nombre de la estructura en snake_case.

use soroban_sdk::{contractevent, Address, BytesN};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventoCreado {
    pub id_hash: BytesN<32>,
    pub retos: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetosAgregados {
    pub cantidad: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TopeSubido {
    #[topic]
    pub reto: u32,
    pub tope: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PantallasRegistradas {
    pub cantidad: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoteAnclado {
    #[topic]
    pub n: u32,
    pub huella: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventoPausado {
    pub quien: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventoReanudado {}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OperadorCambiado {
    pub nuevo: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventoCerrado {
    pub n_final: u32,
    pub huella_final: BytesN<32>,
}
