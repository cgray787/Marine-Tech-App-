/** Subscribe only while the calendar is visible and the app is active. */
export function startCalendarSession<T>({
  initialState,
  subscribe,
  unsubscribe,
  refresh,
}: {
  initialState: string | null;
  subscribe: (onChange: () => void) => T;
  unsubscribe: (channel: T) => void;
  refresh: () => void;
}) {
  let channel: T | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const pause = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (channel !== null) unsubscribe(channel);
    channel = null;
  };
  const setState = (state: string | null) => {
    if (stopped) return;
    if (state !== "active") { pause(); return; }
    if (channel !== null) return;
    channel = subscribe(() => {
      if (stopped || channel === null) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; refresh(); }, 250);
    });
    // Catch up on changes missed while the app was backgrounded.
    refresh();
  };
  setState(initialState);
  return { setState, stop: () => { stopped = true; pause(); } };
}
