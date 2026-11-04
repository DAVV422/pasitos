# Clientes y segmentos

> **Estado:** vigente (modelo de negocio oficial) · **Última revisión:** 2026-11-03

## 1. Punto de partida: qué pasa en Bolivia

Durante el hackathon se analizó un primer modelo, en el que los sponsors pagaban por lead verificado en su stand. Se descartó porque no se ajusta a la realidad local:

| Supuesto descartado | Realidad local |
|---|---|
| Los sponsors pagan licencias de cientos o miles de dólares al año | Pocas empresas pagarían eso. La mayoría de los patrocinios locales son montos chicos o aportes en especie (meriendas, merch, lugar) |
| Los eventos tienen stands de sponsors | Muchos no: hackathons, meetups, eventos de GDG, charlas universitarias. El sponsor pone dinero o productos, pero no tiene stand |
| El organizador paga una licencia por evento | Los organizadores comunitarios **buscan** sponsors para cubrir gastos. No tienen dinero para una suscripción |
| El valor principal son los "leads para el stand" | El dolor real es otro: **el organizador no puede demostrarle a su sponsor qué logró su dinero** |

**El producto no cambió: cambió a quién se le vende y cómo se cobra.** El registro de la decisión está en [decisiones.md](../decisiones.md) (D9).

## 2. Segmentos por capacidad de pago

| Segmento | Ejemplos | ¿Pueden pagar? | Rol en el negocio |
|---|---|---|---|
| **A. Comunidades** | GDG, meetups, clubes universitarios, hackathons pequeños | ❌ No, o muy poco | **Usuarios gratuitos.** Dan volumen, casos de uso y datos. Atraen a los segmentos B y C |
| **B. Financiadores con obligación de reportar** | Fundaciones y ecosistemas blockchain (Stellar, BAF), cooperación internacional, universidades, programas públicos de innovación | ✅ Sí. Tienen presupuesto por programa y **deben demostrar impacto** | **Primer segmento que paga** |
| **C. Ferias y eventos comerciales** | Expos, ferias empresariales, festivales, ferias gastronómicas | ✅ Sí, si el cobro es por uso y no una suscripción | Ingreso por transacciones (más adelante) |
| D. Grandes sponsors corporativos | Bancos, telcos, bebidas | Algunos, a largo plazo | No contamos con ellos para empezar |

### Por qué paga el segmento B

- **Ya gasta dinero en eventos**, y su presupuesto suele venir en dólares de afuera (fundaciones, fondos, cooperación).
- **Tiene que reportar** a su directorio, a sus donantes o a su ecosistema. Un reporte verificable on-chain le ahorra trabajo y le da credibilidad.
- **Para un ecosistema blockchain, el reporte vale doble:** cada asistente sale con una wallet y transacciones reales en Stellar. No es solo una métrica del evento: **es onboarding a la red**, que es justo lo que esas fundaciones financian.
- **El monto es chico para ellos:** $300 sobre un hackathon que cuesta miles es menos del 10 % del presupuesto.

**Ejemplo real: el hackathon Stellar Elite Bolivia.** Lo patrocinó BAF x Stellar, y el organizador gestionó el lugar, las meriendas, el café y el merch. Con Pasitos, BAF y Stellar sabrían **cuántos participantes hicieron su primera transacción en Stellar**, con pruebas y no con fotos.

## 3. Quién usa y quién paga

| Actor | Rol | ¿Paga? | Qué obtiene |
|---|---|---|---|
| **Organizador** | Opera el evento en Pasitos | Comunidad: no · Programa: lo paga el financiador · Feria: comisión | Retención, merch repartido de forma justa, reporte para sus sponsors |
| **Financiador / sponsor** | Pone el dinero, el merch o las meriendas | Plan Programa o estadísticas avanzadas (como línea del patrocinio) | Pruebas verificables de lo que logró su aporte |
| **Mesa de canje o comercio** | Usuario operativo | En ferias: comisión sobre las ventas en dólares | Cobros rápidos, menos efectivo y filas |
| **Asistente** | Usuario final | ❌ Nunca | Premios, merch justo, saldo reembolsable (ferias) |

## 4. Cliente ideal para los pilotos

| Criterio | Valor |
|---|---|
| Tipo de evento | Meetups, eventos de comunidad, hackathons, foros académicos |
| Tamaño | 50 a 300 asistentes (límite del plan Comunidad) |
| Financiadores | Al menos 1 sponsor o financiador al que haya que mostrarle resultados |
| Duración | 1 o 2 días |
| Frecuencia | Ediciones recurrentes: un piloto exitoso se convierte en usuario fijo |
| Ubicación | La Paz, Santa Cruz y Cochabamba para empezar |
| Contacto | Organizadores que el equipo ya conoce |

## 5. Orden de entrada

| Etapa | Qué hacer | Objetivo |
|---|---|---|
| **1. Primeros 3 meses** | 3–5 eventos comunitarios gratis (GDG, meetups, clubes) | Casos reales y reportes que mostrar |
| **2. Con casos en mano** | Vender el plan Programa a fundaciones, ecosistemas, universidades y cooperación | Primeros ingresos |
| **3. Después** | Ferias comerciales con cobro por transacción | Escala |

Ver también el [Roadmap](../01-producto/06-roadmap.md).
