import { createHash } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Uso: node scripts/hash-password.mjs "uma-senha-com-12-ou-mais-caracteres"');
  process.exit(1);
}
console.log(createHash('sha256').update(password).digest('hex'));
