import * as React from 'react';
import { Calendar } from '@fluentui/react-calendar-compat';

export const calendarDate = new Date(2023, 2, 15);

export const SampleCalendarCompatMultiDayView = ({ daysToSelectInDayView }: { daysToSelectInDayView: number }) => {
  return (
    <Calendar
      highlightSelectedMonth
      showGoToToday
      today={calendarDate}
      value={calendarDate}
      calendarDayProps={{ daysToSelectInDayView }}
    />
  );
};
