// src/utils/generalHelpers.ts

export type CurrencyCode = 'USD' | 'AUD'; 

// Define configuration for each currency (locale and symbol)
const CURRENCY_CONFIG: Record<CurrencyCode, { locale: string; currency: string }> = {
  USD: { locale: 'en-US', currency: 'USD' },
  AUD: { locale: 'en-AU', currency: 'AUD' },
  // Add more currencies here:
  // EUR: { locale: 'de-DE', currency: 'EUR' },
};

/**
 * Formats a number as a specified currency.
 * Cents are displayed only if the amount is not an integer.
 * * @param amount The amount to format (number, null, or undefined).
 * @param currency The 3-letter currency code ('USD' or 'AUD'). Defaults to 'AUD'.
 * @returns The formatted currency string.
 */
export const formatCurrency = (
  amount?: number | null,
  currency: CurrencyCode = 'AUD'
): string => {
  // 1. Handle null/undefined edge cases
  if (amount === null || amount === undefined) {
    return '$0'; 
  }

  const config = CURRENCY_CONFIG[currency];

  // 2. Determine if cents should be included
  // We check if the number has a fractional part (i.e., it's not an integer)
  const isInteger = amount % 1 === 0;

  // 3. Define all formatting options, including the dynamic fraction digits
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: config.currency,
    // Set minimum and maximum fraction digits based on the integer check
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  };

  // 4. Create and use the formatter
  // We MUST create a new formatter instance because the options change dynamically.
  return new Intl.NumberFormat(config.locale, options).format(amount);
};