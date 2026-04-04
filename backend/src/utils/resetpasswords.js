require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Resetting all passwords...\n');

  const patientHash = await bcrypt.hash('Patient@123', 12);
  const doctorHash  = await bcrypt.hash('Doctor@123',  12);

  const patients = [
    'priya.sharma@gmail.com',
    'arjun.mehta@gmail.com',
    'sneha.kulkarni@gmail.com',
    'rohan.verma@gmail.com'
  ];

  const doctors = [
    'dr.ravi@mediconnect.ai',
    'dr.meena@mediconnect.ai',
    'dr.suresh@mediconnect.ai',
    'dr.anita@mediconnect.ai',
    'dr.kiran@mediconnect.ai'
  ];

  for (const email of patients) {
    const r = await prisma.user.updateMany({
      where: { email },
      data:  { passwordHash: patientHash }
    });
    console.log(`Patient  ${email}: ${r.count} row updated`);
  }

  for (const email of doctors) {
    const r = await prisma.user.updateMany({
      where: { email },
      data:  { passwordHash: doctorHash }
    });
    console.log(`Doctor   ${email}: ${r.count} row updated`);
  }

  console.log('\nDone. Passwords reset:');
  console.log('  Patients → Patient@123');
  console.log('  Doctors  → Doctor@123');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());