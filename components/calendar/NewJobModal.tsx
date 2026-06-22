'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { addHours, format } from 'date-fns';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createJob } from '@/lib/calendar/queries';
import { createClient } from '@/lib/supabase/client';
import type { JobKind } from '@/lib/calendar/types';
import { PerDayLocationEditor } from './PerDayLocationEditor';
import './modal-input.css';

type Props = {
  open: boolean;
  defaultStart: Date | null;
  customers: { id: string; name: string }[];
  boats: { id: string; name: string; customerId: string }[];
  marinas: { id: string; name: string }[];
  techs: { id: string; fullName: string }[];
  onClose: () => void;
};

// 'YYYY-MM-DD' day part of a local Date (matches the datetime-local wall-clock).
function dayString(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function NewJobModal({ open, defaultStart, customers, boats, marinas, techs, onClose }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<JobKind>('service');
  const [customerId, setCustomerId] = useState('');
  const [boatId, setBoatId] = useState('');
  const [marinaId, setMarinaId] = useState('');
  const [locationOverride, setLocationOverride] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [start, setStart] = useState(defaultStart ?? new Date());
  const [end, setEnd] = useState(defaultStart ? addHours(defaultStart, 1) : addHours(new Date(), 1));
  const [notes, setNotes] = useState('');
  const [dayLocations, setDayLocations] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultStart) {
      setStart(defaultStart);
      setEnd(addHours(defaultStart, 1));
    }
  }, [defaultStart]);

  useEffect(() => {
    if (open) {
      setKind('service');
      setCustomerId('');
      setBoatId('');
      setMarinaId('');
      setLocationOverride('');
      setAssignedTo('');
      setNotes('');
      setDayLocations({});
      setError(null);
    }
  }, [open]);

  const eligibleBoats = customerId ? boats.filter((b) => b.customerId === customerId) : boats;
  const isPaperwork = kind === 'paperwork';
  const startDay = dayString(start);
  const endDay = dayString(end);
  // A multi-day job is one whose end date is strictly after its start date.
  const isMultiDay = endDay > startDay;

  const mutation = useMutation({
    mutationFn: () =>
      createJob(supabase, {
        kind,
        // Paperwork blocks carry no client/boat.
        customerId: isPaperwork ? null : customerId,
        boatId: isPaperwork ? null : boatId,
        marinaId: isPaperwork ? null : marinaId || null,
        locationOverride: isPaperwork ? null : locationOverride || null,
        assignedTo: assignedTo || null,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        scheduledEndDate: isMultiDay ? endDay : null,
        dayLocations: isMultiDay ? dayLocations : {},
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: (e: any) => setError(e?.message ?? 'Failed to create job'),
  });

  const canSubmit = isPaperwork
    ? !!notes.trim() && end > start
    : !!customerId && !!boatId && end > start;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#0d1320] border border-[#1a2236] text-white rounded-lg p-6 w-[480px] max-w-[90vw]">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              {isPaperwork ? 'New paperwork block' : 'New job'}
            </Dialog.Title>
            <Dialog.Close aria-label="Close" className="text-[#8892A5] hover:text-white"><X size={18} /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Schedule a new service job or a paperwork block. Service jobs need a customer and boat; paperwork blocks just need a title and time.
          </Dialog.Description>

          {/* Service | Paperwork segmented toggle */}
          <div className="mb-4 inline-flex rounded-lg border border-[#1a2236] bg-[#060a12] p-0.5">
            {(['service', 'paperwork'] as JobKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-md px-4 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                  kind === k
                    ? 'bg-[#C9A96E] text-[#060a12]'
                    : 'text-[#8892A5] hover:text-white'
                }`}
              >
                {k === 'service' ? 'Service' : '📋 Paperwork'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {!isPaperwork && (
              <>
                <Field label="Customer">
                  <select className="modal-input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setBoatId(''); }}>
                    <option value="">Select customer...</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Boat">
                  <select className="modal-input" value={boatId} onChange={(e) => setBoatId(e.target.value)} disabled={!customerId}>
                    <option value="">Select boat...</option>
                    {eligibleBoats.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="Marina">
                  <select className="modal-input" value={marinaId} onChange={(e) => setMarinaId(e.target.value)}>
                    <option value="">— none —</option>
                    {marinas.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Location override (optional)">
                  <input className="modal-input" type="text" value={locationOverride} onChange={(e) => setLocationOverride(e.target.value)} placeholder="e.g., Lake WA, near marker 12" />
                </Field>
              </>
            )}

            {isPaperwork && (
              <Field label="Title / Note">
                <input className="modal-input" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., Month-end invoicing" />
              </Field>
            )}

            <Field label="Technician">
              <select className="modal-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <input className="modal-input" type="datetime-local"
                  value={format(start, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => setStart(new Date(e.target.value))} />
              </Field>
              <Field label="End">
                <input className="modal-input" type="datetime-local"
                  value={format(end, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => setEnd(new Date(e.target.value))} />
              </Field>
            </div>

            {isMultiDay && (
              <PerDayLocationEditor
                startDay={startDay}
                endDay={endDay}
                value={dayLocations}
                onChange={setDayLocations}
              />
            )}

            {!isPaperwork && (
              <Field label="Notes">
                <textarea className="modal-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            )}

            {error && <div className="text-red-400 text-sm">{error}</div>}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close className="px-4 py-2 text-[#8892A5] hover:text-white">Cancel</Dialog.Close>
            <button
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="bg-[#C9A96E] text-[#060a12] px-4 py-2 rounded-md font-semibold disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : isPaperwork ? 'Create paperwork' : 'Create job'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-[#8892A5] uppercase tracking-wider mb-1 block">{label}</span>
      {children}
    </label>
  );
}
