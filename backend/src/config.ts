import dotenv from 'dotenv';
import path from 'path';

// Load from backend/.env if present, otherwise root .env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  DATABASE_PATH: process.env.DATABASE_PATH || path.resolve(__dirname, '..', 'data', 'invoicedesk.db'),
  FASTN_API_KEY: process.env.FASTN_API_KEY || '',
  FASTN_BASE_URL: process.env.FASTN_BASE_URL || 'https://api.fastn.ai',
  FASTN_MCP_URL: process.env.FASTN_MCP_URL || '',

  // Primary AI Providers
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',

  // Secondary / Legacy Fallbacks
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  NODE_ENV: process.env.NODE_ENV || 'development',
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.resolve(__dirname, '..', 'uploads'),
};
