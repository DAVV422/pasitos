//! Errores del contrato (Contrato y sellador §2.4). Los códigos no cambian: el sellador los lee.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoAutorizado = 1,
    EventoCerrado = 2,
    EventoPausado = 3,
    LoteFueraDeOrden = 4,
    HuellaAnteriorNoCoincide = 5,
    TopeSuperado = 6,
    RetoDesconocido = 7,
    TopeMenorAEntregados = 8,
    PantallaYaRegistrada = 9,
    LoteYaAnclado = 10,
    ConteosInvalidos = 11,
    /// Un tope solo sube (HU-102 §1).
    TopeNoBaja = 12,
}
