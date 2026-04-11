import { createContext, useContext, useState, type ReactNode } from 'react';
import type { DateRangeValue } from '@/components/DateRangeFilter';

interface FilterState {
  dateRange: DateRangeValue;
  setDateRange: (v: DateRangeValue) => void;
}

const FilterContext = createContext<FilterState | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRangeValue>(null);
  return (
    <FilterContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
