export interface Tenant {
  id: string;
  name: string;
  slug: string;
  default_currency: string;
  locale: string;
  tax_rate: number;
  created_at: string;
}

export interface LineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  vendor_name: string;
  vendor_email: string;
  vendor_tax_id: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: 'PENDING' | 'PROCESSING' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';
  source: string;
  raw_ocr_text: string;
  original_filename: string;
  created_at: string;
  updated_at: string;
  line_items?: LineItem[];
  analyses?: LLMAnalysis[];
  deterministic_checks?: DeterministicCheck[];
  audit_trail?: AuditEntry[];
}

export interface LLMAnalysis {
  id: string;
  invoice_id: string;
  model_name: string;
  extracted_data: any;
  risk_flags: string[];
  confidence_score: number;
  raw_response?: string;
  created_at: string;
}

export interface DeterministicCheck {
  id: string;
  invoice_id: string;
  check_name: string;
  passed: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  details: any;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  invoice_id: string;
  tenant_id: string;
  action: string;
  actor: string;
  details: any;
  created_at: string;
}

export interface ArbitrationResult {
  consensus: any;
  field_confidences?: Record<string, number>;
  discrepancies: Array<{ field: string; model_a: any; model_b: any; confidence: number }>;
  overall_confidence: number;
  recommendation: string;
}

export interface FastnConnection {
  id: string;
  tenant_id: string;
  provider: string;
  name?: string;
  role?: string;
  description?: string;
  workflow_name?: string;
  fastn_connection_id: string | null;
  status: string;
  auth_status?: 'authenticated' | 'not_connected';
  workflow_status?: 'published' | 'unpublished';
  execution_status?: 'ready' | 'executed' | 'awaiting_auth';
  last_synced_at: string | null;
  created_at?: string;
}

export interface ProviderStatus {
  model_a: {
    provider: string;
    model: string;
    is_live: boolean;
    env_key: string;
  };
  model_b: {
    provider: string;
    model: string;
    is_live: boolean;
    env_key: string;
  };
  fastn: {
    provider: string;
    is_live: boolean;
    base_url: string;
    env_key: string;
  };
}

export interface DemoScenario {
  id: string;
  title: string;
  subtitle: string;
  invoiceNumber: string;
  expectedStatus: 'APPROVED' | 'NEEDS_REVIEW';
  riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL';
  description: string;
  tags: string[];
}

export interface VerificationCase {
  id: string;
  title: string;
  subtitle: string;
  invoiceNumber: string;
  expectedStatus: Invoice['status'];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  tags: string[];
}
