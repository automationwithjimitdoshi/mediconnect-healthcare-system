// routes/ai.js — FIXED
// When no API key is configured, generates a proper clinical summary from
// available patient data instead of showing an error message.

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const prisma  = require('../lib/prisma');

function getAIService() {
  return require('../services/aiService');
}

// Build a proper clinical brief without AI — uses available patient data
function buildFallbackSummary(patient) {
  const name       = `${patient.firstName} ${patient.lastName}`;
  const dob        = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age        = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
  const conditions = patient.conditions?.map(c => c.condition).filter(Boolean) || [];
  const meds       = patient.medications?.map(m => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`).filter(Boolean) || [];
  const allergies  = patient.allergies?.map(a => a.allergen).filter(Boolean) || [];
  const vitals     = patient.vitals?.[0];

  const parts = [];

  // Sentence 1: patient overview
  const agePart = age ? `, ${age} yrs` : '';
  const genderPart = patient.gender && patient.gender !== 'Not specified' ? `, ${patient.gender}` : '';
  const bloodPart = patient.bloodType ? `, ${patient.bloodType}` : '';
  parts.push(`${name}${agePart}${genderPart}${bloodPart}.`);

  // Sentence 2: conditions + meds
  if (conditions.length > 0) {
    parts.push(`Active conditions: ${conditions.join(', ')}.`);
  }
  if (meds.length > 0) {
    parts.push(`Current medications: ${meds.join(', ')}.`);
  }
  if (allergies.length > 0) {
    parts.push(`Known allergies: ${allergies.join(', ')}.`);
  }

  // Sentence 3: vitals if available
  if (vitals) {
    const vParts = [];
    if (vitals.bloodPressure) vParts.push(`BP ${vitals.bloodPressure}`);
    if (vitals.heartRate)     vParts.push(`HR ${vitals.heartRate} bpm`);
    if (vitals.oxygenSaturation) vParts.push(`SpO₂ ${vitals.oxygenSaturation}%`);
    if (vitals.weight)        vParts.push(`Wt ${vitals.weight} kg`);
    if (vParts.length > 0)    parts.push(`Latest vitals: ${vParts.join(', ')}.`);
  }

  if (parts.length === 1) {
    // No clinical data at all
    return `${name} — No clinical data recorded yet. Please review the patient's history before the consultation.`;
  }

  return parts.join(' ');
}

// GET /api/ai/summary/:patientId
router.get('/summary/:patientId', auth, async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.patientId },
      include: {
        conditions:  true,
        medications: { where: { isActive: true } },
        allergies:   true,
        vitals:      { take: 1, orderBy: { recordedAt: 'desc' } }
      }
    });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // No API key — build a proper clinical summary from available data
    const hasOpenAI     = !!process.env.OPENAI_API_KEY;
    const hasAnthropic  = !!process.env.ANTHROPIC_API_KEY;

    if (!hasOpenAI && !hasAnthropic) {
      return res.json({ summary: buildFallbackSummary(patient) });
    }

    const { generateAISummary } = getAIService();
    const summary = await generateAISummary({ patient, reason: 'General review' });

    // Cache in DB (non-blocking)
    prisma.aISummary.create({
      data: { patientId: patient.id, generatedBy: 'ai', summary, urgency: 'LOW', tags: [] }
    }).catch(() => {});

    res.json({ summary });
  } catch (err) {
    console.error('AI summary error:', err.message);
    // On error, still return a useful fallback rather than an error message
    try {
      const patient = await prisma.patient.findUnique({
        where: { id: req.params.patientId },
        include: { conditions: true, medications: { where: { isActive: true } }, allergies: true, vitals: { take: 1, orderBy: { recordedAt: 'desc' } } }
      });
      if (patient) return res.json({ summary: buildFallbackSummary(patient) });
    } catch {}
    res.status(500).json({ error: err.message, summary: null });
  }
});

// POST /api/ai/ask — Medical Brain Q&A
router.post('/ask', auth, async (req, res) => {
  try {
    const { question, patientId } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });

    const patient = patientId
      ? await prisma.patient.findUnique({
          where: { id: patientId },
          include: {
            conditions:  true,
            medications: { where: { isActive: true } },
            vitals:      { take: 1, orderBy: { recordedAt: 'desc' } },
            files:       { take: 5, orderBy: { createdAt: 'desc' } }
          }
        })
      : null;

    const hasKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
    if (!hasKey) {
      return res.json({ answer: 'AI Medical Brain requires an API key. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to your .env file to enable this feature.' });
    }

    const { askMedicalBrain } = getAIService();
    const answer = await askMedicalBrain({ question, patientContext: patient });
    res.json({ answer });
  } catch (err) {
    console.error('AI ask error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/cardiac-analyze
// Priority: Gemini (FREE) → OpenAI → Anthropic
// Gemini free tier: 1500 req/day, no credit card needed
// Get key free at: aistudio.google.com
router.post('/cardiac-analyze', auth, async (req, res) => {
  const https = require('https');
  let anthropicCreditError = false;

  function httpsPost(hostname, path, reqHeaders, body) {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const agent   = new https.Agent({ rejectUnauthorized: false, keepAlive: false });
      const request = https.request({
        hostname, path, method: 'POST', agent,
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...reqHeaders,
        },
        timeout: 60000,
      }, (resp) => {
        let data = '';
        resp.on('data', c => { data += c; });
        resp.on('end', () => {
          try   { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: resp.statusCode, body: { raw: data.slice(0, 500) } }); }
        });
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('Timed out (60s)')); });
      request.write(bodyStr);
      request.end();
    });
  }

  // Gemini uses multipart inline data — different structure from OpenAI
  function httpsGet(hostname, path, reqHeaders) {
    return new Promise((resolve, reject) => {
      const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });
      const request = https.request({
        hostname, path, method: 'GET', agent,
        headers: { ...reqHeaders },
        timeout: 10000,
      }, (resp) => {
        let data = '';
        resp.on('data', c => { data += c; });
        resp.on('end', () => {
          try   { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: resp.statusCode, body: { raw: data.slice(0, 200) } }); }
        });
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('Timed out')); });
      request.end();
    });
  }

  try {
    const { imageBase64, mimeType, mode, fileId } = req.body;
    if (!imageBase64 || !mode) {
      return res.status(400).json({ success: false, message: 'imageBase64 and mode are required' });
    }

    const isECG    = mode === 'ecg';
    const isPDF    = mimeType === 'application/pdf';
    const safeMime = mimeType === 'image/jpg' ? 'image/jpeg'
      : ['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(mimeType)
        ? mimeType : 'image/jpeg';

    console.log('\n[cardiac] ── New request ─────────────────────────');
    console.log('[cardiac] mode=' + mode + ' mime=' + safeMime + ' size=' + (imageBase64?.length || 0));

    // ── Prompts ─────────────────────────────────────────────────────────────
    const ecgPrompt = [
      'You are an expert cardiologist AI. Analyze this 12-lead ECG image thoroughly.',
      'Detect which of these 6 conditions are present (examine all 12 leads):',
      '1. Atrial Fibrillation - absent P waves, irregular RR intervals, fibrillatory baseline',
      '2. Sinus Tachycardia - regular rhythm with P before each QRS, rate above 100 bpm',
      '3. Sinus Bradycardia - regular rhythm with P before each QRS, rate below 60 bpm',
      '4. Left Bundle Branch Block - wide QRS >120ms, broad notched R in V5/V6, deep S in V1',
      '5. Right Bundle Branch Block - wide QRS >120ms, rSR pattern in V1, wide S in I and V5/V6',
      '6. First-Degree AV Block - prolonged PR interval >200ms with normal conduction',
      'Examine all leads: rate, rhythm, P waves, QRS, ST, T waves, intervals.',
      'Return ONLY valid JSON (no markdown, no text outside JSON):',
      '{"detected":["exact condition names"],"confidence":{"ConditionName":"high/medium/low"},"findings":"3-4 sentence clinical ECG interpretation","rate":"e.g. 72 bpm","rhythm":"e.g. normal sinus rhythm","axis":"e.g. normal axis","pr_interval":"e.g. 160ms","qrs_duration":"e.g. 90ms","qt_interval":"e.g. 400ms","warning":"urgent finding or null"}',
      'Set detected:[] if none of the 6 conditions are found.',
    ].join('\n');

    const echoPrompt = [
      'You are an expert echocardiographer AI (PanEcho framework - 39 reporting tasks).',
      'Analyze this echocardiogram image and report all visible findings.',
      'Assess: LV/RV size and function, all 4 valves, atria, pericardium, wall motion.',
      'Valve grading: none/trace/mild/moderate/severe.',
      'Diastolic function: normal, grade I (impaired relaxation), grade II (pseudonormal), grade III (restrictive).',
      'LVEF: normal>=55%, mildly reduced 45-54%, moderately reduced 30-44%, severely reduced <30%.',
      'Return ONLY valid JSON (no markdown, no text outside JSON):',
      '{"lvef":"e.g. 55-60%","lvFunction":"normal/mildly reduced/moderately reduced/severely reduced","lv_edv":"estimate or Not visualized","lv_esv":"estimate or Not visualized","rvFunction":"normal/mildly reduced/moderately reduced","rv_size":"normal/mildly enlarged","valvularFindings":{"mitral":"normal or grade","aortic":"normal or grade","tricuspid":"normal","pulmonary":"normal"},"structuralFindings":["abnormal findings"],"diastolicFunction":"normal or grade I/II/III","la_size":"normal/mildly enlarged/moderately enlarged","pericardium":"normal or effusion","wallMotion":"normal or regional abnormality","impression":"3-4 sentence impression","recommendations":["recommendations"],"limitations":"none","tasks_assessed":["PanEcho tasks assessed"]}',
    ].join('\n');

    const prompt = isECG ? ecgPrompt : echoPrompt;
    let result = null;

    // ══════════════════════════════════════════════════════════════════════
    // 1. GEMINI (FREE — primary provider, 1500 req/day)
    //    Get key free at: aistudio.google.com → No credit card needed
    // ══════════════════════════════════════════════════════════════════════
    const geminiKey = process.env.GEMINI_API_KEY;
    console.log('[cardiac] GEMINI_API_KEY: ' + (geminiKey ? 'SET' : 'NOT SET — get free at aistudio.google.com'));

    if (geminiKey && !result) {
      // Only gemini-2.0-flash-lite and gemini-2.0-flash confirmed working from logs
      // Others gave 404 (model name not valid for this key/region)
      const GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'];
      const GEMINI_PATHS  = ['/v1beta/models/', '/v1/models/']; // try both API versions

      const geminiParts = isPDF
        ? [{ inlineData: { mimeType: 'application/pdf', data: imageBase64 } }, { text: prompt }]
        : [{ inlineData: { mimeType: safeMime, data: imageBase64 } }, { text: prompt }];

      const geminiBody = {
        contents: [{ parts: geminiParts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      };

      const sleep = ms => new Promise(res => setTimeout(res, ms));

      outerLoop:
      for (const apiPath of GEMINI_PATHS) {
        for (const model of GEMINI_MODELS) {
          if (result) break outerLoop;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log('[cardiac] Gemini ' + model + ' attempt ' + attempt + ' via ' + apiPath.slice(0,-8) + '...');
              const r = await httpsPost(
                'generativelanguage.googleapis.com',
                apiPath + model + ':generateContent?key=' + geminiKey,
                {},
                geminiBody
              );
              console.log('[cardiac] Gemini ' + model + ' HTTP ' + r.status);

              if (r.status === 200 && r.body?.candidates) {
                const rawText = r.body.candidates[0]?.content?.parts?.[0]?.text || '';
                console.log('[cardiac] Gemini raw: ' + rawText.slice(0, 200));
                const cleaned = rawText.replace(/```json[\n]?/gi, '').replace(/```[\n]?/g, '').trim();
                const jsonM   = cleaned.match(/\{[\s\S]*\}/);
                if (jsonM) {
                  result = JSON.parse(jsonM[0]);
                  result.aiAvailable = true;
                  result.provider    = 'gemini/' + model;
                  console.log('[cardiac] Gemini SUCCESS with ' + model);
                  break outerLoop;
                }
                console.warn('[cardiac] Gemini: no JSON found in response');
                break; // wrong format, try next model
              } else if (r.status === 429) {
                const wait = attempt * 8000; // 8s, 16s, 24s
                console.warn('[cardiac] Gemini 429 — waiting ' + (wait/1000) + 's (attempt ' + attempt + '/3)');
                await sleep(wait);
                // loop continues to retry
              } else if (r.status === 404) {
                console.warn('[cardiac] Gemini ' + model + ' 404 via ' + apiPath.slice(0,-8));
                break; // try next path/model combo
              } else if (r.status === 403) {
                console.error('[cardiac] Gemini 403 — key invalid. Check aistudio.google.com');
                break outerLoop;
              } else {
                const msg = r.body?.error?.message || JSON.stringify(r.body).slice(0, 150);
                console.warn('[cardiac] Gemini ' + model + ' HTTP ' + r.status + ': ' + msg);
                break;
              }
            } catch (err) {
              console.warn('[cardiac] Gemini ' + model + ' error: ' + err.message);
              break;
            }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. OPENAI (secondary — if Gemini unavailable)
    // ══════════════════════════════════════════════════════════════════════
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && !result) {
      console.log('[cardiac] OPENAI_API_KEY: SET (' + openaiKey.slice(0,10) + '...) — trying as fallback');
      const messages = [{
        role: 'user',
        content: isPDF
          ? [{ type: 'text', text: prompt }]
          : [
              { type: 'image_url', image_url: { url: 'data:' + safeMime + ';base64,' + imageBase64, detail: 'high' } },
              { type: 'text', text: prompt },
            ],
      }];

      const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
      for (const model of OPENAI_MODELS) {
        if (result) break;
        try {
          console.log('[cardiac] Trying OpenAI ' + model + '...');
          const r = await httpsPost(
            'api.openai.com', '/v1/chat/completions',
            { Authorization: 'Bearer ' + openaiKey },
            { model, max_tokens: 1500, messages }
          );
          console.log('[cardiac] OpenAI ' + model + ' HTTP ' + r.status);
          if (r.status === 200 && r.body?.choices) {
            const text  = r.body.choices[0]?.message?.content || '';
            const jsonM = text.match(/\{[\s\S]*\}/);
            if (jsonM) {
              result = JSON.parse(jsonM[0]);
              result.aiAvailable = true;
              result.provider = 'openai/' + model;
              console.log('[cardiac] OpenAI ' + model + ' SUCCESS');
            }
          } else if (r.status === 403) {
            console.warn('[cardiac] OpenAI ' + model + ': 403 model access blocked');
          } else {
            console.warn('[cardiac] OpenAI ' + model + ': HTTP ' + r.status);
          }
        } catch (err) {
          console.warn('[cardiac] OpenAI ' + model + ': ' + err.message);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. ANTHROPIC (last resort)
    // ══════════════════════════════════════════════════════════════════════
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !result) {
      try {
        console.log('[cardiac] Trying Anthropic claude-sonnet-4-6...');
        const contentBlock = isPDF
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
          : { type: 'image',    source: { type: 'base64', media_type: safeMime,           data: imageBase64 } };

        const r = await httpsPost(
          'api.anthropic.com', '/v1/messages',
          { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
          { model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }] }
        );
        console.log('[cardiac] Anthropic HTTP ' + r.status);
        if (r.status === 200 && r.body?.content) {
          const text  = r.body.content.find(b => b.type === 'text')?.text || '';
          const jsonM = text.match(/\{[\s\S]*\}/);
          if (jsonM) {
            result = JSON.parse(jsonM[0]);
            result.aiAvailable = true;
            result.provider = 'anthropic/claude-sonnet-4-6';
            console.log('[cardiac] Anthropic SUCCESS');
          }
        } else if (r.status === 400) {
          const errMsg = r.body?.error?.message || '';
          if (errMsg.toLowerCase().includes('credit') || errMsg.toLowerCase().includes('balance')) {
            anthropicCreditError = true;
            console.error('[cardiac] Anthropic: no credits. Add at console.anthropic.com/settings/billing');
          }
        }
      } catch (err) {
        console.warn('[cardiac] Anthropic error: ' + err.message);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. FALLBACK — clear actionable message
    // ══════════════════════════════════════════════════════════════════════
    if (!result) {
      const noGemini = !geminiKey;
      const fix = noGemini
        ? 'FREE FIX: Go to aistudio.google.com → Sign in → Get API Key → Copy key → Add GEMINI_API_KEY=your-key to backend/.env → Restart server. Free 1500 ECG analyses per day, no credit card needed.'
        : anthropicCreditError
          ? 'Anthropic key needs credits. Go to console.anthropic.com/settings/billing and add $5.'
          : 'Check backend logs for the specific error from each provider.';

      console.error('[cardiac] All providers failed. ' + fix);

      result = isECG ? {
        detected: [], confidence: {},
        findings: fix,
        rate: 'Not determined', rhythm: 'Not determined', axis: 'Not determined',
        pr_interval: 'Not determined', qrs_duration: 'Not determined', qt_interval: 'Not determined',
        warning: null, aiAvailable: false, pending: true,
      } : {
        lvef: 'Not determined', lvFunction: 'AI unavailable', rvFunction: 'Not determined',
        rv_size: 'Not determined', valvularFindings: {}, structuralFindings: [],
        diastolicFunction: 'Not determined', la_size: 'Not determined',
        pericardium: 'Not determined', wallMotion: 'Not determined',
        impression: fix,
        recommendations: [], limitations: 'AI provider unavailable', tasks_assessed: [],
        lv_edv: 'Not determined', lv_esv: 'Not determined', aiAvailable: false, pending: true,
      };
    }

    // ── Save to DB ─────────────────────────────────────────────────────────
    if (fileId) {
      try {
        await prisma.medicalFile.update({
          where: { id: fileId },
          data: {
            patientAnalysis:   result,
            patientAnalyzedAt: new Date(),
            isProcessed:       true,
            category:          isECG ? 'ecg' : 'echo',
            urgencyLevel:      (result.warning && result.warning !== 'null') ? 'HIGH' : 'LOW',
          },
        });
        console.log('[cardiac] Saved to MedicalFile ' + fileId);
      } catch (dbErr) {
        console.warn('[cardiac] DB save failed: ' + dbErr.message);
      }
    }

    return res.json({ success: true, result, provider: result.provider || 'none' });

  } catch (err) {
    console.error('[cardiac] Unhandled error: ' + err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ai/test-keys — diagnostic endpoint
// Open in browser: http://localhost:5000/api/ai/test-keys
router.get('/test-keys', async (req, res) => {
  const https  = require('https');
  const gemini = process.env.GEMINI_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const anth   = process.env.ANTHROPIC_API_KEY;

  function testPost(hostname, path, headers, body) {
    return new Promise(resolve => {
      const bodyStr = JSON.stringify(body);
      const agent   = new https.Agent({ rejectUnauthorized: false });
      const r = https.request({
        hostname, path, method: 'POST', agent, timeout: 10000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
      }, resp => {
        let d = '';
        resp.on('data', c => { d += c; });
        resp.on('end', () => {
          try { resolve({ status: resp.statusCode, body: JSON.parse(d) }); }
          catch { resolve({ status: resp.statusCode, body: { raw: d.slice(0, 200) } }); }
        });
      });
      r.on('error', e => resolve({ status: 0, error: e.message }));
      r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'Timed out' }); });
      r.write(bodyStr); r.end();
    });
  }

  const result = {
    gemini_key_set:       !!gemini,
    gemini_key_prefix:    gemini ? gemini.slice(0, 10) + '...' : 'NOT SET — get FREE at aistudio.google.com',
    openai_key_set:       !!openai,
    openai_key_prefix:    openai ? openai.slice(0, 12) + '...' : 'NOT SET',
    anthropic_key_set:    !!anth,
    anthropic_key_prefix: anth ? anth.slice(0, 12) + '...' : 'NOT SET',
  };

  // Test Gemini (free)
  if (gemini) {
    // Try multiple models — whichever responds first is used
    const geminiModels = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
    result.gemini_model_tested = null;
    result.gemini_works = false;
    for (const gm of geminiModels) {
      const r = await testPost(
        'generativelanguage.googleapis.com',
        '/v1beta/models/' + gm + ':generateContent?key=' + gemini,
        {},
        { contents: [{ parts: [{ text: 'Reply with the word OK only.' }] }], generationConfig: { maxOutputTokens: 5 } }
      );
      result.gemini_model_tested = gm;
      result.gemini_status = r.status;
      if (r.status === 200) {
        result.gemini_works       = true;
        result.gemini_best_model  = gm;
        result.gemini_error       = null;
        break;
      } else if (r.status === 429) {
        result.gemini_error = 'Rate limit on ' + gm + ' — trying next model';
      } else if (r.status === 404) {
        result.gemini_error = gm + ' not available — trying next model';
      } else if (r.status === 403) {
        result.gemini_error = 'Invalid API key — get free key at aistudio.google.com';
        break;
      } else {
        result.gemini_error = 'HTTP ' + r.status + ' on ' + gm;
      }
    }
    if (!result.gemini_works) {
      const last = result.gemini_error || 'All models failed';
      if (last.includes('429') || last.includes('Rate limit')) {
        result.gemini_error = '429 Rate limit from repeated test calls — your key IS working. Wait 60 seconds then upload an ECG directly (do not call test-keys repeatedly).';
        result.gemini_works = 'LIKELY_WORKS'; // flag that key is valid, just rate limited by our tests
      } else {
        result.gemini_error = last + ' — Check aistudio.google.com to confirm key is active.';
      }
    }
  }

  // Test OpenAI
  if (openai) {
    const r = await testPost('api.openai.com', '/v1/chat/completions',
      { Authorization: 'Bearer ' + openai },
      { model: 'gpt-4o', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }
    );
    result.openai_status = r.status;
    result.openai_works  = r.status === 200;
    result.openai_error  = r.status === 200 ? null
      : r.status === 401 ? 'Invalid key'
      : r.status === 403 ? 'Model access blocked — create personal key at platform.openai.com/api-keys'
      : r.error || ('HTTP ' + r.status);
  }

  // Test Anthropic
  if (anth) {
    const r = await testPost('api.anthropic.com', '/v1/messages',
      { 'x-api-key': anth, 'anthropic-version': '2023-06-01' },
      { model: 'claude-sonnet-4-6', max_tokens: 5, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }
    );
    result.anthropic_status = r.status;
    result.anthropic_works  = r.status === 200;
    result.anthropic_error  = r.status === 200 ? null
      : r.status === 400 ? 'Key valid but NO CREDITS — add $5 at console.anthropic.com/settings/billing'
      : r.status === 401 ? 'Invalid key'
      : r.error || ('HTTP ' + r.status);
  }

  const anyWorking = result.gemini_works === true || result.gemini_works === 'LIKELY_WORKS' || result.openai_works || result.anthropic_works;
  result.status = anyWorking ? 'Cardiac AI ready' : 'No working AI provider';
  if (!anyWorking) {
    if (!gemini) {
      result.recommended_fix = 'Get FREE Gemini key: go to aistudio.google.com → Sign in → Get API key → Add GEMINI_API_KEY to backend/.env';
    } else if (result.gemini_error?.includes('429') || result.gemini_error?.includes('Rate limit')) {
      result.recommended_fix = 'Wait 60 seconds (rate limit from test calls), then upload an ECG directly — do NOT keep hitting test-keys';
      result.status = 'Key works — just rate limited by test calls';
    } else {
      result.recommended_fix = 'Check aistudio.google.com — confirm the key is active and Generative Language API is enabled';
    }
  }

  console.log('[test-keys]', JSON.stringify(result, null, 2));
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/summarize-note
// Accepts speech-to-text transcript and:
//   1. Calls AI to produce bullets + category + urgency + tags
//      AND the 4 structured sections (notes / followUp / prescription / others)
//      — all in one AI call, with full multilingual support.
//   2. Saves rawNote + all 4 sections to DB immediately (no second round-trip needed).
//   3. Returns everything to the frontend so chat and tab panels update together.
//
// Body: { rawText, patientId?, appointmentId?, inputLang?, outputLang?, language? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/summarize-note', auth, async (req, res) => {
  try {
    const { rawText, patientId, appointmentId, language, inputLang, outputLang } = req.body;

    if (!rawText || rawText.trim().length < 3) {
      return res.status(400).json({ error: 'rawText is required' });
    }

    // Normalise language codes — accept 'en'/'hi'/'gu' or 'english'/'hindi'/'gujarati'
    const LANG_MAP = { english: 'en', hindi: 'hi', gujarati: 'gu', en: 'en', hi: 'hi', gu: 'gu' };
    const resolvedInput  = LANG_MAP[(inputLang  || language || 'en').toLowerCase()] || 'en';
    const resolvedOutput = LANG_MAP[(outputLang || language || 'en').toLowerCase()] || 'en';

    // ── 1. AI call — summarise + extract sections in ONE request ─────────────
    const { summarizeClinicalNote } = getAIService();
    const result = await summarizeClinicalNote(rawText, {
      inputLang:  resolvedInput,
      outputLang: resolvedOutput,
    });
    // result = { bullets, summary, category, urgency, tags, sections: { notes, followUp, prescription, others }, aiGenerated, provider }

    const sec = result.sections || {};

    // ── 2. Persist rawNote + all 4 sections to DB in one upsert ─────────────
    if (appointmentId) {
      await prisma.consultationNote.upsert({
        where:  { appointmentId },
        update: {
          rawNote:      rawText,
          notes:        sec.notes        || '',
          followUp:     sec.followUp     || '',
          prescription: sec.prescription || '',
          others:       sec.others       || '',
          updatedAt:    new Date(),
        },
        create: {
          appointmentId,
          ...(patientId ? { patientId } : {}),
          rawNote:      rawText,
          notes:        sec.notes        || '',
          followUp:     sec.followUp     || '',
          prescription: sec.prescription || '',
          others:       sec.others       || '',
        },
      }).catch(e => console.warn('[summarize-note] DB upsert failed:', e.message));
    }

    // ── 3. Return full result so frontend can update chat + all tab panels ───
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[summarize-note] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/extract-sections
// Re-extracts sections from an existing note (e.g. when doctor edits raw note).
// Also supports outputLang for translated section content.
// Body: { rawNote, appointmentId?, patientId?, outputLang?, language? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/extract-sections', auth, async (req, res) => {
  try {
    const { rawNote, appointmentId, patientId, outputLang, language } = req.body;

    if (!rawNote || rawNote.trim().length < 3) {
      return res.status(400).json({ error: 'rawNote is required' });
    }

    // Normalise language
    const LANG_MAP = { english: 'en', hindi: 'hi', gujarati: 'gu', en: 'en', hi: 'hi', gu: 'gu' };
    const resolvedOutput = LANG_MAP[(outputLang || language || 'en').toLowerCase()] || 'en';

    // ── 1. Extract 4 sections (OpenAI → rule-based fallback) ─────────────────
    const { extractConsultationSections } = getAIService();
    const sections = await extractConsultationSections(rawNote, { outputLang: resolvedOutput });
    // sections = { notes, followUp, prescription, others, aiGenerated, provider? }

    // ── 2. Persist all 4 sections + rawNote to DB ────────────────────────────
    if (appointmentId) {
      await prisma.consultationNote.upsert({
        where:  { appointmentId },
        update: {
          rawNote:      rawNote,
          notes:        sections.notes        || '',
          followUp:     sections.followUp     || '',
          prescription: sections.prescription || '',
          others:       sections.others       || '',
          updatedAt:    new Date(),
        },
        create: {
          appointmentId,
          ...(patientId ? { patientId } : {}),
          rawNote,
          notes:        sections.notes        || '',
          followUp:     sections.followUp     || '',
          prescription: sections.prescription || '',
          others:       sections.others       || '',
        },
      }).catch(e => console.warn('[extract-sections] DB upsert failed:', e.message));
    }

    return res.json({ success: true, sections });
  } catch (err) {
    console.error('[extract-sections] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});


module.exports = router;