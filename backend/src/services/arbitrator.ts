import { LLMExtractionResult } from './llmEvaluator';

export interface FieldComparison {
  field: string;
  model_a_value: any;
  model_b_value: any;
  consensus_value: any;
  confidence: number;
  discrepancy: boolean;
  note: string;
}

export interface ArbitrationResult {
  consensus: LLMExtractionResult;
  field_comparisons: FieldComparison[];
  discrepancies: FieldComparison[];
  overall_confidence: number;
  recommended_status: string;
}

/**
 * Compare Model A and Model B results field by field.
 * Produce a consensus with confidence scores and flag discrepancies.
 */
export function arbitrate(
  modelA: LLMExtractionResult,
  modelB: LLMExtractionResult
): ArbitrationResult {
  const comparisons: FieldComparison[] = [];

  // String fields to compare
  const stringFields: (keyof LLMExtractionResult)[] = [
    'vendor_name',
    'vendor_tax_id',
    'invoice_number',
    'invoice_date',
    'due_date',
    'currency',
    'payment_terms',
    'bank_details',
  ];

  // Numeric fields to compare
  const numericFields: (keyof LLMExtractionResult)[] = [
    'subtotal',
    'tax_amount',
    'total_amount',
  ];

  for (const field of stringFields) {
    const a = String(modelA[field] || '');
    const b = String(modelB[field] || '');
    const comparison = compareStrings(field, a, b);
    comparisons.push(comparison);
  }

  for (const field of numericFields) {
    const a = Number(modelA[field]) || 0;
    const b = Number(modelB[field]) || 0;
    const comparison = compareNumbers(field, a, b);
    comparisons.push(comparison);
  }

  // Compare line items count
  const lineItemCountComp = compareNumbers(
    'line_items_count',
    modelA.line_items.length,
    modelB.line_items.length
  );
  comparisons.push(lineItemCountComp);

  // Build consensus
  const discrepancies = comparisons.filter((c) => c.discrepancy);
  const totalConfidence =
    comparisons.reduce((sum, c) => sum + c.confidence, 0) / comparisons.length;
  const overallConfidence = Math.round(totalConfidence * 100) / 100;

  // Build consensus values — prefer Model A for exact matches, otherwise higher confidence model
  const consensus: LLMExtractionResult = {
    vendor_name: pickConsensusString(modelA.vendor_name, modelB.vendor_name),
    vendor_tax_id: pickConsensusString(modelA.vendor_tax_id, modelB.vendor_tax_id),
    invoice_number: pickConsensusString(modelA.invoice_number, modelB.invoice_number),
    invoice_date: pickConsensusString(modelA.invoice_date, modelB.invoice_date),
    due_date: pickConsensusString(modelA.due_date, modelB.due_date),
    currency: pickConsensusString(modelA.currency, modelB.currency),
    line_items:
      modelA.line_items.length >= modelB.line_items.length
        ? modelA.line_items
        : modelB.line_items,
    subtotal: pickConsensusNumber(modelA.subtotal, modelB.subtotal),
    tax_amount: pickConsensusNumber(modelA.tax_amount, modelB.tax_amount),
    total_amount: pickConsensusNumber(modelA.total_amount, modelB.total_amount),
    payment_terms: pickConsensusString(modelA.payment_terms, modelB.payment_terms),
    bank_details: pickConsensusString(modelA.bank_details, modelB.bank_details),
    confidence_score: overallConfidence,
    risk_flags: mergeRiskFlags(modelA.risk_flags, modelB.risk_flags),
  };

  const recommendedStatus = overallConfidence < 0.8 ? 'NEEDS_REVIEW' : 'PROCESSING';

  return {
    consensus,
    field_comparisons: comparisons,
    discrepancies,
    overall_confidence: overallConfidence,
    recommended_status: recommendedStatus,
  };
}

function compareStrings(field: string, a: string, b: string): FieldComparison {
  if (a === b) {
    return {
      field,
      model_a_value: a,
      model_b_value: b,
      consensus_value: a,
      confidence: 1.0,
      discrepancy: false,
      note: 'Exact match',
    };
  }

  const similarity = levenshteinSimilarity(a.toLowerCase(), b.toLowerCase());

  if (similarity > 0.85) {
    return {
      field,
      model_a_value: a,
      model_b_value: b,
      consensus_value: a.length >= b.length ? a : b, // prefer the longer/more complete value
      confidence: 0.9,
      discrepancy: false,
      note: `Fuzzy match (similarity: ${(similarity * 100).toFixed(1)}%)`,
    };
  }

  return {
    field,
    model_a_value: a,
    model_b_value: b,
    consensus_value: a || b, // prefer non-empty
    confidence: Math.max(0.3, similarity),
    discrepancy: true,
    note: `Mismatch (similarity: ${(similarity * 100).toFixed(1)}%)`,
  };
}

function compareNumbers(field: string, a: number, b: number): FieldComparison {
  if (a === b) {
    return {
      field,
      model_a_value: a,
      model_b_value: b,
      consensus_value: a,
      confidence: 1.0,
      discrepancy: false,
      note: 'Exact match',
    };
  }

  const max = Math.max(Math.abs(a), Math.abs(b));
  const diff = max > 0 ? Math.abs(a - b) / max : 0;

  if (diff < 0.01) {
    return {
      field,
      model_a_value: a,
      model_b_value: b,
      consensus_value: (a + b) / 2,
      confidence: 0.9,
      discrepancy: false,
      note: `Near match (diff: ${(diff * 100).toFixed(2)}%)`,
    };
  }

  return {
    field,
    model_a_value: a,
    model_b_value: b,
    consensus_value: Math.max(a, b), // prefer larger for safety
    confidence: Math.max(0.3, 1 - diff),
    discrepancy: true,
    note: `Numeric mismatch (diff: ${(diff * 100).toFixed(2)}%)`,
  };
}

function pickConsensusString(a: string, b: string): string {
  if (a === b) return a;
  // Prefer the non-empty, longer value
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

function pickConsensusNumber(a: number, b: number): number {
  if (a === b) return a;
  // If close enough, average; otherwise pick the larger
  const max = Math.max(Math.abs(a), Math.abs(b));
  const diff = max > 0 ? Math.abs(a - b) / max : 0;
  if (diff < 0.01) return Math.round(((a + b) / 2) * 100) / 100;
  return Math.max(a, b);
}

function mergeRiskFlags(flagsA: string[], flagsB: string[]): string[] {
  const set = new Set<string>([...flagsA, ...flagsB]);
  return Array.from(set);
}

/**
 * Compute Levenshtein similarity between two strings.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}
