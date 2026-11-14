'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface ScheduleDateProps {
  onApply?: (range: DateRange) => void;
  onCancel?: () => void;
  defaultRange?: DateRange;
}

const PRESETS = [
  { label: 'Today', id: 'today' },
  { label: 'Yesterday', id: 'yesterday' },
  { label: 'Last 7 Days', id: '7d' },
  { label: 'Last 30 Days', id: '30d' },
  { label: 'Last 365 Days', id: '365d' },
  { label: 'Week to Date', id: 'wtd' },
  { label: 'Month to Date', id: 'mtd' },
  { label: 'Year to Date', id: 'ytd' },
  { label: 'Custom', id: 'custom' },
];

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export const ScheduleDate: React.FC<ScheduleDateProps> = ({
  onApply,
  onCancel,
  defaultRange,
}) => {
  const [selectedPreset, setSelectedPreset] = useState('custom');
  
  const [range, setRange] = useState<DateRange>(
    defaultRange || {
      start: new Date(2025, 9, 15),
      end: new Date(2025, 9, 25),
    }
  );

  const initialView = range.start ? new Date(range.start.getFullYear(), range.start.getMonth(), 1) : new Date();
  const [viewDate, setViewDate] = useState(initialView);

  const handlePresetClick = (presetId: string) => {
    setSelectedPreset(presetId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let start = new Date(today);
    let end = new Date(today);

    switch (presetId) {
      case 'today':
        break;
      case 'yesterday':
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
        break;
      case '7d':
        start.setDate(today.getDate() - 6);
        break;
      case '30d':
        start.setDate(today.getDate() - 29);
        break;
      case '365d':
        start.setDate(today.getDate() - 364);
        break;
      case 'wtd':
        // Assuming Monday is start of week
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        break;
      case 'mtd':
        start.setDate(1);
        break;
      case 'ytd':
        start.setMonth(0, 1);
        break;
      default:
        return;
    }
    
    setRange({ start, end });
    setViewDate(new Date(start.getFullYear(), start.getMonth(), 1));
  };

  const handleDateClick = (date: Date) => {
    if (!range.start || (range.start && range.end)) {
      setRange({ start: date, end: null });
      setSelectedPreset('custom');
    } else {
      if (date < range.start) {
        setRange({ start: date, end: range.start });
      } else {
        setRange({ ...range, end: date });
      }
    }
  };

  const renderMonthGrid = (
    monthDate: Date,
    showLeftNav = false,
    showRightNav = false,
    showRightNavMobile = false,
  ) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = monthDate.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });

    return (
      <div className="w-full min-w-0 md:min-w-56 flex-1">
        <div className="mb-3 flex items-center justify-between px-1 md:mb-4 md:px-2">
          {showLeftNav ? (
            <button
              title="left"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="p-1 text-neutral-400 transition-colors hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
          ) : (
            <div className="w-7" />
          )}
          <span className="text-[13px] font-semibold tracking-tight text-neutral-800 dark:text-neutral-200">
            {monthName}
          </span>
          {showRightNav ? (
            <button
              title="right"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="p-1 text-neutral-400 transition-colors hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          ) : showRightNavMobile ? (
            <>
              <button
                title="right"
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="p-1 text-neutral-400 transition-colors hover:text-neutral-900 md:hidden dark:text-neutral-500 dark:hover:text-white"
              >
                <ChevronRight size={18} strokeWidth={2.5} />
              </button>
              <div className="hidden w-7 md:block" />
            </>
          ) : (
            <div className="w-7" />
          )}
        </div>

        <div className="relative grid grid-cols-7 gap-y-1 text-center">
          {DAYS.map((d) => (
            <span
              key={d}
              className="mb-2 text-[11px] font-medium text-neutral-400 dark:text-neutral-600"
            >
              {d}
            </span>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="h-8" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const currentDayDate = new Date(year, month, day);
            const isStart =
              range.start?.toDateString() === currentDayDate.toDateString();
            const isEnd =
              range.end?.toDateString() === currentDayDate.toDateString();
            const isInRange =
              range.start &&
              range.end &&
              currentDayDate > range.start &&
              currentDayDate < range.end;

            return (
              <div
                key={day}
                onClick={() => handleDateClick(currentDayDate)}
                className="group relative flex h-8 cursor-pointer items-center justify-center"
              >
                {(isInRange || isStart || isEnd) && (
                  <div
                    className={cn(
                      'absolute z-0 h-8',
                      'border-y border-neutral-200 bg-neutral-100 dark:border-white/5 dark:bg-neutral-900/50',
                      isStart ? 'left-1/2 rounded-l-lg border-l' : 'left-0',
                      isEnd ? 'right-1/2 rounded-r-lg border-r' : 'right-0',
                      isInRange && !isStart && !isEnd ? 'w-full' : '',
                    )}
                  />
                )}
                {isStart || isEnd ? (
                  <div className="absolute z-10 flex h-8 w-8 flex-col items-center justify-center rounded-lg border border-neutral-600 bg-linear-to-b from-neutral-700 to-neutral-900 shadow-xl dark:border-white/10 dark:from-neutral-800 dark:to-indigo-900/50">
                    <span className="text-xs font-bold text-white">{day}</span>
                    <motion.div
                      layoutId="activeThumb"
                      className="absolute bottom-1 h-[1.5px] w-2 rounded-full bg-blue-400 shadow-[0_0_8px_#6366f1] dark:bg-indigo-500"
                    />
                  </div>
                ) : (
                  <span
                    className={cn(
                      'relative z-10 text-[13px] font-normal transition-colors',
                      isInRange
                        ? 'text-neutral-900 dark:text-white'
                        : 'text-neutral-600 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-white',
                    )}
                  >
                    {day}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[calc(100vw-1.5rem)] md:max-w-195 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white font-sans text-neutral-600 shadow-2xl dark:border-neutral-800 dark:bg-black dark:text-neutral-400">
      <div className="flex min-h-0 w-full flex-col md:min-h-105 md:flex-row">
        {/* Sidebar */}
        <aside className="no-scrollbar flex w-full shrink-0 flex-row gap-1.5 overflow-x-auto border-b border-neutral-200 bg-neutral-50/50 p-2 md:w-52 md:flex-col md:gap-1 md:border-r md:border-b-0 md:p-3 dark:border-neutral-800 dark:bg-neutral-950/20">
          {PRESETS.map((preset, idx) => (
            <React.Fragment key={preset.id}>
              {[2, 5, 8].includes(idx) && (
                <div className="mx-3 my-1 hidden h-px bg-neutral-200 md:block dark:bg-neutral-800" />
              )}
              <button
                onClick={() => handlePresetClick(preset.id)}
                className={cn(
                  'group flex shrink-0 items-center justify-between rounded-lg px-2.5 py-1 text-xs whitespace-nowrap transition-all duration-200 md:mx-0 md:px-3 md:py-1.5 md:text-[13px]',
                  selectedPreset === preset.id
                    ? preset.id === 'custom'
                      ? 'border border-neutral-300 bg-linear-to-b from-neutral-100 to-neutral-200 font-medium text-neutral-900 dark:border-neutral-700 dark:from-neutral-800 dark:to-neutral-900 dark:text-white'
                      : 'bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-white'
                    : 'hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-200',
                )}
              >
                <span>{preset.label}</span>
                {selectedPreset === preset.id && preset.id === 'custom' && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="ml-2"
                  >
                    <Check size={12} />
                  </motion.div>
                )}
              </button>
            </React.Fragment>
          ))}
        </aside>
        {/* Main Content */}
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden bg-white p-3.5 md:gap-6 md:p-5 dark:bg-transparent">
          {/* Inputs Area */}
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3">
            <DateInput label="Start date" date={range.start} />
            <DateInput label="End date" date={range.end} />
          </div>

          {/* Calendars Container */}
          <div className="flex flex-row items-start justify-center gap-6 overflow-hidden pb-1 lg:gap-10">
            {/* Left Month (Always shown; has both Left & Right nav on mobile, Left only on desktop) */}
            <div className="w-full shrink-0 md:w-auto md:min-w-56">
              {renderMonthGrid(viewDate, true, false, true)}
            </div>

            {/* Divider (Desktop only) */}
            <div className="hidden h-40 w-px shrink-0 self-center bg-neutral-200 opacity-50 md:block dark:bg-neutral-800" />

            {/* Right Month (Desktop only) */}
            <div className="hidden shrink-0 md:block md:w-auto md:min-w-56">
              {renderMonthGrid(
                new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1),
                false,
                true,
                false,
              )}
            </div>
          </div>
        </main>
      </div>

      <footer className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50/50 px-4 md:h-16 md:gap-3 md:px-6 dark:border-neutral-800 dark:bg-neutral-950/50">
        <button
          onClick={onCancel}
          className="rounded-full border border-neutral-200 px-3.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 md:px-4 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={() => onApply?.(range)}
          className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white shadow-lg transition-all hover:opacity-90 active:scale-95 md:px-5 dark:bg-neutral-100 dark:text-black"
        >
          Apply
        </button>
      </footer>
    </div>
  );
};

const DateInput = ({ label, date }: { label: string; date: Date | null }) => (
  <div className="flex flex-1 flex-col gap-1">
    <label className="ml-1 text-[11px] font-normal text-neutral-400 dark:text-neutral-500">
      {label}
    </label>
    <div className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:border-neutral-300 md:px-3 md:py-2 md:text-[13px] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700">
      <span className="truncate">
        {date
          ? date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'Select Date'}
      </span>
      <ChevronDown
        size={14}
        className="shrink-0 text-neutral-400 dark:text-neutral-500"
      />
    </div>
  </div>
);
