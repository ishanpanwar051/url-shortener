import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      username: 'demo',
      hashedPassword,
    },
  });

  const urls = [
    { shortCode: 'abc123', longUrl: 'https://example.com', userId: user.id },
    { shortCode: 'def456', longUrl: 'https://github.com', userId: user.id },
    { shortCode: 'ghi789', longUrl: 'https://stackoverflow.com', userId: user.id, isActive: false },
  ];

  for (const urlData of urls) {
    await prisma.uRL.upsert({
      where: { shortCode: urlData.shortCode },
      update: {},
      create: urlData,
    });
  }

  console.log('Seed data created successfully');
  console.log(`Demo user: demo@example.com / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
