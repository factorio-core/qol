import { isModuleEnabled } from '../index';

/** Registers YAFC custom inputs, shortcuts, and GUI sprites in prototype stage. */
export function initYafcPrototypes(): void {
  if (!isModuleEnabled('yafc')) {
    return;
  }

  data.extend([
    {
      type: 'custom-input',
      name: 'yafc-toggle-gui',
      key_sequence: 'F6',
      consuming: 'none',
      action: 'lua',
    },
    {
      type: 'shortcut',
      name: 'yafc-shortcut',
      order: '20',
      action: 'lua',
      associated_control_input: 'yafc-toggle-gui',
      icon: '__qol__/modules/yafc/graphics/png/yafc-shortcut-64.png',
      icon_size: 64,
      small_icon: '__qol__/modules/yafc/graphics/png/yafc-shortcut-24.png',
      small_icon_size: 24,
    },
    {
      type: 'sprite',
      name: 'yafc_logo',
      filename: '__qol__/modules/yafc/graphics/png/yafc-shortcut-64.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_add_group',
      filename: '__qol__/modules/yafc/graphics/png/add_group.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_add_chain',
      filename: '__qol__/modules/yafc/graphics/png/add_chain.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_add_recipe',
      filename: '__qol__/modules/yafc/graphics/png/add_recipe.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_questionmark',
      filename: '__qol__/modules/yafc/graphics/png/questionmark.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_filter_all',
      filename: '__qol__/modules/yafc/graphics/png/filter_all.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_filter_private',
      filename: '__qol__/modules/yafc/graphics/png/filter_private.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_electricity',
      filename: '__qol__/modules/yafc/graphics/png/electricity.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_heat',
      filename: '__qol__/modules/yafc/graphics/png/heat.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_effect_speed',
      filename: '__qol__/modules/yafc/graphics/png/effect_speed.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_effect_productivity',
      filename: '__qol__/modules/yafc/graphics/png/effect_productivity.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_effect_consumption',
      filename: '__qol__/modules/yafc/graphics/png/effect_consumption.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
    {
      type: 'sprite',
      name: 'yafc_effect_quality',
      filename: '__qol__/modules/yafc/graphics/png/effect_quality.png',
      position: [0, 0],
      size: 64,
      flags: ['gui-icon'],
    },
  ]);
}

initYafcPrototypes();
