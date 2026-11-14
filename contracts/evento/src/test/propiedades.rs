//! Propiedades (Contrato §8): para secuencias aleatorias de lotes, `entregados` nunca pasa el tope
//! y la huella final del contrato es la misma que se calcula fuera, con otra implementación de SHA-256.

use super::crear;
use crate::Error;
use proptest::prelude::*;
use sha2::{Digest, Sha256};
use soroban_sdk::{BytesN, Vec};

fn huella_fuera(
    id_hash: &[u8; 32],
    n: u32,
    anterior: &[u8; 32],
    raiz: &[u8; 32],
    conteos: &[(u32, u32)],
) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(b"PASITOS-LOTE-v1");
    h.update(id_hash);
    h.update(n.to_be_bytes());
    h.update(anterior);
    h.update(raiz);
    for (reto, conteo) in conteos {
        h.update(reto.to_be_bytes());
        h.update(conteo.to_be_bytes());
    }
    h.finalize().into()
}

fn genesis_fuera(id_hash: &[u8; 32]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(b"PASITOS-GENESIS-v1");
    h.update(id_hash);
    h.finalize().into()
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn el_tope_nunca_se_pasa_y_la_cadena_coincide(
        topes in prop::collection::vec(1u32..40, 1..5),
        lotes in prop::collection::vec((prop::collection::vec(0u32..12, 5), any::<u8>()), 1..12),
    ) {
        let retos: std::vec::Vec<(u32, u32)> = topes
            .iter()
            .enumerate()
            .map(|(i, tope)| (i as u32 + 1, *tope))
            .collect();
        let e = crear(&retos);
        let id_hash = e.id_hash.to_array();
        let mut entregados = std::vec![0u32; topes.len()];
        let mut ultima = genesis_fuera(&id_hash);
        let mut n = 0u32;

        for (cantidades, semilla) in lotes {
            let pares: std::vec::Vec<(u32, u32)> = topes
                .iter()
                .enumerate()
                .map(|(i, _)| (i as u32 + 1, cantidades[i]))
                .collect();
            let mut conteos = Vec::new(&e.env);
            for par in &pares {
                conteos.push_back(*par);
            }
            let raiz = [semilla; 32];
            let pasa = pares.iter().all(|(reto, c)| entregados[*reto as usize - 1] + c <= topes[*reto as usize - 1]);
            let resultado = e.cliente.try_anchor(
                &(n + 1),
                &BytesN::from_array(&e.env, &ultima),
                &BytesN::from_array(&e.env, &raiz),
                &conteos,
            );
            if pasa {
                let huella = resultado.unwrap().unwrap();
                n += 1;
                ultima = huella_fuera(&id_hash, n, &ultima, &raiz, &pares);
                prop_assert_eq!(huella.to_array(), ultima);
                for (reto, c) in &pares {
                    entregados[*reto as usize - 1] += c;
                }
            } else {
                prop_assert_eq!(resultado, Err(Ok(Error::TopeSuperado)));
            }
            for (i, tope) in topes.iter().enumerate() {
                let info = e.cliente.get_reto(&(i as u32 + 1)).unwrap();
                prop_assert!(info.entregados <= *tope);
                prop_assert_eq!(info.entregados, entregados[i]);
            }
        }
        prop_assert_eq!(e.cliente.get_ultimo().huella.to_array(), ultima);
        prop_assert_eq!(e.cliente.get_ultimo().n, n);
    }
}
