import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const backendDir = path.resolve(__dirname, '..');
const dbPath = path.join(backendDir, 'prisma', 'test.db');

// Set environment
process.env.TEST_DATABASE_URL = `file:${dbPath}`;
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.REDIS_URL = '';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT = '3456';

// Remove old test db
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

// Generate Prisma client for SQLite
execSync('npx prisma generate --schema=prisma/schema.test.prisma', {
  cwd: backendDir,
  stdio: 'inherit',
});

// Run migrations
execSync('npx prisma db push --schema=prisma/schema.test.prisma --accept-data-loss', {
  cwd: backendDir,
  stdio: 'inherit',
});

console.log('Test database setup complete!');
console.log(`Database: ${dbPath}`);
