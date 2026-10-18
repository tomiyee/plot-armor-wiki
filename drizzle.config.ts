import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { resolveDatabaseUrl } from './src/db/url';

dotenv.config({ path: '.env.local' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
