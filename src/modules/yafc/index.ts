import type { LuaPlayer, CustomInputEvent } from 'factorio:runtime';
import { registerComponent, toggleRoot } from 'fcore/react';
import * as Storage from './storage';
import { YafcWindow } from './ui/YafcWindow';
import { YafcPinWindow } from './ui/YafcPinWindow';
import { ModalRecipePicker } from './ui/ModalRecipePicker';
import { ModalResourcePicker } from './ui/ModalResourcePicker';
import { ModalMachineSelector } from './ui/ModalMachineSelector';
import { ModalFuelSelector } from './ui/ModalFuelSelector';
import { ModalModuleSelector } from './ui/ModalModuleSelector';
import { ModalBeaconSelector } from './ui/ModalBeaconSelector';
import { ModalGroupSettings } from './ui/ModalGroupSettings';
import * as Cache from './cache';
import { registerTranslationProvider, TranslatableItem } from 'fcore/utils/translate';
import { bind } from 'fcore/utils/event';
import { isModuleEnabled } from '../index';
import { COMPONENT_NAMES } from './constants';

// Register all top-level window and modal components
registerComponent(COMPONENT_NAMES.YafcWindow, YafcWindow);
registerComponent(COMPONENT_NAMES.YafcPinWindow, YafcPinWindow);
registerComponent(COMPONENT_NAMES.ModalRecipePicker, ModalRecipePicker);
registerComponent(COMPONENT_NAMES.ModalResourcePicker, ModalResourcePicker);
registerComponent(COMPONENT_NAMES.ModalMachineSelector, ModalMachineSelector);
registerComponent(COMPONENT_NAMES.ModalFuelSelector, ModalFuelSelector);
registerComponent(COMPONENT_NAMES.ModalModuleSelector, ModalModuleSelector);
registerComponent(COMPONENT_NAMES.ModalBeaconSelector, ModalBeaconSelector);
registerComponent(COMPONENT_NAMES.ModalGroupSettings, ModalGroupSettings);

/** Toggles the main YAFC window root for the specified player. */
export function toggleYafcWindow(player: LuaPlayer): void {
  if (!isModuleEnabled('yafc')) {
    return;
  }
  toggleRoot(player.gui.screen, COMPONENT_NAMES.YafcWindow, { playerIndex: player.index });
}

/** Initializes the YAFC module lifecycle hooks, event listeners, and translation providers. */
export function initYafcModule(): void {
  if (!isModuleEnabled('yafc')) {
    return;
  }

  registerTranslationProvider((_) => {
    const items: TranslatableItem[] = [];
    const fluids: TranslatableItem[] = [];

    for (const group of Cache.getResourceGroups()) {
      for (const sg of group.subgroups) {
        for (const res of sg.resources) {
          if (res.type === 'item') {
            items.push({ name: res.name, localisedName: res.localisedName });
          } else if (res.type === 'fluid') {
            fluids.push({ name: res.base.name, localisedName: res.base.localisedName });
          }
        }
      }
    }

    return {
      item: items,
      fluid: fluids,
    };
  });

  // Pre-initialize in-memory prototype catalogs at script load so that
  // React on_load hydration immediately has full access to machine and recipe definitions.
  Cache.buildAllPrototypeCaches();

  bind('on_init', () => {
    Storage.initStorage();
    Cache.buildAllPrototypeCaches();
  });

  bind('on_load', () => {
    Cache.buildAllPrototypeCaches();
  });

  bind('on_configuration_changed', () => {
    Storage.initStorage();
    Cache.init(true);
    Storage.validateAllChains();
  });

  // Handle Shortcut click in Factorio shortcut bar
  bind(defines.events.on_lua_shortcut, (e) => {
    if (e.prototype_name === 'yafc-shortcut') {
      const player = game.get_player(e.player_index);
      if (player) {
        toggleYafcWindow(player);
      }
    }
  });

  // Handle Custom Input keybinding (F6)
  bind('yafc-toggle-gui', (e: CustomInputEvent) => {
    const player = game.get_player(e.player_index);
    if (player) {
      toggleYafcWindow(player);
    }
  });
}
