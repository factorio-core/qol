/** Updates display order for a shortcut prototype. */
function changeShortcutOrder(shortcutName: string, order: string | number): void {
  const shortcut = data.raw.shortcut?.[shortcutName];
  if (shortcut) {
    shortcut.order = tostring(order);
  }
}

changeShortcutOrder('cybersyn-toggle-gui', '01');
changeShortcutOrder('give-red-wire', '02');
changeShortcutOrder('give-green-wire', '03');
changeShortcutOrder('give-copper-wire', '04');
changeShortcutOrder('WideChests_merge-chest-selector', '05');
changeShortcutOrder('mining-patch-planner-shortcut', '06');
changeShortcutOrder('pump-shortcut', '07');
changeShortcutOrder('yarm-selector', '08');
changeShortcutOrder('rcalc-get-selection-tool', '09');
changeShortcutOrder('tms-toggle', '10');
changeShortcutOrder('ghost-counter-shortcut', '11');
changeShortcutOrder('toggle-module-inserter-ex', '12');
changeShortcutOrder('get-module-inserter-ex', '13');
changeShortcutOrder('milestones_toggle_gui', '14');
changeShortcutOrder('import-string', '15');
changeShortcutOrder('tree-killer', '16');
changeShortcutOrder('big-zoom', '17');
changeShortcutOrder('toggle-personal-roboport', '18');
changeShortcutOrder('give-blueprint-book', '19');

import { isModuleEnabled } from './modules';
import { initYafcPrototypes } from './modules/yafc/data';

if (isModuleEnabled('yafc')) {
  initYafcPrototypes();
}
