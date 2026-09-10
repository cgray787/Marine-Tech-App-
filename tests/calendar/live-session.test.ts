import { describe,it,expect,vi,afterEach } from 'vitest';
import { startCalendarSession } from '../../mobile/lib/calendar/live-session';
afterEach(()=>vi.useRealTimers());
describe('calendar live session',()=>{
  it('refreshes on return and does no subscription work in the background',()=>{
    const subscribe=vi.fn(()=>({id:'channel'})),unsubscribe=vi.fn(),refresh=vi.fn();
    const live=startCalendarSession({initialState:'background',subscribe,unsubscribe,refresh});
    expect(subscribe).not.toHaveBeenCalled();
    live.setState('active');expect(refresh).toHaveBeenCalledTimes(1);
    live.setState('active');expect(subscribe).toHaveBeenCalledTimes(1);
    live.setState('background');expect(unsubscribe).toHaveBeenCalledTimes(1);
    live.setState('active');expect(refresh).toHaveBeenCalledTimes(2);
    live.stop();live.setState('active');expect(subscribe).toHaveBeenCalledTimes(2);
  });
  it('coalesces bursts and cancels queued refresh on leaving the screen',()=>{
    vi.useFakeTimers();let changed=()=>{};
    const refresh=vi.fn();
    const live=startCalendarSession({initialState:'active',subscribe:(cb)=>{changed=cb;return {};},unsubscribe:vi.fn(),refresh});
    changed();changed();changed();vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(2);
    changed();live.stop();vi.runAllTimers();changed();vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
