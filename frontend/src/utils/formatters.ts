export const formatEUR = (value: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(value) + ' €';
};
