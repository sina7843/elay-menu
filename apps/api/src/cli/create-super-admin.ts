// Interactive bootstrap of the FIRST super admin. No fixed or default credential exists.
// Usage (Docker): docker compose exec -it api node dist/cli/create-super-admin.js
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ObjectId } from 'mongodb';
import { NewPasswordSchema, UsernameSchema } from '@elay/shared';
import { hashPassword } from '../auth/password.js';
import { loadConfig } from '../config.js';
import { collections, connect, migrate } from '../db.js';

if (!stdin.isTTY) {
  console.error('This command needs an interactive terminal (use `docker compose exec -it api ...`).');
  process.exit(1);
}

/** Reads a line without echoing it. */
function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = Array.from(value).slice(0, -1).join('');
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const config = loadConfig();
const { client, db } = await connect(config.MONGODB_URI);
try {
  await migrate(db);
  const c = collections(db);
  if (await c.accounts.findOne({ role: 'super_admin' })) {
    console.error('A super admin already exists. This command only creates the first one.');
    process.exitCode = 1;
  } else {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.on('SIGINT', () => process.exit(130));
    const usernameRaw = await rl.question('Super admin username: ');
    rl.close();
    const username = UsernameSchema.safeParse(usernameRaw);
    if (!username.success) throw new Error('Invalid username: 3-32 chars of a-z, 0-9, ".", "_" or "-".');
    const password = await askSecret('Password (min 8, letters and digits): ');
    const check = NewPasswordSchema.safeParse(password);
    if (!check.success) throw new Error('Password does not meet the policy.');
    if ((await askSecret('Repeat password: ')) !== password) throw new Error('Passwords do not match.');
    const now = new Date();
    await c.accounts.insertOne({
      _id: new ObjectId(),
      username: username.data,
      passwordHash: await hashPassword(password),
      role: 'super_admin',
      stallId: null,
      createdAt: now,
      passwordChangedAt: now,
    });
    console.log(`Super admin "${username.data}" created.`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.close();
}
