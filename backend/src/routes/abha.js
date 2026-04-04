const express  = require('express');
const router   = express.Router();
const prisma   = require('../lib/prisma');
const authenticate = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/abha/fetch — fetch and summarize patient's ABHA history
router.post('/fetch', authenticate, async (req, res) => {
  try {
    const { abhaId, patientId } = req.body;
    if (!abhaId) return res.status(400).json({ error: 'abhaId is required' });

    // ── ABDM sandbox / production API call ────────────────────────────────
    // In production replace this block with real ABDM FHIR API calls:
    // POST https://dev.abdm.gov.in/gateway/v0.5/health-information/cm/request
    // Docs: https://sandbox.abdm.gov.in/docs/

    const isSandbox = process.env.ABDM_ENV !== 'production';
    let nationalHistory;

    if (isSandbox || !process.env.ABDM_CLIENT_ID) {
      // Return realistic mock data for development/demo
      nationalHistory = generateMockABHAHistory(abhaId);
    } else {
      // Real ABDM API integration
      const token = await getABDMToken();
      nationalHistory = await fetchFromABDM(abhaId, token);
    }

    // Use Claude to summarize the national health history
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Summarize this patient's national health history (from ABDM/ABHA) for a doctor.
Be concise, clinically relevant, and flag any important patterns.

Patient ABHA ID: ${abhaId}
National Health History:
${JSON.stringify(nationalHistory, null, 2)}

Return ONLY valid JSON:
{
  "abhaId": "${abhaId}",
  "summary": "2-3 sentence overall health summary",
  "previousHospitals": ["Hospital A (2023)", "Hospital B (2022)"],
  "keyDiagnoses": ["Type 2 Diabetes (2021)", "Hypertension (2020)"],
  "previousMedications": ["Metformin 500mg", "Amlodipine 5mg"],
  "allergiesRecorded": ["Penicillin"],
  "recentProcedures": ["Echocardiogram (Jan 2024)", "Colonoscopy (Mar 2023)"],
  "redFlags": ["Non-compliant with diabetes medication for 6 months"],
  "aiInsight": "Key clinical insight for the treating doctor"
}`
      }]
    });

    const parsed = JSON.parse(response.content[0].text.match(/\{[\s\S]*\}/)[0]);

    // Save to patient record for future reference
    if (patientId) {
      await prisma.clinicalTimeline.create({
        data: {
          patientId,
          title:       'ABHA History Fetched',
          description: parsed.summary,
          category:    'report',
          metadata:    parsed
        }
      });
    }

    res.json({ success: true, data: { ...parsed, rawHistory: nationalHistory } });
  } catch (err) {
    console.error('ABHA fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch ABHA history', detail: err.message });
  }
});

async function getABDMToken() {
  const r = await fetch('https://dev.abdm.gov.in/gateway/v0.5/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId:     process.env.ABDM_CLIENT_ID,
      clientSecret: process.env.ABDM_CLIENT_SECRET
    })
  });
  const d = await r.json();
  return d.accessToken;
}

async function fetchFromABDM(abhaId, token) {
  // Real ABDM FHIR R4 call — replace with actual endpoint
  const r = await fetch(`https://dev.abdm.gov.in/fhir/R4/Patient?identifier=${abhaId}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-CM-ID': 'sbx' }
  });
  return r.json();
}

function generateMockABHAHistory(abhaId) {
  return {
    abhaId,
    records: [
      { hospital: 'Apollo Hospitals Bangalore', date: '2023-08-15', type: 'OPD',     diagnosis: 'Type 2 Diabetes Mellitus', medications: ['Metformin 1000mg BD', 'Glipizide 5mg OD'] },
      { hospital: 'Fortis Hospital',            date: '2023-02-10', type: 'IPD',     diagnosis: 'Hypertensive Crisis',       procedures: ['IV Labetalol', 'Cardiac monitoring'] },
      { hospital: 'Manipal Hospital',           date: '2022-11-05', type: 'Lab',     diagnosis: 'HbA1c: 9.2%, LDL: 145',   notes: 'Poor glycemic control' },
      { hospital: 'Narayana Health',            date: '2022-06-20', type: 'Surgery', diagnosis: 'Appendectomy',              procedures: ['Laparoscopic appendectomy'] },
    ],
    allergies:   ['Penicillin — anaphylaxis (2019)'],
    bloodGroup:  'B+',
    vaccinations:['COVID-19 (2 doses)', 'Tetanus (2021)']
  };
}

module.exports = router;