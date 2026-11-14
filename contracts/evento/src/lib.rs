//! Contrato del evento de Pasitos (HU-102).
//!
//! Una instancia por evento, **sin función de actualización**: nadie, tampoco Pasitos, puede
//! cambiar el código a mitad del evento. Guarda los topes de los retos, las llaves de las pantallas
//! y la última huella encadenada; rechaza un lote fuera de orden, que no encadena o que pasa un tope.
//! Diseño: docs/version-piloto/07-contrato-y-sellador.md §2.
#![no_std]

mod errores;
mod eventos;
mod huella;
mod tipos;

pub use errores::Error;
pub use tipos::{CierreInfo, Estado, EventoInfo, PantallaInfo, RetoInfo, Totales, UltimoLote};

use eventos::{
    EventoCerrado, EventoCreado, EventoPausado, EventoReanudado, LoteAnclado, OperadorCambiado,
    PantallasRegistradas, RetosAgregados, TopeSubido,
};
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, BytesN, Env, Vec};
use tipos::Clave;

/// Versión de la interfaz del contrato. Sube cuando cambia.
pub const VERSION: u32 = 1;

/// Tiempo de vida en ledgers (~5 s cada uno): se extiende a ~31 días cuando quedan menos de ~7.
pub const TTL_UMBRAL: u32 = 120_960;
pub const TTL_EXTENSION: u32 = 535_680;

#[contract]
pub struct EventoContract;

#[contractimpl]
impl EventoContract {
    /// Crea el contrato del evento con sus retos iniciales `(número, tope)`, ordenados y sin repetidos.
    pub fn __constructor(
        env: Env,
        admin: Address,
        operador: Address,
        evento: EventoInfo,
        retos: Vec<(u32, u32)>,
    ) {
        if let Err(error) = validate_retos_nuevos(&env, &retos) {
            panic_with_error!(&env, error);
        }
        let instancia = env.storage().instance();
        instancia.set(&Clave::Admin, &admin);
        instancia.set(&Clave::Operador, &operador);
        instancia.set(&Clave::Evento, &evento);
        instancia.set(&Clave::Estado, &Estado::Activo);
        let genesis = huella::build_genesis(&env, &evento.id_hash);
        instancia.set(
            &Clave::Ultimo,
            &UltimoLote {
                n: 0,
                huella: genesis,
            },
        );
        save_retos_nuevos(&env, &retos);
        extend_instancia(&env);
        EventoCreado {
            id_hash: evento.id_hash,
            retos: retos.len(),
        }
        .publish(&env);
    }

    pub fn add_retos(env: Env, retos: Vec<(u32, u32)>) -> Result<(), Error> {
        get_operador(&env).require_auth();
        require_abierto(&env)?;
        validate_retos_nuevos(&env, &retos)?;
        save_retos_nuevos(&env, &retos);
        extend_instancia(&env);
        RetosAgregados {
            cantidad: retos.len(),
        }
        .publish(&env);
        Ok(())
    }

    /// Sube el tope de un reto. Nunca baja, ni por debajo de lo ya entregado.
    pub fn raise_tope(env: Env, reto: u32, tope: u32) -> Result<(), Error> {
        get_operador(&env).require_auth();
        require_abierto(&env)?;
        let clave = Clave::Reto(reto);
        let mut info: RetoInfo = env
            .storage()
            .persistent()
            .get(&clave)
            .ok_or(Error::RetoDesconocido)?;
        if tope < info.entregados {
            return Err(Error::TopeMenorAEntregados);
        }
        if tope < info.tope {
            return Err(Error::TopeNoBaja);
        }
        info.tope = tope;
        save_persistente(&env, &clave, &info);
        extend_instancia(&env);
        TopeSubido { reto, tope }.publish(&env);
        Ok(())
    }

    /// Registra llaves públicas de pantallas `(número, llave)`, con la hora del ledger. No se cambian.
    pub fn add_pantallas(env: Env, pantallas: Vec<(u32, BytesN<65>)>) -> Result<(), Error> {
        get_operador(&env).require_auth();
        require_abierto(&env)?;
        let ahora = env.ledger().timestamp();
        for (numero, llave_publica) in pantallas.iter() {
            let clave = Clave::Pantalla(numero);
            if env.storage().persistent().has(&clave) {
                // También si viene repetida en la misma llamada: el error deshace todo lo escrito.
                return Err(Error::PantallaYaRegistrada);
            }
            save_persistente(
                &env,
                &clave,
                &PantallaInfo {
                    llave_publica,
                    registrada_at: ahora,
                },
            );
        }
        extend_instancia(&env);
        PantallasRegistradas {
            cantidad: pantallas.len(),
        }
        .publish(&env);
        Ok(())
    }

    /// Ancla el lote `n` y devuelve su huella (Contrato y sellador §2.3).
    pub fn anchor(
        env: Env,
        n: u32,
        huella_anterior: BytesN<32>,
        raiz: BytesN<32>,
        conteos: Vec<(u32, u32)>,
    ) -> Result<BytesN<32>, Error> {
        get_operador(&env).require_auth();
        match get_estado(&env) {
            Estado::Cerrado => return Err(Error::EventoCerrado),
            Estado::Pausado => return Err(Error::EventoPausado),
            Estado::Activo => {}
        }
        validate_orden(&conteos)?;

        let evento: EventoInfo = env.storage().instance().get(&Clave::Evento).unwrap();
        let ultimo = get_ultimo(&env);
        let huella =
            huella::build_huella(&env, &evento.id_hash, n, &huella_anterior, &raiz, &conteos);
        if n == ultimo.n && n > 0 && huella == ultimo.huella {
            return Err(Error::LoteYaAnclado);
        }
        if ultimo.n.checked_add(1) != Some(n) {
            return Err(Error::LoteFueraDeOrden);
        }
        if huella_anterior != ultimo.huella {
            return Err(Error::HuellaAnteriorNoCoincide);
        }

        // Primero se valida todo; después se escribe.
        let mut nuevos: Vec<(u32, RetoInfo)> = Vec::new(&env);
        for (reto, conteo) in conteos.iter() {
            let mut info: RetoInfo = env
                .storage()
                .persistent()
                .get(&Clave::Reto(reto))
                .ok_or(Error::RetoDesconocido)?;
            let total = info
                .entregados
                .checked_add(conteo)
                .ok_or(Error::TopeSuperado)?;
            if total > info.tope {
                return Err(Error::TopeSuperado);
            }
            info.entregados = total;
            nuevos.push_back((reto, info));
        }
        for (reto, info) in nuevos.iter() {
            save_persistente(&env, &Clave::Reto(reto), &info);
        }
        env.storage().instance().set(
            &Clave::Ultimo,
            &UltimoLote {
                n,
                huella: huella.clone(),
            },
        );
        extend_instancia(&env);
        LoteAnclado {
            n,
            huella: huella.clone(),
        }
        .publish(&env);
        Ok(huella)
    }

    /// Cierra el evento con la huella final y los totales. Después no acepta más lotes ni cambios.
    pub fn close(
        env: Env,
        n_final: u32,
        huella_final: BytesN<32>,
        totales: Totales,
    ) -> Result<(), Error> {
        get_operador(&env).require_auth();
        require_abierto(&env)?;
        let ultimo = get_ultimo(&env);
        if n_final != ultimo.n {
            return Err(Error::LoteFueraDeOrden);
        }
        if huella_final != ultimo.huella {
            return Err(Error::HuellaAnteriorNoCoincide);
        }
        let cierre = CierreInfo {
            n_final,
            huella_final: huella_final.clone(),
            totales,
            cerrado_at: env.ledger().timestamp(),
        };
        let instancia = env.storage().instance();
        instancia.set(&Clave::Cierre, &cierre);
        instancia.set(&Clave::Estado, &Estado::Cerrado);
        extend_instancia(&env);
        EventoCerrado {
            n_final,
            huella_final,
        }
        .publish(&env);
        Ok(())
    }

    /// Deja de aceptar lotes. Lo puede hacer el operador o el admin; `quien` dice cuál firma.
    pub fn pause(env: Env, quien: Address) -> Result<(), Error> {
        if quien != get_operador(&env) && quien != get_admin(&env) {
            return Err(Error::NoAutorizado);
        }
        quien.require_auth();
        require_abierto(&env)?;
        env.storage()
            .instance()
            .set(&Clave::Estado, &Estado::Pausado);
        extend_instancia(&env);
        EventoPausado { quien }.publish(&env);
        Ok(())
    }

    /// Vuelve a aceptar lotes. Solo el admin (la llave de emergencia, fuera del servidor).
    pub fn unpause(env: Env) -> Result<(), Error> {
        get_admin(&env).require_auth();
        require_abierto(&env)?;
        env.storage()
            .instance()
            .set(&Clave::Estado, &Estado::Activo);
        extend_instancia(&env);
        EventoReanudado {}.publish(&env);
        Ok(())
    }

    /// Cambia la cuenta del sellador (si se perdió o la robaron). Solo el admin.
    pub fn set_operador(env: Env, nuevo: Address) -> Result<(), Error> {
        get_admin(&env).require_auth();
        require_abierto(&env)?;
        env.storage().instance().set(&Clave::Operador, &nuevo);
        extend_instancia(&env);
        OperadorCambiado { nuevo }.publish(&env);
        Ok(())
    }

    pub fn get_estado(env: Env) -> Estado {
        get_estado(&env)
    }

    pub fn get_evento(env: Env) -> EventoInfo {
        env.storage().instance().get(&Clave::Evento).unwrap()
    }

    pub fn get_ultimo(env: Env) -> UltimoLote {
        get_ultimo(&env)
    }

    pub fn get_reto(env: Env, reto: u32) -> Option<RetoInfo> {
        env.storage().persistent().get(&Clave::Reto(reto))
    }

    pub fn get_pantalla(env: Env, pantalla: u32) -> Option<PantallaInfo> {
        env.storage().persistent().get(&Clave::Pantalla(pantalla))
    }

    pub fn get_cierre(env: Env) -> Option<CierreInfo> {
        env.storage().instance().get(&Clave::Cierre)
    }

    pub fn get_operador(env: Env) -> Address {
        get_operador(&env)
    }

    pub fn get_admin(env: Env) -> Address {
        get_admin(&env)
    }

    pub fn version(_env: Env) -> u32 {
        VERSION
    }
}

fn get_estado(env: &Env) -> Estado {
    env.storage().instance().get(&Clave::Estado).unwrap()
}

fn get_ultimo(env: &Env) -> UltimoLote {
    env.storage().instance().get(&Clave::Ultimo).unwrap()
}

fn get_operador(env: &Env) -> Address {
    env.storage().instance().get(&Clave::Operador).unwrap()
}

fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&Clave::Admin).unwrap()
}

fn require_abierto(env: &Env) -> Result<(), Error> {
    if get_estado(env) == Estado::Cerrado {
        return Err(Error::EventoCerrado);
    }
    Ok(())
}

/// Pares ordenados por número y sin repetidos.
fn validate_orden(pares: &Vec<(u32, u32)>) -> Result<(), Error> {
    let mut anterior: Option<u32> = None;
    for (numero, _) in pares.iter() {
        if numero == 0 || anterior.is_some_and(|a| numero <= a) {
            return Err(Error::ConteosInvalidos);
        }
        anterior = Some(numero);
    }
    Ok(())
}

fn validate_retos_nuevos(env: &Env, retos: &Vec<(u32, u32)>) -> Result<(), Error> {
    validate_orden(retos)?;
    for (numero, tope) in retos.iter() {
        if tope == 0 || env.storage().persistent().has(&Clave::Reto(numero)) {
            return Err(Error::ConteosInvalidos);
        }
    }
    Ok(())
}

fn save_retos_nuevos(env: &Env, retos: &Vec<(u32, u32)>) {
    for (numero, tope) in retos.iter() {
        save_persistente(
            env,
            &Clave::Reto(numero),
            &RetoInfo {
                tope,
                entregados: 0,
            },
        );
    }
}

fn save_persistente<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    env: &Env,
    clave: &Clave,
    valor: &V,
) {
    let persistente = env.storage().persistent();
    persistente.set(clave, valor);
    persistente.extend_ttl(clave, TTL_UMBRAL, TTL_EXTENSION);
}

fn extend_instancia(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_UMBRAL, TTL_EXTENSION);
}

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod test;
