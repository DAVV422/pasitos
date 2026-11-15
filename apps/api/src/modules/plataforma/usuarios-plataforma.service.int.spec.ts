import { eq } from 'drizzle-orm';
import { AppError } from '@pasitos/dominio';
import { bitacora, usuarios } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { hashPassword, verifyPassword } from '../auth/password';
import type { ActorPlataforma } from './eventos-plataforma.service';
import { UsuariosPlataformaService } from './usuarios-plataforma.service';

const COMANDO: ActorPlataforma = {
  tipo: 'sistema',
  id: null,
  nombre: 'Soporte de Pasitos (comando)',
  rol: null,
};

/** Primer administrador de Pasitos (`pnpm plataforma crear-admin`, HU-202 §5). Requiere Docker. */
describe('UsuariosPlataformaService.createUsuario', () => {
  let base: BaseDePrueba;
  let servicio: UsuariosPlataformaService;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    servicio = new UsuariosPlataformaService(base.sistema.db);
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  it('crea el administrador con el correo normalizado, la contraseña en Argon2id y la bitácora', async () => {
    const passwordHash = await hashPassword('una frase larga de prueba');
    const id = await servicio.createUsuario(
      { email: '  Admin.Uno@example.com ', nombre: 'Admin Uno', passwordHash, rol: 'admin' },
      COMANDO,
    );

    const [usuario] = await base.sistema.db.select().from(usuarios).where(eq(usuarios.id, id));
    expect(usuario).toMatchObject({
      email: 'admin.uno@example.com',
      nombre: 'Admin Uno',
      rolPlataforma: 'admin',
      estado: 'activo',
    });
    expect(usuario?.emailVerificadoAt).toBeInstanceOf(Date);
    expect(usuario?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(usuario?.passwordHash ?? '', 'una frase larga de prueba')).toBe(
      true,
    );
    expect(await verifyPassword(usuario?.passwordHash ?? '', 'otra cosa')).toBe(false);

    const filas = await base.sistema.db.select().from(bitacora).where(eq(bitacora.objetoId, id));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      accion: 'plataforma.usuario.create',
      organizacionId: null,
      actorTipo: 'sistema',
      objetoNombre: 'Admin Uno',
      despues: { rolPlataforma: 'admin' },
    });
    expect(JSON.stringify(filas[0])).not.toContain('example.com');
  });

  it('rechaza un correo que ya existe, aunque cambien las mayúsculas', async () => {
    const passwordHash = await hashPassword('una frase larga de prueba');
    await servicio.createUsuario(
      { email: 'admin.dos@example.com', nombre: 'Admin Dos', passwordHash, rol: 'admin' },
      COMANDO,
    );
    const repetido = servicio.createUsuario(
      { email: 'ADMIN.DOS@example.com', nombre: 'Otra', passwordHash, rol: 'soporte' },
      COMANDO,
    );
    await expect(repetido).rejects.toBeInstanceOf(AppError);
    await expect(repetido).rejects.toMatchObject({
      code: 'VALIDACION',
      errors: [{ field: 'email', code: 'YA_EXISTE' }],
    });
  });

  it('rechaza un correo o un nombre inválidos sin escribir nada', async () => {
    const passwordHash = await hashPassword('una frase larga de prueba');
    await expect(
      servicio.createUsuario(
        { email: 'sin-arroba', nombre: 'X', passwordHash, rol: 'admin' },
        COMANDO,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDACION',
      errors: [{ field: 'email' }, { field: 'nombre' }],
    });
  });
});
