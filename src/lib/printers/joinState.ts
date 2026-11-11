import type { PrintablePart, PrintableSplit } from './meshSplitter';

/** Discard generated connector geometry and return the original safe split parts. */
export function restoreUnjoinedParts(split: PrintableSplit): PrintablePart[] {
  return split.parts.map((part) => ({ ...part }));
}
