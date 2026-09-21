import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local'), override: true });

async function main() {
  const { reindexAdminPromptEmbeddings } = await import(
    '../server/admin/admin-prompt-embeddings-repo.server'
  );
  const stats = await reindexAdminPromptEmbeddings();
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
