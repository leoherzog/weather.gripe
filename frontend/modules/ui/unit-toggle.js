// Unit toggle functionality
// Extracted from index.html inline script

import { Units } from '../utils/units.js';

export function initUnitToggle() {
  const metric = document.getElementById('units-metric');
  const imperial = document.getElementById('units-imperial');

  if (!metric || !imperial) return;

  let stored;
  try { stored = localStorage.getItem('weatherUnits'); } catch(e) {}
  let current = stored || window.__defaultUnits || 'imperial';

  const update = function() {
    if (current === 'metric') {
      metric.classList.add('temp-gradient-btn');
      metric.setAttribute('appearance', 'filled');
      metric.removeAttribute('variant');
      imperial.classList.remove('temp-gradient-btn');
      imperial.setAttribute('appearance', 'outlined');
      imperial.setAttribute('variant', 'brand');
    } else {
      imperial.classList.add('temp-gradient-btn');
      imperial.setAttribute('appearance', 'filled');
      imperial.removeAttribute('variant');
      metric.classList.remove('temp-gradient-btn');
      metric.setAttribute('appearance', 'outlined');
      metric.setAttribute('variant', 'brand');
    }
  };

  const set = function(system) {
    current = system;
    Units.setSystem(system); // Handles localStorage and Units.current
    update();
  };

  update();
  metric.addEventListener('click', function() { set('metric'); });
  imperial.addEventListener('click', function() { set('imperial'); });
}
