import { customType } from 'drizzle-orm/pg-core';

/** Correo sin distinguir mayúsculas (extensión `citext`). */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/** Bytes (hashes de tokens, llaves). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
