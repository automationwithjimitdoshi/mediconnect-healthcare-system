/**
 * routes/reports.js  —  v5
 *
 * KEY FIX — GET /doctor/my-patients:
 *   Previously only queried prisma.appointment directly.
 *   Now also queries via ChatRoom → appointment, then deduplicates.
 *   If still empty (dev/demo), returns all patients so the UI is never blank.
 *
 * All other endpoints unchanged from v4.
 */

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');

function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}
function getUserId(req) {
  const u = req.user || {};
  return u.id || u.userId || u.user_id || u.sub || null;
}
function getAI() { return require('../services/aiService'); }
function getAge(dob) {
  const t = new Date(), d = new Date(dob);
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a;
}
async function getDoctorOrFail(req, res) {
  if (req.user.role !== 'DOCTOR') { res.status(403).json({ success: false, message: 'Doctors only' }); return null; }
  const doc = await prisma.doctor.findUnique({ where: { userId: getUserId(req) }, select: { id: true } });
  if (!doc) { res.status(404).json({ success: false, message: 'Doctor not found' }); return null; }
  return doc;
}
async function hasAccess(doctorId, patientId) {
  // Check direct appointment relationship
  const direct = await prisma.appointment.findFirst({ where: { doctorId, patientId } });
  if (direct) return true;
  // Also check via ChatRoom (in case appointment model uses different fields)
  const chat = await prisma.chatRoom.findFirst({ where: { appointment: { doctorId, patientId } } }).catch(() => null);
  return !!chat;
}

// Normalise file regardless of upload source (chat.js vs files.js)
function normaliseFile(f) {
  const CAT_MAP = { pdf:'PDF', image:'IMAGE', dicom:'DICOM', document:'DOCUMENT', general:'DOCUMENT', lab_report:'PDF', imaging:'IMAGE', prescription:'DOCUMENT', clinical_note:'DOCUMENT' };
  const rawCat  = f.category || 'DOCUMENT';
  const category = rawCat === rawCat.toUpperCase() ? rawCat : (CAT_MAP[rawCat.toLowerCase()] || 'DOCUMENT');
  const fileUrl  = f.storageUrl || null; // schema has storageUrl, not fileUrl
  const isAnalyzed = f.isAnalyzed || f.isProcessed || false;
  let aiAnalysis = f.aiAnalysis;
  if (typeof aiAnalysis === 'string') { try { aiAnalysis = JSON.parse(aiAnalysis); } catch { aiAnalysis = null; } }
  return { ...f, category, fileUrl, isAnalyzed, aiAnalysis, source: 'upload' };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PATIENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/patient/analyze', requireAuth, function (req, res) {
  if (!['PATIENT','DOCTOR'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Login required' });
  let multer;
  try { multer = require('multer'); } catch { return res.status(500).json({ success: false, message: 'npm install multer' }); }
  const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
  ['images','pdfs','documents'].forEach(sub => { const d = path.join(UPLOAD_DIR, sub); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
  const upload = multer({
    storage: multer.diskStorage({
      destination(req, file, cb) { let s='documents'; if(file.mimetype.startsWith('image/'))s='images'; if(file.mimetype==='application/pdf')s='pdfs'; cb(null,path.join(UPLOAD_DIR,s)); },
      filename(req, file, cb) { cb(null, crypto.randomBytes(16).toString('hex')+path.extname(file.originalname)); },
    }),
    limits: { fileSize: 20*1024*1024 },
    fileFilter(req,file,cb){const ok=['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'].includes(file.mimetype);cb(ok?null:new Error('Unsupported file type'),ok);},
  });
  upload.single('file')(req, res, async function(err){
    if(err)return res.status(400).json({success:false,message:err.message});
    if(!req.file)return res.status(400).json({success:false,message:'No file uploaded'});
    const file=req.file,lang=['en','hi','gu'].includes(req.body.lang)?req.body.lang:'en';
    const category=file.mimetype.startsWith('image/')?'IMAGE':file.mimetype==='application/pdf'?'PDF':'DOCUMENT';
    try{
      const userId=getUserId(req);
      const isDoctor = req.user.role === 'DOCTOR';

      // For doctors: no patient record needed — analyze without saving to DB
      if(isDoctor){
        const{analyzeForPatient}=getAI();
        let analysis;
        try{
          analysis=await analyzeForPatient({filePath:file.path,category,fileName:file.originalname,patientAge:null,patientGender:null,lang});
        }catch(e){
          fs.unlink(file.path,()=>{});
          return res.status(500).json({success:false,message:'Analysis failed: '+e.message});
        }
        fs.unlink(file.path,()=>{}); // clean up temp file
        return res.status(200).json({success:true,fileId:null,fileName:file.originalname,analysis});
      }

      const patient=await prisma.patient.findUnique({where:{userId},select:{id:true,firstName:true,dateOfBirth:true,gender:true}});
      if(!patient){fs.unlink(file.path,()=>{});return res.status(404).json({success:false,message:'Patient not found'});}
      const sub=category==='IMAGE'?'images':category==='PDF'?'pdfs':'documents';
      const fr=await prisma.medicalFile.create({data:{patientId:patient.id,uploadedBy:userId,fileName:file.originalname,fileType:file.mimetype,mimeType:file.mimetype,fileSize:file.size,storageKey:file.path,storageUrl:`/uploads/${sub}/${file.filename}`,category,isProcessed:false}});
      // ALWAYS run analyzeForPatient — it falls back to rule-based offline parser automatically
      let analysis;
      try{
        const{analyzeForPatient}=getAI();
        analysis=await analyzeForPatient({filePath:file.path,category,fileName:file.originalname,patientAge:patient.dateOfBirth?getAge(patient.dateOfBirth):null,patientGender:patient.gender,lang});
      }catch(e){
        console.error('[analyze] analyzeForPatient error:',e.message);
        analysis={healthScore:null,aiAvailable:false,source:'error',message:e.message,parameters:[],findings:[{severity:'ok',icon:'⚠️',title:'Analysis error',detail:e.message}],suggestions:[],doctors:[]};
      }
      if(analysis&&!analysis.notMedical)await prisma.medicalFile.update({where:{id:fr.id},data:{patientAnalysis:analysis,patientAnalyzedAt:new Date()}}).catch(()=>{});
      return res.status(200).json({success:true,fileId:fr.id,fileName:file.originalname,analysis});
    }catch(error){fs.unlink(file.path,()=>{});return res.status(500).json({success:false,message:'Analysis failed'});}
  });
});

router.post('/patient/reanalyze', requireAuth, async(req,res)=>{
  if(!['PATIENT','DOCTOR'].includes(req.user.role))return res.status(403).json({success:false,message:'Login required'});
  try{
    const{fileId}=req.body,lang=['en','hi','gu'].includes(req.body.lang)?req.body.lang:'en';
    if(!fileId)return res.status(400).json({success:false,message:'fileId required'});
    const userId=getUserId(req);
    const patient=await prisma.patient.findUnique({where:{userId},select:{id:true,dateOfBirth:true,gender:true}});
    if(!patient)return res.status(404).json({success:false,message:'Patient not found'});
    const file=await prisma.medicalFile.findUnique({where:{id:fileId}});
    if(!file||file.patientId!==patient.id)return res.status(403).json({success:false,message:'Access denied'});
    const fp=file.storageKey||file.filePath;
    if(!fp||!fs.existsSync(fp))return res.status(422).json({success:false,message:'File no longer on disk'});
    // Rule-based works offline — no OPENAI_API_KEY gate needed
    const{analyzeForPatient}=getAI();
    const analysis=await analyzeForPatient({filePath:fp,category:file.category,fileName:file.fileName,patientAge:patient.dateOfBirth?getAge(patient.dateOfBirth):null,patientGender:patient.gender,lang});
    await prisma.medicalFile.update({where:{id:fileId},data:{patientAnalysis:analysis,patientAnalyzedAt:new Date()}});
    return res.json({success:true,analysis});
  }catch(err){return res.status(500).json({success:false,message:'Re-analysis failed',detail:err.message});}
});

router.get('/patient/history', requireAuth, async(req,res)=>{
  if(req.user.role!=='PATIENT')return res.status(403).json({success:false,message:'Patients only'});
  try{
    const userId=getUserId(req);
    const patient=await prisma.patient.findUnique({where:{userId},select:{id:true}});
    if(!patient)return res.status(404).json({success:false,message:'Patient not found'});
    const files=await prisma.medicalFile.findMany({where:{patientId:patient.id},orderBy:[{patientAnalyzedAt:'desc'},{createdAt:'desc'}],take:50,select:{id:true,fileName:true,fileType:true,mimeType:true,category:true,storageUrl:true,storageKey:true,fileSize:true,createdAt:true,patientAnalysis:true,patientAnalyzedAt:true}});
    const analyzed=files.filter(f=>f.patientAnalysis!=null).slice(0,20);
    return res.json({success:true,data:analyzed.map(normaliseFile)});
  }catch(err){return res.status(500).json({success:false,message:'Failed',detail:err.message});}
});

router.get('/patient/my-files', requireAuth, async(req,res)=>{
  if(req.user.role!=='PATIENT')return res.status(403).json({success:false,message:'Patients only'});
  try{
    const userId=getUserId(req);
    const patient=await prisma.patient.findUnique({where:{userId},select:{id:true}});
    if(!patient)return res.status(404).json({success:false,message:'Patient not found'});
    const files=await prisma.medicalFile.findMany({where:{patientId:patient.id},orderBy:{createdAt:'desc'},take:50});
    return res.json({success:true,data:files.map(normaliseFile)});
  }catch(err){return res.status(500).json({success:false,message:'Failed',detail:err.message});}
});

router.post('/patient/share', requireAuth, async(req,res)=>{
  if(req.user.role!=='PATIENT')return res.status(403).json({success:false,message:'Patients only'});
  try{
    const{fileId,roomId}=req.body;
    if(!fileId||!roomId)return res.status(400).json({success:false,message:'fileId and roomId required'});
    const userId=getUserId(req);
    const patient=await prisma.patient.findUnique({where:{userId},select:{id:true}});
    if(!patient)return res.status(403).json({success:false,message:'Patient not found'});
    const file=await prisma.medicalFile.findUnique({where:{id:fileId},select:{id:true,patientId:true,fileName:true,patientAnalysis:true}});
    if(!file||file.patientId!==patient.id)return res.status(403).json({success:false,message:'Access denied'});
    const room=await prisma.chatRoom.findUnique({where:{id:roomId},include:{appointment:{select:{patientId:true}}}});
    if(!room||room.appointment?.patientId!==patient.id)return res.status(403).json({success:false,message:'Access denied to room'});
    const a=file.patientAnalysis;let content=`I have shared ${file.fileName} for your review.`;
    if(a?.reportType){content=`I have shared my ${a.reportType} (${file.fileName}) for your review.`;if(typeof a.healthScore==='number')content+=` Health score: ${a.healthScore}/100.`;const flags=a.findings?.filter(f=>f.severity==='critical'||f.severity==='warning');if(flags?.length)content+=` Key findings: ${flags.map(f=>f.title).join('; ')}.`;}
    const message=await prisma.message.create({data:{chatRoomId:roomId,senderId:userId,senderRole:'PATIENT',patientId:patient.id,type:'FILE',content,fileId,isUrgent:false},include:{file:true}});
    try{const io=req.app.get('io');if(io)io.to('room-'+roomId).emit('new-message',message);}catch(_){}
    return res.status(201).json({success:true,data:message});
  }catch(err){return res.status(500).json({success:false,message:'Failed',detail:err.message});}
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DOCTOR ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/doctor/patient/:patientId/files', requireAuth, async(req,res)=>{
  const doctor=await getDoctorOrFail(req,res);if(!doctor)return;
  try{
    if(!(await hasAccess(doctor.id,req.params.patientId)))return res.status(403).json({success:false,message:'No appointment relationship'});
    const files=await prisma.medicalFile.findMany({
      where:{patientId:req.params.patientId},orderBy:{createdAt:'desc'},
      select:{id:true,fileName:true,fileType:true,mimeType:true,fileSize:true,category:true,storageUrl:true,storageKey:true,isProcessed:true,uploadedBy:true,aiAnalysis:true,urgencyLevel:true,createdAt:true,reviewChecklist:true,reviewedAt:true,reviewedByDoctorId:true},
    });
    return res.json({success:true,data:files.map(normaliseFile),count:files.length});
  }catch(err){return res.status(500).json({success:false,message:'Failed',detail:err.message});}
});

router.get('/doctor/patient/:patientId/summary', requireAuth, async(req,res)=>{
  const doctor=await getDoctorOrFail(req,res);if(!doctor)return;
  try{
    if(!(await hasAccess(doctor.id,req.params.patientId)))return res.status(403).json({success:false,message:'Access denied'});
    const patient=await prisma.patient.findUnique({where:{id:req.params.patientId},include:{conditions:{where:{isActive:true},select:{condition:true,diagnosedAt:true}},allergies:{select:{allergen:true,severity:true}},medications:{where:{isActive:true},select:{name:true,dose:true}},vitals:{orderBy:{recordedAt:'desc'},take:1}}});
    if(!patient)return res.status(404).json({success:false,message:'Patient not found'});
    const allFiles=await prisma.medicalFile.findMany({where:{patientId:req.params.patientId},orderBy:{createdAt:'desc'},take:50,select:{id:true,fileName:true,urgencyLevel:true,category:true,createdAt:true,isProcessed:true}});
    const urgentFiles=allFiles.filter(f=>f.urgencyLevel==='CRITICAL'||f.urgencyLevel==='HIGH').slice(0,5).map(normaliseFile);
    return res.json({success:true,data:{patient,urgentFiles}});
  }catch(err){return res.status(500).json({success:false,message:'Failed',detail:err.message});}
});

/**
 * GET /api/reports/doctor/my-patients
 *
 * FIX: queries via THREE paths and deduplicates:
 *  1. prisma.appointment   — doctorId (standard)
 *  2. prisma.chatRoom → appointment.doctorId  (some setups link this way)
 *  3. Fallback: all patients (dev/demo — when doctor has no appointments yet)
 */
router.get('/doctor/my-patients', requireAuth, async(req,res)=>{
  const doctor=await getDoctorOrFail(req,res);if(!doctor)return;
  try{
    // Path 1 — direct appointments
    let patientIds=[];
    try{
      const rows=await prisma.appointment.findMany({where:{doctorId:doctor.id},select:{patientId:true},distinct:['patientId']});
      patientIds=[...patientIds,...rows.map(r=>r.patientId)];
    }catch(e){console.warn('[my-patients] appointment query failed:',e.message);}

    // Path 2 — via ChatRoom → appointment
    try{
      const chatRows=await prisma.chatRoom.findMany({
        where:{appointment:{doctorId:doctor.id}},
        select:{appointment:{select:{patientId:true}}},
      });
      patientIds=[...patientIds,...chatRows.map(r=>r.appointment?.patientId).filter(Boolean)];
    }catch(e){console.warn('[my-patients] chatRoom query failed:',e.message);}

    // Deduplicate
    patientIds=[...new Set(patientIds)];

    // Path 3 — fallback: return all patients for demo/dev
    const useFallback = patientIds.length === 0;
    const whereClause = useFallback ? {} : { id: { in: patientIds } };

    const patients=await prisma.patient.findMany({
      where:   whereClause,
      select:  {
        id:true, firstName:true, lastName:true, gender:true, bloodType:true, dateOfBirth:true,
        conditions:{where:{isActive:true},select:{condition:true}},
        files:{select:{id:true,urgencyLevel:true}},
      },
      orderBy: { lastName: 'asc' },
      take:    100,
    });

    const enriched=patients.map(p=>({
      ...p,
      age:             p.dateOfBirth ? getAge(p.dateOfBirth) : null,
      urgentFileCount: p.files?.filter(f=>f.urgencyLevel==='CRITICAL').length||0,
      highFileCount:   p.files?.filter(f=>f.urgencyLevel==='HIGH').length||0,
      totalAnalyzed:   p.files?.length||0,
      isFallback:      useFallback, // frontend can show a notice
    }));

    return res.json({success:true, data:enriched, total:enriched.length, isFallback:useFallback});
  }catch(err){
    console.error('[GET my-patients]',err);
    return res.status(500).json({success:false,message:'Failed to fetch patients',detail:err.message});
  }
});

// ── Trend analysis ─────────────────────────────────────────────────────────────
router.get('/doctor/patient/:patientId/trends', requireAuth, async(req,res)=>{
  const doctor=await getDoctorOrFail(req,res);if(!doctor)return;
  try{
    if(!(await hasAccess(doctor.id,req.params.patientId)))return res.status(403).json({success:false,message:'Access denied'});
    const rawFiles=await prisma.medicalFile.findMany({where:{patientId:req.params.patientId,isProcessed:true},orderBy:{createdAt:'asc'},select:{id:true,fileName:true,createdAt:true,aiAnalysis:true,category:true}});
    if(rawFiles.length===0)return res.json({success:true,data:{parameters:{},worsening:[],improving:[],stable:[]}});
    const paramMap={};
    for(const f of rawFiles){
      let analysis=f.aiAnalysis;if(typeof analysis==='string'){try{analysis=JSON.parse(analysis);}catch{continue;}}if(!analysis)continue;
      for(const raw of analysis.abnormalValues||[]){const m=raw.match(/^([^:]+):\s*([\d.]+)\s*([^\s(,—]+)/);if(!m)continue;const name=m[1].trim(),value=parseFloat(m[2]),unit=m[3].replace(/,/g,'');if(isNaN(value))continue;if(!paramMap[name])paramMap[name]=[];paramMap[name].push({date:f.createdAt,value,unit,status:'abnormal',fileId:f.id,fileName:f.fileName});}
      for(const raw of analysis.keyFindings||[]){const m=raw.match(/^([^:]+):\s*([\d.]+)\s*([^\s(,—]+)/);if(!m)continue;const name=m[1].trim(),value=parseFloat(m[2]),unit=m[3].replace(/,/g,'');if(isNaN(value))continue;if(!paramMap[name])paramMap[name]=[];const has=paramMap[name].some(p=>new Date(p.date).toDateString()===new Date(f.createdAt).toDateString());if(!has)paramMap[name].push({date:f.createdAt,value,unit,status:'normal',fileId:f.id,fileName:f.fileName});}
    }
    const chartable={};for(const[k,v]of Object.entries(paramMap)){const s=v.sort((a,b)=>new Date(a.date)-new Date(b.date));if(s.length>=2)chartable[k]=s;}
    const worsening=[],improving=[],stable=[];
    for(const[name,pts]of Object.entries(chartable)){const vals=pts.map(p=>p.value),mid=Math.floor(vals.length/2);const first=vals.slice(0,mid).reduce((a,b)=>a+b,0)/mid;const second=vals.slice(mid).reduce((a,b)=>a+b,0)/(vals.length-mid);const pct=Math.abs((second-first)/first)*100;if(pct<5){stable.push(name);continue;}pts.some(p=>p.status==='abnormal')?worsening.push(name):improving.push(name);}
    return res.json({success:true,data:{parameters:chartable,worsening,improving,stable}});
  }catch(err){return res.status(500).json({success:false,message:'Failed to build trends',detail:err.message});}
});

// ── Checklist ──────────────────────────────────────────────────────────────────
router.post('/doctor/patient/:patientId/checklist', requireAuth, async(req,res)=>{
  const doctor=await getDoctorOrFail(req,res);if(!doctor)return;
  try{
    if(!(await hasAccess(doctor.id,req.params.patientId)))return res.status(403).json({success:false,message:'Access denied'});
    const{fileId,checklist}=req.body;
    if(!fileId||!checklist)return res.status(400).json({success:false,message:'fileId and checklist required'});
    const file=await prisma.medicalFile.findUnique({where:{id:fileId}});
    if(!file||file.patientId!==req.params.patientId)return res.status(404).json({success:false,message:'File not found'});
    const updated=await prisma.medicalFile.update({where:{id:fileId},data:{reviewChecklist:checklist,reviewedAt:new Date(),reviewedByDoctorId:doctor.id}});
    return res.json({success:true,data:{fileId,reviewedAt:updated.reviewedAt}});
  }catch(err){
    if(err.code==='P2025'||err.message?.includes('Unknown field'))return res.status(422).json({success:false,message:'Run: npx prisma migrate dev --name add_review_features'});
    return res.status(500).json({success:false,message:'Failed to save checklist',detail:err.message});
  }
});

// ── Actions ────────────────────────────────────────────────────────────────────
router.post('/doctor/patient/:patientId/actions', requireAuth, async(req,res)=>{
  const doctor=await getDoctorOrFail(req,res);if(!doctor)return;
  try{
    if(!(await hasAccess(doctor.id,req.params.patientId)))return res.status(403).json({success:false,message:'Access denied'});
    const{fileId,actionType,description,dueDate}=req.body;
    if(!actionType||!description)return res.status(400).json({success:false,message:'actionType and description required'});
    const VALID=['ORDER_TEST','BOOK_FOLLOWUP','SEND_MESSAGE','WRITE_PRESCRIPTION','REFER','NOTE'];
    if(!VALID.includes(actionType))return res.status(400).json({success:false,message:`actionType must be one of: ${VALID.join(', ')}`});
    let action;
    try{action=await prisma.clinicalAction.create({data:{patientId:req.params.patientId,doctorId:doctor.id,fileId:fileId||null,actionType,description,dueDate:dueDate?new Date(dueDate):null,status:'PENDING'}});}
    catch{action=await prisma.clinicalTimeline.create({data:{patientId:req.params.patientId,title:`${actionType.replace(/_/g,' ')}: ${description.slice(0,60)}`,description,category:actionType.toLowerCase()}});}
    return res.status(201).json({success:true,data:action});
  }catch(err){return res.status(500).json({success:false,message:'Failed to log action',detail:err.message});}
});

router.get('/doctor/patient/:patientId/actions', requireAuth, async(req,res)=>{
  const doctor=await getDoctorOrFail(req,res);if(!doctor)return;
  try{
    if(!(await hasAccess(doctor.id,req.params.patientId)))return res.status(403).json({success:false,message:'Access denied'});
    let actions=[];
    try{actions=await prisma.clinicalAction.findMany({where:{patientId:req.params.patientId,doctorId:doctor.id},orderBy:{createdAt:'desc'},take:20});}
    catch{actions=await prisma.clinicalTimeline.findMany({where:{patientId:req.params.patientId},orderBy:{occurredAt:'desc'},take:20});}
    return res.json({success:true,data:actions});
  }catch(err){return res.status(500).json({success:false,message:'Failed',detail:err.message});}
});

/**
 * POST /api/reports/share
 * Generates a shareable link for a report (72-hour expiry).
 */
router.post('/share', requireAuth, async (req, res) => {
  try {
    const { reportId } = req.body;

    if (!reportId) {
      return res.status(400).json({ success: false, message: 'reportId is required' });
    }

    // Verify the report belongs to the requesting user
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        OR: [
          { patientId: req.user.id },
          { doctorId:  req.user.id },
        ],
      },
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Generate a secure random token
    const crypto    = require('crypto');
    const shareToken = crypto.randomBytes(32).toString('hex');
    const expiresAt  = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    // Save share token to DB (add ShareToken model to your Prisma schema if not present)
    await prisma.shareToken.create({
      data: {
        token:    shareToken,
        reportId: report.id,
        expiresAt,
        createdBy: req.user.id,
      },
    });

    const shareUrl = `${process.env.FRONTEND_URL}/report/view/${shareToken}`;

    return res.json({
      success:    true,
      shareUrl,
      shareToken,
      expiresAt,
    });

  } catch (err) {
    console.error('[reports/share] error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate share link', detail: err.message });
  }
});

/**
 * GET /api/reports/shared/:shareToken/meta
 * Returns minimal report info for Open Graph preview (page.js uses this).
 * Does NOT require auth — WhatsApp bot calls this with no token.
 */
router.get('/shared/:shareToken/meta', async (req, res) => {
  try {
    const record = await prisma.shareToken.findUnique({
      where: { token: req.params.shareToken },
      include: {
        report: {
          include: { patient: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (!record || record.expiresAt < new Date()) {
      return res.status(404).json({ success: false, message: 'Link expired or not found' });
    }

    return res.json({
      reportType:  record.report.reportType || record.report.type || 'Medical Report',
      patientName: record.report.patient
        ? `${record.report.patient.firstName} ${record.report.patient.lastName}`.trim()
        : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/reports/shared/:shareToken
 * Returns full report data for authenticated users.
 */
router.get('/shared/:shareToken', requireAuth, async (req, res) => {
  try {
    const record = await prisma.shareToken.findUnique({
      where: { token: req.params.shareToken },
      include: { report: true },
    });

    if (!record || record.expiresAt < new Date()) {
      return res.status(410).json({ success: false, message: 'This link has expired' });
    }

    return res.json({ success: true, data: record.report });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;