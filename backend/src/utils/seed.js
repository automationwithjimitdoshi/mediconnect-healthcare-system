// utils/seed.js — Realistic seed data for development/demo
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding MediConnect database...\n');

  // ── Doctors ────────────────────────────────────────
  const doctorData = [
    { email:'dr.ravi@mediconnect.ai', firstName:'Ravi', lastName:'Kumar', specialty:'Endocrinology & Diabetology', qualification:'MD, DM (Endocrinology)', hospital:'Apollo Hospitals, Bangalore', phone:'+919900112233', consultFee:80000 },
    { email:'dr.meena@mediconnect.ai', firstName:'Meena', lastName:'Iyer', specialty:'Cardiology', qualification:'MD, DM (Cardiology), FRCP', hospital:'Fortis Heart Institute, Bangalore', phone:'+919900223344', consultFee:100000 },
    { email:'dr.suresh@mediconnect.ai', firstName:'Suresh', lastName:'Nair', specialty:'Pulmonology', qualification:'MD, DM (Pulmonology)', hospital:'Manipal Hospital, Bangalore', phone:'+919900334455', consultFee:70000 },
    { email:'dr.anita@mediconnect.ai', firstName:'Anita', lastName:'Desai', specialty:'Psychiatry & Neurology', qualification:'MD (Psychiatry), DPM', hospital:'NIMHANS Affiliated Clinic', phone:'+919900445566', consultFee:60000 },
    { email:'dr.kiran@mediconnect.ai', firstName:'Kiran', lastName:'Reddy', specialty:'Nephrology', qualification:'MD, DM (Nephrology)', hospital:'Max Hospital, Bangalore', phone:'+919900556677', consultFee:90000 }
  ];

  const doctors = [];
  for (const d of doctorData) {
    const hash = await bcrypt.hash('Doctor@123', 12);
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: {
        email: d.email, passwordHash: hash, role: 'DOCTOR',
        doctor: { create: {
          firstName: d.firstName, lastName: d.lastName, specialty: d.specialty,
          qualification: d.qualification, hospital: d.hospital,
          phone: d.phone, consultFee: d.consultFee,
          slots: {
            create: [
              { dayOfWeek: 1, startTime: '09:00', endTime: '09:30' },
              { dayOfWeek: 1, startTime: '09:30', endTime: '10:00' },
              { dayOfWeek: 1, startTime: '10:00', endTime: '10:30' },
              { dayOfWeek: 1, startTime: '10:30', endTime: '11:00' },
              { dayOfWeek: 1, startTime: '14:00', endTime: '14:30' },
              { dayOfWeek: 2, startTime: '09:00', endTime: '09:30' },
              { dayOfWeek: 2, startTime: '10:00', endTime: '10:30' },
              { dayOfWeek: 3, startTime: '09:00', endTime: '09:30' },
              { dayOfWeek: 3, startTime: '11:00', endTime: '11:30' },
              { dayOfWeek: 4, startTime: '14:00', endTime: '14:30' },
              { dayOfWeek: 5, startTime: '09:00', endTime: '09:30' },
            ]
          }
        }}
      },
      include: { doctor: true }
    });
    doctors.push(user.doctor);
    console.log(`✅ Doctor: ${d.firstName} ${d.lastName} (${d.specialty})`);
  }

  // ── Patients ────────────────────────────────────────
  const patientData = [
    {
      email:'priya.sharma@gmail.com', firstName:'Priya', lastName:'Sharma',
      phone:'+919820155473', dob:'1990-08-14', gender:'Female', blood:'B+',
      address:'Flat 12B, Shivaji Nagar, Pune',
      insurance:'Star Health', policy:'SH-2024-88102',
      conditions:['Type 2 Diabetes Mellitus','Hypertension Stage 1','Dyslipidemia'],
      allergies:[{allergen:'Penicillin',severity:'Moderate'},{allergen:'Sulfa drugs',severity:'Mild'}],
      meds:[
        {name:'Metformin',dose:'1000mg',frequency:'BD'},
        {name:'Amlodipine',dose:'5mg',frequency:'OD'},
        {name:'Atorvastatin',dose:'20mg',frequency:'OD at night'}
      ],
      vitals:{bp:'138/88',pulse:84,temperature:98.6,spo2:97,bmi:27.4,hba1c:8.2,fbs:248}
    },
    {
      email:'arjun.mehta@gmail.com', firstName:'Arjun', lastName:'Mehta',
      phone:'+919987012345', dob:'1973-03-22', gender:'Male', blood:'O+',
      address:'14, MG Road, Bangalore',
      insurance:'New India Assurance', policy:'NIA-2023-44219',
      conditions:['Ischemic Heart Disease','Post-MI (March 2023)','Hyperthyroidism'],
      allergies:[{allergen:'Aspirin',severity:'Mild GI intolerance'}],
      meds:[
        {name:'Clopidogrel',dose:'75mg',frequency:'OD'},
        {name:'Atorvastatin',dose:'40mg',frequency:'OD'},
        {name:'Carvedilol',dose:'12.5mg',frequency:'BD'},
        {name:'Methimazole',dose:'10mg',frequency:'OD'}
      ],
      vitals:{bp:'124/78',pulse:68,temperature:98.2,spo2:98,bmi:25.1,hba1c:5.4,fbs:94}
    },
    {
      email:'sneha.kulkarni@gmail.com', firstName:'Sneha', lastName:'Kulkarni',
      phone:'+919123467890', dob:'1997-12-05', gender:'Female', blood:'A+',
      address:'203, Koregaon Park, Pune',
      insurance:'ICICI Lombard', policy:'ICL-2025-11203',
      conditions:['Generalised Anxiety Disorder','Migraine with Aura','Chronic Insomnia'],
      allergies:[],
      meds:[
        {name:'Escitalopram',dose:'10mg',frequency:'OD morning'},
        {name:'Propranolol',dose:'40mg',frequency:'OD (migraine prophylaxis)'},
        {name:'Melatonin',dose:'3mg',frequency:'OD at bedtime'}
      ],
      vitals:{bp:'110/70',pulse:72,temperature:98.4,spo2:99,bmi:22.3,hba1c:5.1,fbs:88}
    },
    {
      email:'rohan.verma@gmail.com', firstName:'Rohan', lastName:'Verma',
      phone:'+919800233456', dob:'1960-07-19', gender:'Male', blood:'AB-',
      address:'7, Sainik Colony, Delhi',
      insurance:'Oriental Insurance', policy:'OI-2024-77811',
      conditions:['COPD Stage II (GOLD)','Type 2 Diabetes Mellitus','CKD Stage 3b'],
      allergies:[{allergen:'NSAIDs',severity:'Severe'},{allergen:'Contrast dye',severity:'Moderate'}],
      meds:[
        {name:'Tiotropium',dose:'18mcg',frequency:'OD via inhaler'},
        {name:'Salbutamol MDI',dose:'100mcg',frequency:'PRN'},
        {name:'Insulin Glargine',dose:'20 units SC',frequency:'OD at bedtime'},
        {name:'Sitagliptin',dose:'50mg',frequency:'OD (renal dose adjusted)'}
      ],
      vitals:{bp:'142/90',pulse:76,temperature:98.8,spo2:93,bmi:23.8,hba1c:8.8,fbs:162}
    }
  ];

  const hash = await bcrypt.hash('Patient@123', 12);
  const patients = [];

  for (const p of patientData) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email, passwordHash: hash, role: 'PATIENT',
        patient: {
          create: {
            firstName: p.firstName, lastName: p.lastName, phone: p.phone,
            dateOfBirth: new Date(p.dob), gender: p.gender, bloodType: p.blood,
            address: p.address, insuranceProvider: p.insurance, policyNumber: p.policy,
            conditions:  { create: p.conditions.map(c => ({ condition: c })) },
            allergies:   { create: p.allergies.map(a => ({ allergen: a.allergen, severity: a.severity })) },
            medications: { create: p.meds.map(m => ({ name: m.name, dose: m.dose, frequency: m.frequency })) },
            vitals: { create: [p.vitals] }
          }
        }
      },
      include: { patient: true }
    });
    patients.push(user.patient);
    console.log(`✅ Patient: ${p.firstName} ${p.lastName}`);
  }

  // ── Appointments with Chat Rooms ───────────────────
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 2); tomorrow.setHours(10, 30, 0, 0);
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7); nextWeek.setHours(14, 0, 0, 0);

  const appt1 = await prisma.appointment.upsert({
    where: { id: 'seed-appt-001' },
    update: {},
    create: {
      id: 'seed-appt-001',
      patientId: patients[0].id, doctorId: doctors[0].id,
      scheduledAt: tomorrow, type: 'IN_PERSON', status: 'CONFIRMED',
      room: 'OPD-204', reason: 'HbA1c follow-up and BP management review',
      urgency: 'HIGH',
      aiSummary: 'Patient Priya Sharma (34F, T2DM + HTN) presents with worsening glycemic control — HbA1c climbed to 8.2%. She reports chest tightness x2 days requiring urgent cardiovascular evaluation. BP remains uncontrolled at 138/88 mmHg. Recommend ECG, lipid panel, and urine microalbumin today.',
      chatRoom: { create: {} }
    },
    include: { chatRoom: true }
  });

  await prisma.appointment.upsert({
    where: { id: 'seed-appt-002' },
    update: {},
    create: {
      id: 'seed-appt-002',
      patientId: patients[3].id, doctorId: doctors[2].id,
      scheduledAt: new Date(), type: 'IN_PERSON', status: 'CONFIRMED',
      room: 'OPD-108', reason: 'URGENT: SpO2 drop + COPD review',
      urgency: 'CRITICAL',
      aiSummary: 'CRITICAL: Rohan Verma (65M, COPD Stage II + CKD 3b) shows SpO2 dropped to 93%. eGFR fallen from 48 to 41 — nephrologist referral required. FBS elevated at 162 mg/dL. Do NOT use contrast for imaging.',
      chatRoom: { create: {} }
    },
    include: { chatRoom: true }
  });

  // ── Seed messages for chat ─────────────────────────
  if (appt1.chatRoom) {
    const chatRoomId = appt1.chatRoom.id;
    const msgs = [
      { from:'patient', text:'Hello Doctor, I\'ve been feeling dizzy since yesterday and my sugar readings at home are 240-260 mg/dL consistently.' },
      { from:'doctor',  text:'Hello Priya, those readings are concerning. Have you missed any Metformin doses recently?' },
      { from:'patient', text:'I missed 2 doses last week due to travel. Also attaching my blood report from this morning.' },
      { from:'patient', text:'Doctor, also for the past 2 days I\'ve been having chest tightness and mild shortness of breath especially on climbing stairs.', urgent:true },
      { from:'doctor',  text:'Priya, the chest tightness with breathlessness is urgent. I\'ve flagged this and scheduled you for a cardiology consultation. Please go to the ER if symptoms worsen.' }
    ];
    for (const m of msgs) {
      await prisma.message.create({
        data: {
          chatRoomId,
          senderId:   m.from === 'patient' ? 'seed-patient-1' : 'seed-doctor-1',
          senderRole: m.from === 'patient' ? 'PATIENT' : 'DOCTOR',
          patientId:  m.from === 'patient' ? patients[0].id : null,
          doctorId:   m.from === 'doctor'  ? doctors[0].id : null,
          type: 'TEXT',
          content: m.text,
          isUrgent: !!m.urgent
        }
      });
    }
  }

  // ── Timeline entries ───────────────────────────────
  await prisma.clinicalTimeline.createMany({
    data: [
      { patientId:patients[0].id, title:'Blood Report Uploaded', description:'HbA1c: 8.2% — flagged high by AI', category:'report', occurredAt: new Date('2026-03-15') },
      { patientId:patients[0].id, title:'Consultation — Dr. Ravi Kumar', description:'Reviewed BP management, adjusted diet plan', category:'visit', occurredAt: new Date('2026-03-12') },
      { patientId:patients[0].id, title:'Prescription Renewed', description:'Metformin 1000mg BD + Amlodipine 5mg OD', category:'prescription', occurredAt: new Date('2026-03-05') },
      { patientId:patients[3].id, title:'URGENT: SpO2 Alert', description:'Patient reported breathlessness, SpO2 93%', category:'alert', occurredAt: new Date('2026-03-17') },
      { patientId:patients[3].id, title:'Renal Function Panel', description:'eGFR: 41 mL/min — Stage 3b CKD confirmed', category:'report', occurredAt: new Date('2026-03-15') }
    ],
    skipDuplicates: true
  });

  console.log('\n✅ Database seeded successfully!');
  console.log('\n🔐 Demo Login Credentials:');
  console.log('   Patient: priya.sharma@gmail.com / Patient@123');
  console.log('   Doctor:  dr.ravi@mediconnect.ai  / Doctor@123');
  console.log('\nOther patients: arjun.mehta@gmail.com, sneha.kulkarni@gmail.com, rohan.verma@gmail.com');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
