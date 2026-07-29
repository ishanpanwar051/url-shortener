"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaRead = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const config_1 = require("./config");
function createClient(databaseUrl) {
    if (process.env.USE_TEST_DB === 'true') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PrismaClient: TestPrismaClient } = require('../node_modules/.prisma-test/client');
        return new TestPrismaClient({ datasources: { db: { url: databaseUrl } } });
    }
    return new client_1.PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
const prisma = createClient(config_1.config.databaseUrl);
exports.prisma = prisma;
const prismaRead = createClient(config_1.config.replicaDatabaseUrl);
exports.prismaRead = prismaRead;
exports.default = prisma;
//# sourceMappingURL=db.js.map