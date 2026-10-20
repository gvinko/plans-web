import { resolveIcon } from '@/lib/icons';
import { memo } from 'react';

const toPascal = (s) => (typeof s === 'string' ? s : '')
  .split('-')
  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
  .join('');

function ApperIcon({ name, size = 20, className = '', ...props }) {
  const Icon = resolveIcon(toPascal(name));
  return <Icon size={size} className={className} aria-hidden="true" focusable="false" {...props} />;
}
export default memo(ApperIcon);
