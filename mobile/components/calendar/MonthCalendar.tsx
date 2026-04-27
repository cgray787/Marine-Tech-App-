import { Calendar, DateData } from 'react-native-calendars';
import { useMemo } from 'react';
import type { CalendarJob } from '@/lib/calendar/types';
import { techColor } from '@/lib/calendar/colors';

type Props = {
  jobs: CalendarJob[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onMonthChange: (firstOfMonth: Date) => void;
};

export function MonthCalendar({ jobs, selectedDate, onSelectDate, onMonthChange }: Props) {
  const markedDates = useMemo(() => {
    const map: Record<string, { dots: { color: string }[]; selected?: boolean }> = {};
    for (const j of jobs) {
      if (!j.scheduledStart) continue;
      const day = j.scheduledStart.slice(0, 10);
      const color = j.tech ? techColor(j.tech.id) : '#3b6cd6';
      map[day] ??= { dots: [] };
      if (map[day].dots.length < 3) map[day].dots.push({ color });
    }
    if (selectedDate) {
      map[selectedDate] = { ...(map[selectedDate] ?? { dots: [] }), selected: true };
    }
    return map;
  }, [jobs, selectedDate]);

  return (
    <Calendar
      markingType="multi-dot"
      markedDates={markedDates}
      onDayPress={(d: DateData) => onSelectDate(d.dateString)}
      onMonthChange={(d: DateData) => onMonthChange(new Date(d.year, d.month - 1, 1))}
      theme={{
        calendarBackground: '#0d1320',
        dayTextColor: '#fff',
        monthTextColor: '#fff',
        textSectionTitleColor: '#8892A5',
        textDisabledColor: '#444',
        todayTextColor: '#C9A96E',
        selectedDayBackgroundColor: '#C9A96E',
        selectedDayTextColor: '#060a12',
        arrowColor: '#C9A96E',
      }}
    />
  );
}
