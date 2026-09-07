import type { BoolSettingDefinition } from 'factorio:settings';

/** Registers YAFC startup settings. */
export function initYafcSettings(): void {
  (data.extend as unknown as (this: void, settings: BoolSettingDefinition[]) => void)([
    {
      type: 'bool-setting',
      name: 'qol-enable-yafc',
      setting_type: 'startup',
      default_value: true,
      order: 'yafc-a',
    },
  ]);
}

initYafcSettings();
