import type { MetricDef } from '@/lib/metrics';

export type MetricValidationResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

const formatLimit = (value: number) => Number.isInteger(value) ? String(value) : String(value);

export function validateMetricValue(raw: string | number | null | undefined, metric: MetricDef): MetricValidationResult | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;

  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value)) return { ok: false, error: `${metric.name} ต้องเป็นตัวเลข` };
  if (metric.min_value != null && value < metric.min_value) {
    return { ok: false, error: `${metric.name} ต้องไม่น้อยกว่า ${formatLimit(metric.min_value)}` };
  }
  if (metric.max_value != null && value > metric.max_value) {
    return { ok: false, error: `${metric.name} ต้องไม่เกิน ${formatLimit(metric.max_value)}` };
  }

  return { ok: true, value };
}

export function validateMetricDefinition(input: {
  name: string;
  decimals: string | number;
  minValue: string | number;
  maxValue: string | number;
}): string | null {
  if (!input.name.trim()) return 'กรุณาระบุชื่อฟิลด์';

  const decimals = Number(input.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    return 'จำนวนทศนิยมต้องอยู่ระหว่าง 0 ถึง 6';
  }

  const min = String(input.minValue).trim() === '' ? null : Number(input.minValue);
  const max = String(input.maxValue).trim() === '' ? null : Number(input.maxValue);
  if (min != null && !Number.isFinite(min)) return 'ค่าต่ำสุดไม่ถูกต้อง';
  if (max != null && !Number.isFinite(max)) return 'ค่าสูงสุดไม่ถูกต้อง';
  if (min != null && max != null && min > max) return 'ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด';
  return null;
}
