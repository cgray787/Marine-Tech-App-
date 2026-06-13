import { describe, it, expect } from 'vitest';
import { parseLocationValue } from '@/lib/location/constants';
import { calendarSelect } from '@/lib/calendar/queries';

describe('parseLocationValue', () => {
  it('accepts a valid uuid', () => {
    expect(parseLocationValue('aca07f4b-2c93-471b-b2ef-a9e4428fab24')).toBe(
      'aca07f4b-2c93-471b-b2ef-a9e4428fab24'
    );
  });

  it('rejects empty and missing values', () => {
    expect(parseLocationValue('')).toBeNull();
    expect(parseLocationValue(null)).toBeNull();
    expect(parseLocationValue(undefined)).toBeNull();
  });

  it('rejects non-uuid garbage (cookie tampering)', () => {
    expect(parseLocationValue('all')).toBeNull();
    expect(parseLocationValue('aca07f4b-2c93-471b-b2ef')).toBeNull();
    expect(parseLocationValue("1; drop table customers;")).toBeNull();
  });
});

describe('calendarSelect', () => {
  it('keeps the plain customer embed when not location-scoped, so customer-less jobs still show', () => {
    expect(calendarSelect(false)).toContain('customer:customers(id, name)');
    expect(calendarSelect(false)).not.toContain('!inner');
  });

  it('switches to an inner join with location_id when location-scoped', () => {
    const s = calendarSelect(true);
    expect(s).toContain('customer:customers!inner(id, name, location_id)');
    expect(s).not.toContain('customer:customers(id, name)');
  });
});
