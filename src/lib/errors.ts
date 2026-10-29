export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
}
