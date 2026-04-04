/**
 * lib/drugInteractionRules.js
 *
 * Client-side drug-report cross-reference rules.
 * Called inside the Report Review page — no API needed.
 *
 * Usage:
 *   import { checkDrugReportInteractions } from '@/lib/drugInteractionRules';
 *   const alerts = checkDrugReportInteractions(medications, aiAnalysis);
 *
 * Returns an array of alerts:
 *   [{ severity: 'CRITICAL'|'HIGH'|'MEDIUM', drug, finding, message, action }]
 */

// ── Rule definitions ──────────────────────────────────────────────────────────
// Each rule: drug class match (substring, case-insensitive) + parameter pattern
// + threshold logic + severity + clinical message + recommended action

const RULES = [
  // ── Metformin ──────────────────────────────────────────────────────────────
  {
    drug:       'metformin',
    parameter:  /creatinine|egfr|renal|kidney/i,
    check:      (val, unit, status) => status === 'abnormal' || (unit?.toLowerCase().includes('egfr') && val < 30),
    severity:   'CRITICAL',
    message:    'Metformin is contraindicated with eGFR < 30 mL/min/1.73m². Risk of lactic acidosis.',
    action:     'Withhold Metformin. Check eGFR. Consider switch to alternative hypoglycaemic agent.',
  },
  {
    drug:       'metformin',
    parameter:  /egfr/i,
    check:      (val) => val >= 30 && val < 45,
    severity:   'HIGH',
    message:    'Metformin use with caution when eGFR 30–45. Dose reduction recommended.',
    action:     'Reduce Metformin to 500mg OD. Monitor renal function every 3 months.',
  },

  // ── Statins (Atorvastatin, Rosuvastatin, Simvastatin) ─────────────────────
  {
    drug:       /atorvastatin|rosuvastatin|simvastatin|statin/i,
    parameter:  /alt|ast|sgpt|sgot|liver|hepatic/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'HIGH',
    message:    'Statin therapy with elevated liver enzymes. ALT/AST > 3× ULN may indicate statin-induced hepatotoxicity.',
    action:     'Withhold statin temporarily. Repeat LFT in 2 weeks. If persists, consider dose reduction or switch.',
  },
  {
    drug:       /atorvastatin|rosuvastatin|simvastatin|statin/i,
    parameter:  /ck|creatine kinase|cpk/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'CRITICAL',
    message:    'Elevated creatine kinase with statin use. Risk of rhabdomyolysis.',
    action:     'Stop statin immediately. Assess for myopathy symptoms. Check renal function urgently.',
  },

  // ── Warfarin / Anticoagulants ─────────────────────────────────────────────
  {
    drug:       /warfarin|acenocoumarol/i,
    parameter:  /inr|prothrombin|pt\s/i,
    check:      (val) => val > 3.5,
    severity:   'CRITICAL',
    message:    `INR > 3.5 in patient on warfarin. Supratherapeutic anticoagulation — bleeding risk.`,
    action:     'Hold warfarin dose. Check for bleeding symptoms. Consider Vitamin K if INR > 5.',
  },
  {
    drug:       /warfarin|acenocoumarol/i,
    parameter:  /inr|prothrombin/i,
    check:      (val) => val < 1.8,
    severity:   'HIGH',
    message:    'INR sub-therapeutic in patient on warfarin. Increased thromboembolism risk.',
    action:     'Review warfarin dose. Check compliance. Consider dose increase after discussion.',
  },

  // ── ACE Inhibitors / ARBs ─────────────────────────────────────────────────
  {
    drug:       /ramipril|lisinopril|enalapril|perindopril|losartan|telmisartan|valsartan|arb|ace inhibitor/i,
    parameter:  /potassium|k\+/i,
    check:      (val, unit, status) => status === 'abnormal' && val > 5.5,
    severity:   'CRITICAL',
    message:    'Hyperkalaemia (K+ > 5.5 mmol/L) in patient on ACE inhibitor/ARB. Risk of cardiac arrhythmia.',
    action:     'Withhold ACE inhibitor/ARB. Repeat potassium urgently. Dietary potassium restriction. Cardiology review if K+ > 6.',
  },
  {
    drug:       /ramipril|lisinopril|enalapril|perindopril|losartan|telmisartan|valsartan/i,
    parameter:  /creatinine|egfr|renal/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'HIGH',
    message:    'Renal impairment detected in patient on ACE inhibitor/ARB. Monitor for drug-induced nephropathy.',
    action:     'Recheck creatinine and electrolytes. If creatinine rise > 30% from baseline, consider dose reduction or cessation.',
  },

  // ── Amiodarone ────────────────────────────────────────────────────────────
  {
    drug:       'amiodarone',
    parameter:  /tsh|thyroid|t3|t4|free t/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'HIGH',
    message:    'Thyroid dysfunction in patient on amiodarone. Amiodarone causes both hypo- and hyperthyroidism.',
    action:     'Endocrinology review. Do not stop amiodarone abruptly without cardiology input. Treat thyroid dysfunction accordingly.',
  },
  {
    drug:       'amiodarone',
    parameter:  /alt|ast|liver|hepatic/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'HIGH',
    message:    'Elevated liver enzymes in patient on amiodarone. Hepatotoxicity possible.',
    action:     'Assess liver function trend. If ALT > 3× ULN, consider dose reduction or alternative antiarrhythmic.',
  },

  // ── NSAIDs ────────────────────────────────────────────────────────────────
  {
    drug:       /ibuprofen|diclofenac|naproxen|indomethacin|nsaid|mefenamic/i,
    parameter:  /creatinine|egfr|renal|kidney/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'HIGH',
    message:    'Renal impairment with NSAID use. NSAIDs reduce renal prostaglandin synthesis.',
    action:     'Withhold NSAID. Switch to paracetamol. Monitor renal function. Avoid NSAIDs if eGFR < 30.',
  },
  {
    drug:       /ibuprofen|diclofenac|naproxen|nsaid/i,
    parameter:  /haemoglobin|hb|hemoglobin|iron|ferritin/i,
    check:      (val, unit, status) => status === 'abnormal' && val < 10,
    severity:   'MEDIUM',
    message:    'Anaemia with NSAID use. NSAIDs can cause GI blood loss.',
    action:     'Check for GI bleeding symptoms. Stool occult blood test. Consider PPI co-prescription.',
  },

  // ── Digoxin ───────────────────────────────────────────────────────────────
  {
    drug:       'digoxin',
    parameter:  /potassium|k\+/i,
    check:      (val, unit, status) => val < 3.5,
    severity:   'CRITICAL',
    message:    'Hypokalaemia (K+ < 3.5) with digoxin use. Risk of digoxin toxicity and arrhythmia.',
    action:     'Correct potassium urgently. Check digoxin level. Cardiac monitoring. Withhold digoxin if K+ < 3.0.',
  },

  // ── Lithium ───────────────────────────────────────────────────────────────
  {
    drug:       'lithium',
    parameter:  /creatinine|egfr|renal/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'HIGH',
    message:    'Renal impairment with lithium use. Risk of lithium toxicity — narrow therapeutic index.',
    action:     'Check lithium level urgently. Reduce dose. Increase monitoring frequency. Nephrology review.',
  },
  {
    drug:       'lithium',
    parameter:  /tsh|thyroid/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'MEDIUM',
    message:    'Thyroid abnormality with lithium use. Lithium commonly causes hypothyroidism.',
    action:     'Thyroid function monitoring every 6 months. Treat hypothyroidism with levothyroxine if indicated.',
  },

  // ── Insulin / Sulphonylureas ──────────────────────────────────────────────
  {
    drug:       /insulin|glibenclamide|gliclazide|glipizide|glimepiride|sulphonylurea/i,
    parameter:  /glucose|blood sugar|fbs|rbs|hba1c/i,
    check:      (val, unit, status) => status === 'abnormal' && (val < 4 || (unit?.includes('%') && val < 5)),
    severity:   'HIGH',
    message:    'Low glucose/HbA1c trend with insulin/sulphonylurea. Hypoglycaemia risk.',
    action:     'Review insulin/sulphonylurea dose. Educate on hypoglycaemia recognition. Check timing of meals.',
  },

  // ── Corticosteroids ───────────────────────────────────────────────────────
  {
    drug:       /prednisolone|dexamethasone|prednisone|methylprednisolone|corticosteroid|steroid/i,
    parameter:  /glucose|blood sugar|hba1c|fbs/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'HIGH',
    message:    'Hyperglycaemia with corticosteroid use. Steroid-induced diabetes is common.',
    action:     'Monitor blood glucose regularly. Consider diabetologist review. May need insulin during steroid course.',
  },
  {
    drug:       /prednisolone|dexamethasone|prednisone|corticosteroid/i,
    parameter:  /potassium|k\+/i,
    check:      (val, unit, status) => val < 3.5,
    severity:   'MEDIUM',
    message:    'Hypokalaemia with corticosteroid use. Steroids promote urinary potassium loss.',
    action:     'Potassium supplementation. Monitor electrolytes weekly during high-dose steroid therapy.',
  },

  // ── Allopurinol ───────────────────────────────────────────────────────────
  {
    drug:       'allopurinol',
    parameter:  /creatinine|egfr/i,
    check:      (val, unit, status) => status === 'abnormal',
    severity:   'MEDIUM',
    message:    'Renal impairment in patient on allopurinol. Dose adjustment required.',
    action:     'Reduce allopurinol dose based on creatinine clearance. eGFR < 30: max 100mg/day.',
  },

  // ── Spironolactone ────────────────────────────────────────────────────────
  {
    drug:       'spironolactone',
    parameter:  /potassium|k\+/i,
    check:      (val, unit, status) => val > 5.0,
    severity:   'HIGH',
    message:    'Hyperkalaemia with spironolactone use. Potassium-sparing diuretic effect.',
    action:     'Reduce or withhold spironolactone. Dietary potassium restriction. Recheck in 48 hours.',
  },
];

/**
 * checkDrugReportInteractions
 *
 * @param {Array}  medications  — patient's active medications [{name, dosage}]
 * @param {Object} aiAnalysis   — from MedicalFile.aiAnalysis
 *                               expects { abnormalValues: string[], keyFindings: string[] }
 * @returns {Array} alerts sorted by severity (CRITICAL first)
 */
export function checkDrugReportInteractions(medications, aiAnalysis) {
  if (!medications?.length || !aiAnalysis) return [];

  const alerts = [];

  // Parse parameter values from both abnormalValues and keyFindings
  const allFindings = [
    ...(aiAnalysis.abnormalValues || []).map(f => ({ text: f, status: 'abnormal' })),
    ...(aiAnalysis.keyFindings    || []).map(f => ({ text: f, status: 'normal'   })),
  ];

  for (const rule of RULES) {
    // Check if any active medication matches this rule's drug
    const matchedDrug = medications.find(med => {
      const name = (med.name || '').toLowerCase();
      if (rule.drug instanceof RegExp) return rule.drug.test(name);
      return name.includes(rule.drug.toLowerCase());
    });
    if (!matchedDrug) continue;

    // Check if any finding matches this rule's parameter
    for (const finding of allFindings) {
      if (!rule.parameter.test(finding.text)) continue;

      // Try to extract numeric value from finding text
      const numMatch = finding.text.match(/([\d.]+)/);
      const val      = numMatch ? parseFloat(numMatch[1]) : null;

      // Extract unit
      const unitMatch = finding.text.match(/[\d.]+\s*([^\s(,—0-9]+)/);
      const unit      = unitMatch ? unitMatch[1] : '';

      // Run the threshold check
      if (rule.check(val, unit, finding.status)) {
        // Avoid duplicate alerts for same drug + same rule
        const isDupe = alerts.some(a => a.drug === matchedDrug.name && a.message === rule.message);
        if (!isDupe) {
          alerts.push({
            severity: rule.severity,
            drug:     matchedDrug.name + (matchedDrug.dosage ? ` ${matchedDrug.dosage}` : ''),
            finding:  finding.text.slice(0, 120),
            message:  rule.message,
            action:   rule.action,
          });
        }
      }
    }
  }

  // Sort: CRITICAL → HIGH → MEDIUM
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  return alerts.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
}

/**
 * getChecklistForReportType
 *
 * Returns a contextual review checklist based on report type.
 * Doctor ticks items as part of structured review.
 *
 * @param {string} documentType — from aiAnalysis.documentType
 * @returns {Array} [{ id, label, critical }]
 */
export function getChecklistForReportType(documentType) {
  const type = (documentType || '').toLowerCase();

  if (type.includes('blood count') || type.includes('cbc') || type.includes('haemogram')) {
    return [
      { id: 'hb_checked',       label: 'Haemoglobin within acceptable range?',                         critical: true  },
      { id: 'wbc_diff',         label: 'WBC differential reviewed (neutrophilia/lymphocytosis)?',        critical: true  },
      { id: 'platelets_ok',     label: 'Platelet count adequate for any planned procedures?',            critical: true  },
      { id: 'iron_ordered',     label: 'Iron studies ordered if microcytic anaemia pattern?',            critical: false },
      { id: 'reticulocyte',     label: 'Reticulocyte count checked if unexplained anaemia?',             critical: false },
      { id: 'peripheral_smear', label: 'Peripheral smear requested if abnormal morphology?',             critical: false },
      { id: 'patient_notified', label: 'Patient notified of results and plan?',                          critical: true  },
    ];
  }

  if (type.includes('lipid') || type.includes('cholesterol')) {
    return [
      { id: 'ldl_target',       label: 'LDL below target for patient\'s cardiovascular risk category?',  critical: true  },
      { id: 'statin_review',    label: 'Statin therapy indicated / adjusted based on result?',           critical: true  },
      { id: 'thyroid_checked',  label: 'Thyroid function checked? (hypothyroidism causes dyslipidaemia)', critical: false },
      { id: 'lifestyle',        label: 'Lifestyle counselling (diet, exercise) documented?',             critical: false },
      { id: 'follow_up_date',   label: 'Follow-up lipid profile date set?',                             critical: false },
      { id: 'patient_notified', label: 'Patient notified of results and plan?',                          critical: true  },
    ];
  }

  if (type.includes('thyroid') || type.includes('tsh') || type.includes('t3') || type.includes('t4')) {
    return [
      { id: 'tsh_range',        label: 'TSH within normal reference range for age/gender?',              critical: true  },
      { id: 'free_t4_checked',  label: 'Free T4 / Free T3 reviewed in context of TSH?',                 critical: true  },
      { id: 'antibodies',       label: 'TPO antibodies ordered if Hashimoto\'s suspected?',              critical: false },
      { id: 'medication_adj',   label: 'Levothyroxine / antithyroid medication dose adjusted if needed?', critical: true  },
      { id: 'symptoms_noted',   label: 'Symptoms of hypo/hyperthyroidism reviewed with patient?',        critical: false },
      { id: 'patient_notified', label: 'Patient notified of results and plan?',                          critical: true  },
    ];
  }

  if (type.includes('glucose') || type.includes('hba1c') || type.includes('diabetes') || type.includes('sugar')) {
    return [
      { id: 'hba1c_target',     label: 'HbA1c within target range (< 7% for most patients)?',           critical: true  },
      { id: 'medication_adj',   label: 'Antidiabetic medication reviewed / adjusted?',                   critical: true  },
      { id: 'hypogly_risk',     label: 'Hypoglycaemia risk assessed if HbA1c very low?',                 critical: true  },
      { id: 'renal_check',      label: 'Renal function checked (Metformin contraindication)?',           critical: true  },
      { id: 'diet_counsel',     label: 'Dietary counselling and carbohydrate guidance provided?',         critical: false },
      { id: 'bp_cholesterol',   label: 'Blood pressure and cholesterol reviewed (metabolic syndrome)?',  critical: false },
      { id: 'patient_notified', label: 'Patient notified of results and plan?',                          critical: true  },
    ];
  }

  if (type.includes('liver') || type.includes('lft') || type.includes('hepatic')) {
    return [
      { id: 'alt_ast_ratio',    label: 'ALT/AST ratio reviewed (AST:ALT > 2 suggests alcoholic liver)?', critical: true  },
      { id: 'bilirubin',        label: 'Bilirubin and ALP reviewed for cholestatic pattern?',            critical: true  },
      { id: 'hepatotoxic_drug', label: 'Any hepatotoxic medications identified and reviewed?',           critical: true  },
      { id: 'ultrasound',       label: 'Liver ultrasound ordered if structural cause suspected?',         critical: false },
      { id: 'viral_hep',        label: 'Viral hepatitis serology (HBsAg, HCV) checked if new elevation?', critical: false },
      { id: 'patient_notified', label: 'Patient notified of results and plan?',                          critical: true  },
    ];
  }

  if (type.includes('renal') || type.includes('kidney') || type.includes('creatinine') || type.includes('egfr')) {
    return [
      { id: 'egfr_stage',       label: 'CKD stage determined (eGFR-based staging applied)?',             critical: true  },
      { id: 'nephrotoxic_meds', label: 'Nephrotoxic medications reviewed and doses adjusted?',           critical: true  },
      { id: 'electrolytes',     label: 'Electrolytes (K+, Na+, HCO3) reviewed?',                        critical: true  },
      { id: 'urine_pcr',        label: 'Urine protein:creatinine ratio ordered?',                       critical: false },
      { id: 'bp_target',        label: 'Blood pressure target < 130/80 mmHg confirmed?',                 critical: false },
      { id: 'nephrology_ref',   label: 'Nephrology referral considered for eGFR < 30?',                  critical: false },
      { id: 'patient_notified', label: 'Patient notified of results and plan?',                          critical: true  },
    ];
  }

  if (type.includes('cardiac') || type.includes('ecg') || type.includes('echo') || type.includes('troponin')) {
    return [
      { id: 'troponin',         label: 'Troponin levels reviewed — rule out ACS?',                       critical: true  },
      { id: 'ecg_reviewed',     label: 'ECG reviewed for rhythm, ST changes, QTc?',                     critical: true  },
      { id: 'echo_lvef',        label: 'Echocardiogram LVEF noted and documented?',                     critical: true  },
      { id: 'cardiology_ref',   label: 'Cardiology referral arranged if significant finding?',            critical: true  },
      { id: 'antiplatelet',     label: 'Antiplatelet / anticoagulation reviewed?',                       critical: false },
      { id: 'patient_notified', label: 'Patient notified of results and plan?',                          critical: true  },
    ];
  }

  // Generic checklist for unrecognised report types
  return [
    { id: 'findings_reviewed',  label: 'All key findings reviewed?',                                    critical: true  },
    { id: 'abnormals_noted',    label: 'All abnormal values identified and actioned?',                   critical: true  },
    { id: 'drug_interaction',   label: 'Drug-report interactions checked?',                             critical: true  },
    { id: 'follow_up_plan',     label: 'Follow-up plan documented?',                                    critical: false },
    { id: 'patient_notified',   label: 'Patient notified of results and plan?',                          critical: true  },
  ];
}
