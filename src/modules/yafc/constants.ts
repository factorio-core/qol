import type { LocalisedString } from 'factorio:runtime';
export const DEFAULT_QUALITY_ID = 'normal';

export const modPrefix = 'yafc';

export const EVENTS = {
  GROUPS_CHANGED: 'yafc_groups_changed',
  CHAINS_CHANGED: 'yafc_chains_changed',
  CHAIN_UPDATED: 'yafc_chain_updated',
};

/** Returns a localized string tuple prefixed with the module name. */
export function loc(key: string, ...args: (string | number | LocalisedString)[]): LocalisedString {
  return [modPrefix + '.' + key, ...args];
}

export const COMPONENT_NAMES = {
  YafcWindow: 'YafcWindow',
  YafcPinWindow: 'YafcPinWindow',
  ModalRecipePicker: 'ModalRecipePicker',
  ModalResourcePicker: 'ModalResourcePicker',
  ModalMachineSelector: 'ModalMachineSelector',
  ModalFuelSelector: 'ModalFuelSelector',
  ModalModuleSelector: 'ModalModuleSelector',
  ModalBeaconSelector: 'ModalBeaconSelector',
  ModalGroupSettings: 'ModalGroupSettings',
};

export type ComponentName = (typeof COMPONENT_NAMES)[keyof typeof COMPONENT_NAMES];

export const VIRTUAL_RECIPE_PREFIX = {
  MINING: 'yafc-mining-',
  BOILER: 'yafc-boiler-',
  OFFSHORE_PUMP: 'yafc-pump-',
  GENERATOR: 'yafc-generator-',
  BURNER_GENERATOR: 'yafc-burner-generator-',
  REACTOR: 'yafc-reactor-',
  FUSION_REACTOR: 'yafc-fusion-reactor-',
  FUSION_GENERATOR: 'yafc-fusion-generator-',
  THRUSTER: 'yafc-thruster-',
};

export const VIRTUAL_GROUP = {
  YAFC: 'yafc',
};

export const VIRTUAL_GROUP_ORDER = 'zz-yafc';

export const VIRTUAL_SUBGROUPS = {
  MINING: 'yafc-mining',
  OFFSHORE_PUMP: 'yafc-offshore-pump',
  BOILER: 'yafc-boiler',
  GENERATOR: 'yafc-generator',
  REACTOR: 'yafc-reactor',
  THRUSTER: 'yafc-thruster',
  ENERGY: 'yafc-energy',
};

export const VIRTUAL_SUBGROUP_ORDERS: Record<string, string> = {
  [VIRTUAL_SUBGROUPS.MINING]: 'a',
  [VIRTUAL_SUBGROUPS.OFFSHORE_PUMP]: 'b',
  [VIRTUAL_SUBGROUPS.BOILER]: 'c',
  [VIRTUAL_SUBGROUPS.GENERATOR]: 'd',
  [VIRTUAL_SUBGROUPS.REACTOR]: 'e',
  [VIRTUAL_SUBGROUPS.THRUSTER]: 'f',
  [VIRTUAL_SUBGROUPS.ENERGY]: 'g',
};

/** Fast O(1) lookup set of ignored item group IDs (excluded from item catalogs) */
export const IGNORED_ITEM_GROUPS_SET: Record<string, boolean> = {
  other: true,
};

export interface SliderSettingConfig {
  min: number;
  max: number;
  default: number;
  step: number;
}

export const SETTINGS = {
  WINDOW_WIDTH: {
    min: 0.5,
    max: 1.0,
    default: 0.75,
    step: 0.05,
  },
  WINDOW_HEIGHT: {
    min: 0.5,
    max: 1.0,
    default: 0.75,
    step: 0.05,
  },
  MAX_GROUP_ROWS: {
    min: 1,
    max: 3,
    default: 2,
    step: 1,
  },
  MAX_CHAIN_ROWS: {
    min: 1,
    max: 3,
    default: 2,
    step: 1,
  },
  MAX_MODULE_SLOTS_PER_ROW: {
    min: 3,
    max: 6,
    default: 5,
    step: 1,
  },
  MAX_BEACON_SLOTS_PER_ROW: {
    min: 3,
    max: 6,
    default: 5,
    step: 1,
  },
  MAX_PRODUCT_SLOTS_PER_ROW: {
    min: 3,
    max: 6,
    default: 5,
    step: 1,
  },
  MAX_INGREDIENT_SLOTS_PER_ROW: {
    min: 3,
    max: 6,
    default: 5,
    step: 1,
  },
  DEFAULT_GROUP_IS_PUBLIC: true,
  DEFAULT_GROUP_FILTER: 'all' as 'all' | 'private',
  DEFAULT_TARGET_RATE_PER_SEC: 1.0,
  DEFAULT_BEACON_COUNT: 8,
  MIN_SPEED_MULTIPLIER: 0.2,
  MIN_CONSUMPTION_MULTIPLIER: 0.2,
};

export const DEFAULT_COLUMN_ORDER: Yafc.TableColumnId[] = ['recipe', 'energy', 'machine', 'fuel', 'modules', 'beacons', 'effects', 'ingredients', 'products', 'actions'];

export const DEFAULT_USER_SETTINGS: Yafc.UserSettingsConfig = {
  widthRatio: SETTINGS.WINDOW_WIDTH.default,
  heightRatio: SETTINGS.WINDOW_HEIGHT.default,
  maxGroupRows: SETTINGS.MAX_GROUP_ROWS.default,
  maxChainRows: SETTINGS.MAX_CHAIN_ROWS.default,
  maxModuleSlotsPerRow: SETTINGS.MAX_MODULE_SLOTS_PER_ROW.default,
  maxBeaconSlotsPerRow: SETTINGS.MAX_BEACON_SLOTS_PER_ROW.default,
  maxProductSlotsPerRow: SETTINGS.MAX_PRODUCT_SLOTS_PER_ROW.default,
  maxIngredientSlotsPerRow: SETTINGS.MAX_INGREDIENT_SLOTS_PER_ROW.default,
  columnOrder: [...DEFAULT_COLUMN_ORDER],
  defaultGroupIsPublic: SETTINGS.DEFAULT_GROUP_IS_PUBLIC,
  groupFilter: SETTINGS.DEFAULT_GROUP_FILTER,
};

export const CAPTIONS = {
  TITLE: loc('title'),
  PIN_TITLE: loc('pin-title'),
  SETTINGS_TITLE: loc('settings-title'),
  GROUP_SETTINGS_TITLE: loc('group-settings-title'),
  MACHINE_SELECTOR_TITLE: loc('machine-selector-title'),
  FUEL_SELECTOR_TITLE: loc('fuel-selector-title'),
  RECIPE_PICKER_TITLE: loc('recipe-picker-title'),
  ITEM_PICKER_TITLE: loc('item-picker-title'),

  // Virtual Energy & Processes
  HEAT: loc('heat'),
  ELECTRICITY: loc('electricity'),
  YAFC_GROUP_TITLE: 'YAFC' as LocalisedString,
  NORMAL_QUALITY: 'Normal' as LocalisedString,

  // Common Actions
  SAVE: loc('save'),
  CANCEL: loc('cancel'),
  CLOSE: ['gui.close'] as LocalisedString,
  RESET_DEFAULTS: loc('reset-defaults'),
  SEARCH: loc('search'),
  ALL_GROUPS: loc('all-groups'),
  ADD_GROUP: loc('add-group'),
  ADD_CHAIN: loc('add-chain'),
  ADD_RECIPE: loc('add-recipe'),
  ADD_DESIRED_GOAL: loc('add-desired-goal'),
  DELETE_RECIPE: loc('delete-recipe'),
  DELETE_GROUP: loc('delete-group'),
  DELETE_CHAIN: loc('delete-chain'),
  CONFIRM_DELETE_RECIPE: loc('confirm-delete-recipe'),
  CONFIRM_DELETE_GROUP: loc('confirm-delete-group'),
  CONFIRM_DELETE_CHAIN: loc('confirm-delete-chain'),
  GROUP_TOOLTIP_PUBLIC: (name: string): LocalisedString => loc('group-tooltip-public', name),
  GROUP_TOOLTIP_PRIVATE: (name: string): LocalisedString => loc('group-tooltip-private', name),
  CHAIN_TOOLTIP: loc('chain-tooltip'),
  PLACEMENT_PREVIEW_TOOLTIP: loc('placement-preview-tooltip'),
  CHANGE_MACHINE: loc('change-machine'),
  PIN_HUD: loc('pin-hud'),
  UNPIN_HUD: loc('unpin-hud'),
  OPEN_FULL: loc('open-full'),
  TOGGLE_SETTINGS: loc('toggle-settings'),
  BACK_TO_CALCULATOR: loc('back-to-calculator'),

  // Group Settings
  GROUP_NAME: loc('group-name'),
  GROUP_ICON: loc('group-icon'),
  PUBLIC_GROUP: loc('public-group'),
  PUBLIC_GROUP_TOOLTIP: loc('public-group-tooltip'),

  // Recipe Picker
  PRODUCTS_HEADER: (count: number): LocalisedString => loc('products-header', count),
  INGREDIENTS_HEADER: (count: number): LocalisedString => loc('ingredients-header', count),
  NO_RECIPES_FOUND: loc('no-recipes-found'),

  // Machine Selector
  MACHINE_LABEL: loc('machine-label'),
  MODULES_LABEL: loc('modules-label'),
  BEACONS_LABEL: loc('beacons-label'),
  BEACON_MODULES_LABEL: loc('beacon-modules-label'),
  SELECT_BEACON: loc('select-beacon'),
  NO_BEACON: loc('no-beacon'),
  BEACON_COUNT: loc('beacon-count'),
  SELECT_FUEL: loc('select-fuel'),
  NO_FUEL: loc('no-fuel'),

  // Summary & Table
  FLOW_SUMMARY: loc('flow-summary'),
  DESIRED_PRODUCTS: loc('desired-products'),
  SUMMARY_INGREDIENTS: loc('summary-ingredients'),
  EXTRA_PRODUCTS: loc('extra-products'),
  DESIRED_EMPTY_HINT: loc('desired-empty-hint'),
  NONE: loc('none'),
  POWER: loc('power'),
  POLLUTION: loc('pollution'),
  TOTAL_MACHINES: loc('total-machines'),
  TOTAL_BEACONS: loc('total-beacons'),
  RECIPE_COLUMN: loc('recipe-column'),
  MACHINE_COLUMN: loc('machine-column'),
  ENERGY_COLUMN: loc('energy-column'),
  FUEL_COLUMN: loc('fuel-column'),
  MODULES_COLUMN: loc('modules-column'),
  BEACONS_COLUMN: loc('beacons-column'),
  EFFECTS_COLUMN: loc('effects-column'),
  PRODUCTS_COLUMN: loc('products-column'),
  INGREDIENTS_COLUMN: loc('ingredients-column'),
  RATE_COLUMN: loc('rate-column'),
  SPEED_COLUMN: loc('speed-column'),
  PROD_COLUMN: loc('prod-column'),
  ACTIONS_COLUMN: loc('actions-column'),

  // User Settings
  UI_DIMENSIONS: loc('ui-dimensions'),
  WIDTH_RATIO: loc('width-ratio'),
  HEIGHT_RATIO: loc('height-ratio'),
  MAX_GROUP_ROWS: loc('max-group-rows'),
  MAX_CHAIN_ROWS: loc('max-chain-rows'),
  DEFAULT_PUBLIC_GROUP: loc('default-public-group'),
  TABLE_COLUMNS: loc('table-columns'),
  FILTER_ALL_GROUPS: loc('filter-all-groups'),
  FILTER_PRIVATE_GROUPS: loc('filter-private-groups'),

  // Chain States & Actions
  CHAIN_EMPTY_HINT: loc('chain-empty-hint'),
  CHAIN_UNAVAILABLE_TITLE: loc('chain-unavailable-title'),
  CHAIN_UNAVAILABLE_DESC: loc('chain-unavailable-desc'),
  ADD_BEACON: loc('add-beacon'),
  ADD_BEACON_TOOLTIP: loc('add-beacon-tooltip'),
  TARGET_INPUT_HINT_TOOLTIP: loc('target-input-hint-tooltip'),
  CONSTRAINT_ADD: loc('constraint-add'),
  CONSTRAINT_REMOVE: loc('constraint-remove'),
  CONSTRAINT_CANCEL: loc('constraint-cancel'),

  // Modals & Selectors
  BEACON_TYPE_LABEL: loc('beacon-type-label'),
  CLEAR_MODULES: loc('clear-modules'),
  NO_MODULES_INSERTED: loc('no-modules-inserted'),
  ALLOWED_BEACON_MODULES: loc('allowed-beacon-modules'),
  SAVE_APPLY: loc('save-apply'),
  REMOVE_THIS_BEACON: loc('remove-this-beacon'),
  REMOVE_BEACON: loc('remove-beacon'),
  MODULE_SELECTOR_TITLE: loc('module-selector-title'),
  MACHINE_NOT_FOUND: loc('machine-not-found'),
  CLEAR_ALL: loc('clear-all'),
  CLICK_ADD_OR_FILL: loc('click-add-or-fill'),
  SELECT_GROUP_ICON_TOOLTIP: loc('select-group-icon-tooltip'),
  MIN_TEMP_LABEL: loc('min-temp-label'),
  MAX_TEMP_LABEL: loc('max-temp-label'),
  EXACT_TEMP_LABEL: loc('exact-temp-label'),
  MAX_MODULES_PER_ROW: loc('max-modules-per-row'),
  MAX_BEACONS_PER_ROW: loc('max-beacons-per-row'),
  MAX_PRODUCTS_PER_ROW: loc('max-products-per-row'),
  MAX_INGREDIENTS_PER_ROW: loc('max-ingredients-per-row'),
  MOVE_COLUMN_UP: loc('move-column-up'),
  MOVE_COLUMN_DOWN: loc('move-column-down'),
  NO_ACTIVE_CHAIN: loc('no-active-chain'),
  COUNT_COLUMN: loc('count-column'),
  CONFIGURE_MODULES_TOOLTIP: loc('configure-modules-tooltip'),
  CONFIGURE_BEACONS_TOOLTIP: loc('configure-beacons-tooltip'),
  SELECT_MACHINE_QUALITY_TOOLTIP: loc('select-machine-quality-tooltip'),
  SELECT_BURNER_FUEL_TOOLTIP: loc('select-burner-fuel-tooltip'),
  SELECT_FUEL_TOOLTIP: loc('select-fuel-tooltip'),
  SPENT_FUEL_BYPRODUCT_TOOLTIP: loc('spent-fuel-byproduct-tooltip'),
  CONFIGURE_BEACON_INDEXED: (index: number): LocalisedString => loc('configure-beacon-indexed', index),
  CONFIGURE_BEACONS_TITLE: loc('configure-beacons-title'),
  BEACON_MODULES_STATUS: (used: number, max: number): LocalisedString => loc('beacon-modules-status', used, max),
  SLOTS_USED_STATUS: (used: number, max: number): LocalisedString => loc('slots-used-status', used, max),
  FILL_SLOTS: (count: number): LocalisedString => loc('fill-slots', count),
  TABLE_SLOT_LIMITS: loc('table-slot-limits'),
  QUALITY_LABEL: loc('quality-label'),
  FUEL_VALUE: (val: string): LocalisedString => loc('fuel-value', val),
  SELECTED: loc('selected'),
  SELECT: loc('select'),
  RECIPE_MACHINES_COUNT: (name: string, count: number): LocalisedString => loc('recipe-machines-count', name, count),
  SPEED_SLOTS_STATUS: (speed: string, slots: number): LocalisedString => loc('speed-slots-status', speed, slots),
  SLOTS_COUNT: (slots: number): LocalisedString => loc('slots-count', slots),
  POWER_KW: (power: string): LocalisedString => loc('power-kw', power),
  FIXED_CONSTRAINT_TOOLTIP: loc('fixed-constraint-tooltip'),
  CALCULATED_COUNT_TOOLTIP: loc('calculated-count-tooltip'),
  BLUEPRINT_BEACON_TOOLTIP: (count: number): LocalisedString => loc('blueprint-beacon-tooltip', count),
  BLUEPRINT_MACHINE_TOOLTIP: (name: LocalisedString | string): LocalisedString => loc('blueprint-machine-tooltip', name),
};
