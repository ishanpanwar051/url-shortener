import { PrismaClient } from '@prisma/client';
import { config } from './config';

function createClient(databaseUrl: string): PrismaClient {
  if (process.env.USE_TEST_DB === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient: TestPrismaClient } = require('../node_modules/.prisma-test/client');
    return new TestPrismaClient({ datasources: { db: { url: databaseUrl } } });
  }
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

const prisma = createClient(config.databaseUrl);
const prismaRead = createClient(config.replicaDatabaseUrl);

export { prisma, prismaRead };
export default prisma;
