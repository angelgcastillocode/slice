/**
 * Slice - Configuración de Producción Conectada a Supabase
 * Proyecto: slice (mskwgkuhmqteqhilfdzj)
 */

export const SUPABASE_URL = 'https://mskwgkuhmqteqhilfdzj.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1za3dna3VobXF0ZXFoaWxmZHpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNTIxNTUsImV4cCI6MjExMDYyODE1NX0.-i7_12xuuasGAxGvfSLV0zlXSiR2QepLvJBQk9jd5QU';

export const USE_LOCAL_DEMO_MODE = false;
export const APP_CURRENCY = 'MXN';
export const ALLOWED_MSI_TERMS = [3, 6, 9, 12, 18, 24];
export const LOCAL_STORAGE_KEY = 'slice_cache_v1';

export function getTodayDateISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DEFAULT_REFERENCE_DATE = getTodayDateISO();
