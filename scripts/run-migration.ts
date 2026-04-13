import { execSync } from 'child_process';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

try {
  console.log('Running drizzle-kit push...');
  const output = execSync('npx drizzle-kit push', { stdio: 'inherit' });
  console.log('Success!');
} catch (error) {
  console.error('Failed to run drizzle-kit push');
}
