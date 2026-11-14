//! Cada función con su caso feliz y cada error de §2.4.

use super::{crear, raiz, RETOS_BASE};
use crate::{huella, Error, Estado, Totales, VERSION};
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke},
    vec, Address, BytesN, Env, IntoVal, Vec,
};

fn is_cerrado<T, C>(resultado: Result<T, Result<Error, C>>) -> bool {
    matches!(resultado, Err(Ok(Error::EventoCerrado)))
}

fn totales(env: &Env) -> Totales {
    Totales {
        participaciones: vec![env, (1, 3)],
        ganados: 60,
        canjeados: 20,
        ajustados: 0,
        vencidos: 40,
    }
}

#[test]
fn devuelve_la_version() {
    let e = crear(RETOS_BASE);
    assert_eq!(e.cliente.version(), VERSION);
}

#[test]
fn el_constructor_guarda_el_evento_los_retos_y_la_genesis() {
    let e = crear(RETOS_BASE);
    assert_eq!(e.cliente.get_estado(), Estado::Activo);
    assert_eq!(e.cliente.get_evento().id_hash, e.id_hash);
    assert_eq!(e.cliente.get_reto(&1).unwrap().tope, 10);
    assert_eq!(e.cliente.get_reto(&3), None);
    let ultimo = e.cliente.get_ultimo();
    assert_eq!(ultimo.n, 0);
    assert_eq!(ultimo.huella, huella::build_genesis(&e.env, &e.id_hash));
    assert_eq!(e.cliente.get_operador(), e.operador);
    assert_eq!(e.cliente.get_admin(), e.admin);
}

#[test]
#[should_panic]
fn el_constructor_rechaza_retos_desordenados() {
    crear(&[(2, 10), (1, 10)]);
}

#[test]
#[should_panic]
fn el_constructor_rechaza_un_tope_cero() {
    crear(&[(1, 0)]);
}

#[test]
fn ancla_en_orden_y_encadena() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    let conteos = vec![&e.env, (1, 4)];
    let h1 = e.cliente.anchor(&1, &genesis, &raiz(&e.env, 1), &conteos);
    let esperado =
        huella::build_huella(&e.env, &e.id_hash, 1, &genesis, &raiz(&e.env, 1), &conteos);
    assert_eq!(h1, esperado);
    let h2 = e
        .cliente
        .anchor(&2, &h1, &raiz(&e.env, 2), &Vec::new(&e.env));
    assert_eq!(e.cliente.get_ultimo().n, 2);
    assert_eq!(e.cliente.get_ultimo().huella, h2);
    assert_eq!(e.cliente.get_reto(&1).unwrap().entregados, 4);
}

#[test]
fn rechaza_lotes_fuera_de_orden() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    let sin = Vec::new(&e.env);
    assert_eq!(
        e.cliente.try_anchor(&2, &genesis, &raiz(&e.env, 1), &sin),
        Err(Ok(Error::LoteFueraDeOrden))
    );
    assert_eq!(
        e.cliente.try_anchor(&0, &genesis, &raiz(&e.env, 1), &sin),
        Err(Ok(Error::LoteFueraDeOrden))
    );
    let h1 = e.cliente.anchor(&1, &genesis, &raiz(&e.env, 1), &sin);
    // Repetir n con la misma huella resultante: ya anclado (el sellador lo toma como éxito).
    assert_eq!(
        e.cliente.try_anchor(&1, &genesis, &raiz(&e.env, 1), &sin),
        Err(Ok(Error::LoteYaAnclado))
    );
    // Repetir n con otra raíz: fuera de orden.
    assert_eq!(
        e.cliente.try_anchor(&1, &genesis, &raiz(&e.env, 9), &sin),
        Err(Ok(Error::LoteFueraDeOrden))
    );
    assert_eq!(e.cliente.get_ultimo().huella, h1);
}

#[test]
fn rechaza_una_huella_anterior_que_no_coincide() {
    let e = crear(RETOS_BASE);
    assert_eq!(
        e.cliente
            .try_anchor(&1, &raiz(&e.env, 5), &raiz(&e.env, 1), &Vec::new(&e.env)),
        Err(Ok(Error::HuellaAnteriorNoCoincide))
    );
}

#[test]
fn el_tope_justo_se_acepta_y_uno_mas_se_rechaza() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    assert_eq!(
        e.cliente
            .try_anchor(&1, &genesis, &raiz(&e.env, 1), &vec![&e.env, (2, 6)]),
        Err(Ok(Error::TopeSuperado))
    );
    // Un rechazo no deja nada escrito.
    assert_eq!(e.cliente.get_reto(&2).unwrap().entregados, 0);
    e.cliente
        .anchor(&1, &genesis, &raiz(&e.env, 1), &vec![&e.env, (2, 5)]);
    assert_eq!(e.cliente.get_reto(&2).unwrap().entregados, 5);
}

#[test]
fn rechaza_retos_desconocidos_y_conteos_invalidos() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    let r = raiz(&e.env, 1);
    assert_eq!(
        e.cliente
            .try_anchor(&1, &genesis, &r, &vec![&e.env, (9, 1)]),
        Err(Ok(Error::RetoDesconocido))
    );
    assert_eq!(
        e.cliente
            .try_anchor(&1, &genesis, &r, &vec![&e.env, (2, 1), (1, 1)]),
        Err(Ok(Error::ConteosInvalidos))
    );
    assert_eq!(
        e.cliente
            .try_anchor(&1, &genesis, &r, &vec![&e.env, (1, 1), (1, 1)]),
        Err(Ok(Error::ConteosInvalidos))
    );
}

#[test]
fn agrega_retos_nuevos_pero_no_repetidos() {
    let e = crear(RETOS_BASE);
    e.cliente.add_retos(&vec![&e.env, (3, 50)]);
    assert_eq!(e.cliente.get_reto(&3).unwrap().tope, 50);
    assert_eq!(
        e.cliente.try_add_retos(&vec![&e.env, (3, 60)]),
        Err(Ok(Error::ConteosInvalidos))
    );
}

#[test]
fn raise_tope_sube_pero_nunca_baja() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    e.cliente
        .anchor(&1, &genesis, &raiz(&e.env, 1), &vec![&e.env, (1, 8)]);
    e.cliente.raise_tope(&1, &20);
    assert_eq!(e.cliente.get_reto(&1).unwrap().tope, 20);
    assert_eq!(
        e.cliente.try_raise_tope(&1, &15),
        Err(Ok(Error::TopeNoBaja))
    );
    assert_eq!(
        e.cliente.try_raise_tope(&1, &7),
        Err(Ok(Error::TopeMenorAEntregados))
    );
    assert_eq!(
        e.cliente.try_raise_tope(&9, &7),
        Err(Ok(Error::RetoDesconocido))
    );
}

#[test]
fn registra_pantallas_con_la_hora_del_ledger_una_sola_vez() {
    let e = crear(RETOS_BASE);
    e.env.ledger().with_mut(|l| l.timestamp = 12_345);
    let llave = BytesN::from_array(&e.env, &[4; 65]);
    e.cliente
        .add_pantallas(&vec![&e.env, (1, llave.clone()), (2, llave.clone())]);
    let pantalla = e.cliente.get_pantalla(&1).unwrap();
    assert_eq!(pantalla.registrada_at, 12_345);
    assert_eq!(pantalla.llave_publica, llave);
    let otra = BytesN::from_array(&e.env, &[5; 65]);
    assert_eq!(
        e.cliente
            .try_add_pantallas(&vec![&e.env, (1, otra.clone())]),
        Err(Ok(Error::PantallaYaRegistrada))
    );
    assert_eq!(
        e.cliente
            .try_add_pantallas(&vec![&e.env, (3, otra.clone()), (3, otra)]),
        Err(Ok(Error::PantallaYaRegistrada))
    );
    assert_eq!(e.cliente.get_pantalla(&3), None);
}

#[test]
fn pausa_y_reanuda() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    e.cliente.pause(&e.operador);
    assert_eq!(e.cliente.get_estado(), Estado::Pausado);
    assert_eq!(
        e.cliente
            .try_anchor(&1, &genesis, &raiz(&e.env, 1), &Vec::new(&e.env)),
        Err(Ok(Error::EventoPausado))
    );
    // La preparación sigue funcionando en pausa.
    e.cliente.add_retos(&vec![&e.env, (3, 5)]);
    e.cliente.unpause();
    e.cliente
        .anchor(&1, &genesis, &raiz(&e.env, 1), &Vec::new(&e.env));
    e.cliente.pause(&e.admin);
    let otro = Address::generate(&e.env);
    assert_eq!(e.cliente.try_pause(&otro), Err(Ok(Error::NoAutorizado)));
}

#[test]
fn cierra_y_despues_todo_lo_que_escribe_falla() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    let h1 = e
        .cliente
        .anchor(&1, &genesis, &raiz(&e.env, 1), &vec![&e.env, (1, 3)]);
    assert_eq!(
        e.cliente.try_close(&0, &genesis, &totales(&e.env)),
        Err(Ok(Error::LoteFueraDeOrden))
    );
    assert_eq!(
        e.cliente.try_close(&1, &genesis, &totales(&e.env)),
        Err(Ok(Error::HuellaAnteriorNoCoincide))
    );
    e.cliente.close(&1, &h1, &totales(&e.env));
    assert_eq!(e.cliente.get_estado(), Estado::Cerrado);
    assert_eq!(e.cliente.get_cierre().unwrap().huella_final, h1);

    let llave = BytesN::from_array(&e.env, &[4; 65]);
    let sin = Vec::new(&e.env);
    assert!(is_cerrado(e.cliente.try_anchor(
        &2,
        &h1,
        &raiz(&e.env, 2),
        &sin
    )));
    assert!(is_cerrado(e.cliente.try_add_retos(&vec![&e.env, (3, 5)])));
    assert!(is_cerrado(e.cliente.try_raise_tope(&1, &50)));
    assert!(is_cerrado(
        e.cliente.try_add_pantallas(&vec![&e.env, (1, llave)])
    ));
    assert!(is_cerrado(e.cliente.try_close(&1, &h1, &totales(&e.env))));
    assert!(is_cerrado(e.cliente.try_pause(&e.operador)));
    assert!(is_cerrado(e.cliente.try_unpause()));
    assert!(is_cerrado(
        e.cliente.try_set_operador(&Address::generate(&e.env))
    ));
}

#[test]
fn set_operador_cambia_quien_puede_anclar() {
    let e = crear(RETOS_BASE);
    let nuevo = Address::generate(&e.env);
    e.cliente.set_operador(&nuevo);
    assert_eq!(e.cliente.get_operador(), nuevo);
}

#[test]
fn emite_lote_anclado() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    e.cliente
        .anchor(&1, &genesis, &raiz(&e.env, 1), &Vec::new(&e.env));
    assert!(!e.env.events().all().events().is_empty());
}

// ── Permisos ────────────────────────────────────────────────────────────────

/// Quién firmó la última llamada.
fn firmante(e: &super::Escenario) -> Address {
    let firmas = e.env.auths();
    assert_eq!(firmas.len(), 1, "se esperaba una sola firma");
    firmas[0].0.clone()
}

#[test]
fn las_funciones_del_operador_exigen_su_firma() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    e.cliente
        .anchor(&1, &genesis, &raiz(&e.env, 1), &Vec::new(&e.env));
    assert_eq!(firmante(&e), e.operador);
    e.cliente.add_retos(&vec![&e.env, (3, 5)]);
    assert_eq!(firmante(&e), e.operador);
    e.cliente.raise_tope(&3, &6);
    assert_eq!(firmante(&e), e.operador);
    e.cliente
        .add_pantallas(&vec![&e.env, (1, BytesN::from_array(&e.env, &[4; 65]))]);
    assert_eq!(firmante(&e), e.operador);
    let ultima = e.cliente.get_ultimo().huella;
    e.cliente.close(&1, &ultima, &totales(&e.env));
    assert_eq!(firmante(&e), e.operador);
}

#[test]
fn unpause_y_set_operador_exigen_la_firma_del_admin() {
    let e = crear(RETOS_BASE);
    e.cliente.pause(&e.operador);
    assert_eq!(firmante(&e), e.operador);
    e.cliente.unpause();
    assert_eq!(firmante(&e), e.admin);
    e.cliente.set_operador(&Address::generate(&e.env));
    assert_eq!(firmante(&e), e.admin);
}

#[test]
fn sin_la_firma_correcta_nada_funciona() {
    let e = crear(RETOS_BASE);
    let genesis = e.cliente.get_ultimo().huella;
    let otro = Address::generate(&e.env);
    // Solo firma "otro": el contrato pide la del operador y falla.
    e.env.mock_auths(&[MockAuth {
        address: &otro,
        invoke: &MockAuthInvoke {
            contract: &e.cliente.address,
            fn_name: "anchor",
            args: (
                1u32,
                genesis.clone(),
                raiz(&e.env, 1),
                Vec::<(u32, u32)>::new(&e.env),
            )
                .into_val(&e.env),
            sub_invokes: &[],
        },
    }]);
    assert!(e
        .cliente
        .try_anchor(&1, &genesis, &raiz(&e.env, 1), &Vec::new(&e.env))
        .is_err());
    e.env.set_auths(&[]);
    assert!(e.cliente.try_unpause().is_err());
    assert!(e.cliente.try_set_operador(&otro).is_err());
    assert!(e.cliente.try_add_retos(&vec![&e.env, (3, 5)]).is_err());
    assert_eq!(e.cliente.get_ultimo().n, 0);
}

#[test]
fn el_contrato_no_tiene_funcion_de_actualizacion() {
    // Nadie, tampoco Pasitos, puede cambiar el código del contrato (Contrato §1.2).
    let fuente = include_str!("../lib.rs");
    assert!(!fuente.contains("update_current_contract_wasm"));
    assert!(!fuente.contains("fn upgrade"));
}
