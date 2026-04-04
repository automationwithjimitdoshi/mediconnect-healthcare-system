'use strict';
/**
 * services/aiService.js
 *
 * OFFLINE-FIRST design — works without any AI API on corporate networks.
 *
 * Strategy:
 *   1. Try OpenAI gpt-4.1-nano if OPENAI_API_KEY is set AND reachable
 *   2. Fall back to built-in rule-based analyzer (works 100% offline)
 *
 * The rule-based analyzer:
 *   - Extracts text from PDF/image using pdf-parse
 *   - Parses 80+ common blood test parameters with regex
 *   - Applies WHO/standard reference ranges
 *   - Generates findings, suggestions, and doctor recommendations
 *   - Supports English, Hindi, Gujarati output
 */

const fs   = require('fs');
const path = require('path');

const MODEL      = 'gpt-4.1-nano';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// ── Try OpenAI (with 8-second timeout — fails fast on blocked networks) ────────
async function tryOpenAI(messages, maxTokens = 1000) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  return new Promise((resolve) => {
    try {
      const https  = require('https');
      const body   = JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages });
      const agent  = new https.Agent({ rejectUnauthorized: false });
      const req    = https.request({
        hostname: 'api.openai.com',
        path:     '/v1/chat/completions',
        method:   'POST',
        agent,
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization':  'Bearer ' + key,
        },
        timeout: 20000,
      }, (resp) => {
        let raw = '';
        resp.on('data', c => { raw += c; });
        resp.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (!resp.statusCode || resp.statusCode >= 400) {
              console.warn(`[aiService] OpenAI HTTP ${resp.statusCode}: ${data?.error?.message || raw.slice(0,80)}`);
              return resolve(null);
            }
            resolve(data.choices?.[0]?.message?.content || null);
          } catch { resolve(null); }
        });
      });
      req.on('error',   (e) => { console.warn('[aiService] OpenAI request error:', e.message); resolve(null); });
      req.on('timeout', ()  => { req.destroy(); console.warn('[aiService] OpenAI timeout'); resolve(null); });
      req.write(body);
      req.end();
    } catch (e) {
      console.warn('[aiService] tryOpenAI setup error:', e.message);
      resolve(null);
    }
  });
}

// ── JSON parser ────────────────────────────────────────────────────────────────
function parseJSON(raw, fallback) {
  if (!raw) return fallback;
  try {
    const cleaned = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

// ── Extract text from any file ─────────────────────────────────────────────────
async function extractText(filePath, category, fileName) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('[extractText] File not found:', filePath);
    return '';
  }

  const isImage = category === 'IMAGE' || /\.(jpg|jpeg|png|webp)$/i.test(fileName);
  const isPDF   = category === 'PDF'   || /\.pdf$/i.test(fileName);

  if (isPDF) {
    const fileBytes = fs.readFileSync(filePath);

    // ── Method 1: pdf-parse ────────────────────────────────────────────────────
    try {
      // pdf-parse v1.1.1+ exports a function directly
      let pdfParse = require('pdf-parse');
      if (pdfParse && pdfParse.default) pdfParse = pdfParse.default;
      if (typeof pdfParse === 'function') {
        const data = await pdfParse(fileBytes);
        const text = (data.text || '').replace(/\u00a0/g, ' ').trim();
        if (text.length > 20) {
          console.log(`[extractText] pdf-parse OK: ${text.length} chars`);
          return text;
        }
      }
    } catch (e) {
      // pdf-parse may fail on Windows with ESM/CJS mismatch — fall through to zlib
      console.warn('[extractText] pdf-parse failed:', e.message.slice(0, 80));
    }

    // ── Method 2: zlib decompress PDF FlateDecode streams ─────────────────────
    try {
      const zlib   = require('zlib');
      const pieces = [];

      // Extract all raw stream buffers from the PDF
      let pos = 0;
      while (pos < fileBytes.length) {
        // Find "stream\n" or "stream\r\n"
        const streamStart = fileBytes.indexOf(Buffer.from('stream'), pos);
        if (streamStart === -1) break;
        // Skip past "stream\r\n" or "stream\n"
        let dataStart = streamStart + 6;
        if (fileBytes[dataStart] === 0x0d) dataStart++; // \r
        if (fileBytes[dataStart] === 0x0a) dataStart++; // \n
        // Find "endstream"
        const endStream = fileBytes.indexOf(Buffer.from('endstream'), dataStart);
        if (endStream === -1) break;

        const streamBuf = fileBytes.slice(dataStart, endStream);
        pos = endStream + 9;

        // Try both inflate methods
        let decoded = null;
        for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
          try { decoded = fn(streamBuf); break; } catch (_) {}
        }
        if (!decoded) continue;

        const text = decoded.toString('latin1');
        // Extract text from BT...ET blocks
        const btBlocks = text.match(/BT[\s\S]*?ET/g) || [];
        for (const block of btBlocks) {
          // (text)Tj
          for (const m of block.matchAll(/\(([^)]{0,300})\)\s*Tj/g))
            if (m[1].trim()) pieces.push(m[1].replace(/\\n/g,'\n').replace(/\\\(/,'(').replace(/\\\)/,')'));
          // [(text)(text)]TJ
          for (const arr of block.matchAll(/\[([\s\S]*?)\]\s*TJ/g))
            for (const p of arr[1].matchAll(/\(([^)]{0,300})\)/g))
              if (p[1].trim()) pieces.push(p[1]);
        }
      }

      if (pieces.length > 3) {
        // Clean and group adjacent pieces that form one lab row:
        // e.g. ["Haemoglobin","11.0","gm%","11.5","–","16.0"] → one line
        const cleaned = pieces
          .map(p => p.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ').trim())
          .filter(p => p.length > 0 && !/^[\x80-\xff]+$/.test(p));

        // Group short adjacent pieces (< 30 chars each) into lines of up to 6 pieces
        const grouped = [];
        let buf = [];
        for (const p of cleaned) {
          if (p.length > 40) {
            if (buf.length) { grouped.push(buf.join('  ')); buf = []; }
            grouped.push(p);
          } else {
            buf.push(p);
            // flush when we have 6 pieces or hit a likely end-of-row
            if (buf.length >= 6 || /^\d+\.?\d*$/.test(p) && buf.length >= 3) {
              grouped.push(buf.join('  '));
              buf = [];
            }
          }
        }
        if (buf.length) grouped.push(buf.join('  '));

        const result = grouped.join('\n');
        console.log(`[extractText] zlib OK: ${pieces.length} pieces grouped to ${grouped.length} rows | ${result.slice(0,150).replace(/\n/g,'|')}`);
        return result;
      }
      console.warn('[extractText] zlib found', pieces.length, 'pieces — not enough');
    } catch (e3) {
      console.warn('[extractText] zlib method failed:', e3.message);
    }

    // ── Method 3: uncompressed BT/ET scan ──────────────────────────────────────
    try {
      const raw    = fileBytes.toString('latin1');
      const pieces = [];
      for (const m of raw.matchAll(/\(([^\x00-\x1F)]{2,200})\)\s*Tj/g))
        if (m[1].trim()) pieces.push(m[1]);
      if (pieces.length > 3) {
        const result = pieces.join('\n');
        console.log(`[extractText] raw scan OK: ${pieces.length} pieces | ${result.slice(0,150)}`);
        return result;
      }
    } catch (e4) {
      console.warn('[extractText] raw scan failed:', e4.message);
    }

    console.error('[extractText] All PDF methods failed for:', fileName);
    return '';
  }

  if (isImage) return '';
  return fs.readFileSync(filePath).toString('utf8').replace(/\0/g,'').slice(0, 50000);
}


// ══════════════════════════════════════════════════════════════════════════════
//  RULE-BASED ANALYZER
//  Verified against Mrs_PARUL_DOSHI_KAF423_33.PDF (14 pages, 43 parameters).
//  pdf-parse produces properly spaced text WITH newlines:
//    "Haemoglobin 11.0 gm% 11 - 15 Spectrophotometry"
//  All patterns use \s* between tokens to be robust to spacing variations.
//
//  PATTERN FORMAT: [name, category, regex, defaultLo, defaultHi]
//    regex group 1 = value
//    regex group 2 = rangeLo (or rangeHi for single-bound '<' patterns)
//    regex group 3 = rangeHi (when both bounds captured)
// ══════════════════════════════════════════════════════════════════════════════

// ── Plain-English test guide ───────────────────────────────────────────────────
// Each entry: { what, goodRange, ranges: [{label, range, meaning, color}] }
// Used by the frontend Plain English tab for rich, educational explanations.
const PLAIN_ENGLISH_GUIDE = {
  'Fasting Blood Glucose': {
    what: 'Measures the sugar (glucose) in your blood after not eating for at least 8 hours. It shows how well your body manages blood sugar when it is not processing food — your baseline level.',
    unit: 'mg/dL',
    goodRange: 'Less than 100 mg/dL is normal. 100–125 is pre-diabetes. 126 or above on two tests means diabetes.',
    ranges: [
      { label:'Normal',      range:'70–99 mg/dL',   color:'#16a34a', meaning:'Blood sugar is well-controlled. Your body is managing glucose efficiently.' },
      { label:'Pre-diabetes',range:'100–125 mg/dL', color:'#d97706', meaning:'Blood sugar is higher than ideal. Lifestyle changes (diet, exercise) can reverse this.' },
      { label:'Diabetes',    range:'≥126 mg/dL',    color:'#dc2626', meaning:'Blood sugar is consistently high. Doctor evaluation and treatment are essential.' },
    ],
  },
  'HbA1c': {
    what: 'Shows your average blood sugar level over the past 2–3 months by measuring what percentage of your red blood cells have sugar attached. Unlike a one-time glucose test, this gives the full picture.',
    unit: '%',
    goodRange: 'Below 5.7% is normal. 5.7–6.4% is pre-diabetes. 6.5% or above means diabetes.',
    ranges: [
      { label:'Normal',      range:'Below 5.7%',   color:'#16a34a', meaning:'Your blood sugar has been well-controlled for months. Great result.' },
      { label:'Pre-diabetes',range:'5.7–6.4%',     color:'#d97706', meaning:'Your blood sugar has been running a little high. Dietary changes can bring this down.' },
      { label:'Diabetes',    range:'6.5% and above',color:'#dc2626', meaning:'Blood sugar has been consistently elevated. Your doctor will guide treatment.' },
    ],
  },
  'Haemoglobin': {
    what: 'Measures the protein in red blood cells that carries oxygen from your lungs to every part of your body. Low haemoglobin means your body may not be getting enough oxygen (anaemia).',
    unit: 'g/dL',
    goodRange: 'Men: 13–17 g/dL. Women: 11–15 g/dL.',
    ranges: [
      { label:'Normal',  range:'Men 13–17, Women 11–15',color:'#16a34a', meaning:'Your blood is carrying oxygen well. Energy levels should be good.' },
      { label:'Low',     range:'Below normal',           color:'#dc2626', meaning:'Anaemia — you may feel tired, short of breath, or dizzy. Iron or B12 supplements may help.' },
      { label:'High',    range:'Above normal',           color:'#d97706', meaning:'Can indicate dehydration or a blood disorder. Doctor review recommended.' },
    ],
  },
  'MCHC': {
    what: 'Mean Corpuscular Haemoglobin Concentration — measures the concentration of haemoglobin packed into each red blood cell. It reveals whether your red blood cells are properly "filled" with oxygen-carrying haemoglobin.',
    unit: 'g/dL',
    goodRange: '32–36 g/dL is normal.',
    ranges: [
      { label:'Normal',range:'32–36 g/dL',color:'#16a34a', meaning:'Your red blood cells have the right amount of haemoglobin.' },
      { label:'Low',   range:'Below 32', color:'#d97706', meaning:'Hypochromic anaemia — cells are "pale" due to iron deficiency or thalassemia. See your doctor.' },
      { label:'High',  range:'Above 36', color:'#dc2626', meaning:'Rare — can mean spherocytosis (abnormal cell shape). Needs doctor evaluation.' },
    ],
  },
  'RBC Count': {
    what: 'Counts the total number of red blood cells in your blood. Red blood cells are the vehicles that carry oxygen around your body. Too few or too many can both cause problems.',
    unit: 'Mill/cumm',
    goodRange: 'Men: 4.5–5.9. Women: 3.8–4.8 million per cubic millimeter.',
    ranges: [
      { label:'Normal',range:'Men 4.5–5.9, Women 3.8–4.8',color:'#16a34a', meaning:'You have enough red blood cells to carry oxygen efficiently.' },
      { label:'Low',   range:'Below normal',                color:'#dc2626', meaning:'Fewer red blood cells than needed — possible anaemia. May cause fatigue.' },
      { label:'High',  range:'Above normal',                color:'#d97706', meaning:'Too many red blood cells — can thicken blood. May indicate dehydration or polycythaemia.' },
    ],
  },
  'Total WBC Count': {
    what: 'Counts the white blood cells that form your immune system. These cells fight infections, bacteria, and viruses. The count tells your doctor whether your immune system is working properly or is under stress.',
    unit: 'Cells/cumm',
    goodRange: '4,000–11,000 cells/cumm is normal.',
    ranges: [
      { label:'Normal',range:'4,000–11,000',color:'#16a34a', meaning:'Your immune system is balanced — not fighting an active infection.' },
      { label:'Low',   range:'Below 4,000', color:'#d97706', meaning:'Leukopenia — weakened immunity. You may be more prone to infections.' },
      { label:'High',  range:'Above 11,000',color:'#dc2626', meaning:'Leukocytosis — your body is fighting something (infection, inflammation, or stress).' },
    ],
  },
  'Platelet Count': {
    what: 'Counts the tiny cells that make your blood clot when you get a cut. Too few means you may bleed or bruise easily; too many can increase clotting risk.',
    unit: '×10³/µL',
    goodRange: '150,000–450,000 per µL is normal.',
    ranges: [
      { label:'Normal',range:'150–450 (×10³/µL)',color:'#16a34a', meaning:'Your blood can clot normally to stop bleeding.' },
      { label:'Low',   range:'Below 150',        color:'#dc2626', meaning:'Thrombocytopenia — risk of unusual bruising or prolonged bleeding. Doctor review needed.' },
      { label:'High',  range:'Above 450',        color:'#d97706', meaning:'Thrombocytosis — increased clot risk. Often caused by iron deficiency or inflammation.' },
    ],
  },
  'Neutrophils': {
    what: 'The most common type of white blood cell — your first line of defence against bacterial infections. They rush to the site of an infection and destroy bacteria.',
    unit: '%',
    goodRange: '45–75% of white blood cells.',
    ranges: [
      { label:'Normal',range:'45–75%',   color:'#16a34a', meaning:'Healthy immune response capacity against bacteria.' },
      { label:'Low',   range:'Below 45%',color:'#d97706', meaning:'Neutropenia — reduced ability to fight bacterial infections.' },
      { label:'High',  range:'Above 75%',color:'#dc2626', meaning:'Often signals a bacterial infection or physical stress on the body.' },
    ],
  },
  'Lymphocytes': {
    what: 'White blood cells that fight viral infections and produce antibodies. They are your immune system\'s memory — they remember past infections and help fight them faster next time.',
    unit: '%',
    goodRange: '20–40% of white blood cells.',
    ranges: [
      { label:'Normal',range:'20–40%',   color:'#16a34a', meaning:'Your viral immune defences are well-balanced.' },
      { label:'Low',   range:'Below 20%',color:'#d97706', meaning:'May indicate stress, steroid use, or a suppressed immune system.' },
      { label:'High',  range:'Above 40%',color:'#dc2626', meaning:'Often seen during or after viral infections (e.g. flu, COVID). Usually resolves on its own.' },
    ],
  },
  'ESR': {
    what: 'Erythrocyte Sedimentation Rate — measures how quickly red blood cells sink to the bottom of a tube. It is a general marker of inflammation anywhere in your body, though it does not pinpoint the cause.',
    unit: 'mm/hr',
    goodRange: 'Men: up to 15 mm/hr. Women: up to 20 mm/hr.',
    ranges: [
      { label:'Normal',range:'Men ≤15, Women ≤20',color:'#16a34a', meaning:'No significant inflammation detected.' },
      { label:'Mildly high', range:'20–50',       color:'#d97706', meaning:'Mild inflammation — could be due to mild infection, anaemia, or pregnancy.' },
      { label:'High', range:'Above 50',           color:'#dc2626', meaning:'Significant inflammation. Doctor will investigate the cause (infection, autoimmune, etc.).' },
    ],
  },
  'Total Cholesterol': {
    what: 'The total amount of all cholesterol (good + bad) circulating in your blood. Cholesterol is a fatty substance — some is needed by your body, but too much clogs arteries and raises heart disease risk.',
    unit: 'mg/dL',
    goodRange: 'Below 200 is desirable. 200–239 is borderline. 240 or above is high.',
    ranges: [
      { label:'Desirable', range:'Below 200 mg/dL',  color:'#16a34a', meaning:'Low risk for heart disease from cholesterol.' },
      { label:'Borderline',range:'200–239 mg/dL',    color:'#d97706', meaning:'Some risk — dietary changes (less saturated fat, more fibre) are advised.' },
      { label:'High',      range:'240 mg/dL or above',color:'#dc2626',meaning:'High risk for clogged arteries and heart attacks. Doctor assessment essential.' },
    ],
  },
  'HDL Cholesterol': {
    what: 'High-Density Lipoprotein — the "good" cholesterol. It acts like a garbage truck, collecting excess cholesterol from your arteries and carrying it to the liver for disposal. Higher is better.',
    unit: 'mg/dL',
    goodRange: 'Above 60 is ideal. 40–60 is acceptable. Below 40 (men) or 50 (women) is low.',
    ranges: [
      { label:'Ideal',    range:'Above 60 mg/dL',           color:'#16a34a', meaning:'Excellent! High HDL actively protects your heart.' },
      { label:'Acceptable',range:'40–60 mg/dL',             color:'#d97706', meaning:'Adequate but could be higher. Exercise and healthy fats help raise HDL.' },
      { label:'Low',      range:'Below 40 (men) / 50 (women)',color:'#dc2626',meaning:'Low protective cholesterol — increased heart risk. Lifestyle changes needed.' },
    ],
  },
  'LDL Cholesterol': {
    what: 'Low-Density Lipoprotein — the "bad" cholesterol. Too much LDL builds up as plaque on artery walls (atherosclerosis), narrowing them and raising the risk of heart attacks and strokes. Lower is better.',
    unit: 'mg/dL',
    goodRange: 'Optimal: below 100. Above optimal: 100–129. Borderline: 130–159. High: 160–189. Very high: 190+.',
    ranges: [
      { label:'Optimal',     range:'Below 100 mg/dL', color:'#16a34a', meaning:'Excellent — very low risk of artery disease from LDL.' },
      { label:'Above optimal',range:'100–129 mg/dL',  color:'#84cc16', meaning:'Slightly above ideal. Maintain a heart-healthy diet.' },
      { label:'Borderline',  range:'130–159 mg/dL',   color:'#d97706', meaning:'Moderate risk. Diet and lifestyle changes recommended.' },
      { label:'High',        range:'160–189 mg/dL',   color:'#ef4444', meaning:'High risk. Doctor may recommend medication in addition to lifestyle changes.' },
      { label:'Very High',   range:'190+ mg/dL',      color:'#dc2626', meaning:'Very high risk. Treatment is almost always required.' },
    ],
  },
  'Total Triglycerides': {
    what: 'The most common type of fat in your blood. After eating, unused calories are converted into triglycerides and stored in fat cells. High levels are linked to heart disease and often come from eating too much sugar and refined carbs.',
    unit: 'mg/dL',
    goodRange: 'Below 150 is normal. 150–199 is borderline. 200–499 is high. 500+ is very high.',
    ranges: [
      { label:'Normal',    range:'Below 150 mg/dL', color:'#16a34a', meaning:'Healthy fat level in blood. Keep up the good diet habits.' },
      { label:'Borderline',range:'150–199 mg/dL',   color:'#d97706', meaning:'Slightly elevated. Cut sugar, alcohol, and refined carbs.' },
      { label:'High',      range:'200–499 mg/dL',   color:'#ef4444', meaning:'High risk — increase exercise and reduce sugar intake. May need medication.' },
      { label:'Very High', range:'500 mg/dL+',      color:'#dc2626', meaning:'Dangerously high — risk of pancreatitis. Urgent medical attention required.' },
    ],
  },
  'Non-HDL Cholesterol': {
    what: 'Total cholesterol minus good (HDL) cholesterol — essentially all the "bad" or neutral cholesterol combined. It is considered a better predictor of heart risk than LDL alone because it includes VLDL (very bad fat particles).',
    unit: 'mg/dL',
    goodRange: 'Below 130 mg/dL is the target.',
    ranges: [
      { label:'Good',   range:'Below 130 mg/dL', color:'#16a34a', meaning:'All your non-protective cholesterol is within safe limits.' },
      { label:'High',   range:'130 mg/dL or above', color:'#dc2626', meaning:'Combined bad cholesterol is too high — raises the risk of blocked arteries.' },
    ],
  },
  'GGT': {
    what: 'Gamma-Glutamyl Transferase — a liver enzyme that is very sensitive to alcohol and liver stress. It is one of the first liver enzymes to rise when the liver is under strain. Also elevated in people who drink heavily.',
    unit: 'U/L',
    goodRange: 'Men: 8–61 U/L. Women: 5–36 U/L.',
    ranges: [
      { label:'Normal',range:'Men 8–61, Women 5–36',color:'#16a34a', meaning:'Your liver enzyme is within the healthy range.' },
      { label:'Mildly high',range:'1–3× upper limit', color:'#d97706', meaning:'Mild liver strain — could be alcohol, medications, or fatty liver. Reduce alcohol intake.' },
      { label:'High',  range:'3× upper limit or more',color:'#dc2626', meaning:'Significant liver stress. Doctor should investigate the cause.' },
    ],
  },
  'SGOT/AST': {
    what: 'Aspartate Aminotransferase — an enzyme found in the liver and heart. When liver cells are damaged, they release AST into the bloodstream. It is a general marker of liver or heart injury.',
    unit: 'U/L',
    goodRange: 'Below 40 U/L is normal.',
    ranges: [
      { label:'Normal',range:'Below 40 U/L', color:'#16a34a', meaning:'No significant liver or heart cell damage detected.' },
      { label:'High',  range:'40 U/L or above', color:'#dc2626', meaning:'Liver or heart cells may be under stress. Often checked alongside ALT to pinpoint the cause.' },
    ],
  },
  'SGPT/ALT': {
    what: 'Alanine Aminotransferase — a liver-specific enzyme. Unlike AST, this enzyme is found mainly in the liver, so a high ALT is a more direct sign of liver damage (from hepatitis, fatty liver, medications, or alcohol).',
    unit: 'U/L',
    goodRange: 'Below 42 U/L is normal.',
    ranges: [
      { label:'Normal',range:'Below 42 U/L',   color:'#16a34a', meaning:'Your liver is not releasing stress signals. Good result.' },
      { label:'High',  range:'42 U/L or above',color:'#dc2626', meaning:'Liver cells may be inflamed or damaged. Reduce alcohol, review medications with your doctor.' },
    ],
  },
  'TSH': {
    what: 'Thyroid Stimulating Hormone — produced by your pituitary gland to tell the thyroid to make more or less thyroid hormones. It is the master control signal for your thyroid gland and the best single test for thyroid function.',
    unit: 'µIU/mL',
    goodRange: '0.27–4.2 µIU/mL is normal for most adults.',
    ranges: [
      { label:'Normal',    range:'0.27–4.2 µIU/mL', color:'#16a34a', meaning:'Your thyroid is receiving the right amount of stimulation — functioning normally.' },
      { label:'Low',       range:'Below 0.27',       color:'#d97706', meaning:'Possible hyperthyroidism (overactive thyroid) — may cause rapid heartbeat, weight loss.' },
      { label:'High',      range:'Above 4.2',        color:'#dc2626', meaning:'Possible hypothyroidism (underactive thyroid) — may cause fatigue, weight gain, feeling cold.' },
    ],
  },
  'Serum Creatinine': {
    what: 'A waste product from normal muscle activity that healthy kidneys filter out of your blood. If creatinine is building up, it means the kidneys are not filtering as efficiently as they should be.',
    unit: 'mg/dL',
    goodRange: 'Men: 0.7–1.3 mg/dL. Women: 0.5–0.9 mg/dL.',
    ranges: [
      { label:'Normal',range:'Men 0.7–1.3, Women 0.5–0.9', color:'#16a34a', meaning:'Your kidneys are filtering waste products effectively.' },
      { label:'High',  range:'Above normal',                color:'#dc2626', meaning:'Reduced kidney function — kidneys are not clearing waste as well as they should. Stay hydrated and see your doctor.' },
    ],
  },
  'Uric Acid': {
    what: 'A waste product formed when your body breaks down purines (found in red meat, seafood, and alcohol). Normally dissolved in blood and excreted in urine — but high levels can form crystals in joints, causing gout, or damage kidneys.',
    unit: 'mg/dL',
    goodRange: 'Men: 3.4–7.0 mg/dL. Women: 2.4–5.7 mg/dL.',
    ranges: [
      { label:'Normal',range:'Men 3.4–7.0, Women 2.4–5.7',color:'#16a34a', meaning:'Uric acid is being cleared efficiently. No gout risk at this level.' },
      { label:'High',  range:'Above normal',               color:'#dc2626', meaning:'Hyperuricemia — raised risk of gout and kidney stones. Reduce red meat, organ meat, and alcohol.' },
    ],
  },
  'Potassium': {
    what: 'An essential mineral (electrolyte) that controls how your heart beats, how muscles contract, and how nerves fire signals. Even small deviations from normal cause significant symptoms.',
    unit: 'mmol/L',
    goodRange: '3.5–5.0 mmol/L is normal.',
    ranges: [
      { label:'Normal',range:'3.5–5.0 mmol/L', color:'#16a34a', meaning:'Your potassium balance is correct for proper heart and muscle function.' },
      { label:'Low',   range:'Below 3.5',      color:'#d97706', meaning:'Hypokalaemia — can cause muscle weakness, cramps, irregular heartbeat.' },
      { label:'High',  range:'Above 5.0',      color:'#dc2626', meaning:'Hyperkalaemia — can cause dangerous heart rhythm problems. Reduce potassium-rich foods and see doctor.' },
    ],
  },
  'Sodium': {
    what: 'The main electrolyte in your body\'s fluids. It controls water balance, blood pressure, and nerve signal transmission. Your body tightly regulates sodium — too high or low causes serious problems.',
    unit: 'mmol/L',
    goodRange: '135–150 mmol/L is normal.',
    ranges: [
      { label:'Normal',range:'135–150 mmol/L',color:'#16a34a', meaning:'Your fluid balance and blood pressure regulation are normal.' },
      { label:'Low',   range:'Below 135',     color:'#d97706', meaning:'Hyponatraemia — can cause nausea, headache, confusion, swelling. Increase salt cautiously.' },
      { label:'High',  range:'Above 150',     color:'#dc2626', meaning:'Hypernatraemia — dehydration or kidney issue. Drink more water and see your doctor.' },
    ],
  },
  'Vitamin B12': {
    what: 'An essential vitamin for making red blood cells, keeping nerves healthy, and supporting DNA production. Your body cannot make it — you get it only from animal products (meat, eggs, dairy) or supplements. Deficiency is common in vegetarians.',
    unit: 'pg/mL',
    goodRange: '191–663 pg/mL is normal. Very high levels (>900) usually mean B12 supplements or injections.',
    ranges: [
      { label:'Normal',    range:'191–663 pg/mL', color:'#16a34a', meaning:'Good B12 level — nerve and blood cell production should be healthy.' },
      { label:'Low',       range:'Below 191',     color:'#dc2626', meaning:'Deficiency — risk of nerve damage, anaemia, fatigue, and brain fog. B12 supplements or injections needed.' },
      { label:'High',      range:'Above 663',     color:'#d97706', meaning:'Often from B12 supplements or injections — usually harmless. Rarely, can indicate liver disease. Mention to doctor.' },
    ],
  },
  'Vitamin D (25-OH)': {
    what: 'Measures the stored form of Vitamin D in your blood. Vitamin D is essential for strong bones, a healthy immune system, and mood regulation. In India, deficiency is very common due to limited sun exposure and diet.',
    unit: 'ng/mL',
    goodRange: '30–100 ng/mL is desirable. 21–29 is insufficient. 20 or below is deficient.',
    ranges: [
      { label:'Sufficient',   range:'30–100 ng/mL', color:'#16a34a', meaning:'Your Vitamin D level is good for bone and immune health.' },
      { label:'Insufficient', range:'21–29 ng/mL',  color:'#d97706', meaning:'Below optimal — bones and immunity may be affected. Get more sunlight and consider supplements.' },
      { label:'Deficient',    range:'20 ng/mL or below',color:'#dc2626',meaning:'Significant deficiency — risk of bone pain, weak muscles, frequent illness. Supplementation is necessary.' },
    ],
  },
  'Rheumatoid Factor': {
    what: 'An antibody that appears in the blood of many people with rheumatoid arthritis (RA) — an autoimmune disease where the immune system attacks joints. A positive result supports but does not confirm RA.',
    unit: 'IU/mL',
    goodRange: 'Below 14 IU/mL is negative (normal).',
    ranges: [
      { label:'Negative (normal)',range:'Below 14 IU/mL',  color:'#16a34a', meaning:'No rheumatoid factor detected. RA is less likely (but not impossible).' },
      { label:'Positive',        range:'14 IU/mL or above',color:'#dc2626', meaning:'Rheumatoid factor detected — could indicate RA or other autoimmune conditions. Doctor evaluation required.' },
    ],
  },
  'Anti-CCP': {
    what: 'Anti-Cyclic Citrullinated Peptide antibody — a more specific test for Rheumatoid Arthritis than Rheumatoid Factor. It can appear years before joint symptoms start, making it valuable for early detection.',
    unit: 'U/mL',
    goodRange: 'Below 17 U/mL is negative.',
    ranges: [
      { label:'Negative',range:'Below 17 U/mL',  color:'#16a34a', meaning:'Very unlikely to have Rheumatoid Arthritis at this level.' },
      { label:'Positive',range:'17 U/mL or above',color:'#dc2626', meaning:'High specificity for RA — doctor will confirm with clinical examination and other tests.' },
    ],
  },
  'Alkaline Phosphatase': {
    what: 'An enzyme found in the liver, bones, and intestines. High levels can indicate liver disease, bone disorders, or bile duct blockage. It is routinely measured as part of a liver function panel.',
    unit: 'U/L',
    goodRange: '35–104 U/L is normal.',
    ranges: [
      { label:'Normal',range:'35–104 U/L',   color:'#16a34a', meaning:'Liver and bone enzyme activity is within healthy limits.' },
      { label:'High',  range:'Above 104 U/L',color:'#dc2626', meaning:'Possible liver disease, bone disorder, or blocked bile duct. Doctor should investigate.' },
    ],
  },
  'Total Bilirubin': {
    what: 'A yellow pigment produced when red blood cells break down. The liver processes it and excretes it in bile. High bilirubin causes jaundice (yellow skin/eyes) and signals liver or bile duct problems.',
    unit: 'mg/dL',
    goodRange: 'Below 1.2 mg/dL is normal.',
    ranges: [
      { label:'Normal',range:'Below 1.2 mg/dL',  color:'#16a34a', meaning:'Your liver is processing red blood cell waste efficiently.' },
      { label:'High',  range:'1.2 mg/dL or above',color:'#dc2626', meaning:'Possible liver disease, hepatitis, or blocked bile duct. Check for jaundice.' },
    ],
  },
  'Total Protein': {
    what: 'Measures the total amount of albumin and globulin proteins in your blood. Proteins are essential for building tissue, fighting infections, and transporting substances. Low levels often mean the liver is struggling.',
    unit: 'g/dL',
    goodRange: '6.6–8.7 g/dL is normal.',
    ranges: [
      { label:'Normal',range:'6.6–8.7 g/dL', color:'#16a34a', meaning:'Your body is producing and maintaining adequate protein levels.' },
      { label:'Low',   range:'Below 6.6',     color:'#d97706', meaning:'May indicate liver disease, malnutrition, or kidney protein loss.' },
      { label:'High',  range:'Above 8.7',     color:'#d97706', meaning:'May indicate dehydration or chronic inflammation (elevated globulins).' },
    ],
  },
  'Albumin': {
    what: 'The most abundant protein in your blood, made by the liver. It keeps fluid inside blood vessels, transports hormones and drugs, and is a key marker of liver function and overall nutrition status.',
    unit: 'g/dL',
    goodRange: '3.5–5.2 g/dL is normal.',
    ranges: [
      { label:'Normal',range:'3.5–5.2 g/dL', color:'#16a34a', meaning:'Good liver function and nutritional status.' },
      { label:'Low',   range:'Below 3.5',    color:'#dc2626', meaning:'Hypoalbuminaemia — liver disease, malnutrition, or protein-losing kidney disease. Needs investigation.' },
    ],
  },
  'Blood Urea': {
    what: 'Urea is a waste product from protein metabolism that the kidneys filter out of blood. High urea can signal reduced kidney function or dehydration. Low levels may indicate liver disease or low protein intake.',
    unit: 'mg/dL',
    goodRange: '16.6–48.5 mg/dL is normal.',
    ranges: [
      { label:'Normal',range:'16.6–48.5 mg/dL',color:'#16a34a', meaning:'Kidneys are filtering protein waste effectively.' },
      { label:'High',  range:'Above 48.5',      color:'#dc2626', meaning:'Possible kidney strain, dehydration, or high protein diet. Doctor should evaluate.' },
      { label:'Low',   range:'Below 16.6',      color:'#d97706', meaning:'May indicate liver disease or very low protein diet.' },
    ],
  },
  'Free T3 (FT3)': {
    what: 'The active form of the thyroid hormone Triiodothyronine that circulates freely in your blood. It directly controls your metabolism, energy, heart rate, and body temperature. More precise than total T3.',
    unit: 'pg/mL',
    goodRange: '2.0–4.4 pg/mL is normal.',
    ranges: [
      { label:'Normal',range:'2.0–4.4 pg/mL',color:'#16a34a', meaning:'Your active thyroid hormone is well-regulated.' },
      { label:'Low',   range:'Below 2.0',    color:'#d97706', meaning:'May indicate hypothyroidism — fatigue, weight gain, feeling cold.' },
      { label:'High',  range:'Above 4.4',    color:'#dc2626', meaning:'May indicate hyperthyroidism — anxiety, rapid heartbeat, weight loss.' },
    ],
  },
  'Free T4 (FT4)': {
    what: 'Free Thyroxine — the storage form of thyroid hormone that converts to the active T3 as needed. It reflects how much thyroid hormone is available for the body to use and is measured alongside TSH for diagnosis.',
    unit: 'ng/dL',
    goodRange: '1.0–1.6 ng/dL is normal.',
    ranges: [
      { label:'Normal',range:'1.0–1.6 ng/dL',color:'#16a34a', meaning:'Your thyroid hormone reserve is within healthy limits.' },
      { label:'Low',   range:'Below 1.0',    color:'#d97706', meaning:'Low thyroid hormone production — hypothyroidism. Fatigue and weight gain are common symptoms.' },
      { label:'High',  range:'Above 1.6',    color:'#dc2626', meaning:'Excess thyroid hormone — hyperthyroidism. Anxiety, palpitations, weight loss are common.' },
    ],
  },
  'T3 Total (TT3)': {
    what: 'Total Triiodothyronine — the most active thyroid hormone, controlling how quickly your body uses energy. Both bound and free forms are measured here. It can be affected by pregnancy, medications, and protein levels.',
    unit: 'ng/mL',
    goodRange: '0.80–2.00 ng/mL is normal.',
    ranges: [
      { label:'Normal',range:'0.80–2.00 ng/mL',color:'#16a34a', meaning:'Total T3 is within the normal range for metabolic function.' },
      { label:'Low',   range:'Below 0.80',      color:'#d97706', meaning:'Possible hypothyroidism. Check TSH and FT3 for confirmation.' },
      { label:'High',  range:'Above 2.00',      color:'#dc2626', meaning:'Possible hyperthyroidism or T3 toxicosis. Needs doctor evaluation.' },
    ],
  },
  'T4 Total (TT4)': {
    what: 'Total Thyroxine — the primary hormone produced by the thyroid gland, which converts to T3 as needed. Total T4 includes both bound and free forms. Used to diagnose hyper- or hypothyroidism.',
    unit: 'µg/dL',
    goodRange: '5.1–14.1 µg/dL is normal.',
    ranges: [
      { label:'Normal',range:'5.1–14.1 µg/dL',color:'#16a34a', meaning:'Thyroid hormone production is within the expected range.' },
      { label:'Low',   range:'Below 5.1',      color:'#d97706', meaning:'Reduced thyroid hormone production — possible hypothyroidism.' },
      { label:'High',  range:'Above 14.1',     color:'#dc2626', meaning:'Excess thyroid hormone — possible hyperthyroidism or high binding protein levels.' },
    ],
  },
  'TIBC': {
    what: 'Total Iron Binding Capacity — measures how much iron your blood proteins COULD carry if fully loaded. It indirectly reflects how much transferrin (iron-transport protein) you have. High TIBC with low iron usually means iron deficiency.',
    unit: 'µg/dL',
    goodRange: '250–450 µg/dL is normal.',
    ranges: [
      { label:'Normal',range:'250–450 µg/dL',color:'#16a34a', meaning:'Your iron transport capacity is balanced with your iron stores.' },
      { label:'High',  range:'Above 450',    color:'#d97706', meaning:'Your blood is "hungry" for iron — often seen in iron deficiency anaemia.' },
      { label:'Low',   range:'Below 250',    color:'#d97706', meaning:'May indicate chronic disease, inflammation, or iron overload.' },
    ],
  },
  'Serum Iron': {
    what: 'Measures the amount of iron circulating in your bloodstream (not stored iron). Iron is essential for making haemoglobin. Low iron is the most common cause of anaemia worldwide.',
    unit: 'µg/dL',
    goodRange: 'Men: 70–180 µg/dL. Women: 60–160 µg/dL.',
    ranges: [
      { label:'Normal',range:'Men 70–180, Women 60–160',color:'#16a34a', meaning:'Adequate circulating iron for haemoglobin production.' },
      { label:'Low',   range:'Below normal',             color:'#dc2626', meaning:'Iron deficiency — likely cause of low haemoglobin. Iron-rich foods or supplements needed.' },
      { label:'High',  range:'Above normal',             color:'#d97706', meaning:'Iron overload — rare; can damage liver, heart, joints. Doctor evaluation needed.' },
    ],
  },
  'Transferrin Saturation': {
    what: 'Shows what percentage of your iron-transport protein (transferrin) is currently carrying iron. It is calculated from serum iron and TIBC. Together they help diagnose iron deficiency or iron overload.',
    unit: '%',
    goodRange: '12–50% is normal.',
    ranges: [
      { label:'Normal',range:'12–50%',   color:'#16a34a', meaning:'Iron transport is balanced — neither deficient nor excessive.' },
      { label:'Low',   range:'Below 12%',color:'#dc2626', meaning:'Iron deficiency — not enough iron to fill transport proteins.' },
      { label:'High',  range:'Above 50%',color:'#d97706', meaning:'Iron overload (haemochromatosis) — excess iron can damage organs.' },
    ],
  },
  'Calcium': {
    what: 'Calcium in your blood is tightly regulated by the kidneys and parathyroid hormone. It is essential for strong bones, muscle contractions (including the heart), nerve signals, and blood clotting.',
    unit: 'mg/dL',
    goodRange: '8.6–10.0 mg/dL is normal.',
    ranges: [
      { label:'Normal',range:'8.6–10.0 mg/dL',color:'#16a34a', meaning:'Calcium balance is good for bone strength and heart/muscle function.' },
      { label:'Low',   range:'Below 8.6',      color:'#d97706', meaning:'Hypocalcaemia — can cause muscle cramps, numbness, weak bones.' },
      { label:'High',  range:'Above 10.0',     color:'#dc2626', meaning:'Hypercalcaemia — nausea, confusion, fatigue. Can indicate parathyroid or kidney problems.' },
    ],
  },
  'Chloride': {
    what: 'An electrolyte that works with sodium to maintain fluid balance, blood pressure, and blood acidity (pH). It is rarely abnormal on its own but shifts with sodium or in acid-base disturbances.',
    unit: 'mmol/L',
    goodRange: '94–110 mmol/L is normal.',
    ranges: [
      { label:'Normal',range:'94–110 mmol/L',color:'#16a34a', meaning:'Fluid balance and blood pH are within normal bounds.' },
      { label:'Low',   range:'Below 94',     color:'#d97706', meaning:'Hypochloraemia — can be from vomiting, diuretics, or kidney issues.' },
      { label:'High',  range:'Above 110',    color:'#d97706', meaning:'Hyperchloraemia — often linked to dehydration or metabolic acidosis.' },
    ],
  },
  'BUN': {
    what: 'Blood Urea Nitrogen — measures the nitrogen portion of urea, a kidney-filtered waste product. It is similar to a urea test and helps assess kidney filtration ability alongside creatinine.',
    unit: 'mg/dL',
    goodRange: '7–18 mg/dL is normal.',
    ranges: [
      { label:'Normal',range:'7–18 mg/dL', color:'#16a34a', meaning:'Kidneys are filtering nitrogen waste normally.' },
      { label:'High',  range:'Above 18',   color:'#dc2626', meaning:'Elevated — possible kidney dysfunction, dehydration, or high protein intake.' },
    ],
  },
  'PCV': {
    what: 'Packed Cell Volume (Haematocrit) — the percentage of your blood volume that is made up of red blood cells. Low PCV means anaemia; high PCV means your blood is thicker than normal.',
    unit: '%',
    goodRange: 'Men: 40–52%. Women: 36–46%.',
    ranges: [
      { label:'Normal',range:'Men 40–52%, Women 36–46%',color:'#16a34a', meaning:'Your blood has the right proportion of red blood cells.' },
      { label:'Low',   range:'Below normal',              color:'#dc2626', meaning:'Anaemia — too few red blood cells relative to blood volume.' },
      { label:'High',  range:'Above normal',              color:'#d97706', meaning:'Polycythaemia — thickened blood. Can indicate dehydration or bone marrow disorder.' },
    ],
  },
  'MCV': {
    what: 'Mean Corpuscular Volume — the average size of your red blood cells. It helps identify the TYPE of anaemia: small cells (iron deficiency), large cells (B12/folate deficiency), or normal-sized cells (other causes).',
    unit: 'fL',
    goodRange: '80–100 fL is normal (normocytic).',
    ranges: [
      { label:'Normal (normocytic)', range:'80–100 fL',  color:'#16a34a', meaning:'Normal-sized red blood cells.' },
      { label:'Low (microcytic)',    range:'Below 80 fL',color:'#d97706', meaning:'Small red blood cells — classic sign of iron deficiency or thalassemia.' },
      { label:'High (macrocytic)',   range:'Above 100 fL',color:'#d97706', meaning:'Large red blood cells — often B12 or folate deficiency. Can also be from liver disease or hypothyroidism.' },
    ],
  },
  'MCH': {
    what: 'Mean Corpuscular Haemoglobin — the average weight of haemoglobin in each red blood cell. It tells you whether cells are well-filled with haemoglobin (related to MCV — bigger cells generally hold more haemoglobin).',
    unit: 'pg',
    goodRange: '26–34 pg is normal.',
    ranges: [
      { label:'Normal',range:'26–34 pg',  color:'#16a34a', meaning:'Each red blood cell carries the right amount of haemoglobin.' },
      { label:'Low',   range:'Below 26',  color:'#d97706', meaning:'Hypochromic — cells have less haemoglobin, often due to iron deficiency.' },
      { label:'High',  range:'Above 34',  color:'#d97706', meaning:'Hyperchromic — often seen with B12/folate deficiency (large cells hold more haemoglobin).' },
    ],
  },
  'Transferrin': {
    what: 'The main protein that transports iron through your blood. When iron stores are low, the liver makes more transferrin to capture whatever iron is available. High transferrin + low iron = iron deficiency.',
    unit: 'mg/dL',
    goodRange: '200–360 mg/dL is normal.',
    ranges: [
      { label:'Normal',range:'200–360 mg/dL',color:'#16a34a', meaning:'Iron transport protein is at a healthy level.' },
      { label:'High',  range:'Above 360',    color:'#d97706', meaning:'Body is producing extra iron-transport protein — likely iron deficiency.' },
      { label:'Low',   range:'Below 200',    color:'#d97706', meaning:'Reduced transferrin — can indicate liver disease, chronic inflammation, or malnutrition.' },
    ],
  },
  'UIBC': {
    what: 'Unsaturated Iron Binding Capacity — measures how much more iron your transferrin protein COULD hold if more were available. It is the "empty" part of your total iron-binding capacity.',
    unit: 'µg/dL',
    goodRange: 'Women: 135–392 µg/dL.',
    ranges: [
      { label:'Normal',range:'135–392 µg/dL (women)',color:'#16a34a', meaning:'Iron transport reserve is balanced.' },
      { label:'High',  range:'Above 392',             color:'#d97706', meaning:'Large unfilled capacity — iron deficiency. Your proteins are ready to grab more iron but there is none available.' },
    ],
  },
  'Direct Bilirubin': {
    what: 'The water-soluble form of bilirubin that the liver has processed and is ready to excrete. High direct bilirubin usually means a blockage in the bile ducts (gallstones, liver disease) rather than a red blood cell breakdown problem.',
    unit: 'mg/dL',
    goodRange: '0–0.3 mg/dL is normal.',
    ranges: [
      { label:'Normal',range:'0–0.3 mg/dL',  color:'#16a34a', meaning:'Liver is processing and excreting bile normally.' },
      { label:'High',  range:'Above 0.3',    color:'#dc2626', meaning:'Bile duct obstruction or liver disease is likely. Jaundice may appear. See doctor.' },
    ],
  },
  'Indirect Bilirubin': {
    what: 'The fat-soluble, unprocessed form of bilirubin formed when red blood cells break down. High indirect bilirubin means red blood cells are being destroyed too fast (haemolysis) or the liver cannot keep up with processing.',
    unit: 'mg/dL',
    goodRange: '0.1–1.0 mg/dL is normal.',
    ranges: [
      { label:'Normal',range:'0.1–1.0 mg/dL',color:'#16a34a', meaning:'Normal red blood cell turnover.' },
      { label:'High',  range:'Above 1.0',    color:'#dc2626', meaning:'Increased red blood cell breakdown or liver processing issue. Investigate with doctor.' },
    ],
  },
  'Globulin': {
    what: 'A group of proteins made by the liver and immune system, including immunoglobulins (antibodies). High globulin with low albumin can indicate chronic liver disease or immune system overactivity.',
    unit: 'g/dL',
    goodRange: '2.5–4.5 g/dL is normal.',
    ranges: [
      { label:'Normal',range:'2.5–4.5 g/dL',color:'#16a34a', meaning:'Immune proteins and liver proteins are in balance.' },
      { label:'High',  range:'Above 4.5',   color:'#d97706', meaning:'Elevated immune proteins — may indicate chronic infection, liver disease, or autoimmune condition.' },
    ],
  },
  'PDW': {
    what: 'Platelet Distribution Width — measures how much platelet sizes vary. A high PDW means your platelets are uneven in size, often seen when the bone marrow is producing them in a hurry (reacting to bleeding or infection).',
    unit: 'fL',
    goodRange: '11–22 fL is normal.',
    ranges: [
      { label:'Normal',range:'11–22 fL',  color:'#16a34a', meaning:'Platelet sizes are uniform — bone marrow functioning steadily.' },
      { label:'High',  range:'Above 22',  color:'#d97706', meaning:'Platelets vary greatly in size — can indicate infection, anaemia, or platelet activation.' },
    ],
  },
  'MPV': {
    what: 'Mean Platelet Volume — the average size of your platelets. Larger platelets are generally more active. A high MPV with low count often indicates the bone marrow is compensating for platelet loss.',
    unit: 'fL',
    goodRange: '7–11 fL is normal.',
    ranges: [
      { label:'Normal',range:'7–11 fL',  color:'#16a34a', meaning:'Average platelet size is normal.' },
      { label:'High',  range:'Above 11', color:'#d97706', meaning:'Larger platelets — may indicate increased platelet activity, immune thrombocytopenia, or cardiovascular risk.' },
    ],
  },
  'RDW-CV': {
    what: 'Red Blood Cell Distribution Width — measures how much red blood cells vary in size (anisocytosis). A high RDW alongside low haemoglobin helps identify the cause of anaemia (iron, B12, folate deficiency).',
    unit: '%',
    goodRange: '11.6–14.0% is normal.',
    ranges: [
      { label:'Normal',range:'11.6–14.0%',color:'#16a34a', meaning:'Red blood cells are uniform in size — consistent production.' },
      { label:'High',  range:'Above 14.0%',color:'#d97706', meaning:'Mixed cell sizes — often early iron or B12/folate deficiency. Check with haemoglobin and MCV.' },
    ],
  },
  'Monocytes': {
    what: 'White blood cells that clean up dead cells and fight chronic infections. They are also the first responders to inflammation. Elevated levels often follow bacterial infections or occur in chronic inflammatory conditions.',
    unit: '%',
    goodRange: '2–10% of white blood cells.',
    ranges: [
      { label:'Normal',range:'2–10%',    color:'#16a34a', meaning:'Monocyte count is within healthy limits.' },
      { label:'High',  range:'Above 10%',color:'#d97706', meaning:'Monocytosis — possible chronic infection, autoimmune disease, or inflammatory condition.' },
    ],
  },
  'Eosinophils': {
    what: 'White blood cells that fight parasites and manage allergic reactions. High levels are very commonly seen in people with allergies, asthma, or hay fever, and also in certain infections.',
    unit: '%',
    goodRange: '1–6% of white blood cells.',
    ranges: [
      { label:'Normal',range:'1–6%',    color:'#16a34a', meaning:'Normal — allergic responses and parasite defences are balanced.' },
      { label:'High',  range:'Above 6%',color:'#d97706', meaning:'Eosinophilia — often allergy, asthma, skin conditions, or parasite infection.' },
    ],
  },
  'Basophils': {
    what: 'The rarest white blood cell, involved in allergic reactions and inflammation. They release histamine (the chemical that causes allergy symptoms). Abnormal levels are rare and usually minor.',
    unit: '%',
    goodRange: '0–2% is normal.',
    ranges: [
      { label:'Normal',range:'0–2%',    color:'#16a34a', meaning:'Basophil count is normal.' },
      { label:'High',  range:'Above 2%',color:'#d97706', meaning:'Basophilia — rare; can occur with allergies, hypothyroidism, or certain blood disorders.' },
    ],
  },
  'Mean Plasma Glucose': {
    what: 'An estimated average blood glucose level calculated from the HbA1c percentage. It gives a concrete number (like a regular glucose test) to help understand what your 3-month average blood sugar has been.',
    unit: 'mg/dL',
    goodRange: 'Below 126 mg/dL corresponds to a normal HbA1c.',
    ranges: [
      { label:'Normal', range:'Below 126 mg/dL', color:'#16a34a', meaning:'Average blood glucose is within the non-diabetic range.' },
      { label:'Elevated',range:'126–194 mg/dL',  color:'#d97706', meaning:'Average blood sugar has been above normal — pre-diabetes or controlled diabetes range.' },
      { label:'High',   range:'Above 194 mg/dL', color:'#dc2626', meaning:'Average blood sugar has been very high — active diabetes range. Treatment review needed.' },
    ],
  },
  'A/G Ratio': {
    what: 'The ratio of Albumin to Globulin proteins in the blood. Normally albumin is higher than globulin. A reversed ratio (low A/G) can indicate liver disease, kidney disease, or overactive immune system.',
    unit: 'ratio',
    goodRange: '1.0–2.1 is normal.',
    ranges: [
      { label:'Normal',range:'1.0–2.1',  color:'#16a34a', meaning:'Protein balance between albumin and globulin is healthy.' },
      { label:'Low',   range:'Below 1.0',color:'#dc2626', meaning:'Low A/G ratio — may indicate liver cirrhosis, kidney disease, or chronic inflammation.' },
      { label:'High',  range:'Above 2.1',color:'#d97706', meaning:'High A/G ratio — may indicate low globulin production or malnutrition.' },
    ],
  },
};



// ── Hindi translations for Plain English guide ────────────────────────────────
const HINDI_GUIDE = {
  'Fasting Blood Glucose': {
    what: 'यह जांच आपके खून में शुगर (ग्लूकोज) की मात्रा मापती है — जब आपने 8+ घंटे कुछ नहीं खाया हो। यह दिखाता है कि आपका शरीर खाली पेट रक्त शर्करा को कैसे नियंत्रित करता है।',
    goodRange: '70–99 mg/dL सामान्य है। 100–125 प्री-डायबिटीज। 126+ डायबिटीज।',
    ranges: [
      { label:'सामान्य',       meaning:'रक्त शर्करा नियंत्रित है। शरीर ग्लूकोज सही तरीके से manage कर रहा है।' },
      { label:'प्री-डायबिटीज', meaning:'शुगर थोड़ी अधिक है। खान-पान और व्यायाम से इसे सामान्य किया जा सकता है।' },
      { label:'डायबिटीज',      meaning:'शुगर लगातार उच्च है। डॉक्टर का मार्गदर्शन और उपचार ज़रूरी है।' },
    ],
  },
  'HbA1c': {
    what: 'यह पिछले 2–3 महीनों की औसत रक्त शर्करा दिखाता है। एक बार की जांच नहीं — बल्कि पूरे 3 महीने की रिपोर्ट।',
    goodRange: '5.7% से कम सामान्य। 5.7–6.4% प्री-डायबिटीज। 6.5%+ डायबिटीज।',
    ranges: [
      { label:'सामान्य',       meaning:'महीनों से रक्त शर्करा नियंत्रित है। बहुत अच्छा।' },
      { label:'प्री-डायबिटीज', meaning:'शुगर थोड़ी ऊंची रही है। आहार बदलाव से सुधार हो सकता है।' },
      { label:'डायबिटीज',      meaning:'शुगर लगातार अधिक रही है। डॉक्टर उपचार में मदद करेंगे।' },
    ],
  },
  'Haemoglobin': {
    what: 'हीमोग्लोबिन लाल रक्त कोशिकाओं में एक प्रोटीन है जो फेफड़ों से ऑक्सीजन पूरे शरीर में पहुंचाता है। कम हो तो एनीमिया हो सकता है।',
    goodRange: 'पुरुष: 13–17 g/dL। महिला: 11–15 g/dL।',
    ranges: [
      { label:'सामान्य', meaning:'खून में पर्याप्त ऑक्सीजन पहुंच रही है। ऊर्जा स्तर अच्छा रहेगा।' },
      { label:'कम',      meaning:'एनीमिया — थकान, सांस फूलना, चक्कर आ सकते हैं। आयरन की जांच करें।' },
      { label:'अधिक',    meaning:'निर्जलीकरण या रक्त विकार हो सकता है। डॉक्टर से मिलें।' },
    ],
  },
  'MCHC': {
    what: 'प्रत्येक लाल रक्त कोशिका में हीमोग्लोबिन की सांद्रता मापता है। बताता है कि कोशिकाएं ऑक्सीजन से "भरी" हैं या नहीं।',
    goodRange: '32–36 g/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'लाल रक्त कोशिकाओं में सही मात्रा में हीमोग्लोबिन है।' },
      { label:'कम',      meaning:'आयरन की कमी से एनीमिया — कोशिकाएं "पीली" हैं। डॉक्टर से मिलें।' },
      { label:'अधिक',    meaning:'दुर्लभ स्थिति — डॉक्टर की जांच ज़रूरी।' },
    ],
  },
  'Total WBC Count': {
    what: 'श्वेत रक्त कोशिकाएं आपकी रोग प्रतिरोधक क्षमता का आधार हैं — संक्रमण, बैक्टीरिया और वायरस से लड़ती हैं।',
    goodRange: '4,000–11,000 cells/cumm सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'प्रतिरक्षा तंत्र संतुलित है — कोई सक्रिय संक्रमण नहीं।' },
      { label:'कम',      meaning:'रोग प्रतिरोधक क्षमता कमजोर — संक्रमण का खतरा अधिक।' },
      { label:'अधिक',    meaning:'शरीर किसी संक्रमण या सूजन से लड़ रहा है।' },
    ],
  },
  'Platelet Count': {
    what: 'प्लेटलेट्स वे छोटी कोशिकाएं हैं जो घाव होने पर खून को जमाती हैं। कम हों तो अधिक रक्तस्राव, अधिक हों तो थक्का जमने का खतरा।',
    goodRange: '1.5–4.5 लाख/µL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'खून सामान्य रूप से जम सकता है।' },
      { label:'कम',      meaning:'असामान्य चोट या लंबे रक्तस्राव का खतरा। डॉक्टर से जांच करवाएं।' },
      { label:'अधिक',    meaning:'थक्का जमने का खतरा बढ़ सकता है।' },
    ],
  },
  'Lymphocytes': {
    what: 'लिम्फोसाइट्स वायरल संक्रमण से लड़ते हैं और एंटीबॉडी बनाते हैं। ये पुराने संक्रमणों को "याद" रखते हैं।',
    goodRange: '20–40% सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'वायरल प्रतिरक्षा संतुलित है।' },
      { label:'कम',      meaning:'वायरल संक्रमण से लड़ने की क्षमता कम।' },
      { label:'अधिक',    meaning:'सक्रिय वायरल संक्रमण या प्रतिरक्षा प्रतिक्रिया।' },
    ],
  },
  'ESR': {
    what: 'एरिथ्रोसाइट सेडिमेंटेशन रेट — शरीर में कहीं भी सूजन का एक सामान्य संकेत। यह बताता है कि आपके खून की लाल कोशिकाएं कितनी तेजी से नीचे बैठती हैं।',
    goodRange: 'पुरुष: 0–15 mm/hr। महिला: 0–20 mm/hr।',
    ranges: [
      { label:'सामान्य', meaning:'कोई महत्वपूर्ण सूजन नहीं।' },
      { label:'थोड़ा अधिक', meaning:'हल्का संक्रमण या सूजन हो सकती है।' },
      { label:'बहुत अधिक', meaning:'सक्रिय सूजन, संक्रमण या ऑटोइम्यून स्थिति — जांच ज़रूरी।' },
    ],
  },
  'Total Cholesterol': {
    what: 'खून में कुल वसा (कोलेस्ट्रॉल) की मात्रा। अधिक कोलेस्ट्रॉल धमनियों को बंद कर सकता है और हृदय रोग का खतरा बढ़ाता है।',
    goodRange: '200 mg/dL से कम अच्छा है।',
    ranges: [
      { label:'सामान्य',          meaning:'हृदय रोग का खतरा कम।' },
      { label:'सीमा रेखा (200–239)', meaning:'खान-पान और व्यायाम सुधारें।' },
      { label:'उच्च (240+)',       meaning:'हृदय रोग और स्ट्रोक का खतरा बढ़ा। डॉक्टर से मिलें।' },
    ],
  },
  'LDL Cholesterol': {
    what: '"खराब" कोलेस्ट्रॉल — धमनियों की दीवारों पर जमता है और उन्हें संकरा बनाता है। हृदय रोग का मुख्य कारण।',
    goodRange: '100 mg/dL से कम सर्वोत्तम है।',
    ranges: [
      { label:'सामान्य (100 से कम)', meaning:'धमनियों में जमाव का खतरा कम।' },
      { label:'ऊपरी सीमा (100–129)', meaning:'खान-पान सुधारें।' },
      { label:'उच्च (130+)',          meaning:'हृदय रोग का खतरा अधिक। दवा या जीवनशैली बदलाव ज़रूरी।' },
    ],
  },
  'HDL Cholesterol': {
    what: '"अच्छा" कोलेस्ट्रॉल — धमनियों से खराब कोलेस्ट्रॉल हटाकर यकृत तक पहुंचाता है। अधिक होना अच्छा है।',
    goodRange: 'महिला: 50+ mg/dL। पुरुष: 40+ mg/dL।',
    ranges: [
      { label:'सामान्य', meaning:'हृदय रोग से सुरक्षा अच्छी है।' },
      { label:'कम',      meaning:'हृदय रोग का खतरा बढ़ सकता है। व्यायाम और स्वस्थ वसा बढ़ाएं।' },
    ],
  },
  'Total Triglycerides': {
    what: 'अतिरिक्त कैलोरी से बनी वसा — विशेष रूप से मीठे और मैदे से। अधिक होने पर हृदय और अग्नाशय का खतरा बढ़ता है।',
    goodRange: '150 mg/dL से कम अच्छा है।',
    ranges: [
      { label:'सामान्य',          meaning:'वसा का स्तर स्वस्थ है।' },
      { label:'सीमा रेखा (150–199)', meaning:'चीनी, शराब और मैदा कम करें।' },
      { label:'उच्च (200+)',       meaning:'हृदय और सूजन का खतरा। खान-पान में बड़ा बदलाव ज़रूरी।' },
    ],
  },
  'Non-HDL Cholesterol': {
    what: 'कुल कोलेस्ट्रॉल से अच्छे HDL को घटाने पर जो बचता है — सभी हानिकारक कण। LDL से बेहतर हृदय जोखिम संकेतक।',
    goodRange: '130 mg/dL या कम सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'हृदय जोखिम कम है।' },
      { label:'उच्च',    meaning:'हृदय रोग का खतरा अधिक — डॉक्टर से परामर्श लें।' },
    ],
  },
  'GGT': {
    what: 'गामा ग्लूटामिल ट्रांसफेरेज़ — एक यकृत एंजाइम। अधिक होने पर यकृत पर तनाव, शराब का सेवन या पित्त नली की समस्या हो सकती है।',
    goodRange: 'महिला: 5–36 U/L। पुरुष: 8–61 U/L।',
    ranges: [
      { label:'सामान्य',  meaning:'यकृत स्वस्थ है।' },
      { label:'थोड़ा अधिक', meaning:'शराब, फैटी लीवर या दवाओं का प्रभाव हो सकता है।' },
      { label:'बहुत अधिक', meaning:'यकृत सूजन या पित्त नली में रुकावट — गैस्ट्रोएंटेरोलॉजिस्ट से मिलें।' },
    ],
  },
  'TSH': {
    what: 'थायराइड स्टिमुलेटिंग हार्मोन — पिट्यूटरी ग्रंथि से निकलता है और थायराइड को नियंत्रित करता है। थायराइड कार्य की पहली जांच।',
    goodRange: '0.27–4.2 µIU/mL सामान्य है।',
    ranges: [
      { label:'सामान्य',  meaning:'थायराइड सही तरीके से काम कर रहा है।' },
      { label:'अधिक TSH', meaning:'थायराइड कम सक्रिय (हाइपोथायरायडिज्म) — थकान, वजन बढ़ना।' },
      { label:'कम TSH',   meaning:'थायराइड अधिक सक्रिय (हाइपरथायरायडिज्म) — वजन घटना, धड़कन तेज।' },
    ],
  },
  'Creatinine': {
    what: 'मांसपेशी चयापचय का एक अपशिष्ट पदार्थ — गुर्दे इसे साफ करते हैं। गुर्दे कितना अच्छा काम कर रहे हैं, यह मापने का सबसे सरल तरीका।',
    goodRange: 'पुरुष: 0.7–1.3 mg/dL। महिला: 0.5–0.9 mg/dL।',
    ranges: [
      { label:'सामान्य', meaning:'गुर्दे सही तरीके से फिल्टर कर रहे हैं।' },
      { label:'थोड़ा अधिक', meaning:'पानी खूब पिएं और 4–6 सप्ताह में दोबारा जांच करें।' },
      { label:'बहुत अधिक', meaning:'गुर्दे सही से काम नहीं कर रहे — नेफ्रोलॉजिस्ट से मिलें।' },
    ],
  },
  'Uric Acid': {
    what: 'प्यूरीन (लाल मांस, शराब, सी-फूड में) टूटने से बनता है। अधिक होने पर जोड़ों में क्रिस्टल जमते हैं जिससे गाउट होता है।',
    goodRange: 'पुरुष: 3.4–7.0 mg/dL। महिला: 2.4–5.7 mg/dL।',
    ranges: [
      { label:'सामान्य', meaning:'गाउट या पथरी का खतरा नहीं।' },
      { label:'थोड़ा अधिक', meaning:'लाल मांस, शराब, फ्रुक्टोज कम करें। पानी अधिक पिएं।' },
      { label:'बहुत अधिक', meaning:'गाउट (जोड़ों में तेज दर्द) और गुर्दे की पथरी का खतरा।' },
    ],
  },
  'Potassium': {
    what: 'एक इलेक्ट्रोलाइट जो हृदय की धड़कन, मांसपेशियों और तंत्रिका संकेतों के लिए ज़रूरी है। यहां तक कि छोटी असामान्यता भी हृदय को प्रभावित कर सकती है।',
    goodRange: '3.5–5.0 mmol/L सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'हृदय और मांसपेशियां सामान्य रूप से काम कर रही हैं।' },
      { label:'कम',      meaning:'मांसपेशियों में कमजोरी, ऐंठन, अनियमित धड़कन।' },
      { label:'अधिक',    meaning:'खतरनाक हृदय ताल गड़बड़ी — तुरंत डॉक्टर से मिलें।' },
    ],
  },
  'Vitamin B12': {
    what: 'तंत्रिका कार्य, DNA उत्पादन और लाल रक्त कोशिकाओं के लिए ज़रूरी विटामिन। शरीर खुद नहीं बना सकता — पशु उत्पाद या सप्लीमेंट से मिलता है।',
    goodRange: '191–663 pg/mL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'B12 पर्याप्त है।' },
      { label:'कम',      meaning:'थकान, हाथ-पैर में झुनझुनी हो सकती है। B12 सप्लीमेंट शुरू करें।' },
      { label:'अधिक (>663)', meaning:'अक्सर सप्लीमेंट से — आमतौर पर हानिरहित। डॉक्टर से पुष्टि करें।' },
    ],
  },
  'Vitamin D (25-OH)': {
    what: 'धूप से बनने वाला विटामिन जो हड्डियों के लिए कैल्शियम अवशोषण, प्रतिरक्षा और मनोदशा में मदद करता है।',
    goodRange: '30–100 ng/mL सर्वोत्तम है।',
    ranges: [
      { label:'सामान्य (30–100)', meaning:'हड्डियां और प्रतिरक्षा तंत्र मजबूत हैं।' },
      { label:'अपर्याप्त (21–29)', meaning:'प्रतिदिन 15–20 मिनट धूप लें और सप्लीमेंट लें।' },
      { label:'कमी (≤20)',        meaning:'हड्डी कमजोरी और प्रतिरक्षा की कमी का खतरा। सप्लीमेंट ज़रूरी।' },
    ],
  },
  'Rheumatoid Factor': {
    what: 'एक एंटीबॉडी जो स्वस्थ जोड़ों पर हमला करती है। रुमेटाइड आर्थराइटिस और अन्य ऑटोइम्यून स्थितियों की पहचान में मदद करती है।',
    goodRange: '14 IU/mL से कम सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'कोई महत्वपूर्ण ऑटोइम्यून गतिविधि नहीं।' },
      { label:'थोड़ा अधिक', meaning:'गलत-सकारात्मक हो सकता है। लक्षणों के साथ मूल्यांकन करें।' },
      { label:'बहुत अधिक', meaning:'रुमेटाइड आर्थराइटिस की संभावना — रुमेटोलॉजिस्ट से मिलें।' },
    ],
  },
  'Serum Creatinine': {
    what: 'मांसपेशी चयापचय का एक अपशिष्ट पदार्थ — गुर्दे इसे साफ करते हैं। गुर्दे कितना अच्छा काम कर रहे हैं, यह मापने का सबसे सरल तरीका।',
    goodRange: 'पुरुष: 0.7–1.3 mg/dL। महिला: 0.5–0.9 mg/dL।',
    ranges: [
      { label:'सामान्य', meaning:'गुर्दे सही तरीके से फिल्टर कर रहे हैं।' },
      { label:'थोड़ा अधिक', meaning:'पानी खूब पिएं और 4–6 सप्ताह में दोबारा जांच करें।' },
      { label:'बहुत अधिक', meaning:'गुर्दे सही से काम नहीं कर रहे — नेफ्रोलॉजिस्ट से मिलें।' },
    ],
  },
  'RBC Count': {
    what: 'लाल रक्त कोशिकाओं की कुल संख्या मापता है। ये कोशिकाएं पूरे शरीर में ऑक्सीजन पहुंचाती हैं।',
    goodRange: 'पुरुष: 4.5–5.9 Mill/cumm। महिला: 3.8–4.8 Mill/cumm।',
    ranges: [
      { label:'सामान्य', meaning:'पर्याप्त लाल कोशिकाएं — शरीर में ऑक्सीजन ठीक से पहुंच रही है।' },
      { label:'कम', meaning:'लाल कोशिकाएं कम — एनीमिया हो सकता है, थकान और सांस फूलना।' },
      { label:'अधिक', meaning:'रक्त गाढ़ा हो सकता है — निर्जलीकरण या रक्त विकार की संभावना।' },
    ],
  },
  'PCV': {
    what: 'पैक्ड सेल वॉल्यूम — खून में लाल कोशिकाओं का प्रतिशत। एनीमिया और निर्जलीकरण जांचने में सहायक।',
    goodRange: 'पुरुष: 40–52%। महिला: 36–46%।',
    ranges: [
      { label:'सामान्य', meaning:'लाल कोशिकाओं का अनुपात सही है।' },
      { label:'कम', meaning:'एनीमिया — आयरन या B12 की कमी हो सकती है।' },
      { label:'अधिक', meaning:'निर्जलीकरण या पॉलीसाइथीमिया — डॉक्टर से मिलें।' },
    ],
  },
  'MCV': {
    what: 'मीन कॉर्पस्कुलर वॉल्यूम — प्रत्येक लाल रक्त कोशिका का औसत आकार। एनीमिया के प्रकार को पहचानने में मदद करता है।',
    goodRange: '80–100 fL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'कोशिकाओं का आकार सही है।' },
      { label:'कम (माइक्रोसाइटिक)', meaning:'आयरन की कमी या थैलेसीमिया।' },
      { label:'अधिक (मैक्रोसाइटिक)', meaning:'B12 या फोलेट की कमी।' },
    ],
  },
  'MCH': {
    what: 'मीन कॉर्पस्कुलर हीमोग्लोबिन — प्रत्येक लाल कोशिका में औसत हीमोग्लोबिन की मात्रा।',
    goodRange: '26–34 pg सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'प्रत्येक कोशिका में सही मात्रा में हीमोग्लोबिन है।' },
      { label:'कम', meaning:'आयरन की कमी से एनीमिया।' },
      { label:'अधिक', meaning:'मैक्रोसाइटिक एनीमिया — B12 जांचें।' },
    ],
  },
  'Neutrophils': {
    what: 'सबसे आम श्वेत रक्त कोशिका — बैक्टीरियल संक्रमण के खिलाफ पहली रक्षा पंक्ति।',
    goodRange: '45–75% सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'बैक्टीरियल संक्रमण से लड़ने की क्षमता सामान्य।' },
      { label:'कम', meaning:'संक्रमण से लड़ने की क्षमता कम।' },
      { label:'अधिक', meaning:'सक्रिय बैक्टीरियल संक्रमण या शरीर पर तनाव।' },
    ],
  },
  'Eosinophils': {
    what: 'एलर्जी और परजीवी संक्रमण से लड़ने वाली श्वेत रक्त कोशिका।',
    goodRange: '1–6% सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'एलर्जी प्रतिक्रिया सामान्य सीमा में।' },
      { label:'अधिक', meaning:'एलर्जी, दमा, या परजीवी संक्रमण हो सकता है।' },
    ],
  },
  'Monocytes': {
    what: 'संक्रमण की जांच करने वाली श्वेत रक्त कोशिका — मृत कोशिकाओं को साफ करती है।',
    goodRange: '2–10% सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'प्रतिरक्षा निगरानी सामान्य है।' },
      { label:'अधिक', meaning:'वायरल/बैक्टीरियल संक्रमण या सूजन।' },
    ],
  },
  'Basophils': {
    what: 'एलर्जी प्रतिक्रियाओं में शामिल दुर्लभ श्वेत रक्त कोशिका।',
    goodRange: '0–2% सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'एलर्जी प्रतिक्रिया नियंत्रित है।' },
      { label:'अधिक', meaning:'एलर्जी या सूजन की स्थिति।' },
    ],
  },
  'Total Bilirubin': {
    what: 'बिलीरुबिन लाल रक्त कोशिकाओं के टूटने से बनता है और यकृत द्वारा हटाया जाता है। अधिक होने पर पीलिया हो सकता है।',
    goodRange: '0.2–1.2 mg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'यकृत बिलीरुबिन सही तरह हटा रहा है।' },
      { label:'थोड़ा अधिक', meaning:'हल्का यकृत तनाव — जांच करवाएं।' },
      { label:'बहुत अधिक', meaning:'पीलिया — यकृत रोग या पित्त नली की समस्या।' },
    ],
  },
  'Direct Bilirubin': {
    what: 'यकृत द्वारा प्रसंस्कृत बिलीरुबिन — पित्त नली की समस्याओं का संकेत दे सकता है।',
    goodRange: '0–0.3 mg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'पित्त नली सही काम कर रही है।' },
      { label:'अधिक', meaning:'पित्त नली में अवरोध — गैस्ट्रोलॉजिस्ट से मिलें।' },
    ],
  },
  'SGOT/AST': {
    what: 'यकृत और हृदय का एंजाइम। बढ़े हुए स्तर का मतलब यकृत कोशिकाएं क्षतिग्रस्त हैं।',
    goodRange: '40 U/L से कम सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'यकृत स्वस्थ है।' },
      { label:'थोड़ा अधिक', meaning:'हल्का यकृत तनाव — शराब और प्रसंस्कृत खाना बंद करें।' },
      { label:'बहुत अधिक', meaning:'गंभीर यकृत क्षति — डॉक्टर से तुरंत मिलें।' },
    ],
  },
  'SGPT/ALT': {
    what: 'सबसे यकृत-विशिष्ट एंजाइम। यकृत क्षति का सबसे अच्छा संकेतक।',
    goodRange: '42 U/L से कम सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'यकृत सुरक्षित है।' },
      { label:'अधिक', meaning:'फैटी लिवर, शराब, या दवा का असर।' },
      { label:'बहुत अधिक', meaning:'हेपेटाइटिस या गंभीर यकृत रोग — हेपेटोलॉजिस्ट से मिलें।' },
    ],
  },
  'Alkaline Phosphatase': {
    what: 'यकृत और हड्डियों का एंजाइम। बढ़ा हुआ स्तर यकृत रोग या हड्डी समस्या का संकेत।',
    goodRange: '35–104 U/L सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'यकृत और हड्डियां ठीक हैं।' },
      { label:'अधिक', meaning:'पित्त नली में अवरोध या हड्डी विकार।' },
    ],
  },
  'Total Protein': {
    what: 'खून में कुल प्रोटीन — यकृत कार्य का संकेतक। कम प्रोटीन = यकृत ठीक से काम नहीं कर रहा।',
    goodRange: '6.6–8.7 g/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'यकृत पर्याप्त प्रोटीन बना रहा है।' },
      { label:'कम', meaning:'यकृत कमजोर हो सकता है या कुपोषण।' },
    ],
  },
  'Albumin': {
    what: 'यकृत द्वारा बना मुख्य रक्त प्रोटीन। यकृत स्वास्थ्य और पोषण स्थिति दर्शाता है।',
    goodRange: '3.5–5.2 g/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'यकृत और पोषण सही है।' },
      { label:'कम', meaning:'यकृत रोग या गंभीर कुपोषण — जांच ज़रूरी।' },
    ],
  },
  'T3 Total (TT3)': {
    what: 'थायराइड हार्मोन T3 — चयापचय, ऊर्जा, हृदय गति नियंत्रित करता है।',
    goodRange: '0.80–2.00 ng/mL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'थायराइड सही तरह काम कर रहा है।' },
      { label:'कम', meaning:'हाइपोथायरायडिज्म — थकान, वजन बढ़ना।' },
      { label:'अधिक', meaning:'हाइपरथायरायडिज्म — दिल की धड़कन तेज, वजन कम होना।' },
    ],
  },
  'T4 Total (TT4)': {
    what: 'थायराइड हार्मोन T4 — भंडारण रूप जो जरूरत पर T3 में बदलता है।',
    goodRange: '5.1–14.1 µg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'थायराइड हार्मोन संतुलित है।' },
      { label:'कम', meaning:'हाइपोथायरायडिज्म की संभावना।' },
      { label:'अधिक', meaning:'हाइपरथायरायडिज्म की संभावना।' },
    ],
  },
  'Free T3 (FT3)': {
    what: 'सक्रिय थायराइड हार्मोन जो सीधे चयापचय और ऊर्जा को नियंत्रित करता है।',
    goodRange: '2.0–4.4 pg/mL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'थायराइड सक्रिय हार्मोन सही मात्रा में।' },
      { label:'कम', meaning:'हाइपोथायरायडिज्म।' },
      { label:'अधिक', meaning:'हाइपरथायरायडिज्म।' },
    ],
  },
  'Free T4 (FT4)': {
    what: 'मुक्त थायरोक्सिन — बाइंडिंग प्रोटीन से अप्रभावित, सबसे सटीक थायराइड माप।',
    goodRange: '1.0–1.6 ng/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'थायराइड हार्मोन स्तर सही है।' },
      { label:'कम', meaning:'हाइपोथायरायडिज्म।' },
      { label:'अधिक', meaning:'हाइपरथायरायडिज्म।' },
    ],
  },
  'Blood Urea': {
    what: 'प्रोटीन चयापचय का अपशिष्ट — गुर्दों द्वारा साफ किया जाता है। गुर्दे की कार्यक्षमता का संकेत।',
    goodRange: '16.6–48.5 mg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'गुर्दे यूरिया सही तरह साफ कर रहे हैं।' },
      { label:'अधिक', meaning:'गुर्दे की कमजोरी या निर्जलीकरण — पानी अधिक पिएं।' },
    ],
  },
  'BUN': {
    what: 'ब्लड यूरिया नाइट्रोजन — प्रोटीन टूटने से बना नाइट्रोजन जो गुर्दे साफ करते हैं।',
    goodRange: '7–18 mg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'गुर्दे की फिल्ट्रेशन सही है।' },
      { label:'अधिक', meaning:'गुर्दे की समस्या या अधिक प्रोटीन आहार।' },
    ],
  },
  'Sodium': {
    what: 'शरीर में द्रव संतुलन, रक्तचाप और तंत्रिका कार्य नियंत्रित करने वाला इलेक्ट्रोलाइट।',
    goodRange: '135–150 mmol/L सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'द्रव संतुलन और रक्तचाप सही है।' },
      { label:'कम', meaning:'हाइपोनेट्रेमिया — थकान, सिरदर्द, भ्रम हो सकता है।' },
      { label:'अधिक', meaning:'हाइपरनेट्रेमिया — निर्जलीकरण या गुर्दे की समस्या।' },
    ],
  },
  'Calcium': {
    what: 'मजबूत हड्डियों, मांसपेशी संकुचन, रक्त जमाव और तंत्रिका संकेतों के लिए आवश्यक।',
    goodRange: '8.6–10.0 mg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'हड्डी और मांसपेशी स्वास्थ्य अच्छा है।' },
      { label:'कम', meaning:'मांसपेशियों में ऐंठन, हड्डी कमजोर — विटामिन D जांचें।' },
      { label:'अधिक', meaning:'गुर्दे की पथरी या पैराथायराइड समस्या — जांच ज़रूरी।' },
    ],
  },
  'Chloride': {
    what: 'शरीर के द्रव संतुलन और एसिड-बेस संतुलन को बनाए रखने वाला इलेक्ट्रोलाइट।',
    goodRange: '94–110 mmol/L सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'इलेक्ट्रोलाइट संतुलन सही है।' },
      { label:'असामान्य', meaning:'एसिड-बेस असंतुलन — दवाओं या गुर्दे की जांच करें।' },
    ],
  },
  'TIBC': {
    what: 'टोटल आयरन बाइंडिंग कैपेसिटी — खून में आयरन ले जाने की क्षमता। उच्च TIBC आमतौर पर आयरन की कमी दर्शाता है।',
    goodRange: '250–450 µg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'आयरन भंडारण सही है।' },
      { label:'अधिक', meaning:'आयरन की कमी — शरीर अधिक आयरन चाहता है।' },
    ],
  },
  'Serum Iron': {
    what: 'खून में वास्तविक आयरन की मात्रा। आयरन हीमोग्लोबिन बनाने और ऑक्सीजन पहुंचाने के लिए ज़रूरी है।',
    goodRange: 'पुरुष: 70–180 µg/dL। महिला: 60–160 µg/dL।',
    ranges: [
      { label:'सामान्य', meaning:'पर्याप्त आयरन — हीमोग्लोबिन बनाने के लिए काफी।' },
      { label:'कम', meaning:'आयरन की कमी — पालक, दाल, राजमा अधिक खाएं।' },
      { label:'अधिक', meaning:'आयरन ओवरलोड — यकृत को नुकसान हो सकता है।' },
    ],
  },
  'Transferrin Saturation': {
    what: 'ट्रांसफेरिन प्रोटीन कितना आयरन लेकर चल रहा है, इसका प्रतिशत। आयरन भंडार का महत्वपूर्ण संकेतक।',
    goodRange: '12–50% सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'आयरन प्रसंस्करण सही है।' },
      { label:'कम', meaning:'आयरन की कमी — हीमोग्लोबिन सामान्य होने पर भी।' },
      { label:'अधिक', meaning:'आयरन ओवरलोड — हेमोक्रोमेटोसिस हो सकता है।' },
    ],
  },  'Anti-CCP': {
    what: 'रुमेटाइड आर्थराइटिस के लिए अत्यंत विशिष्ट एंटीबॉडी टेस्ट — RF से अधिक सटीक।',
    goodRange: '17 U/mL से कम सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'रुमेटाइड आर्थराइटिस की संभावना बहुत कम।' },
      { label:'पॉजिटिव', meaning:'रुमेटाइड आर्थराइटिस की पुष्टि — जल्दी उपचार से जोड़ों को नुकसान रोका जा सकता है।' },
    ],
  },
  'RDW-CV': {
    what: 'रेड सेल डिस्ट्रीब्यूशन विड्थ — लाल रक्त कोशिकाओं के आकार में भिन्नता। एनीमिया के प्रकार पहचानने में मदद करता है।',
    goodRange: '11.6–14.0% सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'लाल कोशिकाएं एक समान आकार की हैं।' },
      { label:'अधिक', meaning:'मिश्रित एनीमिया या पोषक तत्वों की कमी।' },
    ],
  },
  'MPV': {
    what: 'मीन प्लेटलेट वॉल्यूम — प्लेटलेट का औसत आकार। बड़ी प्लेटलेट्स अधिक सक्रिय होती हैं।',
    goodRange: '7–11 fL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'प्लेटलेट आकार और गतिविधि संतुलित।' },
      { label:'अधिक', meaning:'प्लेटलेट बहुत सक्रिय — सूजन या थक्का जोखिम।' },
    ],
  },
  'PDW': {
    what: 'प्लेटलेट डिस्ट्रीब्यूशन विड्थ — प्लेटलेट आकार में भिन्नता दर्शाता है।',
    goodRange: '11–22 fL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'प्लेटलेट आकार एक समान है।' },
      { label:'अधिक', meaning:'प्लेटलेट सक्रियता या सूजन।' },
    ],
  },
  'Globulin': {
    what: 'प्रतिरक्षा प्रोटीन — एंटीबॉडी शामिल हैं। संक्रमण, यकृत रोग और ऑटोइम्यून स्थितियों का संकेत।',
    goodRange: '2.0–4.5 g/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'प्रतिरक्षा प्रोटीन संतुलित है।' },
      { label:'अधिक', meaning:'सक्रिय संक्रमण, यकृत रोग या ऑटोइम्यून बीमारी।' },
    ],
  },
  'Transferrin': {
    what: 'आयरन ले जाने वाला प्रोटीन — TIBC की तरह आयरन भंडार दर्शाता है।',
    goodRange: '200–360 mg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'आयरन परिवहन सही है।' },
      { label:'अधिक', meaning:'आयरन की कमी।' },
      { label:'कम', meaning:'यकृत रोग या अधिक आयरन।' },
    ],
  },
  'UIBC': {
    what: 'अनसैचुरेटेड आयरन बाइंडिंग कैपेसिटी — ट्रांसफेरिन कितना अधिक आयरन ले सकता है।',
    goodRange: 'महिला: 135–392 µg/dL सामान्य है।',
    ranges: [
      { label:'सामान्य', meaning:'आयरन क्षमता संतुलित है।' },
      { label:'अधिक', meaning:'आयरन की कमी — शरीर अधिक आयरन के लिए तैयार है।' },
    ],
  },
  'Mean Plasma Glucose': {
    what: 'HbA1c से गणना किया गया औसत प्लाज्मा ग्लूकोज — पिछले 3 महीनों का अनुमानित औसत रक्त शर्करा।',
    goodRange: '154 mg/dL से कम सामान्य HbA1c के साथ।',
    ranges: [
      { label:'सामान्य', meaning:'औसत रक्त शर्करा नियंत्रित रही है।' },
      { label:'अधिक', meaning:'रक्त शर्करा का दीर्घकालिक उच्च स्तर।' },
    ],
  },

};

const DIRECT_PATTERNS = [
  // ── Glucose ────────────────────────────────────────────────────────────────
  ['Fasting Blood Glucose','Glucose',   /Fasting Glucose\s*([\d.]+)\s*mg\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                   70,   99  ],
  ['HbA1c',               'Glucose',   /Haemoglobin HbA1c\s*([\d.]+)\s*%/i,                                                                  null, 5.8 ],
  ['Mean Plasma Glucose',  'Glucose',   /Approximate Mean Plasma Glucose\s*([\d.]+)/i,                                                         0,    9999],
  // ── Vitamins ───────────────────────────────────────────────────────────────
  ['Vitamin B12',          'Other',     /Vitamin\s*-\s*B12\s*>?\s*([\d.]+)\s*pg\/mL[\s\S]{1,80}?([\d]{3})\s*-\s*([\d]{3})/i,                  191,  663 ],
  ['Vitamin D (25-OH)',    'Other',     /25\s*\(OH\)\s*Vitamin-D\s*([\d.]+)\s*ng\/mL/i,                                                        30,   100 ],
  // ── CBC ────────────────────────────────────────────────────────────────────
  ['Haemoglobin',          'CBC',       /Haemoglobin\s*([\d.]+)\s*gm%\s*([\d.]+)\s*-\s*([\d.]+)/i,                                             11,   15  ],
  ['RBC Count',            'CBC',       /RBC Count\s*([\d.]+)\s*Millions\/cumm\s*([\d.]+)\s*-\s*([\d.]+)/i,                                     3.8,  4.8 ],
  ['Total WBC Count',      'CBC',       /Total WBC Count\s*([\d.]+)\s*Cells\/cumm\s*([\d.]+)\s*-\s*([\d.]+)/i,                                  4000, 11000],
  ['Platelet Count',       'CBC',       /Platelet Count\s*(\d+)\s*10[ˆ^]3\/[µu]L\s*([\d.]+)\s*-\s*([\d.]+)/i,                                  150,  450 ],
  ['PCV',                  'CBC',       /Packed Cell Volume\s*\(PCV\)\s*([\d.]+)\s*%\s*([\d.]+)\s*-\s*([\d.]+)/i,                               36,   46  ],
  ['MCV',                  'CBC',       /Mean Corpuscular Volume\s*\(MCV\)\s*([\d.]+)\s*fL\s*([\d.]+)\s*-\s*([\d.]+)/i,                         80,   100 ],
  ['MCH',                  'CBC',       /Mean Corpuscular Hb\.\s*\(MCH\)\s*([\d.]+)\s*pg\s*([\d.]+)\s*-\s*([\d.]+)/i,                           26,   34  ],
  ['MCHC',                 'CBC',       /\bMCHC\s*([\d.]+)\s*g\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                32,   36  ],
  ['RDW-CV',               'CBC',       /RDW CV\s*([\d.]+)\s*%\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                    11.6, 14.0],
  ['RDW-SD',               'CBC',       /RDW SD\s*([\d.]+)\s*fL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                   29,   46  ],
  ['PDW',                  'CBC',       /\bPDW\s*([\d.]+)\s*fL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                    11,   22  ],
  ['MPV',                  'CBC',       /\bMPV\s*([\d.]+)\s*fL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                    7,    11  ],
  ['Neutrophils',          'CBC',       /Neutrophils\s*([\d.]+)\s*%\s*([\d.]+)\s*-\s*([\d.]+)/i,                                               45,   75  ],
  ['Lymphocytes',          'CBC',       /Lymphocytes\s*([\d.]+)\s*%\s*([\d.]+)\s*-\s*([\d.]+)/i,                                               20,   40  ],
  ['Eosinophils',          'CBC',       /Eosinophils\s*([\d.]+)\s*%\s*([\d.]+)\s*-\s*([\d.]+)/i,                                               1,    6   ],
  ['Monocytes',            'CBC',       /Monocytes\s*([\d.]+)\s*%\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                 2,    10  ],
  ['Basophils',            'CBC',       /Basophils\s*([\d.]+)\s*%\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                 0,    2   ],
  // ── ESR ────────────────────────────────────────────────────────────────────
  ['ESR',                  'Inflammation', /Erythrocyte Sedimentation Rate\s*\(ESR\)\s*([\d.]+)\s*mm\/hr\s*([\d.]+)\s*-\s*([\d.]+)/i,          0,    20  ],
  // ── Lipid ──────────────────────────────────────────────────────────────────
  ['Total Cholesterol',    'Lipid',     /Total Cholesterol\s*([\d.]+)\s*mg\/dL/i,                                                              0,    200 ],
  ['HDL Cholesterol',      'Lipid',     /HDL Cholesterol\s*([\d.]+)\s*mg\/dL/i,                                                                40,   9999],
  ['Total Triglycerides',  'Lipid',     /Total Triglycerides\s*([\d.]+)\s*mg\/dL/i,                                                            0,    150 ],
  ['VLDL Cholesterol',     'Lipid',     /VLDL Cholesterol\s*([\d.]+)\s*mg\/dL/i,                                                               0,    30  ],
  // LDL: use negative lookbehind to avoid matching VLDL line
  ['LDL Cholesterol',      'Lipid',     /(?<!V)LDL Cholesterol\s*([\d.]+)\s*mg\/dL/i,                                                          0,    100 ],
  ['Non-HDL Cholesterol',  'Lipid',     /Non\s*-\s*HDL Cholesterol\s*([\d.]+)\s*mg\/dL\s*[≤<]\s*([\d.]+)/i,                                    0,    130 ],
  // ── LFT ────────────────────────────────────────────────────────────────────
  ['Total Bilirubin',      'Liver',     /Total Bilirubin\s*([\d.]+)\s*mg\/dL\s*<\s*([\d.]+)/i,                                                 0,    1.2 ],
  ['Direct Bilirubin',     'Liver',     /Direct Bilirubin\s*([\d.]+)\s*mg\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                     0,    0.3 ],
  ['Indirect Bilirubin',   'Liver',     /Indirect Bilirubin\s*([\d.]+)\s*mg\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                   0.1,  1.0 ],
  ['SGOT/AST',             'Liver',     /SGOT\s*\/\s*AST\s*([\d.]+)\s*U\/L\s*<\s*([\d.]+)/i,                                                   0,    40  ],
  ['SGPT/ALT',             'Liver',     /SGPT\s*\/\s*ALT\s*([\d.]+)\s*U\/L\s*<\s*([\d.]+)/i,                                                   0,    42  ],
  // ALP: use 3-group to capture full 35-104 range (not just "35")
  ['Alkaline Phosphatase', 'Liver',     /Alkaline Phosphatase\s*([\d.]+)\s*U\/L\s*([\d.]+)\s*[-–‑]\s*([\d.]+)/i,                               35,   104 ],
  ['GGT',                  'Liver',     /Gamma Glutamyl Transferase\s*\(GGT\)\s*([\d.]+)\s*U\/L/i,                                             5,    36  ],
  ['Total Protein',        'Liver',     /Total Protein\s*([\d.]+)\s*g\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                         6.0,  8.7 ],
  ['Albumin',              'Liver',     /\bAlbumin\s*([\d.]+)\s*g\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                             3.5,  5.2 ],
  ['Globulin',             'Liver',     /\bGlobulin\s*([\d.]+)\s*g\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                            2.0,  4.5 ],
  // ── Thyroid ────────────────────────────────────────────────────────────────
  ['TSH',                  'Thyroid',   /Thyroid Stimulating Hormone\s*\(TSH\)\s*([\d.]+)\s*[µμ]IU\/mL\s*([\d.]+)\s*-\s*([\d.]+)/i,            0.27, 4.2 ],
  ['T3 Total (TT3)',       'Thyroid',   /Triiodothyronine Total\s*\(TT3\)\s*([\d.]+)\s*ng\/mL\s*([\d.]+)\s*-\s*([\d.]+)/i,                     0.80, 2.00],
  ['T4 Total (TT4)',       'Thyroid',   /Thyroxine\s*\(TT4\)\s*([\d.]+)\s*[µμ]g\/dL\s*([\d.]+)[-–]?\s*([\d.]+)/i,                             5.1,  14.1],
  ['Free T3 (FT3)',        'Thyroid',   /Triiodothyronine Free\s*\(FT3\)\s*([\d.]+)\s*pg\/mL\s*([\d.]+)\s*-\s*([\d.]+)/i,                      2.0,  4.4 ],
  ['Free T4 (FT4)',        'Thyroid',   /Thyroxine\s*-\s*Free\s*\(FT4\)\s*([\d.]+)\s*ng\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                       1.0,  1.6 ],
  // ── RFT ────────────────────────────────────────────────────────────────────
  ['Urea',                 'Kidney',    /\bUrea\s*([\d.]+)\s*mg\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                               16.6, 48.5],
  ['Creatinine',           'Kidney',    /\bCreatinine\s*([\d.]+)\s*mg\/dL\s*Females?:\s*([\d.]+)\s*-\s*([\d.]+)/i,                              0.5,  0.9 ],
  ['BUN',                  'Kidney',    /\bBUN\s*([\d.]+)\s*mg\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                                7,    18  ],
  ['Uric Acid',            'Kidney',    /Uric Acid\s*([\d.]+)\s*mg\/dL/i,                                                                       2.4,  5.7 ],
  ['Sodium',               'Kidney',    /\bSodium\s*([\d.]+)\s*mmol\/L\s*([\d.]+)\s*-\s*([\d.]+)/i,                                            135,  150 ],
  ['Potassium',            'Kidney',    /\bPotassium\s*([\d.]+)\s*mmol\/L\s*([\d.]+)\s*-\s*([\d.]+)/i,                                         3.5,  5.0 ],
  ['Chloride',             'Kidney',    /\bChloride\s*([\d.]+)\s*mmol\/L\s*([\d.]+)\s*-\s*([\d.]+)/i,                                          94,   110 ],
  ['Calcium',              'Kidney',    /\bCalcium\s*([\d.]+)\s*mg\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                            8.6,  10.0],
  // ── Iron ───────────────────────────────────────────────────────────────────
  ['TIBC',                 'CBC',       /\bTIBC\s*([\d.]+)\s*ug\/dL\s*([\d.]+)[-–]\s*([\d.]+)/i,                                               250,  450 ],
  ['Serum Iron',           'CBC',       /\bIron\s*([\d.]+)\s*[µu]g\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                           60,   160 ],
  ['Transferrin Saturation%','CBC',     /Transferrin Saturation%\s*([\d.]+)\s*([\d.]+)\s*-\s*([\d.]+)/i,                                        12,   50  ],
  ['Transferrin',          'CBC',       /\bTransferrin\s+([\d.]+)\s*mg\/dL\s*([\d.]+)\s*-\s*([\d.]+)/i,                                         200,  360 ],
  ['UIBC',                 'CBC',       /Unsaturated Iron Binding Capacity\s*\(UIBC\)\s*([\d.]+)\s*[µu]g\/dL\s*Females?:\s*([\d.]+)\s*-\s*([\d.]+)/i, 135, 392],
  // ── Autoimmune ─────────────────────────────────────────────────────────────
  ['Rheumatoid Factor',    'Other',     /Rheumatoid Factor\s*([\d.]+)\s*IU\/ml\s*<\s*([\d.]+)/i,                                               0,    14  ],
  // Anti-CCP: value appears on its own line after the test name wraps
  ['Anti-CCP',             'Other',     /(?:Antibody\s*[\n\r]\s*\(CCP\)|CCP\))\s*[\n\r]?\s*([\d.]+)\s*U\/mL\s*<\s*([\d.]+)/i,                  0,    17  ],
  // ── CRP / Cardiac ──────────────────────────────────────────────────────────
  ['CRP',                  'Inflammation', /C[.\s-]?Reactive Protein\s*([\d.]+)\s*mg\/L\s*<\s*([\d.]+)/i,                                      0,    5   ],
  ['Troponin I',           'Cardiac',   /Troponin[- ]?I\s*([\d.]+)\s*ng\/mL\s*<\s*([\d.]+)/i,                                                  0,    0.04],
  ['Troponin T',           'Cardiac',   /Troponin[- ]?T\s*([\d.]+)\s*ng\/mL\s*<\s*([\d.]+)/i,                                                  0,    0.01],
];

// Unit display lookup
const UNITS = {
  'Fasting Blood Glucose':'mg/dL','HbA1c':'%','Mean Plasma Glucose':'mg/dL',
  'Vitamin B12':'pg/mL','Vitamin D (25-OH)':'ng/mL',
  'Haemoglobin':'g/dL','RBC Count':'Mill/cumm','Total WBC Count':'Cells/cumm',
  'Platelet Count':'×10³/µL','PCV':'%','MCV':'fL','MCH':'pg','MCHC':'g/dL',
  'RDW-CV':'%','RDW-SD':'fL','PDW':'fL','MPV':'fL',
  'Neutrophils':'%','Lymphocytes':'%','Eosinophils':'%','Monocytes':'%','Basophils':'%',
  'ESR':'mm/hr','CRP':'mg/L',
  'Total Cholesterol':'mg/dL','HDL Cholesterol':'mg/dL','Total Triglycerides':'mg/dL',
  'VLDL Cholesterol':'mg/dL','LDL Cholesterol':'mg/dL','Non-HDL Cholesterol':'mg/dL',
  'Total Bilirubin':'mg/dL','Direct Bilirubin':'mg/dL','Indirect Bilirubin':'mg/dL',
  'SGOT/AST':'U/L','SGPT/ALT':'U/L','Alkaline Phosphatase':'U/L','GGT':'U/L',
  'Total Protein':'g/dL','Albumin':'g/dL','Globulin':'g/dL',
  'TSH':'µIU/mL','T3 Total (TT3)':'ng/mL','T4 Total (TT4)':'µg/dL',
  'Free T3 (FT3)':'pg/mL','Free T4 (FT4)':'ng/dL',
  'Urea':'mg/dL','Creatinine':'mg/dL','BUN':'mg/dL','Uric Acid':'mg/dL',
  'Sodium':'mmol/L','Potassium':'mmol/L','Chloride':'mmol/L','Calcium':'mg/dL',
  'TIBC':'µg/dL','Serum Iron':'µg/dL','Transferrin Saturation%':'%',
  'Transferrin':'mg/dL','UIBC':'µg/dL',
  'Rheumatoid Factor':'IU/mL','Anti-CCP':'U/mL',
  'Troponin I':'ng/mL','Troponin T':'ng/mL',
};
function getUnit(name) { return UNITS[name] || ''; }

// ── Main rule-based analysis ──────────────────────────────────────────────────

// ── Plain-English explanations for each test parameter ──────────────────────
const PLAIN_ENGLISH = {
  'Fasting Blood Glucose': {
    what: 'Measures your blood sugar level after fasting (no food/drink except water) for 8+ hours. Shows how well your body manages sugar when not processing food.',
    good: 'Normal: 70–99 mg/dL — your blood sugar is in a healthy range.',
    caution: 'Pre-diabetes: 100–125 mg/dL — your sugar is higher than ideal. Diet and exercise can bring it back to normal.',
    bad: 'Diabetes: 126+ mg/dL — your blood sugar is consistently high. See a doctor for diagnosis and management.',
  },
  'HbA1c': {
    what: 'Shows your average blood sugar over the past 2–3 months. Unlike a single sugar test, this gives a long-term picture of how your body handles glucose.',
    good: 'Normal: below 5.9% — blood sugar well-controlled.',
    caution: 'Pre-diabetes: 5.9–6.4% — higher than ideal. Lifestyle changes can reverse this.',
    bad: 'Diabetes: 6.5%+ — blood sugar has been consistently high. Treatment needed.',
  },
  'Vitamin B12': {
    what: 'Measures Vitamin B12 in your blood. B12 is essential for nerve function, DNA production, and making red blood cells. Your body cannot make it — you get it from animal foods or supplements.',
    good: 'Normal: 191–663 pg/mL — adequate B12 levels.',
    caution: 'Borderline low: may cause fatigue, tingling in hands/feet. Eat more eggs, dairy, meat or take supplements.',
    bad: 'Very low: causes anaemia, nerve damage. High (>663, often from supplements): generally safe but correlate with doctor.',
  },
  'Vitamin D (25-OH)': {
    what: 'Measures Vitamin D3 in your blood. Vitamin D is made by your skin in sunlight and helps absorb calcium for strong bones, supports immunity, and mood.',
    good: 'Optimal: 30–100 ng/mL — good bone and immune health.',
    caution: 'Insufficiency: 21–29 ng/mL — get more sunlight (15–20 min/day) and consider supplements.',
    bad: 'Deficiency: ≤20 ng/mL — risk of bone loss, fatigue, immune weakness. Supplements required.',
  },
  'Haemoglobin': {
    what: 'Measures haemoglobin, the protein in red blood cells that carries oxygen from your lungs to every cell in your body.',
    good: 'Normal: 13–17 g/dL (men) / 11–15 g/dL (women) — oxygen delivery is healthy.',
    caution: 'Mild anaemia: slightly low. May feel tired or short of breath.',
    bad: 'Anaemia: low haemoglobin means less oxygen reaches your organs. Causes include iron/B12 deficiency.',
  },
  'MCHC': {
    what: 'Mean Corpuscular Haemoglobin Concentration — measures how much haemoglobin is packed into each red blood cell. Helps identify the type of anaemia.',
    good: 'Normal: 32–36 g/dL — red blood cells are well-filled with haemoglobin.',
    caution: 'Low: cells are pale and under-filled (hypochromic), often from iron deficiency.',
    bad: 'Very low: significant iron deficiency anaemia — iron supplementation needed.',
  },
  'Total WBC Count': {
    what: 'Counts your white blood cells — your immune system soldiers that fight infections, bacteria, and viruses.',
    good: 'Normal: 4,000–11,000 cells/cumm — immune system is working normally.',
    caution: 'Mildly high: may indicate mild infection, stress, or inflammation.',
    bad: 'Very high: significant infection or immune reaction. Very low: weakened immunity — susceptible to infections.',
  },
  'Platelet Count': {
    what: 'Platelets are tiny cell fragments that form blood clots to stop bleeding when you are injured.',
    good: 'Normal: 150,000–450,000/µL — clotting function is healthy.',
    caution: 'Low-normal: monitor; avoid aspirin or blood thinners.',
    bad: 'Low: risk of excessive bleeding. High: risk of unwanted clots.',
  },
  'Neutrophils': {
    what: 'The most common white blood cell — first responders to bacterial infections and injuries.',
    good: 'Normal: 45–75% — immune response to bacteria is balanced.',
    caution: 'High: active bacterial infection or inflammation.',
    bad: 'Low: reduced ability to fight bacterial infections.',
  },
  'Lymphocytes': {
    what: 'White blood cells that fight viruses and produce antibodies. They also remember past infections so your body can respond faster next time.',
    good: 'Normal: 20–40% — viral immunity is balanced.',
    caution: 'Slightly high: recent viral infection or stress. Slightly low: may reduce viral immunity.',
    bad: 'Very high: active viral infection or immune condition.',
  },
  'ESR': {
    what: 'Erythrocyte Sedimentation Rate — measures how quickly red blood cells settle in a tube. A non-specific marker of inflammation anywhere in the body.',
    good: 'Normal: 0–15 mm/hr (men) / 0–20 mm/hr (women) — no significant inflammation.',
    caution: 'Mildly elevated: minor infection or inflammation.',
    bad: 'High: active inflammation, infection, or autoimmune condition — needs investigation.',
  },
  'Total Cholesterol': {
    what: 'Total fat (lipid) in your blood. Cholesterol is needed for hormones and cell membranes, but too much clogs arteries and raises heart disease risk.',
    good: 'Desirable: below 200 mg/dL — low cardiovascular risk.',
    caution: 'Borderline: 200–239 mg/dL — review diet, exercise, and risk factors.',
    bad: 'High: 240+ mg/dL — significantly raises heart attack and stroke risk.',
  },
  'LDL Cholesterol': {
    what: 'Low-Density Lipoprotein — the "bad" cholesterol that deposits plaque in artery walls, narrowing them and raising heart attack risk.',
    good: 'Optimal: below 100 mg/dL — minimal artery-clogging risk.',
    caution: 'Above optimal: 100–129 mg/dL — diet and exercise recommended.',
    bad: 'High: 130+ mg/dL — significantly raises heart disease risk. Medication may be needed.',
  },
  'HDL Cholesterol': {
    what: 'High-Density Lipoprotein — the "good" cholesterol that removes LDL from arteries and carries it back to the liver for disposal.',
    good: 'Normal: 50+ mg/dL (women) / 40+ mg/dL (men) — protects against heart disease.',
    caution: 'Borderline low: less arterial protection.',
    bad: 'Low: higher risk of heart disease. Exercise, healthy fats, and quitting smoking raise HDL.',
  },
  'Total Triglycerides': {
    what: 'Fats stored in your blood from excess calories (especially from sugar and refined carbs). High levels raise heart and pancreatitis risk.',
    good: 'Normal: below 150 mg/dL — healthy fat levels.',
    caution: 'Borderline: 150–199 mg/dL — reduce sugar, alcohol, and refined carbs.',
    bad: 'High: 200+ mg/dL — raises heart and inflammation risk. Diet change essential.',
  },
  'Non-HDL Cholesterol': {
    what: 'All cholesterol except the "good" HDL — includes LDL, VLDL, and other harmful particles. A better heart risk predictor than LDL alone.',
    good: 'Normal: 130 mg/dL or less.',
    caution: 'Borderline: 130–160 mg/dL.',
    bad: 'High: 160+ mg/dL — raises cardiovascular risk significantly.',
  },
  'GGT': {
    what: 'Gamma-Glutamyl Transferase — a liver enzyme. Elevated levels indicate liver stress, alcohol use, or bile duct problems.',
    good: 'Normal: 5–36 U/L (women) / 8–61 U/L (men).',
    caution: 'Mildly high: possible alcohol use, fatty liver, or medication effect.',
    bad: 'High: liver inflammation or bile duct obstruction — see a gastroenterologist.',
  },
  'SGOT/AST': {
    what: 'Aspartate Aminotransferase — a liver and heart enzyme. Elevated levels mean liver cells are damaged or stressed.',
    good: 'Normal: below 40 U/L.',
    caution: 'Mildly elevated: minor liver stress — avoid alcohol and processed foods.',
    bad: 'High: significant liver damage — needs medical evaluation.',
  },
  'SGPT/ALT': {
    what: 'Alanine Aminotransferase — the most liver-specific enzyme. A better marker of liver damage than AST.',
    good: 'Normal: below 42 U/L.',
    caution: 'Mildly elevated: fatty liver, alcohol, or medication effect.',
    bad: 'High: significant liver inflammation (hepatitis, fatty liver). See a hepatologist.',
  },
  'Alkaline Phosphatase': {
    what: 'An enzyme from liver and bones. High levels can indicate bone growth, liver disease, or bile duct problems.',
    good: 'Normal: 35–104 U/L.',
    caution: 'Mildly high: may be due to bone healing or minor liver stress.',
    bad: 'High: bile duct blockage, liver disease, or bone disorders.',
  },
  'Total Bilirubin': {
    what: 'Bilirubin is a yellow waste product from broken-down red blood cells, processed by the liver. High levels cause jaundice (yellow skin/eyes).',
    good: 'Normal: 0.2–1.2 mg/dL.',
    caution: 'Mildly high: mild liver stress or Gilberts syndrome (harmless genetic variant).',
    bad: 'High: liver disease, gallstones, or haemolytic anaemia — needs investigation.',
  },
  'TSH': {
    what: 'Thyroid Stimulating Hormone — secreted by your pituitary gland to control the thyroid. It is the best first test for thyroid function.',
    good: 'Normal: 0.27–4.2 µIU/mL — thyroid is working correctly.',
    caution: 'Borderline: monitor and recheck in 3–6 months.',
    bad: 'High TSH: underactive thyroid (hypothyroidism) — fatigue, weight gain. Low TSH: overactive thyroid (hyperthyroidism) — weight loss, palpitations.',
  },
  'Free T3 (FT3)': {
    what: 'The active form of thyroid hormone that controls metabolism, energy, heart rate, and body temperature.',
    good: 'Normal: 2.0–4.4 pg/mL.',
    caution: 'Low-normal: monitor thyroid function.',
    bad: 'Low: hypothyroidism symptoms. High: hyperthyroidism.',
  },
  'Free T4 (FT4)': {
    what: 'Thyroxine — the storage form of thyroid hormone converted to active T3 as needed by your body.',
    good: 'Normal: 1.0–1.6 ng/dL.',
    caution: 'Borderline: monitor with TSH.',
    bad: 'Low: hypothyroidism. High: hyperthyroidism.',
  },
  'Creatinine': {
    what: 'A waste product from muscle metabolism, filtered out by your kidneys. The best simple test of how well your kidneys are working.',
    good: 'Normal: 0.7–1.3 mg/dL (men) / 0.5–0.9 mg/dL (women).',
    caution: 'Mildly high: stay well hydrated; recheck in 4–6 weeks.',
    bad: 'High: kidneys are not filtering properly — see a nephrologist.',
  },
  'Urea': {
    what: 'A waste product from protein metabolism cleared by the kidneys. Used alongside creatinine to assess kidney health.',
    good: 'Normal: 16.6–48.5 mg/dL.',
    caution: 'Slightly high: increase water intake; reduce high-protein diet.',
    bad: 'High: kidney dysfunction or dehydration — needs evaluation.',
  },
  'Uric Acid': {
    what: 'A waste product from breaking down purines (found in red meat, seafood, alcohol). When too high, crystals form in joints causing gout.',
    good: 'Normal: 3.4–7.0 mg/dL (men) / 2.4–5.7 mg/dL (women).',
    caution: 'Mildly high: reduce red meat, alcohol, fructose. Drink more water.',
    bad: 'High: risk of gout, kidney stones. Painful joint flares possible.',
  },
  'Sodium': {
    what: 'An electrolyte that controls fluid balance, blood pressure, and nerve/muscle function.',
    good: 'Normal: 135–150 mmol/L.',
    caution: 'Mildly abnormal: review fluid intake and medications.',
    bad: 'Low (hyponatraemia) or high (hypernatraemia): can cause serious symptoms — needs prompt attention.',
  },
  'Potassium': {
    what: 'An electrolyte critical for heart rhythm, muscle contractions, and nerve signals. Even small abnormalities can affect the heart.',
    good: 'Normal: 3.5–5.0 mmol/L.',
    caution: 'Borderline: recheck and review medications (especially diuretics).',
    bad: 'Low (hypokalaemia): muscle weakness, cramps, irregular heartbeat. High (hyperkalaemia): dangerous heart rhythm changes — seek prompt care.',
  },
  'Calcium': {
    what: 'Needed for strong bones, muscle contractions, blood clotting, and nerve signals.',
    good: 'Normal: 8.6–10.0 mg/dL.',
    caution: 'Borderline: check Vitamin D levels.',
    bad: 'Low: muscle cramps, bone loss. High: kidney stones, fatigue — needs investigation.',
  },
  'Rheumatoid Factor': {
    what: 'An antibody that attacks healthy joint tissue. Used to help diagnose rheumatoid arthritis and other autoimmune conditions.',
    good: 'Normal: below 14 IU/mL — no significant autoimmune activity detected.',
    caution: 'Mildly elevated: may be a false positive. Correlate with symptoms.',
    bad: 'High: suggests rheumatoid arthritis or other autoimmune disease — see a rheumatologist.',
  },
  'Anti-CCP': {
    what: 'Anti-Cyclic Citrullinated Peptide antibody — a highly specific test for rheumatoid arthritis, more accurate than Rheumatoid Factor.',
    good: 'Normal: below 17 U/mL — very unlikely to have RA.',
    caution: 'Borderline: monitor with clinical symptoms.',
    bad: 'Positive (high): strongly suggests rheumatoid arthritis — early treatment prevents joint damage.',
  },
  'TIBC': {
    what: 'Total Iron Binding Capacity — measures how much iron your blood can carry. High TIBC usually means your body is hungry for iron (iron deficiency).',
    good: 'Normal: 250–450 µg/dL.',
    caution: 'High: often means iron deficiency — increase iron-rich foods.',
    bad: 'Very high: significant iron deficiency anaemia.',
  },
  'Serum Iron': {
    what: 'The actual amount of iron in your blood. Iron is essential for making haemoglobin and carrying oxygen.',
    good: 'Normal: 60–170 µg/dL.',
    caution: 'Low-normal: borderline iron stores — eat more spinach, lentils, meat.',
    bad: 'Low: iron deficiency. High: iron overload (haemochromatosis).',
  },
  'Transferrin Saturation%': {
    what: 'Shows what percentage of iron-carrying proteins (transferrin) are actually loaded with iron. A key measure of iron stores.',
    good: 'Normal: 12–50%.',
    caution: 'Low (<12%): iron deficiency even if haemoglobin is normal.',
    bad: 'High (>50%): iron overload — can damage liver and heart.',
  },
};

function getPlainExplanation(param, lang) {
  // For Hindi, try HINDI_GUIDE first
  if (lang === 'hi') {
    const hi = HINDI_GUIDE[param.name];
    if (hi) {
      const rangeInfo = hi.ranges && hi.ranges.length > 0
        ? (param.status === 'normal' ? hi.ranges[0] : hi.ranges[hi.ranges.length - 1])
        : null;
      const rangeMsg = rangeInfo ? rangeInfo.meaning : hi.goodRange || '';
      return `${hi.what} | ${rangeMsg}`;
    }
    // Hindi fallback using buildPlain
    const dir = param.status === 'high' ? 'अधिक' : param.status === 'low' ? 'कम' : 'सामान्य';
    const ref  = param.referenceRange ? ` (सामान्य: ${param.referenceRange})` : '';
    return param.status === 'normal'
      ? `आपका ${param.name} ${param.value} ${param.unit} है${ref} — यह सामान्य है।`
      : `आपका ${param.name} ${param.value} ${param.unit} है${ref} — सामान्य से ${dir} है। डॉक्टर से मिलें।`;
  }

  // For Gujarati
  if (lang === 'gu') {
    const dir = param.status === 'high' ? 'વધારે' : param.status === 'low' ? 'ઓછું' : 'સામાન્ય';
    const ref  = param.referenceRange ? ` (સામાન્ય: ${param.referenceRange})` : '';
    return param.status === 'normal'
      ? `તમારું ${param.name} ${param.value} ${param.unit} છે${ref} — આ સામાન્ય છે.`
      : `તમારું ${param.name} ${param.value} ${param.unit} છે${ref} — સામાન્ય કરતાં ${dir} છે. ડૉક્ટરની સલાહ લો.`;
  }

  // English
  const info = PLAIN_ENGLISH[param.name];
  if (!info) {
    const dir = param.status === 'high' ? 'higher than normal' : param.status === 'low' ? 'lower than normal' : 'within the normal range';
    const ref  = param.referenceRange ? ` (normal range: ${param.referenceRange})` : '';
    return `${param.name} is ${param.value} ${param.unit} — ${dir}${ref}. ${param.status !== 'normal' ? 'Please discuss this with your doctor.' : 'No action needed.'}`;
  }
  const rangeMsg = param.status === 'normal' ? info.good : param.status === 'high' ? info.bad : info.caution;
  return `${info.what} | ${rangeMsg}`;
}

function ruleBasedAnalyze(text, lang, fileName, patientAge, patientGender) {
  // Normalise: non-breaking spaces → regular space
  const rawText = text.replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
  console.log(`[ruleBasedAnalyze] text=${rawText.length} chars | first 300: ${rawText.slice(0,300).replace(/\n/g,'|').replace(/\r/g,'')}`);
  const params  = [];
  const seen    = new Set();
  const gender  = (patientGender || '').toLowerCase();

  for (const [name, cat, rx, defLo, defHi] of DIRECT_PATTERNS) {
    if (seen.has(name)) continue;

    let m;
    try { m = rx.exec(rawText); } catch(e) { continue; }
    if (!m) continue;

    const val = parseFloat(String(m[1]).trim());
    if (isNaN(val) || val < 0) continue;

    // Extract range from report; fall back to catalogue defaults
    let lo = defLo, hi = defHi;
    if (m[3] !== undefined) {
      const g2 = parseFloat(m[2]), g3 = parseFloat(m[3]);
      if (!isNaN(g2) && !isNaN(g3)) { lo = g2; hi = g3; }
    } else if (m[2] !== undefined) {
      const g2 = parseFloat(m[2]);
      if (!isNaN(g2)) { lo = 0; hi = g2; }
    }

    // ── Gender-specific range overrides ───────────────────────────────────────
    if (name === 'Haemoglobin')     { lo = gender==='male' ? 13 : 11;   hi = gender==='male' ? 17 : 15;   }
    if (name === 'RBC Count')       { lo = gender==='male' ? 4.5 : 3.8; hi = gender==='male' ? 5.9 : 4.8; }
    if (name === 'PCV')             { lo = gender==='male' ? 40  : 36;  hi = gender==='male' ? 52  : 46;  }
    if (name === 'ESR')             { hi = gender==='male' ? 15  : 20;  lo = 0; }
    if (name === 'Creatinine')      { lo = gender==='male' ? 0.7 : 0.5; hi = gender==='male' ? 1.3 : 0.9; }
    if (name === 'Uric Acid')       { lo = gender==='male' ? 3.4 : 2.4; hi = gender==='male' ? 7.0 : 5.7; }
    if (name === 'GGT')             { lo = gender==='male' ? 8   : 5;   hi = gender==='male' ? 61  : 36;  }
    if (name === 'HDL Cholesterol') { lo = gender==='male' ? 40  : 50;  hi = 9999; }

    // ── Custom status for multi-tier / special ranges ─────────────────────────
    let status;
    if      (name === 'HbA1c')             { status = val >= 5.9 ? 'high' : 'normal'; }
    else if (name === 'Vitamin D (25-OH)') { status = val >= 30  ? 'normal' : 'low';  }
    else if (name === 'Vitamin B12')       { const isGT = /Vitamin\s*-\s*B12\s*>/.test(rawText); status = (isGT||val>hi)?'high':val<lo?'low':'normal'; }
    else if (name === 'Total Cholesterol') { status = val >= 200 ? 'high' : 'normal'; }
    else if (name === 'LDL Cholesterol')   { status = val >= 100 ? 'high' : 'normal'; }
    else if (name === 'Total Triglycerides'){ status = val >= 150 ? 'high' : 'normal'; }
    else if (name === 'HDL Cholesterol')   { status = val < lo   ? 'low'  : 'normal'; }
    else if (name === 'Mean Plasma Glucose'){ status = 'normal'; }
    else {
      if (lo !== null && lo > 0 && val < lo)   status = 'low';
      else if (hi !== null && hi < 9999 && val > hi) status = 'high';
      else status = 'normal';
    }

    // ── Display value (show ">" prefix for capped results like B12 >2000) ─────
    const isGTVal   = name === 'Vitamin B12' && /Vitamin\s*-\s*B12\s*>/.test(rawText);
    const displayVal = isGTVal ? `>${val}` : val;
    const refRange   = lo !== null && hi !== null && hi < 9999 ? `${lo}–${hi}` : (hi !== null && hi < 9999 ? `<${hi}` : '');

    const guide = PLAIN_ENGLISH_GUIDE[name] || null;
    seen.add(name);
    // For Hindi: include the Hindi guide so frontend can render fully translated content
    const guideHi = (lang === 'hi' && HINDI_GUIDE[name]) ? HINDI_GUIDE[name] : null;
    params.push({
      name,
      value:          displayVal,
      guide:          guide,
      guideHi:        guideHi,
      numericValue:   val,
      unit:           getUnit(name),
      referenceRange: refRange,
      low:            lo  ?? 0,
      high:           hi  ?? 9999,
      status,
      category:       cat,
      plain: getPlainExplanation({ name, value:displayVal, unit:getUnit(name), status, referenceRange:refRange }, lang),
    });
  }

  // Always run smartExtractParams and MERGE — catches any params rule-based missed
  // MUST run BEFORE computing healthScore so merged params are counted in score
  const smartParams = smartExtractParams(rawText);
  let smartAdded = 0;
  for (const sp of smartParams) {
    if (!params.find(p => p.name.toLowerCase() === sp.name.toLowerCase())) {
      sp.plain = getPlainExplanation(sp, lang);
      params.push(sp);
      smartAdded++;
    }
  }
  if (smartAdded > 0) console.log('[ruleBasedAnalyze] smart extraction merged', smartAdded, 'extra params');

  // Compute score AFTER merge so all params (including smart-found ones) count
  const abnormal    = params.filter(p => p.status !== 'normal');
  const healthScore = params.length === 0 ? null
    : Math.max(20, Math.round(100 - (abnormal.length / params.length) * 100 * 0.85));

  const meta = extractReportMeta(rawText);
  return {
    aiAvailable:  true,
    source:       'rule-based',
    patientName:  meta.patientName,
    labName:      meta.labName,
    reportType:   detectReportType(rawText, params),
    healthScore,
    scoreLabel:   !healthScore           ? 'Analysis complete'
                : healthScore >= 85      ? 'Good'
                : healthScore >= 65      ? 'Mostly normal'
                : healthScore >= 45      ? 'Needs attention'
                : 'Urgent attention needed',
    parameters:  params,
    findings:    buildFindings(abnormal, lang, params),
    suggestions: buildSuggestions(abnormal, lang),
    doctors:     buildDoctors(abnormal, lang),
    disclaimer:  lang === 'hi'
      ? 'यह शैक्षणिक उद्देश्यों के लिए है। उपचार निर्णयों के लिए डॉक्टर से परामर्श लें।'
      : lang === 'gu'
      ? 'આ ફક્ત શૈક્ષણિક ઉદ્દેશ્ય માટે છે. સારવાર માટે ડૉક્ટરની સલાહ લો.'
      : 'For educational purposes only. Always consult a qualified doctor for treatment decisions.',
    lang,
  };
}

function buildPlain(name, val, unit, status, lo, hi, lang) {
  const vs = `${val} ${unit}`.trim();
  const r  = lo !== null && hi !== null && hi < 9999 ? `${lo}–${hi} ${unit}` : '';
  if (status === 'normal') {
    if (lang === 'hi') return `आपका ${name} ${vs} है${r ? ', सामान्य सीमा (' + r + ') में' : ''}। यह ठीक है।`;
    if (lang === 'gu') return `તમારું ${name} ${vs} છે${r ? ' ('+r+')' : ''}. આ સામાન્ય છે.`;
    return `Your ${name} is ${vs}${r ? ', within the normal range of ' + r : ''}. This is normal.`;
  }
  const dir = status === 'high'
    ? (lang==='hi' ? 'अधिक' : lang==='gu' ? 'વધારે' : 'HIGH')
    : (lang==='hi' ? 'कम'   : lang==='gu' ? 'ઓછું' : 'LOW');
  if (lang === 'hi') return `आपका ${name} ${vs} है${r ? ' (सामान्य: '+r+')' : ''} — सामान्य से ${dir} है। डॉक्टर से मिलें।`;
  if (lang === 'gu') return `તમારું ${name} ${vs} છે${r ? ' (સામાન્ય: '+r+')' : ''} — ${dir} છે. ડૉક્ટરની સલાહ લો.`;
  return `Your ${name} is ${vs}${r ? ' (normal: '+r+')' : ''} — this is ${dir}. Please consult your doctor.`;
}

function buildFindings(abnormal, lang, allParams) {
  if (abnormal.length === 0 && allParams.length > 0) {
    return [{ severity:'ok', icon:'🟢',
      title:  lang==='hi' ? 'सभी मान सामान्य' : lang==='gu' ? 'બધા મૂલ્ય સામાન્ય' : 'All values within normal range',
      detail: lang==='hi' ? `${allParams.length} मापदंडों की जांच। सभी सामान्य सीमा में हैं।`
            : lang==='gu' ? `${allParams.length} પ્રમાણો તપાસ્યા — બધા સામાન્ય.`
            : `All ${allParams.length} parameters checked — everything is within normal reference ranges.` }];
  }
  return abnormal.slice(0, 10).map(p => {
    const nv  = p.numericValue ?? parseFloat(String(p.value).replace(/[^0-9.]/g, '')) ?? 0;
    const dev = p.high < 9999 ? Math.abs(nv - (p.status === 'high' ? p.high : p.low)) / Math.max(1, p.high - p.low) : 0;
    const sev = dev > 0.3 ? 'critical' : 'warning';
    const dir = p.status === 'high'
      ? (lang==='hi' ? 'अधिक' : lang==='gu' ? 'વધારે' : 'Elevated')
      : (lang==='hi' ? 'कम'   : lang==='gu' ? 'ઓછું' : 'Low');
    const title = lang==='hi' ? `${p.name} ${dir}` : lang==='gu' ? `${p.name} ${dir}` : `${p.name} is ${dir}`;
    const detail = p.plain || `${p.name}: ${p.value} ${p.unit}${p.referenceRange ? ' (normal: '+p.referenceRange+')' : ''}. ${sev==='critical'?'Prompt medical attention recommended.':'Follow up with your doctor.'}`;
    return { severity:sev, icon:sev==='critical'?'🔴':'🟠', title, detail };
  });
}

function buildSuggestions(abnormal, lang) {
  const cats = new Set(abnormal.map(p => p.category));
  const diet = [], life = [], tests = [];
  const t = (en, hi, gu) => lang==='hi' ? hi : lang==='gu' ? gu : en;

  if (cats.has('CBC')) {
    diet.push(t('Iron-rich foods: spinach, lentils, rajma, beetroot, sesame, jaggery','आयरन-युक्त आहार: पालक, दाल, राजमा, बीटरूट, तिल, गुड़','આયર્ન-સmriddh aahar: palak, dal, rajma, beetroot, til, gur'));
    tests.push(t('Repeat CBC in 4 weeks after starting treatment','4 सप्ताह बाद CBC दोहराएं','સારवાR shire kya pachhi 4 hapta bade CBC pheri tapasavo'));
  }
  if (cats.has('Lipid')) {
    diet.push(t('Reduce fried foods, ghee, butter. Increase oats, flaxseeds, fruits, vegetables','तला-भुना, घी, मक्खन कम करें। ओट्स, अलसी, फल-सब्जियां बढ़ाएं','Telu khavanu, ghee, makkhan ghataavo. Oats, shaakbhaji vadhaaro'));
    life.push(t('30-min aerobic exercise 5 days/week — walking, cycling, or swimming','30 मिनट व्यायाम 5 दिन/सप्ताह — पैदल, साइकिल, या तैराकी','Davaranaa 5 divas 30 minit kasrat karo — chaalvu, cycle, tari'));
    tests.push(t('Repeat lipid profile in 3 months after lifestyle changes','3 माह बाद Lipid Profile दोहराएं','3 mahina pachhi Lipid Profile repeat karavo'));
  }
  if (cats.has('Glucose')) {
    diet.push(t('Reduce sugary drinks, white rice, maida. Eat whole grains and low-GI foods','मीठे पेय, सफेद चावल, मैदा कम करें। साबुत अनाज, कम-GI खाद्य पदार्थ खाएं','Mithu pevu, safed chokha ghataavo. Saabut anaaj khavanu vadhaaro'));
    life.push(t('Walk 15–20 minutes after each meal; monitor blood sugar regularly','खाने के बाद 15–20 मिनट टहलें; नियमित रक्त शर्करा जांचें','Khavana pachhi 15-20 minit chaalvo; niyamit blood sugar chapavo'));
    tests.push(t('Recheck HbA1c and fasting glucose in 3 months','3 माह बाद HbA1c और Fasting Glucose जांचें','3 mahina pachhi HbA1c ane Fasting Glucose tapasavo'));
  }
  if (cats.has('Liver')) {
    diet.push(t('Avoid alcohol and processed foods. Stay well hydrated','शराब और प्रसंस्कृत खाद्य पदार्थों से बचें। हाइड्रेटेड रहें','Daaru ane processed khavanuathi dur raho. Pani vadhare pivo'));
    tests.push(t('Repeat LFT in 4–6 weeks','4–6 सप्ताह बाद LFT दोहराएं','4-6 hapta pachhi LFT repeat karavo'));
  }
  if (cats.has('Kidney')) {
    diet.push(t('Drink 8–10 glasses of water daily. Limit salt and excessive protein','8–10 गिलास पानी रोज़ पिएं। नमक और अधिक प्रोटीन से बचें','Roj 8-10 glass pani pivo. Maanu ane protein ghataavo'));
    tests.push(t('Repeat kidney function test in 4–6 weeks','4–6 सप्ताह बाद Kidney Function Test दोहराएं','4-6 hapta pachhi Kidney Function Test repeat karavo'));
  }
  if (cats.has('Thyroid')) {
    life.push(t('Take thyroid medication consistently; never skip doses','थायराइड दवाएं नियमित लें, खुराक कभी न छोड़ें','Thyroid ni dava niyamit lo, kadhi na chukso'));
    tests.push(t('Recheck thyroid profile 6 weeks after any medication change','दवा बदलने के 6 सप्ताह बाद Thyroid Profile जांचें','Dava badalya pachhi 6 hapta bade Thyroid Profile tapasavo'));
  }
  if (cats.has('Other')) {
    diet.push(t('Balanced diet with 15–20 min of morning sunlight daily for Vitamin D','संतुलित आहार और 15–20 मिनट सुबह धूप लें (विटामिन D के लिए)','Santhulit bhojan ane savare 15-20 minit taap lo (Vitamin D mate)'));
    tests.push(t('Recheck vitamins and minerals in 2–3 months','2–3 माह बाद विटामिन और खनिज जांचें','2-3 mahina pachhi vitamins tapasavo'));
  }
  if (cats.has('Inflammation')) {
    life.push(t('Rest adequately and stay well hydrated','पर्याप्त आराम करें और हाइड्रेटेड रहें','Pooarto aaram karo ane pani pivo'));
    tests.push(t('Repeat inflammatory markers in 4 weeks','4 सप्ताह बाद inflammatory markers दोहराएं','4 hapta pachhi inflammatory markers repeat karavo'));
  }

  if (!diet.length)  diet.push(t('Maintain a balanced, varied diet rich in vegetables and whole grains','संतुलित, विविध आहार लें जिसमें सब्जियां और साबुत अनाज हों','Santhulit, vividh bhojan lo: shaakbhaji ane saabut anaaj'));
  if (!life.length)  life.push(t('30 minutes of moderate activity 5 days/week; 7–8 hours sleep','30 मिनट मध्यम गतिविधि सप्ताह में 5 दिन; 7–8 घंटे नींद','Davaranaa 5 divas 30 minit kasrat karo, 7-8 kalaak soo'));
  if (!tests.length) tests.push(t('Annual comprehensive health check-up recommended','वार्षिक व्यापक स्वास्थ्य जांच की सिफारिश','Varshik sampoorn arogya tapas ni bhalaaman'));

  return [
    { category: t('Diet','आहार','Diet (aahar)'),            icon:'🥗', items: diet  },
    { category: t('Lifestyle','जीवनशैली','Lifestyle'),      icon:'🏃', items: life  },
    { category: t('Follow-up Tests','अनुवर्ती परीक्षण','Follow-up Tests'), icon:'🧪', items: tests },
  ];
}

function buildDoctors(abnormal, lang) {
  const cats = new Set(abnormal.map(p => p.category));
  const docs = [];
  const t = (en, hi, gu) => lang==='hi' ? hi : lang==='gu' ? gu : en;
  if (cats.has('Glucose'))      docs.push({ specialty:'Endocrinologist / Diabetologist', reason:t('Abnormal blood glucose — specialist management to prevent long-term complications.','रक्त शर्करा असामान्य — विशेषज्ञ देखभाल आवश्यक है','Blood sugar asaamaanya che — nishnaant ni salah lo'), urgency:'high',   icon:'🦋' });
  if (cats.has('Lipid'))        docs.push({ specialty:'Cardiologist',                    reason:t('Abnormal lipid levels increase cardiovascular risk — needs evaluation.','लिपिड असामान्यता — हृदय रोग का खतरा बढ़ सकता है','Lipid asaamaanya che — hraday roga nu jokhm — mulyankan jaroori'), urgency:'medium', icon:'❤️' });
  if (cats.has('Liver'))        docs.push({ specialty:'Gastroenterologist / Hepatologist', reason:t('Elevated liver enzymes require hepatology assessment.','लीवर एंजाइम ऊंचे — हेपेटोलॉजी मूल्यांकन आवश्यक','Liver na enzymes vadhela che — hepatology mulyankan jaroori'), urgency:'medium', icon:'👨‍⚕️' });
  if (cats.has('Kidney'))       docs.push({ specialty:'Nephrologist',                    reason:t('Kidney function markers outside range — nephrology review recommended.','गुर्दे के मापदंड असामान्य — नेफ्रोलॉजी समीक्षा','Kidney na maapand asaamaanya che — nephrology samiksha'), urgency:'medium', icon:'🫁' });
  if (cats.has('CBC'))          docs.push({ specialty:'General Physician / Haematologist', reason:t('CBC abnormality — evaluation for anaemia, infection, or related conditions.','रक्त गणना असामान्य — एनीमिया या संक्रमण हो सकता है','CBC asaamaanya che — anaemia ya infection ni tapas'), urgency:'medium', icon:'🩸' });
  if (cats.has('Thyroid'))      docs.push({ specialty:'Endocrinologist',                 reason:t('Thyroid hormone imbalance needs specialist management.','थायराइड असंतुलन — विशेषज्ञ प्रबंधन आवश्यक है','Thyroid hormone nu asantulan — nishnaant ni salah jaroori'), urgency:'medium', icon:'🦋' });
  if (cats.has('Inflammation')) docs.push({ specialty:'General Physician',               reason:t('Raised inflammatory markers need investigation for underlying cause.','सूजन मापदंड ऊंचे — कारण की जांच आवश्यक है','Sojan na maapand vadhela che — kaaran ni tapas karavo'), urgency:'medium', icon:'👨‍⚕️' });
  if (cats.has('Other'))        docs.push({ specialty:'General Physician',               reason:t('Vitamins/minerals outside optimal range — review and supplementation plan.','विटामिन/खनिज असंतुलन — समीक्षा और पूरकता योजना','Vitamins/minerals asaamaanya che — samiksha ane purak yojana'), urgency:'low',    icon:'👨‍⚕️' });
  if (cats.has('Cardiac'))      docs.push({ specialty:'Cardiologist',                    reason:t('Cardiac markers elevated — urgent cardiology evaluation.','हृदय चिह्नक असामान्य — तत्काल हृदय रोग विशेषज्ञ से मिलें','Hraday na markers vadhela che — tatkal cardiology mulyankan'), urgency:'high',   icon:'❤️' });
  if (!docs.length)              docs.push({ specialty:'General Physician',               reason:t('Annual health review and preventive screening recommended.','वार्षिक स्वास्थ्य समीक्षा और निवारक जांच की सलाह दी जाती है','Varshik arogya samiksha ane nivaarak tapas ni bhalaaman'), urgency:'low',    icon:'👨‍⚕️' });
  return docs;
}

function detectReportType(text, params) {
  const cats = new Set(params.map(p => p.category));
  if (cats.size >= 5) return 'Comprehensive Health Check Panel';
  if (cats.size >= 3) return 'Multi-Panel Lab Report';
  const t = text.toLowerCase();
  if (/complete blood|cbc|haemoglobin|wbc/i.test(t))  return 'Complete Blood Count (CBC)';
  if (/lipid|cholesterol|triglyceride/i.test(t))       return 'Lipid Profile';
  if (/thyroid|tsh/i.test(t))                          return 'Thyroid Function Test';
  if (/liver|lft|sgpt|bilirubin/i.test(t))             return 'Liver Function Test (LFT)';
  if (/kidney|rft|creatinine|urea/i.test(t))           return 'Kidney Function Test (RFT)';
  if (/glucose|diabetes|hba1c/i.test(t))               return 'Blood Glucose Panel';
  return params.length > 0 ? 'Medical Report' : 'Medical Document';
}

// ══════════════════════════════════════════════════════════════════════════════
//  smartExtractParams — flexible multi-lab parameter extraction
//  Works when DIRECT_PATTERNS miss due to different lab formatting.
//  Strategy: find test name keywords then grab nearby numbers + reference ranges.
// ══════════════════════════════════════════════════════════════════════════════
function smartExtractParams(text) {
  if (!text) return [];
  const results = [];
  const seen    = new Set();

  // ── TEST_MAP: name → {cat, aliases, lo, hi, unit} ──────────────────────────
  const TEST_MAP = [
    { name:'Haemoglobin',          cat:'CBC',     aliases:[/h[ae]moglobin|hgb|\bhb\b(?!a)/i],              lo:11,    hi:17,    unit:'g/dL' },
    { name:'RBC Count',            cat:'CBC',     aliases:[/\brbc\b|red blood cell/i],                     lo:3.8,   hi:5.9,   unit:'M/μL' },
    { name:'Total WBC Count',      cat:'CBC',     aliases:[/\bwbc\b|\btlc\b|white blood|leucocyte/i],      lo:4000,  hi:11000, unit:'cells/μL' },
    { name:'Platelet Count',       cat:'CBC',     aliases:[/platelet|thrombocyte|\bplt\b/i],               lo:150000,hi:450000,unit:'/μL' },
    { name:'PCV',                  cat:'CBC',     aliases:[/\bpcv\b|packed cell|haematocrit|hematocrit|\bhct\b/i], lo:36, hi:52, unit:'%' },
    { name:'MCV',                  cat:'CBC',     aliases:[/\bmcv\b/i],                                    lo:80,    hi:100,   unit:'fL' },
    { name:'MCH',                  cat:'CBC',     aliases:[/\bmch\b(?!c)/i],                               lo:27,    hi:33,    unit:'pg' },
    { name:'MCHC',                 cat:'CBC',     aliases:[/\bmchc\b/i],                                   lo:32,    hi:36,    unit:'g/dL' },
    { name:'Neutrophils',          cat:'CBC',     aliases:[/neutrophil|poly\b|\bpmn\b/i],                  lo:40,    hi:75,    unit:'%' },
    { name:'Lymphocytes',          cat:'CBC',     aliases:[/lymphocyte|\blymph\b/i],                       lo:20,    hi:45,    unit:'%' },
    { name:'Eosinophils',          cat:'CBC',     aliases:[/eosinophil|\beos\b/i],                         lo:1,     hi:6,     unit:'%' },
    { name:'Monocytes',            cat:'CBC',     aliases:[/monocyte|\bmono\b/i],                          lo:2,     hi:10,    unit:'%' },
    { name:'Basophils',            cat:'CBC',     aliases:[/basophil|\bbaso\b/i],                          lo:0,     hi:2,     unit:'%' },
    { name:'ESR',                  cat:'Inflammation', aliases:[/\besr\b|erythrocyte sedimentation/i],     lo:0,     hi:20,    unit:'mm/hr' },
    { name:'CRP',                  cat:'Inflammation', aliases:[/\bcrp\b|c.?reactive/i],                   lo:0,     hi:5,     unit:'mg/L' },
    { name:'Fasting Blood Glucose',cat:'Glucose', aliases:[/fasting.*glucose|fasting.*sugar|\bfbs\b|\bfbg\b/i], lo:70, hi:99, unit:'mg/dL' },
    { name:'HbA1c',                cat:'Glucose', aliases:[/hba1c|glycated|a1c\b/i],                       lo:0,     hi:5.7,   unit:'%' },
    { name:'Random Blood Glucose', cat:'Glucose', aliases:[/random.*glucose|random.*sugar|\brbs\b|\bppbs\b/i], lo:70, hi:140, unit:'mg/dL' },
    { name:'Total Cholesterol',    cat:'Lipid',   aliases:[/total.*cholesterol|cholesterol.*total/i],      lo:0,     hi:200,   unit:'mg/dL' },
    { name:'LDL Cholesterol',      cat:'Lipid',   aliases:[/\bldl\b/i],                                    lo:0,     hi:100,   unit:'mg/dL' },
    { name:'HDL Cholesterol',      cat:'Lipid',   aliases:[/\bhdl\b/i],                                    lo:40,    hi:9999,  unit:'mg/dL' },
    { name:'Total Triglycerides',  cat:'Lipid',   aliases:[/triglyceride|\btg\b|\bvldl\b/i],               lo:0,     hi:150,   unit:'mg/dL' },
    { name:'TSH',                  cat:'Thyroid', aliases:[/\btsh\b|thyroid.*stim/i],                      lo:0.4,   hi:4.0,   unit:'mIU/L' },
    { name:'Free T3',              cat:'Thyroid', aliases:[/free\s*t3|\bft3\b/i],                          lo:2.3,   hi:4.2,   unit:'pg/mL' },
    { name:'Free T4',              cat:'Thyroid', aliases:[/free\s*t4|\bft4\b/i],                          lo:0.89,  hi:1.76,  unit:'ng/dL' },
    { name:'SGPT',                 cat:'Liver',   aliases:[/\bsgpt\b|\balt\b(?!er)/i],                     lo:0,     hi:40,    unit:'U/L' },
    { name:'SGOT',                 cat:'Liver',   aliases:[/\bsgot\b|\bast\b(?!hm)/i],                     lo:0,     hi:40,    unit:'U/L' },
    { name:'Total Bilirubin',      cat:'Liver',   aliases:[/total.*bilirubin/i],                           lo:0,     hi:1.2,   unit:'mg/dL' },
    { name:'Direct Bilirubin',     cat:'Liver',   aliases:[/direct.*bilirubin/i],                          lo:0,     hi:0.3,   unit:'mg/dL' },
    { name:'Alkaline Phosphatase', cat:'Liver',   aliases:[/alkaline.*phos|\balp\b|alkphos/i],             lo:44,    hi:147,   unit:'U/L' },
    { name:'Total Protein',        cat:'Liver',   aliases:[/total.*protein(?!.*urine)/i],                  lo:6.3,   hi:8.2,   unit:'g/dL' },
    { name:'Albumin',              cat:'Liver',   aliases:[/\balbumin\b/i],                                lo:3.5,   hi:5.0,   unit:'g/dL' },
    { name:'Creatinine',           cat:'Kidney',  aliases:[/\bcreatinine\b|\bcreat\b/i],                   lo:0.6,   hi:1.3,   unit:'mg/dL' },
    { name:'Blood Urea Nitrogen',  cat:'Kidney',  aliases:[/\bbun\b|blood.*urea|serum.*urea|\burea\b(?!.*acid)/i], lo:7, hi:25, unit:'mg/dL' },
    { name:'Uric Acid',            cat:'Kidney',  aliases:[/uric.*acid|\burate\b/i],                       lo:2.5,   hi:7.5,   unit:'mg/dL' },
    { name:'eGFR',                 cat:'Kidney',  aliases:[/\begfr\b/i],                                   lo:60,    hi:999,   unit:'mL/min' },
    { name:'Sodium',               cat:'Kidney',  aliases:[/\bsodium\b/i],                                 lo:136,   hi:145,   unit:'mEq/L' },
    { name:'Potassium',            cat:'Kidney',  aliases:[/\bpotassium\b/i],                              lo:3.5,   hi:5.0,   unit:'mEq/L' },
    { name:'Chloride',             cat:'Kidney',  aliases:[/\bchloride\b/i],                               lo:98,    hi:107,   unit:'mEq/L' },
    { name:'Calcium',              cat:'Other',   aliases:[/\bcalcium\b(?!.*urine)/i],                     lo:8.5,   hi:10.5,  unit:'mg/dL' },
    { name:'Vitamin D (25-OH)',    cat:'Other',   aliases:[/vitamin.*d|25.?oh/i],                          lo:30,    hi:100,   unit:'ng/mL' },
    { name:'Vitamin B12',          cat:'Other',   aliases:[/vitamin.*b.?12|cobalamin/i],                   lo:191,   hi:663,   unit:'pg/mL' },
    { name:'Serum Iron',           cat:'Other',   aliases:[/serum.*iron|s\.?\s*iron(?!.*bind)/i],          lo:60,    hi:170,   unit:'μg/dL' },
    { name:'Ferritin',             cat:'Other',   aliases:[/\bferritin\b/i],                               lo:12,    hi:300,   unit:'ng/mL' },
    { name:'TIBC',                 cat:'Other',   aliases:[/\btibc\b|total.*iron.*bind/i],                 lo:250,   hi:370,   unit:'μg/dL' },
  ];

  // ── STEP 1: Try to parse as pipe/tab delimited table (handles LPL, Thyrocare, etc.) ──
  // Many Indian labs produce PDFs where text comes out as:
  // "TestName | Value | Unit | Low-High" or "TestName  Value  Unit"
  const pipeLines = text.split('\n').filter(l => l.includes('|'));
  if (pipeLines.length > 3) {
    for (const line of pipeLines) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 2) continue;

      // Find which column has a test name
      for (const test of TEST_MAP) {
        if (seen.has(test.name)) continue;
        const nameCol = cols.findIndex(c => test.aliases.some(rx => rx.test(c)));
        if (nameCol < 0) continue;

        // Value is the first numeric column AFTER the name column
        let val = NaN, unit = '', lo = test.lo, hi = test.hi, refRange = '';
        for (let ci = nameCol + 1; ci < cols.length; ci++) {
          const numM = cols[ci].match(/^([<>]?\s*)(\d+\.?\d*)$/);
          if (numM) { val = parseFloat(numM[2]); break; }
          // Also match "12.5 g/dL" in one column
          const combined = cols[ci].match(/^(\d+\.?\d*)\s*([a-zA-Z/%μ]+)/);
          if (combined) { val = parseFloat(combined[1]); unit = combined[2]; break; }
        }
        if (isNaN(val) || val <= 0) continue;

        // Find reference range: look for "lo - hi" or "lo-hi" pattern in any col
        for (const c of cols) {
          const refM = c.match(/(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)/);
          if (refM) {
            const parsedLo = parseFloat(refM[1]), parsedHi = parseFloat(refM[2]);
            if (!isNaN(parsedLo) && !isNaN(parsedHi) && parsedLo < parsedHi) {
              lo = parsedLo; hi = parsedHi;
              refRange = parsedLo + ' – ' + parsedHi;
            }
            break;
          }
        }

        // Sanity: value must be plausible for this test (within 0.01× to 100× normal range)
        const saneLo = lo * 0.01, saneHi = hi * 100;
        if (val < saneLo || val > saneHi) continue;

        const status = val < lo ? 'low' : val > hi ? 'high' : 'normal';
        results.push({ name: test.name, value: val, unit: unit || test.unit,
          referenceRange: refRange || lo + ' – ' + hi + ' ' + test.unit,
          low: lo, high: hi, status, category: test.cat, plain: null, source: 'smart-pipe' });
        seen.add(test.name);
        break;
      }
    }
  }

  // ── STEP 2: Line-by-line proximity search for remaining tests ──────────────
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const test of TEST_MAP) {
    if (seen.has(test.name)) continue;
    for (let li = 0; li < lines.length; li++) {
      if (!test.aliases.some(rx => rx.test(lines[li]))) continue;
      // Search this line + next 3 lines for a value
      const context = lines.slice(li, li + 4).join(' ');

      // Extract numeric value — prefer decimal, avoid simple integers that could be metadata
      let val = NaN;
      const decM = context.match(/\b(\d{1,4}\.\d{1,4})\b/);   // prefer decimal like 11.5
      const intM = context.match(/\b([1-9]\d{0,4})\b/);        // fallback: integer
      if (decM) val = parseFloat(decM[1]);
      else if (intM) val = parseFloat(intM[1]);
      if (isNaN(val) || val <= 0) continue;

      // Sanity check — must be in plausible range for this test
      const saneLo = test.lo * 0.01, saneHi = test.hi * 100;
      if (val < saneLo || val > saneHi) continue;

      // Try to extract reference range
      let lo = test.lo, hi = test.hi, refRange = '';
      const refM = context.match(/(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)/);
      if (refM) {
        const pLo = parseFloat(refM[1]), pHi = parseFloat(refM[2]);
        if (!isNaN(pLo) && !isNaN(pHi) && pLo < pHi) {
          lo = pLo; hi = pHi; refRange = pLo + ' – ' + pHi;
        }
      }

      const status = val < lo ? 'low' : val > hi ? 'high' : 'normal';
      results.push({ name: test.name, value: val, unit: test.unit,
        referenceRange: refRange || lo + ' – ' + hi + ' ' + test.unit,
        low: lo, high: hi, status, category: test.cat, plain: null, source: 'smart-line' });
      seen.add(test.name);
      break;
    }
  }
  return results;
}


// ══════════════════════════════════════════════════════════════════════════════
//  analyzeForPatient — tries OpenAI first, falls back to rule-based
// ══════════════════════════════════════════════════════════════════════════════
const LANG_INSTRUCTIONS = {
  en: '',
  hi: 'LANGUAGE RULE: Write ALL human-readable text (plain, detail, items, reason, scoreLabel, title, disclaimer) in Hindi (Devanagari). Keep JSON field names, units, numbers in English.',
  gu: 'LANGUAGE RULE: Write ALL human-readable text in Gujarati script. Keep JSON field names, units, numbers in English.',
};

// ── Extract patient name and lab name from report text ─────────────────────
function extractReportMeta(text) {
  const flat = text.replace(/[\t\r]+/g, ' ').replace(/ +/g, ' ').replace(/\n/g, ' ');
  let patientName = '', labName = '';

  // ── Brand name from website URL (most reliable) ───────────────────────────
  // e.g. "www.remedieslabs.com" → "Dr. Remedies Labs"
  // e.g. "www.thyrocare.com" → "Thyrocare"
  // e.g. "www.lalpathlab.com" → "Dr Lal PathLabs"
  const urlMatch = /www\.([a-z0-9]+(?:labs?|path|diagnostics?|health)?)\.(?:com|in|co\.in)/i.exec(text);
  if (urlMatch) {
    const domain = urlMatch[1].toLowerCase();
    const DOMAIN_TO_LAB = {
      remedieslabs: 'Dr. Remedies Labs',
      drlal: 'Dr. Lal PathLabs', lalpathlab: 'Dr. Lal PathLabs', drlalas: 'Dr. Lal PathLabs',
      thyrocare: 'Thyrocare Laboratories', srl: 'SRL Diagnostics',
      metropolis: 'Metropolis Healthcare', vijayalab: 'Vijaya Diagnostics',
      apollodiagnostics: 'Apollo Diagnostics', pathcarelabs: 'Pathcare Labs',
      redcliffe: 'Redcliffe Labs', healthians: 'Healthians',
    };
    if (DOMAIN_TO_LAB[domain]) { labName = DOMAIN_TO_LAB[domain]; }
    else {
      // Capitalise the domain as lab name
      labName = domain.replace(/labs?$/, ' Labs').replace(/diagnostics?$/, ' Diagnostics')
                      .replace(/(?:^|\s)([a-z])/g, m => m.toUpperCase()).trim();
    }
  }

  // ── Patient name ──────────────────────────────────────────────────────────
  // Handles "NAME: Mrs.PARUL DOSHI" (no space after .) AND "NAME : Mrs. PARUL DOSHI"
  const STOP = '(?=\\s*(?:UHID|/[FM]\\b|\\d+\\s*Y\\s*\\d|Collected|Received|Reported|Ref\\b|Client|Barcode|Visit|DRL|Age\\b|Gender\\b))';
  const nameRx = [
    // "NAME: Mrs.PARUL DOSHI" or "NAME : Mrs. PARUL DOSHI"
    new RegExp('NAME\\s*[:.]?\\s*(?:Mrs?\\.?\\s*|Ms\\.?\\s*|Dr\\.?\\s*|Master\\s+)?([A-Z][A-Z0-9\\s\\.]{1,40}?)' + STOP, 'i'),
    new RegExp('Patient\\s*(?:Name)?\\s*[:.]?\\s*(?:Mrs?\\.?\\s*|Ms\\.?\\s*|Dr\\.?\\s*)?([A-Z][A-Za-z\\s\\.]{1,40}?)' + STOP, 'i'),
  ];
  for (const rx of nameRx) {
    const m = rx.exec(flat);
    if (m) {
      const name = m[1].trim().replace(/[.\s]+$/, '');
      if (name.length >= 2 && name.length <= 50) { patientName = toTitleCase(name); break; }
    }
  }

  // ── Lab name ──────────────────────────────────────────────────────────────
  // If URL-based detection already found the lab, skip pattern matching
  if (!labName) {
  const labRx = [
    // HIGHEST PRIORITY: "Dr. Remedies Labs" / "Dr Lal PathLabs" / "Dr. Shilpa" style brands
    /\b(Dr\.?\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Labs?|Diagnostics?|Pathlab|Laboratory|Hospital))\b/i,
    // Direct named brand in header (first line of page, standalone)
    /^([A-Z][A-Za-z0-9 .&\-]{4,60}?(?:Labs?|Diagnostics?|Laboratory|Pathology|Healthcare|PathLab))\s*(?:\n|Diagnostics|Redefined|$)/im,
    // DRL code → Dr. Remedies Labs
    // (handled separately below — DRL check returns early)
    // "Ref. Cust : SLN DIAGNOSTICS - UDAYANAGAR" → keep company, drop city
    /Ref\.?\s*Cust\s*:?\s*([A-Za-z][A-Za-z0-9 .&\-]{3,50}?)(?:\s*[-–]\s*[A-Z0-9 ]{2,20})?(?=\s*(?:Reported|Client|Barcode|\n|$))/i,
    // "Sample Processed at : BANGLORE REGIONAL LAB" (processing centre — lower priority)
    /(?:Sample\s+Processed\s+at|Processed\s+at)\s*:?\s*([A-Z][A-Za-z0-9 .,&\-]{4,70}?)(?:\s*,|\s*\*{3}|\s*$)/im,
    // Concatenated: "Ref.Cust:SLN DIAGNOSTICS"
    /Ref\.?Cust\s*:?([A-Z][A-Z0-9 .\-&]{3,40}?)(?=[A-Z]{2,}\s*\d|Reported|Client|Barcode|$)/,
  ];

  // DRL code check: if text contains "DRL" (Dr. Remedies Labs abbreviation), use brand name
  if (/\bDRL\b/.test(text) && /Dr\.?\s*Remedies/i.test(text)) {
    labName = 'Dr. Remedies Labs';
    // Still extract patient name below
  } else if (/\bDRL\b/.test(text) && !labName) {
    // DRL found but no Dr.Remedies text — try the patterns
  }
  // DRL = Dr. Remedies Labs brand code (appears as "DRL - 72" on every page)
  if (!labName && /\bDRL\s*-\s*\d/i.test(text)) {
    labName = 'Dr. Remedies Labs';
  } else if (!labName && /Dr\.?\s*Remedies\s*Labs?/i.test(text)) {
    labName = 'Dr. Remedies Labs';
  }

  // DRL = Dr. Remedies Labs brand code (appears as "DRL - 72" on every page)
  if (!labName && /\bDRL\s*-\s*\d/i.test(text)) {
    labName = 'Dr. Remedies Labs';
  } else if (!labName && /Dr\.?\s*Remedies\s*Labs?/i.test(text)) {
    labName = 'Dr. Remedies Labs';
  }

  if (!labName) for (const rx of labRx) {
    const m = rx.exec(text);
    if (m) {
      const raw = (m[1] || '').trim().replace(/\s+/g, ' ').replace(/[.,\s]+$/, '');
      if (raw.length >= 4 && raw.length <= 80 && !/^(the|and|or|at|in|of|by)$/i.test(raw)) {
        labName = raw; break;
      }
    }
  }

  } // end if (!labName)
  return { patientName, labName };
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// enrichAndBuild — single shared function called by ALL analyzeForPatient paths
// Guarantees consistent UI regardless of which AI path (Gemini/retry/OpenAI/rule)
// produced the raw parameters.
// ─────────────────────────────────────────────────────────────────────────────
function enrichAndBuild(rawParams, meta, parsedMeta, text, lang) {
  // 1. Enrich every parameter
  const params = (rawParams || []).map(p => {
    const lo  = typeof p.low   === 'number' ? p.low   : parseFloat(p.low)  || null;
    const hi  = typeof p.high  === 'number' ? p.high  : parseFloat(p.high) || null;
    const val = typeof p.value === 'number' ? p.value : parseFloat(p.value) || null;
    // Recompute status from numeric bounds (AI status is often wrong)
    let status = p.status || 'normal';
    if (val !== null && lo !== null && hi !== null) {
      status = val < lo ? 'low' : val > hi ? 'high' : 'normal';
    }
    // Use our guide-based plain text (richer than AI-generated one sentence)
    const guidePlain = getPlainExplanation(
      { name: p.name, value: val, unit: p.unit || '', status, referenceRange: p.referenceRange || '' },
      lang
    );
    return { ...p, status, low: lo, high: hi, plain: guidePlain || p.plain || '' };
  });

  // 2. Compute score from actual abnormal count
  const abnormal   = params.filter(p => p.status !== 'normal');
  const healthScore = params.length === 0 ? null
    : Math.max(20, Math.round(100 - (abnormal.length / params.length) * 100 * 0.85));

  // 3. Score label
  const scoreLabel = !healthScore          ? 'Analysis complete'
    : healthScore >= 85                    ? 'Good'
    : healthScore >= 65                    ? 'Mostly normal'
    : healthScore >= 45                    ? 'Needs attention'
    :                                        'Urgent attention needed';

  // 4. Build findings / suggestions / doctors from actual params
  const findings    = buildFindings(abnormal, lang, params);
  const suggestions = (parsedMeta && Array.isArray(parsedMeta.suggestions) && parsedMeta.suggestions.length)
    ? parsedMeta.suggestions : buildSuggestions(abnormal, lang);
  const doctors     = (parsedMeta && Array.isArray(parsedMeta.doctors) && parsedMeta.doctors.length)
    ? parsedMeta.doctors     : buildDoctors(abnormal, lang);

  const reportMeta  = meta || {};

  return {
    aiAvailable: true,
    patientName: (parsedMeta && parsedMeta.patientName) || reportMeta.patientName || '',
    labName:     (parsedMeta && parsedMeta.labName)     || reportMeta.labName     || '',
    reportType:  (parsedMeta && parsedMeta.reportType)  || detectReportType(text || '', params),
    healthScore,
    scoreLabel,
    parameters:  params,
    findings,
    suggestions,
    doctors,
    disclaimer:  (parsedMeta && parsedMeta.disclaimer)  || 'Always consult a qualified doctor for interpretation.',
    lang,
  };
}

async function analyzeForPatient({ filePath, category, fileName, patientAge, patientGender, lang = 'en' }) {
  if (!filePath || !fs.existsSync(filePath)) return _patientFallback(fileName, lang, false);

  const text = await extractText(filePath, category, fileName);
  const patientCtx = [patientAge ? 'Age: ' + patientAge : '', patientGender ? 'Gender: ' + patientGender : ''].filter(Boolean).join(', ');
  const langInstr   = LANG_INSTRUCTIONS[lang] || '';

  // ── Explicit parameter-by-parameter extraction prompt ──────────────────────
  const universalPrompt =
    (langInstr ? langInstr + '\n\n' : '') +
    'You are a medical lab report parser. Extract every blood test parameter from the text below.\n\n' +
    'STEP 1: Detect the format:\n' +
    '  - PIPE FORMAT (most Indian labs like LPL, Thyrocare): columns separated by | e.g. "Haemoglobin|11.0|gm%|11.5 - 16.0"\n' +
    '  - SPACE FORMAT: columns separated by spaces e.g. "Haemoglobin  11.0  gm%  11.5-16.0"\n' +
    '  - For PIPE FORMAT: split each line on | to get [name, value, unit, range] columns.\n' +
    '  - For SPACE FORMAT: find test name, then grab the first number after it as value.\n' +
    'STEP 2: Find lines with a medical test name AND extract its value.\n' +
    'STEP 2: Look for these tests (not exhaustive - extract ALL you find):\n' +
    ' CBC: Haemoglobin/Hb/Hgb, RBC, WBC/TLC, Platelets, MCV, MCH, MCHC, PCV, Neutrophils, Lymphocytes, Eosinophils, ESR\n' +
    ' Glucose: Fasting Glucose/FBS, HbA1c, PPBS, Random Blood Sugar/RBS\n' +
    ' Lipid: Total Cholesterol, LDL, HDL, Triglycerides/TG, VLDL\n' +
    ' Liver: SGPT/ALT, SGOT/AST, Total Bilirubin, Direct Bilirubin, ALP, Total Protein, Albumin\n' +
    ' Kidney: Creatinine, BUN/Urea, Uric Acid, eGFR, Sodium, Potassium, Chloride\n' +
    ' Thyroid: TSH, Free T3, Free T4\n' +
    ' Other: Vitamin D, Vitamin B12, Iron, Ferritin, CRP, Calcium, Phosphorus\n\n' +
    'STEP 3: For each parameter set:\n' +
    ' value: the number result\n' +
    ' unit: g/dL or mg/dL or % etc\n' +
    ' referenceRange: from the report if shown, else use standard\n' +
    ' low/high: numeric bounds of reference range\n' +
    ' status: normal/low/high by comparing value to range\n' +
    ' category: CBC|Lipid|Thyroid|Glucose|Liver|Kidney|Cardiac|Inflammation|Other\n' +
    ' plain: one simple sentence for the patient\n\n' +
    'Standard ranges if not in report: Hb 11-17 g/dL | WBC 4000-11000 | Platelets 150000-400000 | ' +
    'Glucose(F) 70-100 mg/dL | HbA1c <5.7% | Cholesterol <200 | LDL <100 | HDL >40 | TG <150 | ' +
    'SGPT 7-40 U/L | SGOT 7-40 U/L | Creatinine 0.6-1.3 | TSH 0.4-4.0 mIU/L | VitD 30-100 ng/mL | VitB12 200-900 pg/mL\n\n' +
    'IMPORTANT: If the text has pipe characters |, it is a pipe-delimited table — split on | to find values. Do not confuse metadata (patient age, lab number) with test values.\n' +
    (patientCtx ? 'Patient: ' + patientCtx + '\n' : '') +
    'LAB REPORT:\n---\n' +
    (text || 'No text. Filename: ' + fileName) +
    '\n---\n\nReturn ONLY valid JSON (no markdown):\n' +
    ANALYSIS_JSON_SCHEMA

  // ── Try Gemini first (free, SSL bypass, handles any text format) ─────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const https = require('https');
      const geminiResult = await new Promise((resolve, reject) => {
        const body  = JSON.stringify({
          contents: [{ parts: [{ text: universalPrompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        });
        const agent = new https.Agent({ rejectUnauthorized: false });
        const req   = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path:     '/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey,
          method:   'POST', agent,
          headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout:  30000,
        }, resp => {
          let d = '';
          resp.on('data', c => { d += c; });
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, body: JSON.parse(d) }); }
            catch { resolve({ status: resp.statusCode, body: {} }); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
        req.write(body); req.end();
      });

      if (geminiResult.status === 200 && geminiResult.body?.candidates) {
        const rawText = geminiResult.body.candidates[0]?.content?.parts?.[0]?.text || '';
        const clean   = rawText.replace(/```json[\s]?/gi, '').replace(/```[\s]?/g, '').trim();
        const jsonM   = clean.match(/\{[\s\S]*\}/);
        if (jsonM) {
          const parsed = parseJSON(jsonM[0], null);
          if (parsed && Array.isArray(parsed.parameters) && parsed.parameters.length > 0) {
            console.log('[analyzeForPatient] Gemini success:', parsed.parameters.length, 'params');
            const aiMeta = extractReportMeta(text || reportText);
            console.log('[analyzeForPatient] Gemini main — enriching', parsed.parameters.length, 'params');
            return enrichAndBuild(parsed.parameters, aiMeta, parsed, text || reportText, lang);
          }
        }
        if (geminiResult.status === 429) console.warn('[analyzeForPatient] Gemini 429 — rate limited');
      }
    } catch (e) {
      console.warn('[analyzeForPatient] Gemini failed:', e.message);
    }
  }

  // ── Gemini retry: if no params, try with the raw text in a simpler prompt ──
  if (geminiKey && text && text.length > 50) {
    try {
      const https = require('https');
      const retryPrompt =
        'Extract ALL medical test parameters from this lab report text. ' +
        'Each line likely has: test_name value unit reference_range. ' +
        'Return JSON array of parameters only.\n\n' +
        'TEXT:\n' + text.slice(0, 6000) + '\n\n' +
        'JSON format: {"parameters":[{"name":"","value":0,"unit":"","referenceRange":"","low":0,"high":0,"status":"normal|low|high","category":"CBC|Lipid|Thyroid|Glucose|Liver|Kidney|Other","plain":""}]}';
      const retryResult = await new Promise((resolve, reject) => {
        const body  = JSON.stringify({
          contents: [{ parts: [{ text: retryPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        });
        const agent = new (require('https').Agent)({ rejectUnauthorized: false });
        const req   = require('https').request({
          hostname: 'generativelanguage.googleapis.com',
          path:     '/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey,
          method: 'POST', agent,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 30000,
        }, resp => {
          let d = '';
          resp.on('data', c => { d += c; });
          resp.on('end', () => { try { resolve({ status: resp.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: 0, body: {} }); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body); req.end();
      });
      if (retryResult.status === 200 && retryResult.body?.candidates) {
        const rt   = retryResult.body.candidates[0]?.content?.parts?.[0]?.text || '';
        const rc   = rt.replace(/```json[\s]?/gi,'').replace(/```[\s]?/g,'').trim();
        const rm   = rc.match(/\{[\s\S]*\}/);
        if (rm) {
          const rp = parseJSON(rm[0], null);
          if (rp && Array.isArray(rp.parameters) && rp.parameters.length > 0) {
            console.log('[analyzeForPatient] Gemini retry — enriching', rp.parameters.length, 'params');
            const meta = extractReportMeta(text);
            return enrichAndBuild(rp.parameters, meta, rp, text, lang);
          }
        }
      }
    } catch (e2) { console.warn('[analyzeForPatient] Gemini retry failed:', e2.message); }
  }

  // ── Try OpenAI (with SSL bypass) ─────────────────────────────────────────
  if (process.env.OPENAI_API_KEY) {
    try {
      const fileContent = await buildOpenAIContent(filePath, category, fileName,
        'Analyze this medical report' + (patientCtx ? ' for a patient (' + patientCtx + ')' : '') +
        '.\n' + langInstr + '\nReturn ONLY valid JSON — no markdown:\n' + ANALYSIS_JSON_SCHEMA);

      console.log('[analyzeForPatient] Trying OpenAI...');
      const raw = await tryOpenAI(fileContent, 4096);

      if (raw) {
        const parsed = parseJSON(raw, null);
        if (parsed && !parsed.error && Array.isArray(parsed.parameters) && parsed.parameters.length > 0) {
          console.log('[analyzeForPatient] OpenAI — enriching', parsed.parameters.length, 'params');
          const aiMeta = extractReportMeta(text);
          return enrichAndBuild(parsed.parameters, aiMeta, parsed, text, lang);
        }
      }
    } catch (err) {
      console.warn('[analyzeForPatient] OpenAI failed:', err.message);
    }
  }

  // ── Rule-based fallback (works offline, regex-based) ─────────────────────
  console.log('[analyzeForPatient] Using offline rule-based analyzer...');
  if (!text && category === 'IMAGE') return _patientFallback(fileName, lang, false);
  const result = ruleBasedAnalyze(text, lang, fileName, patientAge, patientGender);
  console.log('[analyzeForPatient] Rule-based:', result.parameters.length, 'params, score', result.healthScore);
  return result;
}

async function buildOpenAIContent(filePath, category, fileName, textPrompt) {
  const isImage = category === 'IMAGE' || /\.(jpg|jpeg|png|webp)$/i.test(fileName);
  if (isImage) {
    const ext   = path.extname(fileName).toLowerCase();
    const mimes = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
    const mime  = mimes[ext] || 'image/jpeg';
    const b64   = fs.readFileSync(filePath).toString('base64');
    return [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } },
      { type: 'text', text: textPrompt },
    ];
  }
  const text = await extractText(filePath, category, fileName);
  return [{ type: 'text', text: `MEDICAL DOCUMENT (${fileName}):\n\n${text}\n\n---\n\n${textPrompt}` }];
}

const ANALYSIS_JSON_SCHEMA = `{
  "patientName": "extract from report or empty string",
  "labName": "lab/hospital name or empty string",
  "reportType": "e.g. Complete Blood Count",
  "healthScore": 0-100,
  "scoreLabel": "Good|Mostly normal|Needs attention|Urgent attention needed",
  "parameters": [{"name":"","value":0,"unit":"","referenceRange":"","low":0,"high":0,"status":"normal|low|high","category":"CBC|Lipid|Thyroid|Glucose|Liver|Kidney|Cardiac|Inflammation|Other","plain":"plain language explanation for patient"}],
  "findings": [{"severity":"critical|warning|caution|ok","icon":"🔴|🟠|🟡|🟢","title":"short title","detail":"2-3 sentences for patient"}],
  "suggestions": [{"category":"Diet|Lifestyle|Follow-up tests|See a doctor","icon":"🥗|🏃|🧪|⏱️","items":["item 1"]}],
  "doctors": [{"specialty":"name","reason":"why","urgency":"high|medium|low","icon":"👨‍⚕️"}],
  "disclaimer": "consult doctor reminder"
}`;

function _patientFallback(fileName, lang, aiAvailable) {
  const msg = lang==='hi' ? `${fileName} सहेजा गया। विश्लेषण अनुपलब्ध। डॉक्टर से परामर्श लें।`
            : lang==='gu' ? `${fileName} સાચવ્યો. વિশ્લેષણ ઉপલ�ઉપલ્બ્ધ નથી. ડૉક્ટરની સલાહ લો.`
            : `${fileName} saved. Analysis unavailable. Share with your doctor.`;
  return { aiAvailable, healthScore:null, scoreLabel:'Unavailable', message:msg, parameters:[],
    findings:[{ severity:'info', icon:'ℹ️', title:'File saved', detail:msg }],
    suggestions:[], doctors:[{ specialty:'General Physician', reason:'Please share this report with your doctor.', urgency:'medium', icon:'👨‍⚕️' }], lang };
}

// ══════════════════════════════════════════════════════════════════════════════
//  Other exported functions
// ══════════════════════════════════════════════════════════════════════════════
async function generateAISummary({ patient, reason='General review' }) {
  const conditions  = patient.conditions?.map(c=>c.condition).join(', ')||'None';
  const medications = patient.medications?.map(m=>`${m.name}${m.dose?` ${m.dose}`:''}`).join(', ')||'None';
  const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age = dob ? Math.floor((Date.now()-dob.getTime())/(365.25*24*3600*1000)) : 'Unknown';
  const base = `${patient.firstName} ${patient.lastName}, ${age} yrs — Conditions: ${conditions}. Meds: ${medications}. Visit: ${reason}.`;
  if (!process.env.OPENAI_API_KEY) return base;
  try {
    const raw = await tryOpenAI([
      { role:'system', content:'Senior clinical AI. Write a 3-sentence pre-appointment brief for a doctor.' },
      { role:'user',   content:`Patient: ${patient.firstName} ${patient.lastName}, ${age}yrs\nConditions: ${conditions}\nMeds: ${medications}\nVisit: ${reason}\n\n3 sentences: 1) status 2) risks 3) focus today.` },
    ], 300);
    return raw?.trim() || base;
  } catch { return base; }
}

async function askMedicalBrain({ question, patientContext=null }) {
  if (!process.env.OPENAI_API_KEY) return 'OPENAI_API_KEY not configured.';
  const ctx = patientContext ? `Patient: ${patientContext.firstName} ${patientContext.lastName}\nConditions: ${patientContext.conditions?.map(c=>c.condition).join(', ')||'None'}\n\n` : '';
  const raw = await tryOpenAI([
    { role:'system', content:'AI Medical Brain for licensed doctors. Answer clinically and concisely.' },
    { role:'user',   content:`${ctx}${question}` },
  ], 800);
  return raw || 'Unable to generate answer — check network connection.';
}

async function analyzeMedicalFile(filePath, category, fileName) {
  if (!process.env.OPENAI_API_KEY || !filePath || !fs.existsSync(filePath)) {
    return { urgencyLevel:'LOW', briefSummary:`${fileName} — manual review required.`, aiStatus:'PENDING',
      analysis:{ documentType:'Medical Document', keyFindings:[], abnormalValues:[], clinicalSignificance:'', recommendedActions:['Review manually'], urgencyReason:'' } };
  }
  try {
    const text = await extractText(filePath, category, fileName);
    const raw  = await tryOpenAI([
      { role:'system', content:'Senior clinical AI. Analyze medical documents for licensed doctors.' },
      { role:'user',   content:`DOCUMENT (${fileName}):\n${text.slice(0,8000)}\n\nReturn ONLY JSON: {"documentType":"","urgencyLevel":"LOW|MEDIUM|HIGH|CRITICAL","urgencyReason":"","briefSummary":"3 sentences","keyFindings":[],"abnormalValues":[],"clinicalSignificance":"","recommendedActions":[]}` },
    ], 1500);
    const parsed = parseJSON(raw, null);
    if (!parsed) return { urgencyLevel:'LOW', briefSummary:`Analysis of ${fileName} complete.`, aiStatus:'COMPLETE', analysis:{ documentType:'Medical Document', keyFindings:[], abnormalValues:[], clinicalSignificance:'', recommendedActions:[], urgencyReason:'' } };
    return { urgencyLevel:parsed.urgencyLevel||'LOW', briefSummary:parsed.briefSummary||'Review complete.', aiStatus:'COMPLETE',
      analysis:{ documentType:parsed.documentType||'Medical Document', keyFindings:Array.isArray(parsed.keyFindings)?parsed.keyFindings:[], abnormalValues:Array.isArray(parsed.abnormalValues)?parsed.abnormalValues:[], clinicalSignificance:parsed.clinicalSignificance||'', recommendedActions:Array.isArray(parsed.recommendedActions)?parsed.recommendedActions:[], urgencyReason:parsed.urgencyReason||'' } };
  } catch { return { urgencyLevel:'LOW', briefSummary:`${fileName} — manual review.`, aiStatus:'FAILED', analysis:{ documentType:'Unknown', keyFindings:[], abnormalValues:[], clinicalSignificance:'', recommendedActions:['Review manually'], urgencyReason:'' } }; }
}

const URGENT_KW = ['chest pain','cannot breathe',"can\'t breathe",'shortness of breath','heart attack','stroke','unconscious','severe bleeding','seizure','anaphylaxis','suicidal','overdose'];
async function analyzeMessageUrgency(content) {
  if (!content||content.trim().length<5) return { isUrgent:false, reason:'' };
  const lower = content.toLowerCase();
  const hit   = URGENT_KW.find(kw=>lower.includes(kw));
  if (hit) return { isUrgent:true, reason:`Urgent symptom: "${hit}"` };
  if (!process.env.OPENAI_API_KEY) return { isUrgent:false, reason:'' };
  try {
    const raw = await tryOpenAI([
      { role:'system', content:'Medical triage AI. Return ONLY JSON.' },
      { role:'user',   content:`Patient: "${content}"\nReturn: {"isUrgent":true|false,"reason":""}` },
    ], 60);
    const p = parseJSON(raw, { isUrgent:false, reason:'' });
    return { isUrgent:Boolean(p.isUrgent), reason:p.reason||'' };
  } catch { return { isUrgent:false, reason:'' }; }
}

async function searchMedicalHistory(query, patientId, prisma) {
  const [files, appointments] = await Promise.all([
    prisma.medicalFile.findMany({ where:{ patientId }, orderBy:{ createdAt:'desc' }, take:30, select:{ id:true, fileName:true, category:true, createdAt:true, aiAnalysis:true, urgencyLevel:true } }),
    prisma.appointment.findMany({ where:{ patientId }, orderBy:{ scheduledAt:'desc' }, take:20, select:{ id:true, scheduledAt:true, status:true, reason:true, notes:true, doctor:{ select:{ firstName:true, lastName:true, specialty:true } } } }),
  ]);
  const q = query.toLowerCase();
  const matchedFiles = files.filter(f => f.fileName.toLowerCase().includes(q)||JSON.stringify(f.aiAnalysis||'').toLowerCase().includes(q));
  const matchedAppts = appointments.filter(a => (a.reason||'').toLowerCase().includes(q)||(a.notes||'').toLowerCase().includes(q));
  return { files:matchedFiles, appointments:matchedAppts, summary:`Found ${matchedFiles.length} file(s) and ${matchedAppts.length} appointment(s) matching "${query}".` };
}


// ══════════════════════════════════════════════════════════════════════════════
//  analyzeCardiac — ECG and Echo AI analysis
//  Uses same tryOpenAI pattern as analyzeForPatient
//  Input: base64 image string + mimeType + mode ('ecg' or 'echo')
//  Returns structured result or a pending fallback (never throws)
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
//  analyzeCardiac — ECG and Echo AI analysis
//  Uses Node https module (NOT global fetch) for reliable Windows/proxy support
//  Input: base64 image string + mimeType + mode ('ecg' or 'echo')
//  Returns structured result or a pending fallback (never throws)
// ══════════════════════════════════════════════════════════════════════════════
async function analyzeCardiac({ imageBase64, mimeType, mode }) {
  const https = require('https');
  const isECG = mode === 'ecg';
  const isPDF = mimeType === 'application/pdf';
  const safeMime = mimeType === 'image/jpg' ? 'image/jpeg'
    : ['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(mimeType)
      ? mimeType : 'image/jpeg';

  const ecgPrompt = `You are a cardiologist AI. Analyze this 12-lead ECG image carefully.
Detect ONLY the following conditions if present:
- Atrial Fibrillation
- Sinus Tachycardia
- Sinus Bradycardia
- Left Bundle Branch Block
- Right Bundle Branch Block
- First-Degree Atrioventricular Block

Reply with ONLY valid JSON (no markdown, no extra text):
{"detected":["condition names found"],"confidence":{"ConditionName":"high/medium/low"},"findings":"2-3 sentence clinical summary","rate":"heart rate e.g. 75 bpm","rhythm":"e.g. sinus rhythm","axis":"e.g. normal axis","warning":null}
If none of the six conditions above are detected, set "detected" to [].`;

  const echoPrompt = `You are an echocardiographer using PanEcho multi-task deep learning (39 tasks).
Analyze this echocardiogram image and report all visible findings.

Reply with ONLY valid JSON (no markdown, no extra text):
{"lvef":"e.g. 55-60%","lvFunction":"normal/mildly reduced/moderately reduced/severely reduced","rvFunction":"normal/mildly reduced/moderately reduced","valvularFindings":{"mitral":"normal/mild MR","aortic":"normal","tricuspid":"normal","pulmonary":"normal"},"structuralFindings":[],"diastolicFunction":"normal/grade I/grade II/grade III","pericardium":"normal","wallMotion":"normal","impression":"2-3 sentence overall impression","recommendations":["recommendation"],"limitations":"none","tasks_assessed":["LVEF","LV function"]}`;

  const prompt = isECG ? ecgPrompt : echoPrompt;

  // ── Helper: make HTTPS POST using Node https module (bypasses Windows fetch issues) ──
  function httpsPost(hostname, path, headers, body) {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      // Use a custom agent that accepts corporate SSL certificates (self-signed/intercepted)
      const agent = new https.Agent({ rejectUnauthorized: false });
      const req = https.request({
        hostname,
        path,
        method: 'POST',
        agent,
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
        timeout: 60000,
      }, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: resp.statusCode, body: { raw: data.slice(0, 500) } }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 60s')); });
      req.write(bodyStr);
      req.end();
    });
  }

  // ── Try OpenAI first ──────────────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const messages = [{
        role: 'user',
        content: isPDF
          ? [{ type: 'text', text: prompt + '\n\nNote: A PDF was provided. Analyze any ECG/Echo data present.' }]
          : [
              { type: 'image_url', image_url: { url: `data:${safeMime};base64,${imageBase64}`, detail: 'high' } },
              { type: 'text', text: prompt },
            ],
      }];

      console.log(`[analyzeCardiac] Trying OpenAI gpt-4o — mode=${mode}, mime=${safeMime}`);
      const r = await httpsPost(
        'api.openai.com',
        '/v1/chat/completions',
        { Authorization: `Bearer ${openaiKey}` },
        { model: 'gpt-4o', max_tokens: 1500, messages }
      );

      if (r.status === 200 && r.body?.choices) {
        const text  = r.body.choices[0]?.message?.content || '';
        const jsonM = text.match(/\{[\s\S]*\}/);
        if (jsonM) {
          console.log('[analyzeCardiac] OpenAI success');
          return { ...JSON.parse(jsonM[0]), aiAvailable: true, provider: 'openai' };
        }
        console.warn('[analyzeCardiac] OpenAI: no JSON in response:', text.slice(0, 200));
      } else {
        const errMsg = r.body?.error?.message || JSON.stringify(r.body).slice(0, 200);
        console.warn(`[analyzeCardiac] OpenAI HTTP ${r.status}: ${errMsg}`);
        if (r.status === 401) console.error('[analyzeCardiac] OpenAI key invalid — check OPENAI_API_KEY in .env');
        if (r.status === 429) console.error('[analyzeCardiac] OpenAI quota exceeded — check billing at platform.openai.com');
      }
    } catch (err) {
      console.warn(`[analyzeCardiac] OpenAI request failed: ${err.message}`);
    }
  } else {
    console.log('[analyzeCardiac] No OPENAI_API_KEY — skipping OpenAI');
  }

  // ── Try Anthropic as fallback ─────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const contentBlock = isPDF
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
        : { type: 'image',    source: { type: 'base64', media_type: safeMime,           data: imageBase64 } };

      console.log(`[analyzeCardiac] Trying Anthropic claude-sonnet — mode=${mode}`);
      const r = await httpsPost(
        'api.anthropic.com',
        '/v1/messages',
        {
          'x-api-key':         anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta':    'pdfs-2024-09-25',
        },
        {
          model:      'claude-sonnet-4-6',
          max_tokens: 1500,
          messages:   [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
        }
      );

      if (r.status === 200 && r.body?.content) {
        const text  = r.body.content.find(b => b.type === 'text')?.text || '';
        const jsonM = text.match(/\{[\s\S]*\}/);
        if (jsonM) {
          console.log('[analyzeCardiac] Anthropic success');
          return { ...JSON.parse(jsonM[0]), aiAvailable: true, provider: 'anthropic' };
        }
        console.warn('[analyzeCardiac] Anthropic: no JSON in response:', text.slice(0, 200));
      } else {
        const errMsg = r.body?.error?.message || JSON.stringify(r.body).slice(0, 200);
        console.warn(`[analyzeCardiac] Anthropic HTTP ${r.status}: ${errMsg}`);
        if (r.status === 401) console.error('[analyzeCardiac] Anthropic key invalid — check ANTHROPIC_API_KEY in .env');
      }
    } catch (err) {
      console.warn(`[analyzeCardiac] Anthropic request failed: ${err.message}`);
    }
  } else {
    console.log('[analyzeCardiac] No ANTHROPIC_API_KEY — skipping Anthropic');
  }

  // ── Both failed — return pending fallback ─────────────────────────────────
  console.warn('[analyzeCardiac] Both providers failed — returning pending fallback');
  return isECG ? {
    detected: [], confidence: {},
    findings: 'AI analysis unavailable. Check backend logs for the exact error. Ensure OPENAI_API_KEY or ANTHROPIC_API_KEY is set in backend/.env and the server can reach the internet.',
    rate: 'Not determined', rhythm: 'Not determined', axis: 'Not determined',
    warning: null, aiAvailable: false, pending: true,
  } : {
    lvef: 'Not determined', lvFunction: 'AI unavailable', rvFunction: 'Not determined',
    valvularFindings: {}, structuralFindings: [], diastolicFunction: 'Not determined',
    pericardium: 'Not determined', wallMotion: 'Not determined',
    impression: 'AI analysis unavailable. Check backend logs. Ensure OPENAI_API_KEY or ANTHROPIC_API_KEY is set in backend/.env.',
    recommendations: [], limitations: 'AI provider unreachable', tasks_assessed: [],
    aiAvailable: false, pending: true,
  };
}




// ── Clinical term lists for trilingual (English / Hindi / Gujarati) parsing ──
// Covers: written script (Unicode) + romanized transliteration (how Speech API transcribes)
const CLINICAL_TERMS = {
  medicine: [
    // English abbreviations & dosage
    'tab\\.?','cap\\.?','syr\\.?','syp\\.?','inj\\.?','oint\\.?','susp\\.?',
    '\\d+\\s*mg','\\d+\\s*ml','\\d+\\s*mcg','\\d+\\s*units?',
    '\\bbd\\b','\\btds\\b','\\bod\\b','\\bqid\\b','\\bhs\\b','\\bsos\\b',
    'once daily','twice daily','thrice daily','at night','before food','after food',
    'with food','empty stomach','morning dose','evening dose',
    'tablet','capsule','syrup','injection','ointment','drops','cream','gel','inhaler','spray',
    'medicine','medication','prescribed','prescription','dose','dosage',
    // Common drug name endings
    'cillin','mycin','zole','pril','sartan','statin','olol','pam','mab','nib','mide','oxacin',
    // Hindi Unicode
    'दवा','दवाई','गोली','टेबलेट','कैप्सूल','सिरप','इंजेक्शन',
    'सुबह','शाम','रात को','खाली पेट','खाने के बाद','खाने से पहले',
    'दो बार','तीन बार','रोज़','रोज','एक बार',
    // Hindi romanized (how Speech API transcribes)
    'dawa','dawai','goli','subah','shaam','khali pet','khaane ke baad','khaane se pehle',
    'do baar','teen baar','roz','ek baar','raat ko','din mein',
    // Gujarati Unicode
    'ગોળી','દવા','ટેબ્લેટ','કેપ્સ્યૂલ','સિરપ','ઇન્જેક્શન',
    'સવારે','સાંજે','રાત્રે','ખાલી પેટ','ખાધા પછી','ખાતા પહેલા',
    // Gujarati romanized
    'dava','goli','savare','sanje','ratre','khali pet','khavya pachhi','khata pahela',
    'ek vaari','be vaari','tran vaari','rojnuj','divas mate','leva','levo','levi',
  ],
  followUp: [
    'follow.?up','review','revisit','repeat','return','next visit','come back',
    'refer','referral','appointment','consult',
    'after \\d+\\s*(day|week|month|din|hapta|mahina)',
    // Hindi Unicode + romanized
    'फिर','दोबारा','अगली बार','अगले','हफ्ते','महीने','जांच','टेस्ट',
    'phir','dobara','agle','hafte','mahine','jaanch',
    // Gujarati romanized follow-up words
    'pachhi','hapta pachhi','mahina pachhi','aagal aavvu','doctor pas',
    // Gujarati Unicode + romanized
    'ફોलો','ફ્રરી','ફ઼ેर','અઠ઼ਵਾਡ','તparash',
    'aagal','pachhi','hapta','mahina','tapas','farino','doctor pas aavvu',
  ],
  other: [
    'diet','exercise','rest','avoid','water','walk','sleep','yoga','physio','massage',
    'lifestyle','activity','drink','eat','food',
    // Hindi Unicode + romanized
    'खाना','पानी','आराम','व्यायाम','परहेज',
    'khana','pani','aram','vyayam','parhej',
    // Gujarati Unicode + romanized  
    'ખોરાક','પানी','આराम','કસrत','ત્yago',
    'khavanu','pani vadhu','kasrat','aram','tyago','avoid karo','chal',
  ],
};

const RX_MED = new RegExp(CLINICAL_TERMS.medicine.join('|'), 'iu');
const RX_FU  = new RegExp(CLINICAL_TERMS.followUp.join('|'),  'iu');
const RX_OTH = new RegExp(CLINICAL_TERMS.other.join('|'),    'iu');

function bucketLines(lines) {
  const out = { prescription: [], followUp: [], others: [], notes: [] };
  for (const line of lines) {
    const stripped = line.replace(/^[\u2022\-\*]\s*/, '').trim(); // strip bullet prefix
    if (!stripped) continue;
    if      (RX_MED.test(stripped)) out.prescription.push(stripped);
    else if (RX_FU.test(stripped))  out.followUp.push(stripped);
    else if (RX_OTH.test(stripped)) out.others.push(stripped);
    else                            out.notes.push(stripped);
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
//  detectLang — auto-detect language from Unicode script ranges
//  Returns 'hi' for Devanagari, 'gu' for Gujarati, 'en' otherwise
// ══════════════════════════════════════════════════════════════════════════════
function detectLang(text) {
  if (!text) return 'en';
  // Count Unicode script characters
  const hiChars  = (text.match(/[\u0900-\u097F]/g) || []).length;  // Devanagari
  const guChars  = (text.match(/[\u0A80-\u0AFF]/g) || []).length;  // Gujarati
  const nonSpace = text.replace(/\s/g, '').length || 1;
  // Lower threshold (0.05) catches sparse Unicode in mixed-language speech
  if (guChars / nonSpace > 0.05) return 'gu';
  if (hiChars / nonSpace > 0.05) return 'hi';
  // Romanized speech (Latin script only) stays as 'en' — bucketLines handles
  // the clinical term matching regardless of the spoken language
  return 'en';
}

// ══════════════════════════════════════════════════════════════════════════════
//  summarizeClinicalNote
//  Takes raw doctor speech/text → returns structured summary + sections in ONE call
//  inputLang is now AUTO-DETECTED from rawText; only outputLang is respected from param
// ══════════════════════════════════════════════════════════════════════════════
async function summarizeClinicalNote(rawText, { outputLang = 'en' } = {}) {
  if (!rawText || rawText.trim().length < 5) {
    return { bullets: [rawText.trim()], summary: rawText.trim(),
             sections: { notes: rawText.trim(), prescription: '', followUp: '', others: '' },
             aiGenerated: false };
  }

  // Auto-detect input language from script — never rely on frontend selection
  const detectedLang = detectLang(rawText);
  const langNames    = { en: 'English', hi: 'Hindi', gu: 'Gujarati' };
  const inLangName   = langNames[detectedLang] || 'English';
  const outLangName  = langNames[outputLang]   || 'English';

  // Native-script language command — most reliable way to enforce output language
  // Language command sent as the very first line of the prompt
  // Using both native script + English for reliability
  const langCmd = {
    en: 'Write all output in clear clinical English.',
    hi: 'सभी उत्तर केवल हिंदी में लिखें। अनुवाद करें। [Write ALL output in Hindi ONLY. Translate everything.]',
    gu: 'Write ALL output in Gujarati language ONLY. Translate every word into Gujarati. [Gujarati maa lakho.]',
  };
  const nativeCmd = langCmd[outputLang] || langCmd.en;

  // Rules listed ABOVE the JSON so Gemini reads them before filling values.
  // JSON schema uses EMPTY strings — no English placeholders that Gemini copies.
  const prompt =
    nativeCmd + '\n\n' +
    'RULES:\n' +
    '1. Input language: ' + inLangName + '. Output language: ' + outLangName + '.\n' +
    '2. Translate EVERYTHING into ' + outLangName + '. Do NOT keep any text in ' + inLangName + '.\n' +
    '3. bullets: up to 8 bullet points summarising the note, each in ' + outLangName + '.\n' +
    '4. summary: one sentence overview in ' + outLangName + '.\n' +
    '5. sections.notes: clinical findings / diagnosis in ' + outLangName + '.\n' +
    '6. sections.prescription: each medicine on its own line in ' + outLangName + '.\n' +
    '7. sections.followUp: follow-up instructions in ' + outLangName + '.\n' +
    '8. sections.others: diet/lifestyle advice in ' + outLangName + '.\n' +
    '9. Leave a section as empty string "" if nothing relevant was said.\n\n' +
    'Doctor note (in ' + inLangName + '):\n"' + rawText + '"\n\n' +
    'Respond ONLY with this JSON structure. Fill every string field in ' + outLangName + ':\n' +
    '{\n' +
    '  "bullets": [],\n' +
    '  "summary": "",\n' +
    '  "category": "consultation",\n' +
    '  "urgency": "routine",\n' +
    '  "tags": [],\n' +
    '  "sections": { "notes": "", "prescription": "", "followUp": "", "others": "" }\n' +
    '}';

  // ── Try Gemini ─────────────────────────────────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const https  = require('https');
      const result = await new Promise((resolve, reject) => {
        const body  = JSON.stringify({
          // systemInstruction: enforces output language before the prompt is read
          systemInstruction: {
            parts: [{ text: 'You are a clinical documentation AI. You MUST write every field of your JSON response in ' + outLangName + ' only. Translate input text into ' + outLangName + ' if needed. Return valid JSON only.' }],
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 900 },
        });
        const agent = new https.Agent({ rejectUnauthorized: false });
        const req   = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path:     '/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey,
          method:   'POST', agent,
          headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout:  20000,
        }, resp => {
          let d = '';
          resp.on('data', c => { d += c; });
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, body: JSON.parse(d) }); }
            catch { resolve({ status: resp.statusCode, body: {} }); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
        req.write(body); req.end();
      });

      if (result.status === 200 && result.body?.candidates) {
        const text  = result.body.candidates[0]?.content?.parts?.[0]?.text || '';
        const clean = text.replace(/```json[\s]?/gi, '').replace(/```[\s]?/g, '').trim();
        const jsonM = clean.match(/\{[\s\S]*\}/);
        if (jsonM) {
          const parsed = JSON.parse(jsonM[0]);
          // Ensure sections is always present
          if (!parsed.sections) parsed.sections = {};
          return { ...parsed, aiGenerated: true, provider: 'gemini', detectedLang };
        }
      }
      if (result.status === 429) console.warn('[summarizeClinicalNote] Gemini 429 rate limit');
    } catch (e) {
      console.warn('[summarizeClinicalNote] Gemini failed:', e.message);
    }
  }

  // ── Try OpenAI (https module, SSL bypass) ──────────────────────────────────
  try {
    const rawOai = await tryOpenAI([
      { role: 'system', content: 'You are a clinical documentation AI. Return only valid JSON.' },
      { role: 'user',   content: prompt },
    ], 900);
    if (rawOai) {
      const clean = rawOai.replace(/```json[\s]?/gi, '').replace(/```[\s]?/g, '').trim();
      const jsonM = clean.match(/\{[\s\S]*\}/);
      if (jsonM) {
        const parsed = JSON.parse(jsonM[0]);
        if (!parsed.sections) parsed.sections = {};
        return { ...parsed, aiGenerated: true, provider: 'openai', detectedLang };
      }
    }
  } catch (e) {
    console.warn('[summarizeClinicalNote] OpenAI failed:', e.message);
  }

  // ── Rule-based fallback: no AI credits used ────────────────────────────────
  const rawLines = rawText.split(/[\n।॥]+/).map(s => s.trim()).filter(s => s.length > 2);
  const buckets  = bucketLines(rawLines);

  const addPfx = arr => arr.map(l => '• ' + l);
  const allBullets = [
    ...addPfx(buckets.notes),
    ...addPfx(buckets.prescription),
    ...addPfx(buckets.followUp),
    ...addPfx(buckets.others),
  ].slice(0, 8);

  const sections = {
    notes:        buckets.notes.join('\n'),
    prescription: buckets.prescription.join('\n'),
    followUp:     buckets.followUp.join('\n'),
    others:       buckets.others.join('\n'),
  };

  // If translation was requested but AI unavailable, add a note
  const translationUnavailable = outputLang !== detectedLang && outputLang !== 'en';
  const translateNote = translationUnavailable
    ? { en: ' [AI translation unavailable — shown in original language]',
        hi: ' [AI अनुवाद अनुपलब्ध]',
        gu: ' [AI ભાષાંतर ઉपलб्ध नहीं]' }[outputLang] || ''
    : '';

  return {
    bullets:      allBullets.length ? allBullets : ['• ' + rawText.trim()],
    summary:      rawText.slice(0, 120) + translateNote,
    category:     buckets.prescription.length ? 'prescription' : 'consultation',
    urgency:      'routine',
    tags:         [],
    sections,
    aiGenerated:  false,
    detectedLang,
    _sectionsHint: sections,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  extractConsultationSections
//  Takes bullet points / raw note text and extracts into 4 structured sections:
//  followUp, prescription, notes, others
//  Used when doctor marks appointment as Complete
// ══════════════════════════════════════════════════════════════════════════════

// Cleans AI-returned sections:
// - prescription: keep only lines that look like drug + dose (strip full sentences)
// - followUp: keep only lines with time/date references
function cleanSections(s) {
  const rxDrug = /\b(\d+\s*mg|\d+\s*ml|\bbd\b|\btds\b|\bod\b|\bqid\b|once|twice|thrice|daily|tab\.?|cap\.?|syr\.?|tablet|capsule|syrup|injection|drops|cream|gel|inhaler)/i;
  const rxTime = /\b(\d+\s*(day|week|month|hour)|after\s+\d|in\s+\d|next\s+(week|month|visit)|review|follow.?up|repeat|revisit)/i;

  const filterLines = (text, rx) => (text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1 && rx.test(l))
    .join('\n');

  // For prescription: keep only drug-like lines; also extract drug from long sentences
  const prescLines = (s.prescription || '').split('\n').map(l => l.trim()).filter(Boolean);
  const cleanPresc = prescLines.map(line => {
    if (rxDrug.test(line)) {
      // If line is short (< 80 chars), keep as-is
      if (line.length < 80) return line;
      // Long sentence: try to extract just the drug part
      const m = line.match(/([A-Za-z]+(?:in|ol|am|il|yl|mycin|cillin|zole|pril|sartan|statin|oxacin)?\s+\d+\s*m[gl][^,;.]{0,30}(?:BD|TDS|OD|QID|once|twice|daily|thrice)?)/i);
      return m ? m[1].trim() : line;
    }
    return null;
  }).filter(Boolean).join('\n');

  return {
    prescription: cleanPresc,
    followUp:     filterLines(s.followUp,     rxTime),
    notes:        s.notes    || '',
    others:       s.others   || '',
  };
}

async function extractConsultationSections(rawNote) {
  if (!rawNote || rawNote.trim().length < 5) {
    return { followUp: '', prescription: '', notes: rawNote || '', others: '', aiGenerated: false };
  }

  const prompt =
    'You are a strict clinical data extraction AI. Extract ONLY what is asked. Do not add context.\n\n' +
    'RULES:\n' +
    '1. prescription: ONLY medicine name + dose + frequency. Format: "DrugName Dose Frequency". ' +
       'One medicine per line. If a sentence mentions a medicine, extract ONLY the drug part, NOT the full sentence. ' +
       'Example: "take azithromycin 500mg twice a day" → "Azithromycin 500mg BD". ' +
       'If no medicine is prescribed, use empty string.\n' +
    '2. followUp: ONLY time references like "after 1 week", "review in 3 days", "next visit in 2 months", ' +
       '"repeat CBC after 2 weeks". Do NOT include medicine or diagnosis. If none, use empty string.\n' +
    '3. notes: diagnosis, symptoms, chief complaint, examination findings. Exclude medicines and follow-up.\n' +
    '4. others: diet advice, lifestyle, rest, physiotherapy, anything not in above 3.\n\n' +
    'Doctor note: "' + rawNote + '"\n\n' +
    'Respond ONLY with valid JSON (no extra text):\n' +
    '{"prescription":"","followUp":"","notes":"","others":""}';

  // Try Gemini
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const https = require('https');
      const result = await new Promise((resolve, reject) => {
        const body  = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
        });
        const agent = new https.Agent({ rejectUnauthorized: false });
        const req   = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path:     '/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey,
          method: 'POST', agent,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 15000,
        }, resp => {
          let d = '';
          resp.on('data', c => { d += c; });
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, body: JSON.parse(d) }); }
            catch { resolve({ status: resp.statusCode, body: {} }); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body); req.end();
      });

      if (result.status === 200 && result.body?.candidates) {
        const text  = result.body.candidates[0]?.content?.parts?.[0]?.text || '';
        const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonM = clean.match(/\{[\s\S]*\}/);
        if (jsonM) {
          const parsed = JSON.parse(jsonM[0]);
          return { ...cleanSections(parsed), aiGenerated: true, provider: 'gemini' };
        }
      }
    } catch (e) {
      console.warn('[extractConsultationSections] Gemini:', e.message);
    }
  }

  // Try OpenAI fallback
  try {
    const raw = await tryOpenAI([
      { role: 'system', content: 'You are a clinical documentation AI. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ], 600);
    if (raw) {
      const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const jsonM = clean.match(/\{[\s\S]*\}/);
      if (jsonM) {
        const parsed = JSON.parse(jsonM[0]);
        return { ...parsed, aiGenerated: true, provider: 'openai' };
      }
    }
  } catch (e) {
    console.warn('[extractConsultationSections] OpenAI:', e.message);
  }

  // Rule-based fallback — full English + Hindi + Gujarati medical vocabulary
  const lines = rawNote.split(/[\n।]+/).map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);

  // Build trilingual regex arrays
  const medTerms = [
    // English abbreviations & dosage
    'tab\\.?','cap\\.?','syr\\.?','syp\\.?','inj\\.?','oint\\.?','susp\\.?',
    '\\d+\\s*mg','\\d+\\s*ml','\\d+\\s*mcg','\\d+\\s*unit',
    '\\bbd\\b','\\btds\\b','\\bod\\b','\\bqid\\b','\\bhs\\b','\\bsos\\b',
    'once daily','twice daily','thrice daily','at night','before food','after food',
    'with food','empty stomach',
    'tablet','capsule','syrup','injection','ointment','drops','cream','gel',
    'inhaler','spray','sachet','medicine','medication','drug','prescri','dose',
    // Hindi
    'दवा','दवाई','गोली','टेबलेट','कैप्सूल','सिरप','इंजेक्शन','मलहम',
    'दो बार','तीन बार','रोज़','रोज','सुबह','शाम','रात को',
    'खाने के बाद','खाने से पहले',
    // Gujarati
    'ગોળી','દવા','ટેબ્લેટ','કેપ્સ્યૂલ','સિરપ','ઇન્જેક્શન','ઓઇન્ટમેન્ટ',
    'બે વખત','ત્રણ વખત','રોજ','સવારે','સાંજે','રાત્રે',
    'ખાધા પછી','ખાતા પહેલા',
    // Drug name endings
    'cillin','mycin','zole','pril','sartan','statin','olol','mide',
    'oxacin','cycline','afil','triptan',
  ];
  const fuTerms = [
    'follow.?up','review','revisit','repeat','return','next visit','come back',
    'refer','referral','consult','after \\d+\\s*(day|week|month)',
    'फिर','दोबारा','अगली बार','अगले','हफ्ते बाद','महीने बाद','जांच',
    'ફોलો','ફरी','बीजी वार','अठवाडिया','तपास',
  ];
  const othTerms = [
    'diet','exercise','rest','avoid','lifestyle','water intake','walking','sleep',
    'yoga','physio','massage','hot pack','cold pack','ice pack','warm water',
    'खाना','पानी','आराम','व्यायाम','परहेज','चलना',
    'ખोराक','पाणी','आराम','कसरत','चालवू','ऊंघ',
  ];

  const RX_MED = new RegExp(medTerms.join('|'), 'i');
  const RX_FU  = new RegExp(fuTerms.join('|'),  'i');
  const RX_OTH = new RegExp(othTerms.join('|'), 'i');

  const sec = { followUp: [], prescription: [], notes: [], others: [] };
  for (const line of lines) {
    if      (RX_MED.test(line)) sec.prescription.push(line);
    else if (RX_FU.test(line))  sec.followUp.push(line);
    else if (RX_OTH.test(line)) sec.others.push(line);
    else                        sec.notes.push(line);
  }

  return {
    followUp:     sec.followUp.join('\n'),
    prescription: sec.prescription.join('\n'),
    notes:        sec.notes.join('\n'),
    others:       sec.others.join('\n'),
    aiGenerated:  false,
  };
}
module.exports = { generateAISummary, askMedicalBrain, analyzeMedicalFile, analyzeMessageUrgency, searchMedicalHistory, analyzeForPatient, analyzeCardiac, summarizeClinicalNote, extractConsultationSections, PLAIN_ENGLISH_GUIDE };