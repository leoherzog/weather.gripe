// Unit toggle functionality
// Uses wa-radio-group for built-in selection state and keyboard navigation

import { Units } from '../utils/units.js';

export function initUnitToggle() {
  const radioGroup = document.getElementById('unit-toggle');
  if (!radioGroup) return;

  let stored;
  try { stored = localStorage.getItem('weatherUnits'); } catch(e) {}
  const current = stored || window.__defaultUnits || 'imperial';

  radioGroup.value = current;
  Units.setSystem(current);
}
