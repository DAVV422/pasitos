use super::{EventoContract, EventoContractClient, VERSION};
use soroban_sdk::Env;

#[test]
fn devuelve_la_version() {
    let env = Env::default();
    let contract_id = env.register(EventoContract, ());
    let client = EventoContractClient::new(&env, &contract_id);
    assert_eq!(client.version(), VERSION);
}
