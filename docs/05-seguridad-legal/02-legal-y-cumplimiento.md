# Legal y cumplimiento

> **Estado:** vigente · 🔍 temas pendientes de revisión legal · **Última revisión:** 2026-11-06

## 1. Checklist antes de un piloto con dinero real

Los pilotos de los planes Comunidad y Programa **solo usan puntos**, así que la mayoría de estos temas aplica recién a la variante Feria.

| Tema | Pregunta a resolver | Postura del diseño |
|---|---|---|
| Activos virtuales en Bolivia | ¿Qué permite hoy el marco del BCB/ASFI para operar con stablecoins? ¿Hace falta un proveedor de servicios de activos virtuales autorizado? | Verificar la normativa vigente. Operar la carga y el retiro a través de un anchor o proveedor autorizado, no por cuenta propia |
| Dinero electrónico | ¿Los puntos podrían considerarse dinero electrónico? | No: no se compran, no se convierten en dinero, no salen del evento y vencen |
| Saldo en dólares (Feria) | ¿Quién custodia el USDC y quién responde por el reembolso? | El organizador o un proveedor autorizado, con reservas 1:1 y reembolso garantizado por contrato |
| Protección al consumidor | ¿Se puede hacer vencer un saldo pagado? | **El saldo en dólares nunca vence**; solo vencen los puntos ganados gratis |
| Contabilidad | Los puntos son un pasivo para el organizador hasta que se canjean o vencen (IFRS 15) | El panel reporta los puntos emitidos, canjeados y vencidos |
| Datos personales | Consentimiento para compartir datos con sponsors | Opt-in explícito; las estadísticas de perfil solo en agregado |
| Conservación del nombre y el correo (piloto, D35) | ¿Se pueden conservar sin plazo el nombre, el correo y la bitácora, como historial y para reportes? ¿Hay que ofrecer un derecho de borrado de esos datos? | 🔍 Revisar. Hoy solo se borran los datos técnicos del dispositivo |
| Menores de edad | ¿Cómo atenderlos (autorización de padres o tutores, eventos de colegio)? | El piloto no pide la edad. Situación a detallar para las versiones siguientes |
| Datos del dispositivo (piloto, D33) | ¿Qué hay que informar o consentir para registrar datos técnicos del dispositivo (modelo, navegador, IP, huella) con fines antifraude? | 🔍 Revisar. Se informa en los términos al vincular, se usan solo para detectar trampas, no se comparten con sponsors y se borran 30 días después del cierre (Acceso del asistente §6.3 *(interno)*) |
| Alcohol | Promociones que incentivan el consumo de alcohol | No premiar la cantidad de alcohol (relevante si algún día se entra a vida nocturna) |
| KYC | ¿Desde qué monto se exige identificación para retirar? | KYC solo en el retiro, por encima de un umbral, vía el anchor |

## 2. Política de datos (resumen)

- **Nunca hay datos personales on-chain.**
- Los datos personales se guardan en el backend, con consentimiento, y se archivan o eliminan según la [Política de privacidad](04-politica-de-privacidad.md) (📝 borrador, 🔍 revisión legal). Las reglas de uso están en los [Términos y condiciones](03-terminos-y-condiciones.md).
- Los reportes a sponsors muestran datos **agregados**; los datos individuales solo con opt-in explícito del asistente.

## 3. Antes de mainnet

- Auditoría del contrato del evento (D22).
- Llave del operador que ancla cifrada en el servidor (o en un KMS), con rotación; la llave de administración del contrato fuera del servidor y con multifirma.
- *(Feria)* Custodia del USDC, reembolsos y revisión legal.
- Monitoreo de eventos y alertas de anomalías (picos de claims, comercios con volumen extraño).
- Revisar el checklist oficial de despliegue en mainnet de Stellar.
