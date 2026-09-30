import 'dotenv/config';
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { pool } from '../server/db.js';

function parseArgs(argv) {
  const args = { admin: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') args.name = argv[++i];
    else if (argv[i] === '--email') args.email = argv[++i];
    else if (argv[i] === '--admin') args.admin = true;
  }
  return args;
}

async function main() {
  const { name, email, admin } = parseArgs(process.argv.slice(2));
  if (!name || !email) {
    console.error('Usage: npm run create-user -- --name "X" --email x@y.com [--admin]');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question('Password (min 10 chars): ');
  rl.close();
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.');
    process.exit(1);
  }

  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  const isAdmin = count === 0 ? true : admin;

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await pool.query(
      'INSERT INTO users (name, email, password_hash, is_admin, is_active) VALUES (?, ?, ?, ?, 1)',
      [name, email.trim().toLowerCase(), passwordHash, isAdmin ? 1 : 0]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.error('A user with that email already exists.');
      process.exit(1);
    }
    throw err;
  }

  console.log(`Created ${isAdmin ? 'admin' : 'user'} ${email}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
