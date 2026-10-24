import { config } from '../config';

export interface LLMExtractionResult {
  vendor_name: string;
  vendor_tax_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_terms: string;
  bank_details: string;
  confidence_score: number;
  risk_flags: string[];
  provider_info?: {
    name: string;
    model: string;
    is_live: boolean;
  };
}

const EXTRACTION_SYSTEM_PROMPT = `You are an invoice data extraction specialist. Extract structured data from the following invoice OCR text.
Return a JSON object with these exact fields:
- vendor_name (string)
- vendor_tax_id (string)
- invoice_number (string)
- invoice_date (string, ISO format YYYY-MM-DD)
- due_date (string, ISO format YYYY-MM-DD)
- currency (string, 3-letter code)
- line_items (array of { description: string, quantity: number, unit_price: number, amount: number })
- subtotal (number)
- tax_amount (number)
- total_amount (number)
- payment_terms (string)
- bank_details (string)
- confidence_score (number between 0 and 1)
- risk_flags (array of strings describing any concerns)

Be precise with numbers. If a field is not found, use empty string for strings, 0 for numbers, empty array for arrays.
Return ONLY valid JSON, no markdown formatting.`;

const AUDIT_SYSTEM_PROMPT = `You are an invoice auditor and risk analyst. Analyze the following invoice OCR text for data extraction AND risk assessment.
Return a JSON object with these exact fields:
- vendor_name (string)
- vendor_tax_id (string)
- invoice_number (string)
- invoice_date (string, ISO format YYYY-MM-DD)
- due_date (string, ISO format YYYY-MM-DD)
- currency (string, 3-letter code)
- line_items (array of { description: string, quantity: number, unit_price: number, amount: number })
- subtotal (number)
- tax_amount (number)
- total_amount (number)
- payment_terms (string)
- bank_details (string)
- confidence_score (number between 0 and 1)
- risk_flags (array of strings - be thorough about potential fraud indicators, unusual patterns, altered bank details, or concerns)

Focus especially on:
1. Mathematical consistency (do line items sum to subtotal?)
2. Suspicious vendor details or altered bank account / wire instructions
3. Keywords associated with urgency, confidential fees, gift cards, or crypto
4. Date validity

Return ONLY valid JSON, no markdown formatting.`;

export function getProviderStatus() {
  const modelAIsLive = Boolean(config.GEMINI_API_KEY || config.OPENAI_API_KEY);
  const modelBIsLive = Boolean(config.OPENROUTER_API_KEY || config.ANTHROPIC_API_KEY);
  const fastnIsLive = Boolean(config.FASTN_API_KEY);

  return {
    model_a: {
      provider: config.GEMINI_API_KEY
        ? 'Google Gemini'
        : config.OPENAI_API_KEY
        ? 'OpenAI'
        : 'Demo Local Engine',
      model: config.GEMINI_API_KEY
        ? config.GEMINI_MODEL
        : config.OPENAI_API_KEY
        ? 'gpt-4o-mini'
        : 'heuristic-extractor-v1',
      is_live: modelAIsLive,
      env_key: 'GEMINI_API_KEY',
    },
    model_b: {
      provider: config.OPENROUTER_API_KEY
        ? 'OpenRouter'
        : config.ANTHROPIC_API_KEY
        ? 'Anthropic'
        : 'Demo Local Engine',
      model: config.OPENROUTER_API_KEY
        ? config.OPENROUTER_MODEL
        : config.ANTHROPIC_API_KEY
        ? 'claude-3-haiku'
        : 'heuristic-auditor-v1',
      is_live: modelBIsLive,
      env_key: 'OPENROUTER_API_KEY',
    },
    fastn: {
      provider: 'Fastn Connect',
      is_live: fastnIsLive,
      base_url: config.FASTN_BASE_URL,
      env_key: 'FASTN_API_KEY',
    },
  };
}

/**
 * Run Model A (Extraction Specialist)
 * Priority 1: Google Gemini (Google AI Studio)
 * Priority 2: OpenAI (gpt-4o-mini)
 * Priority 3: Fallback test extractor
 */
export async function runModelA(ocrText: string): Promise<LLMExtractionResult> {
  // Option 1: Google Gemini via REST
  if (config.GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        config.GEMINI_MODEL
      )}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;

      const prompt = `${EXTRACTION_SYSTEM_PROMPT}\n\nInvoice text to extract:\n${ocrText}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 150)}`);
      }

      const data = (await res.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(text);
      const normalized = normalizeResult(parsed);
      normalized.provider_info = {
        name: 'Google Gemini',
        model: config.GEMINI_MODEL,
        is_live: true,
      };
      return normalized;
    } catch (err: any) {
      console.warn('[LLM] Gemini call failed, falling back to local extractor:', err.message);
      const fallback = generateMockResult('model_a', ocrText);
      fallback.risk_flags.push(`[API Warning] Live Gemini attempt failed: ${err.message}`);
      return fallback;
    }
  }

  // Option 2: OpenAI fallback
  if (config.OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: `Extract data from this invoice:\n\n${ocrText}` },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const normalized = normalizeResult(parsed);
      normalized.provider_info = {
        name: 'OpenAI',
        model: 'gpt-4o-mini',
        is_live: true,
      };
      return normalized;
    } catch (err: any) {
      console.warn('[LLM] OpenAI call failed, falling back to local extractor:', err.message);
      const fallback = generateMockResult('model_a', ocrText);
      fallback.risk_flags.push(`[API Warning] Live OpenAI attempt failed: ${err.message}`);
      return fallback;
    }
  }

  // Option 3: Local deterministic test extractor
  console.info('[LLM] GEMINI_API_KEY not set — Model A using local heuristic test extractor');
  return generateMockResult('model_a', ocrText);
}

/**
 * Run Model B (Auditor & Risk Specialist)
 * Priority 1: OpenRouter (meta-llama/llama-3.3-70b-instruct or configured model)
 * Priority 2: Anthropic (claude-3-haiku)
 * Priority 3: Fallback test auditor
 */
export async function runModelB(ocrText: string): Promise<LLMExtractionResult> {
  // Option 1: OpenRouter via standard REST
  if (config.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Invoice Desk Hackathon',
        },
        body: JSON.stringify({
          model: config.OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: AUDIT_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Analyze this invoice for extraction and risk assessment:\n\n${ocrText}`,
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error (${res.status}): ${errText.slice(0, 150)}`);
      }

      const data = (await res.json()) as any;
      const text = data.choices?.[0]?.message?.content || '{}';
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeResult(parsed);
      normalized.provider_info = {
        name: 'OpenRouter',
        model: config.OPENROUTER_MODEL,
        is_live: true,
      };
      return normalized;
    } catch (err: any) {
      console.warn('[LLM] OpenRouter call failed, falling back to local auditor:', err.message);
      const fallback = generateMockResult('model_b', ocrText);
      fallback.risk_flags.push(`[API Warning] Live OpenRouter attempt failed: ${err.message}`);
      return fallback;
    }
  }

  // Option 2: Anthropic fallback
  if (config.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        system: AUDIT_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Analyze this invoice for extraction and risk assessment:\n\n${ocrText}` },
        ],
      });

      const content =
        response.content?.[0]?.type === 'text' ? response.content[0].text : '{}';
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeResult(parsed);
      normalized.provider_info = {
        name: 'Anthropic',
        model: 'claude-3-haiku',
        is_live: true,
      };
      return normalized;
    } catch (err: any) {
      console.warn('[LLM] Anthropic call failed, falling back to local auditor:', err.message);
      const fallback = generateMockResult('model_b', ocrText);
      fallback.risk_flags.push(`[API Warning] Live Anthropic attempt failed: ${err.message}`);
      return fallback;
    }
  }

  // Option 3: Local deterministic test auditor
  console.info('[LLM] OPENROUTER_API_KEY not set — Model B using local heuristic test auditor');
  return generateMockResult('model_b', ocrText);
}

function normalizeResult(raw: any): LLMExtractionResult {
  return {
    vendor_name: raw.vendor_name || '',
    vendor_tax_id: raw.vendor_tax_id || '',
    invoice_number: raw.invoice_number || '',
    invoice_date: raw.invoice_date || '',
    due_date: raw.due_date || '',
    currency: raw.currency || 'USD',
    line_items: Array.isArray(raw.line_items)
      ? raw.line_items.map((li: any) => ({
          description: li.description || '',
          quantity: Number(li.quantity) || 0,
          unit_price: Number(li.unit_price) || 0,
          amount: Number(li.amount) || 0,
        }))
      : [],
    subtotal: Number(raw.subtotal) || 0,
    tax_amount: Number(raw.tax_amount) || 0,
    total_amount: Number(raw.total_amount) || 0,
    payment_terms: raw.payment_terms || '',
    bank_details: raw.bank_details || '',
    confidence_score: Number(raw.confidence_score) || 0.85,
    risk_flags: Array.isArray(raw.risk_flags) ? raw.risk_flags : [],
  };
}

function generateMockResult(model: string, ocrText?: string): LLMExtractionResult {
  const isMockA = model === 'model_a';

  if (ocrText && ocrText.length > 20) {
    const invMatch = ocrText.match(/Invoice Number:\s*([^\r\n]+)/i);
    const vendorMatch = ocrText.match(/From:\s*([^\r\n]+)/i);
    const taxMatch = ocrText.match(/Tax ID:\s*([^\r\n]+)/i);
    const dateMatch = ocrText.match(/Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    const dueDateMatch = ocrText.match(/Due Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    const subtotalMatch = ocrText.match(/Subtotal:\s*(?:[A-Z]{3}\s*)?([0-9,.]+)/i);
    const taxAmountMatch = ocrText.match(/Tax\s*\([^)]*\):\s*(?:[A-Z]{3}\s*)?([0-9,.]+)/i);
    const totalMatch = ocrText.match(/Total:\s*(?:[A-Z]{3}\s*)?([0-9,.]+)/i);
    const bankMatch = ocrText.match(/Bank:\s*([^\r\n]+)/i);
    const termsMatch = ocrText.match(/Payment Terms:\s*([^\r\n]+)/i);

    const parseNum = (m: RegExpMatchArray | null) => (m ? parseFloat(m[1].replace(/,/g, '')) : 0);
    const subtotal = parseNum(subtotalMatch);
    const taxAmount = parseNum(taxAmountMatch);
    const totalAmount = parseNum(totalMatch);

    const lineItems: Array<{ description: string; quantity: number; unit_price: number; amount: number }> = [];
    const lines = ocrText.split('\n');
    let parsingItems = false;
    for (const line of lines) {
      if (line.includes('───') || line.includes('---')) {
        parsingItems = true;
        continue;
      }
      if (parsingItems) {
        if (line.trim().startsWith('Subtotal') || line.trim() === '') {
          if (line.trim().startsWith('Subtotal')) break;
          continue;
        }
        const itemMatch = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        if (itemMatch) {
          lineItems.push({
            description: itemMatch[1].trim(),
            quantity: parseFloat(itemMatch[2]),
            unit_price: parseFloat(itemMatch[3].replace(/,/g, '')),
            amount: parseFloat(itemMatch[4].replace(/,/g, '')),
          });
        }
      }
    }

    const currency = ocrText.includes('EUR') ? 'EUR' : 'USD';
    const riskFlags: string[] = [
      isMockA
        ? '[DEMO MODE] Model A: Heuristic extractor active (configure GEMINI_API_KEY for live Gemini inference)'
        : '[DEMO MODE] Model B: Heuristic auditor active (configure OPENROUTER_API_KEY for live OpenRouter inference)',
    ];

    if (!isMockA) {
      if (ocrText.toLowerCase().includes('crypto') || ocrText.toLowerCase().includes('urgent payment')) {
        riskFlags.push('URGENT: Suspicious payment and crypto terms detected in invoice text');
      }
      if (
        ocrText.toLowerCase().includes('bank details have changed') ||
        ocrText.toLowerCase().includes('wire transfer change')
      ) {
        riskFlags.push('HIGH RISK: Unverified wire transfer instruction change detected');
      }
      if (taxMatch && taxMatch[1].includes('00-0000000')) {
        riskFlags.push('CRITICAL: Suspicious vendor tax identifier format detected');
      }
    }

    return {
      vendor_name: vendorMatch ? vendorMatch[1].trim() : 'Sample Vendor',
      vendor_tax_id: taxMatch ? taxMatch[1].trim() : '',
      invoice_number: invMatch ? invMatch[1].trim() : 'INV-SAMPLE',
      invoice_date: dateMatch ? dateMatch[1].trim() : '2024-06-15',
      due_date: dueDateMatch ? dueDateMatch[1].trim() : '2024-07-15',
      currency,
      line_items:
        lineItems.length > 0
          ? lineItems
          : [
              {
                description: 'General Services',
                quantity: 1,
                unit_price: subtotal || 1000,
                amount: subtotal || 1000,
              },
            ],
      subtotal: subtotal || 1000,
      tax_amount: taxAmount || 0,
      total_amount: totalAmount || (subtotal || 1000) + (taxAmount || 0),
      payment_terms: termsMatch ? termsMatch[1].trim() : 'Net 30',
      bank_details: bankMatch ? bankMatch[1].trim() : '',
      confidence_score: isMockA ? 0.94 : 0.91,
      risk_flags: riskFlags,
      provider_info: {
        name: isMockA ? 'Demo Heuristic Extractor' : 'Demo Heuristic Auditor',
        model: isMockA ? 'demo-extractor-v1' : 'demo-auditor-v1',
        is_live: false,
      },
    };
  }

  return {
    vendor_name: 'Mock Vendor Corp',
    vendor_tax_id: 'US-MOCK-123456789',
    invoice_number: 'INV-MOCK-001',
    invoice_date: '2024-01-15',
    due_date: '2024-02-15',
    currency: 'USD',
    line_items: [
      {
        description: 'Consulting Services',
        quantity: 10,
        unit_price: 150.0,
        amount: 1500.0,
      },
      {
        description: 'Software License',
        quantity: 1,
        unit_price: 500.0,
        amount: 500.0,
      },
    ],
    subtotal: 2000.0,
    tax_amount: 200.0,
    total_amount: 2200.0,
    payment_terms: 'Net 30',
    bank_details: 'Mock Bank, Acct: XXXX-MOCK-1234',
    confidence_score: isMockA ? 0.88 : 0.85,
    risk_flags: [
      isMockA
        ? '[DEMO MODE] Model A: Heuristic extractor active'
        : '[DEMO MODE] Model B: Heuristic auditor active',
    ],
    provider_info: {
      name: isMockA ? 'Demo Heuristic Extractor' : 'Demo Heuristic Auditor',
      model: isMockA ? 'demo-extractor-v1' : 'demo-auditor-v1',
      is_live: false,
    },
  };
}
