import { useState } from 'react';
import { format, startOfDay, endOfDay, subDays, subMonths } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

export type DateRangeValue = { from: Date; to: Date } | null;

const presets = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom period' },
] as const;

function getPresetRange(preset: string): DateRangeValue {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'week':
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
    case 'month':
      return { from: startOfDay(subMonths(now, 1)), to: endOfDay(now) };
    default:
      return null;
  }
}

interface Props {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
}

export default function DateRangeFilter({ value, onChange }: Props) {
  const [preset, setPreset] = useState<string>('all');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handlePreset = (v: string) => {
    setPreset(v);
    if (v === 'custom') {
      setCalendarOpen(true);
      return;
    }
    onChange(getPresetRange(v));
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      onChange({ from: startOfDay(range.from), to: endOfDay(range.to) });
    } else if (range?.from) {
      onChange({ from: startOfDay(range.from), to: endOfDay(range.from) });
    }
  };

  const calendarValue: DateRange | undefined = value ? { from: value.from, to: value.to } : undefined;

  return (
    <div className="flex gap-2 items-center">
      <Select value={preset} onValueChange={handlePreset}>
        <SelectTrigger className="w-[140px] h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map(p => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === 'custom' && (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('h-9 text-xs gap-1 font-normal', !value && 'text-muted-foreground')}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {value ? `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d')}` : 'Pick dates'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={calendarValue}
              onSelect={handleCalendarSelect}
              numberOfMonths={1}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
