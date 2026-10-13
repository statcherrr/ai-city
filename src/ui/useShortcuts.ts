/** Keyboard shortcuts: 1-4 scenarios, space pause, M before/after, R view, / ask. */

import { useEffect } from 'react';
import { SCENARIOS } from '@/data/scenarios';
import { useCityStore } from '@/store/useCityStore';

export function useShortcuts(): void {
  const trigger = useCityStore((state) => state.trigger);
  const togglePause = useCityStore((state) => state.togglePause);
  const toggleMode = useCityStore((state) => state.toggleMode);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) {
        if (event.key === 'Escape') target.blur();
        return;
      }

      if (event.key >= '1' && event.key <= '4') {
        const scenario = SCENARIOS[Number(event.key) - 1];
        if (scenario) trigger(scenario.id);
        return;
      }
      switch (event.code) {
        case 'Space':
          event.preventDefault();
          togglePause();
          break;
        default:
          break;
      }
      switch (event.key.toLowerCase()) {
        case 'm':
          toggleMode();
          break;
        case 'r':
          window.dispatchEvent(new Event('city:reset-view'));
          break;
        case '/':
          event.preventDefault();
          window.dispatchEvent(new Event('city:focus-command'));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trigger, togglePause, toggleMode]);
}
