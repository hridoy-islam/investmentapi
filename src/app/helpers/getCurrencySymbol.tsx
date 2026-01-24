import { currency } from "../modules/types/currency";

export const getCurrencySymbol = (code: string): string => {
  const normalizedCode = (code || 'GBP').toUpperCase();
  
  return currency[normalizedCode as keyof typeof currency]?.symbol || normalizedCode || '£';
};