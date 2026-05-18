import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateBatchId() {
  return `BATCH-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('pt-MZ', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}
