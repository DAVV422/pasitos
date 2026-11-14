//! Vectores compartidos con libs/firmas (HU-102 §4): génesis y cadena de huellas.

use super::crear_en;
use soroban_sdk::{BytesN, Env, Vec};

const VECTORES: &str = include_str!("../../../../libs/firmas/vectores/huellas.json");

fn bytes32(env: &Env, texto: &str) -> BytesN<32> {
    let datos: [u8; 32] = hex::decode(texto).unwrap().try_into().unwrap();
    BytesN::from_array(env, &datos)
}

fn vectores() -> serde_json::Value {
    serde_json::from_str(VECTORES).unwrap()
}

#[test]
fn la_genesis_coincide_con_los_vectores() {
    for evento in vectores()["eventos"].as_array().unwrap() {
        let env = Env::default();
        env.mock_all_auths();
        let id_hash = bytes32(&env, evento["eventoIdHash"].as_str().unwrap()).to_array();
        let e = crear_en(env, id_hash, &[]);
        let genesis = bytes32(&e.env, evento["genesis"].as_str().unwrap());
        assert_eq!(e.cliente.get_ultimo().huella, genesis);
    }
}

#[test]
fn la_cadena_de_huellas_coincide_con_los_vectores() {
    let v = vectores();
    let env = Env::default();
    env.mock_all_auths();
    let id_hash = bytes32(&env, v["cadena"]["eventoIdHash"].as_str().unwrap()).to_array();
    let e = crear_en(
        env,
        id_hash,
        &[(1, 1_000), (2, 1_000), (3, 1_000), (7, 1_000)],
    );

    for lote in v["cadena"]["lotes"].as_array().unwrap() {
        let n = lote["n"].as_u64().unwrap() as u32;
        let anterior = bytes32(&e.env, lote["huellaAnterior"].as_str().unwrap());
        let raiz = bytes32(&e.env, lote["raiz"].as_str().unwrap());
        let mut conteos = Vec::new(&e.env);
        for par in lote["conteos"].as_array().unwrap() {
            conteos.push_back((
                par[0].as_u64().unwrap() as u32,
                par[1].as_u64().unwrap() as u32,
            ));
        }
        assert_eq!(e.cliente.get_ultimo().huella, anterior);
        let huella = e.cliente.anchor(&n, &anterior, &raiz, &conteos);
        assert_eq!(
            huella,
            bytes32(&e.env, lote["huella"].as_str().unwrap()),
            "lote {n}"
        );
    }
}
