import { renderToString } from 'react-dom/server';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LocalSchedule } from '@/app/dashboard/jobs/local-schedule';
afterEach(cleanup);
it('does not embed the server timezone into browser-local schedule text', () => {
  const value='2026-08-07T07:00:00Z';
  expect(renderToString(<LocalSchedule value={value} />)).toContain('>Scheduled</time>');
  render(<LocalSchedule value={value} />);
  expect(screen.queryByText('Scheduled')).toBeNull();
  expect(document.querySelector('time')?.dateTime).toBe(value);
});
