import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import { LLMExtractionResult } from './llmEvaluator';

export interface DeterministicCheckResult {
  id: string;
  invoice_id: string;
  check_name: string;
  passed: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  details: any;
}

const COMMON_TAX_RATES = [0, 5, 7, 10, 13, 15, 18, 19, 20, 21, 25];

const SUSPICIOUS_KEYWORDS = [
  'gift card',
  'crypto',
  'confidential',
  'wire transfer change',
  'urgent payment',
];

/**
 * Run all 8 deterministic checks and store the results in the DB.
 */
export function runDeterministicChecks(
  invoiceId: string,
  data: LLMExtractionResult,
  tenantId: string
): DeterministicCheckResult[] {
  const results: DeterministicCheckResult[] = [];

  results.push(checkMathSum(invoiceId, data));
  results.push(checkTaxRateSanity(invoiceId, data));
  results.push(checkDuplicateInvoice(invoiceId, data, tenantId));
  results.push(checkDateValidity(invoiceId, data));
  results.push(checkAbnormalAmount(invoiceId, data, tenantId));
  results.push(checkSuspiciousKeywords(invoiceId, data));
  results.push(checkMissingFields(invoiceId, data));
  results.push(checkLineItemMath(invoiceId, data));

  // Store results in the database
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO deterministic_checks (id, invoice_id, check_name, passed, severity, message, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertAll = db.transaction(() => {
    for (const result of results) {
      stmt.run(
        result.id,
        result.invoice_id,
        result.check_name,
        result.passed ? 1 : 0,
        result.severity,
        result.message,
        JSON.stringify(result.details)
      );
    }
  });

  insertAll();

  return results;
}

/**
 * 1. math_sum_check: Sum(line_items.amount) ≈ subtotal (within 0.01)
 */
function checkMathSum(
  invoiceId: string,
  data: LLMExtractionResult
): DeterministicCheckResult {
  const lineItemsSum = data.line_items.reduce((sum, li) => sum + li.amount, 0);
  const diff = Math.abs(lineItemsSum - data.subtotal);
  const passed = diff <= 0.01;

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'math_sum_check',
    passed,
    severity: passed ? 'INFO' : 'CRITICAL',
    message: passed
      ? 'Line items sum matches subtotal.'
      : `Line items sum (${lineItemsSum.toFixed(2)}) does not match subtotal (${data.subtotal.toFixed(2)}). Difference: ${diff.toFixed(2)}`,
    details: {
      line_items_sum: lineItemsSum,
      subtotal: data.subtotal,
      difference: diff,
    },
  };
}

/**
 * 2. tax_rate_sanity: Computed tax rate matches common rates
 */
function checkTaxRateSanity(
  invoiceId: string,
  data: LLMExtractionResult
): DeterministicCheckResult {
  if (data.subtotal === 0) {
    return {
      id: uuidv4(),
      invoice_id: invoiceId,
      check_name: 'tax_rate_sanity',
      passed: true,
      severity: 'INFO',
      message: 'Subtotal is zero, tax rate check not applicable.',
      details: { computed_rate: null },
    };
  }

  const computedRate = (data.tax_amount / data.subtotal) * 100;
  const roundedRate = Math.round(computedRate);
  const matchesCommon = COMMON_TAX_RATES.some(
    (rate) => Math.abs(computedRate - rate) < 1.5
  );

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'tax_rate_sanity',
    passed: matchesCommon,
    severity: matchesCommon ? 'INFO' : 'WARNING',
    message: matchesCommon
      ? `Tax rate (${computedRate.toFixed(1)}%) matches common rate.`
      : `Tax rate (${computedRate.toFixed(1)}%) does not match any common tax rate.`,
    details: {
      computed_rate: computedRate,
      rounded_rate: roundedRate,
      common_rates: COMMON_TAX_RATES,
    },
  };
}

/**
 * 3. duplicate_invoice: Same invoice_number + vendor_name already exists for this tenant
 */
function checkDuplicateInvoice(
  invoiceId: string,
  data: LLMExtractionResult,
  tenantId: string
): DeterministicCheckResult {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM invoices
       WHERE tenant_id = ? AND invoice_number = ? AND vendor_name = ? AND id != ?`
    )
    .get(tenantId, data.invoice_number, data.vendor_name, invoiceId) as
    | { id: string }
    | undefined;

  const isDuplicate = !!existing;

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'duplicate_invoice',
    passed: !isDuplicate,
    severity: isDuplicate ? 'CRITICAL' : 'INFO',
    message: isDuplicate
      ? `Duplicate invoice found: same invoice number "${data.invoice_number}" and vendor "${data.vendor_name}" already exists.`
      : 'No duplicate invoice found.',
    details: {
      invoice_number: data.invoice_number,
      vendor_name: data.vendor_name,
      duplicate_id: existing?.id || null,
    },
  };
}

/**
 * 4. date_validity: due_date >= invoice_date, invoice_date not in future
 */
function checkDateValidity(
  invoiceId: string,
  data: LLMExtractionResult
): DeterministicCheckResult {
  const issues: string[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (data.invoice_date) {
    const invoiceDate = new Date(data.invoice_date);
    if (!isNaN(invoiceDate.getTime()) && invoiceDate > today) {
      issues.push(`Invoice date (${data.invoice_date}) is in the future.`);
    }
  }

  if (data.invoice_date && data.due_date) {
    const invoiceDate = new Date(data.invoice_date);
    const dueDate = new Date(data.due_date);
    if (
      !isNaN(invoiceDate.getTime()) &&
      !isNaN(dueDate.getTime()) &&
      dueDate < invoiceDate
    ) {
      issues.push(
        `Due date (${data.due_date}) is before invoice date (${data.invoice_date}).`
      );
    }
  }

  const passed = issues.length === 0;

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'date_validity',
    passed,
    severity: passed ? 'INFO' : 'WARNING',
    message: passed ? 'Dates are valid.' : issues.join(' '),
    details: { issues, invoice_date: data.invoice_date, due_date: data.due_date },
  };
}

/**
 * 5. abnormal_amount: Total > 2.5× vendor's average (if history exists)
 */
function checkAbnormalAmount(
  invoiceId: string,
  data: LLMExtractionResult,
  tenantId: string
): DeterministicCheckResult {
  const db = getDb();

  if (!data.vendor_name) {
    return {
      id: uuidv4(),
      invoice_id: invoiceId,
      check_name: 'abnormal_amount',
      passed: true,
      severity: 'INFO',
      message: 'No vendor name available for historical comparison.',
      details: { vendor_name: null },
    };
  }

  const history = db
    .prepare(
      `SELECT AVG(total_amount) as avg_amount, COUNT(*) as count
       FROM invoices
       WHERE tenant_id = ? AND vendor_name = ? AND id != ? AND total_amount > 0`
    )
    .get(tenantId, data.vendor_name, invoiceId) as {
    avg_amount: number | null;
    count: number;
  };

  if (!history || history.count === 0 || !history.avg_amount) {
    return {
      id: uuidv4(),
      invoice_id: invoiceId,
      check_name: 'abnormal_amount',
      passed: true,
      severity: 'INFO',
      message: 'No historical data for this vendor to compare against.',
      details: { vendor_name: data.vendor_name, history_count: 0 },
    };
  }

  const ratio = data.total_amount / history.avg_amount;
  const isAbnormal = ratio > 2.5;

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'abnormal_amount',
    passed: !isAbnormal,
    severity: isAbnormal ? 'WARNING' : 'INFO',
    message: isAbnormal
      ? `Total amount ($${data.total_amount.toFixed(2)}) is ${ratio.toFixed(1)}x the vendor's average ($${history.avg_amount.toFixed(2)}).`
      : `Total amount is within normal range for this vendor.`,
    details: {
      total_amount: data.total_amount,
      vendor_average: history.avg_amount,
      ratio,
      history_count: history.count,
    },
  };
}

/**
 * 6. suspicious_keywords: Scan for specific fraud-related keywords
 */
function checkSuspiciousKeywords(
  invoiceId: string,
  data: LLMExtractionResult
): DeterministicCheckResult {
  const textToScan = [
    data.vendor_name,
    data.payment_terms,
    data.bank_details,
    ...data.line_items.map((li) => li.description),
    ...data.risk_flags,
  ]
    .join(' ')
    .toLowerCase();

  const foundKeywords = SUSPICIOUS_KEYWORDS.filter((kw) =>
    textToScan.includes(kw.toLowerCase())
  );

  const passed = foundKeywords.length === 0;

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'suspicious_keywords',
    passed,
    severity: passed ? 'INFO' : 'CRITICAL',
    message: passed
      ? 'No suspicious keywords detected.'
      : `Suspicious keywords found: ${foundKeywords.join(', ')}`,
    details: { found_keywords: foundKeywords },
  };
}

/**
 * 7. missing_fields: Check all required fields are present and non-empty
 */
function checkMissingFields(
  invoiceId: string,
  data: LLMExtractionResult
): DeterministicCheckResult {
  const requiredFields: (keyof LLMExtractionResult)[] = [
    'vendor_name',
    'invoice_number',
    'invoice_date',
    'due_date',
    'currency',
    'subtotal',
    'total_amount',
  ];

  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === '' || value === 0) {
      missingFields.push(field);
    }
  }

  if (data.line_items.length === 0) {
    missingFields.push('line_items');
  }

  const passed = missingFields.length === 0;

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'missing_fields',
    passed,
    severity: passed ? 'INFO' : 'WARNING',
    message: passed
      ? 'All required fields are present.'
      : `Missing or empty fields: ${missingFields.join(', ')}`,
    details: { missing_fields: missingFields },
  };
}

/**
 * 8. line_item_math: Each line_item.amount ≈ quantity × unit_price (within 0.01)
 */
function checkLineItemMath(
  invoiceId: string,
  data: LLMExtractionResult
): DeterministicCheckResult {
  const errors: Array<{
    description: string;
    expected: number;
    actual: number;
    difference: number;
  }> = [];

  for (const li of data.line_items) {
    const expected = li.quantity * li.unit_price;
    const diff = Math.abs(expected - li.amount);
    if (diff > 0.01) {
      errors.push({
        description: li.description,
        expected: Math.round(expected * 100) / 100,
        actual: li.amount,
        difference: Math.round(diff * 100) / 100,
      });
    }
  }

  const passed = errors.length === 0;

  return {
    id: uuidv4(),
    invoice_id: invoiceId,
    check_name: 'line_item_math',
    passed,
    severity: passed ? 'INFO' : 'CRITICAL',
    message: passed
      ? 'All line item amounts match quantity × unit_price.'
      : `${errors.length} line item(s) have math discrepancies.`,
    details: { errors },
  };
}
