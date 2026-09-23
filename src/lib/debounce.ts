export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  flush: () => void;
  cancel: () => void;
}

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;
  const run = () => {
    timer = null;
    const args = pendingArgs;
    pendingArgs = null;
    if (args) fn(...args);
  };
  const debounced = ((...args: Args) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  }) as Debounced<Args>;
  debounced.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  return debounced;
}
