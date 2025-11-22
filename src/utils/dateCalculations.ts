export const calculateQuarter = (date: string): number => {
  const month = new Date(date).getMonth() + 1; // 0-indexed to 1-indexed
  return Math.ceil(month / 3);
};

export const calculateMonth = (date: string): number => {
  return new Date(date).getMonth() + 1;
};

export const getDateComponents = (date: string) => {
  const dateObj = new Date(date);
  return {
    year: dateObj.getFullYear(),
    quarter: calculateQuarter(date),
    month: calculateMonth(date)
  };
};