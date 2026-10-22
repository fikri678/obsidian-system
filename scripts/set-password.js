/**
 * Tukar kata laluan mana-mana akaun (untuk deployment produksi).
 * Penggunaan: node scripts/set-password.js <email> <kata-laluan-baru>
 */
import { bootstrapDatabase, closeDb } from '../src/db/index.js';
import { usersRepo } from '../src/db/repositories/users.repo.js';
import { hashPassword } from '../src/lib/password.js';
import { stamp } from '../src/lib/time.js';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Penggunaan: node scripts/set-password.js <email> <kata-laluan-baru>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Kata laluan mesti sekurang-kurangnya 8 aksara.');
  process.exit(1);
}

const { db } = await bootstrapDatabase({ seedIfEmpty: false });
const users = usersRepo(db);
const user = await users.findByEmail(email);

if (!user) {
  console.error(`Akaun tidak dijumpai: ${email}`);
  await closeDb();
  process.exit(1);
}

await users.update(user.id, { passwordHash: await hashPassword(password), updatedAt: stamp() });
await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);

console.log(`Kata laluan dikemas kini untuk ${user.email} (${user.role}). Semua sesi lama ditamatkan.`);
await closeDb();
