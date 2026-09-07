import type { PlayerIndex } from 'factorio:runtime';
import { createElement, useState } from 'fcore/react';
import { VStack, Section, Label, Slider, Table, Button, Checkbox, DialogFooter } from 'fcore/react-components';
import { CAPTIONS, SETTINGS, DEFAULT_USER_SETTINGS } from '../constants';

export interface SettingsViewProps {
  /** Player index owning the view. */
  playerIndex: PlayerIndex;
  /** Current user settings configuration. */
  currentSettings: Yafc.UserSettingsConfig;
  /** Callback invoked when settings are saved. */
  onSave: (this: void, settings: Yafc.UserSettingsConfig, isWindowSizeChanged: boolean) => void;
  /** Callback invoked on close/cancel. */
  onClose: (this: void) => void;
}

/** Settings pane for configuring window dimensions, row wrap limits, slot density, and group defaults. */
export function SettingsView(props: SettingsViewProps) {
  const { currentSettings, onSave, onClose } = props;
  const initialSettings: Yafc.UserSettingsConfig = currentSettings || DEFAULT_USER_SETTINGS;

  const [widthRatio, setWidthRatio] = useState<number>(initialSettings.widthRatio ?? SETTINGS.WINDOW_WIDTH.default);
  const [heightRatio, setHeightRatio] = useState<number>(initialSettings.heightRatio ?? SETTINGS.WINDOW_HEIGHT.default);
  const [maxGroupRows, setMaxGroupRows] = useState<number>(initialSettings.maxGroupRows ?? SETTINGS.MAX_GROUP_ROWS.default);
  const [maxChainRows, setMaxChainRows] = useState<number>(initialSettings.maxChainRows ?? SETTINGS.MAX_CHAIN_ROWS.default);
  const [maxModuleSlotsPerRow, setMaxModuleSlotsPerRow] = useState<number>(initialSettings.maxModuleSlotsPerRow ?? SETTINGS.MAX_MODULE_SLOTS_PER_ROW.default);
  const [maxBeaconSlotsPerRow, setMaxBeaconSlotsPerRow] = useState<number>(initialSettings.maxBeaconSlotsPerRow ?? SETTINGS.MAX_BEACON_SLOTS_PER_ROW.default);
  const [maxProductSlotsPerRow, setMaxProductSlotsPerRow] = useState<number>(initialSettings.maxProductSlotsPerRow ?? SETTINGS.MAX_PRODUCT_SLOTS_PER_ROW.default);
  const [maxIngredientSlotsPerRow, setMaxIngredientSlotsPerRow] = useState<number>(initialSettings.maxIngredientSlotsPerRow ?? SETTINGS.MAX_INGREDIENT_SLOTS_PER_ROW.default);
  const [defaultGroupIsPublic, setDefaultGroupIsPublic] = useState<boolean>(initialSettings.defaultGroupIsPublic);

  const handleWidthChange = (val: number) => {
    const step = SETTINGS.WINDOW_WIDTH.step;
    setWidthRatio(Math.round(val / step) * step);
  };

  const handleHeightChange = (val: number) => {
    const step = SETTINGS.WINDOW_HEIGHT.step;
    setHeightRatio(Math.round(val / step) * step);
  };

  const handleMaxGroupRowsChange = (val: number) => {
    const step = SETTINGS.MAX_GROUP_ROWS.step;
    setMaxGroupRows(Math.round(val / step) * step);
  };

  const handleMaxChainRowsChange = (val: number) => {
    const step = SETTINGS.MAX_CHAIN_ROWS.step;
    setMaxChainRows(Math.round(val / step) * step);
  };

  const handleMaxModuleSlotsPerRowChange = (val: number) => {
    const step = SETTINGS.MAX_MODULE_SLOTS_PER_ROW.step;
    setMaxModuleSlotsPerRow(Math.round(val / step) * step);
  };

  const handleMaxBeaconSlotsPerRowChange = (val: number) => {
    const step = SETTINGS.MAX_BEACON_SLOTS_PER_ROW.step;
    setMaxBeaconSlotsPerRow(Math.round(val / step) * step);
  };

  const handleMaxProductSlotsPerRowChange = (val: number) => {
    const step = SETTINGS.MAX_PRODUCT_SLOTS_PER_ROW.step;
    setMaxProductSlotsPerRow(Math.round(val / step) * step);
  };

  const handleMaxIngredientSlotsPerRowChange = (val: number) => {
    const step = SETTINGS.MAX_INGREDIENT_SLOTS_PER_ROW.step;
    setMaxIngredientSlotsPerRow(Math.round(val / step) * step);
  };

  const handleToggleGroupPublic = (checked: boolean) => {
    setDefaultGroupIsPublic(checked);
  };

  const handleResetDefaults = () => {
    setWidthRatio(DEFAULT_USER_SETTINGS.widthRatio);
    setHeightRatio(DEFAULT_USER_SETTINGS.heightRatio);
    setMaxGroupRows(DEFAULT_USER_SETTINGS.maxGroupRows);
    setMaxChainRows(DEFAULT_USER_SETTINGS.maxChainRows);
    setMaxModuleSlotsPerRow(DEFAULT_USER_SETTINGS.maxModuleSlotsPerRow);
    setMaxBeaconSlotsPerRow(DEFAULT_USER_SETTINGS.maxBeaconSlotsPerRow);
    setMaxProductSlotsPerRow(DEFAULT_USER_SETTINGS.maxProductSlotsPerRow);
    setMaxIngredientSlotsPerRow(DEFAULT_USER_SETTINGS.maxIngredientSlotsPerRow);
    setDefaultGroupIsPublic(DEFAULT_USER_SETTINGS.defaultGroupIsPublic);
  };

  const handleSave = () => {
    const isWindowSizeChanged = widthRatio !== initialSettings.widthRatio || heightRatio !== initialSettings.heightRatio;

    onSave(
      {
        widthRatio,
        heightRatio,
        maxGroupRows,
        maxChainRows,
        maxModuleSlotsPerRow,
        maxBeaconSlotsPerRow,
        maxProductSlotsPerRow,
        maxIngredientSlotsPerRow,
        defaultGroupIsPublic,
        columnOrder: initialSettings.columnOrder,
        groupFilter: initialSettings.groupFilter,
      },
      isWindowSizeChanged,
    );
  };

  return (
    <VStack gap="sm" stretch stretchV className="m-4 mb-8">
      <Label caption={CAPTIONS.SETTINGS_TITLE} className="heading-1" />

      {/* Section 1: Window Dimensions & Tab Rows (Sliders) */}
      <Section title={CAPTIONS.UI_DIMENSIONS} gap="xs">
        <Table column_count={3} className="items-center">
          {/* Width */}
          <Label caption={CAPTIONS.WIDTH_RATIO} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.WINDOW_WIDTH.min}
            maximum_value={SETTINGS.WINDOW_WIDTH.max}
            value_step={SETTINGS.WINDOW_WIDTH.step}
            value={widthRatio}
            className="setting-slider"
            onChange={handleWidthChange}
          />
          <Label caption={`${Math.round(widthRatio * 100)}%`} className="setting-value" />

          {/* Height */}
          <Label caption={CAPTIONS.HEIGHT_RATIO} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.WINDOW_HEIGHT.min}
            maximum_value={SETTINGS.WINDOW_HEIGHT.max}
            value_step={SETTINGS.WINDOW_HEIGHT.step}
            value={heightRatio}
            className="setting-slider"
            onChange={handleHeightChange}
          />
          <Label caption={`${Math.round(heightRatio * 100)}%`} className="setting-value" />

          {/* Max Group Rows */}
          <Label caption={CAPTIONS.MAX_GROUP_ROWS} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.MAX_GROUP_ROWS.min}
            maximum_value={SETTINGS.MAX_GROUP_ROWS.max}
            value_step={SETTINGS.MAX_GROUP_ROWS.step}
            discrete_values={true}
            value={maxGroupRows}
            className="setting-slider"
            onChange={handleMaxGroupRowsChange}
          />
          <Label caption={tostring(maxGroupRows)} className="setting-value" />

          {/* Max Chain Rows */}
          <Label caption={CAPTIONS.MAX_CHAIN_ROWS} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.MAX_CHAIN_ROWS.min}
            maximum_value={SETTINGS.MAX_CHAIN_ROWS.max}
            value_step={SETTINGS.MAX_CHAIN_ROWS.step}
            discrete_values={true}
            value={maxChainRows}
            className="setting-slider"
            onChange={handleMaxChainRowsChange}
          />
          <Label caption={tostring(maxChainRows)} className="setting-value" />
        </Table>
      </Section>

      {/* Section 2: Table Slot Limits (Per Row) */}
      <Section title={CAPTIONS.TABLE_SLOT_LIMITS} gap="xs">
        <Table column_count={3} className="items-center">
          {/* Max Module Slots */}
          <Label caption={CAPTIONS.MAX_MODULES_PER_ROW} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.MAX_MODULE_SLOTS_PER_ROW.min}
            maximum_value={SETTINGS.MAX_MODULE_SLOTS_PER_ROW.max}
            value_step={SETTINGS.MAX_MODULE_SLOTS_PER_ROW.step}
            discrete_values={true}
            value={maxModuleSlotsPerRow}
            className="setting-slider"
            onChange={handleMaxModuleSlotsPerRowChange}
          />
          <Label caption={tostring(maxModuleSlotsPerRow)} className="setting-value" />

          {/* Max Beacon Slots */}
          <Label caption={CAPTIONS.MAX_BEACONS_PER_ROW} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.MAX_BEACON_SLOTS_PER_ROW.min}
            maximum_value={SETTINGS.MAX_BEACON_SLOTS_PER_ROW.max}
            value_step={SETTINGS.MAX_BEACON_SLOTS_PER_ROW.step}
            discrete_values={true}
            value={maxBeaconSlotsPerRow}
            className="setting-slider"
            onChange={handleMaxBeaconSlotsPerRowChange}
          />
          <Label caption={tostring(maxBeaconSlotsPerRow)} className="setting-value" />

          {/* Max Product Slots */}
          <Label caption={CAPTIONS.MAX_PRODUCTS_PER_ROW} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.MAX_PRODUCT_SLOTS_PER_ROW.min}
            maximum_value={SETTINGS.MAX_PRODUCT_SLOTS_PER_ROW.max}
            value_step={SETTINGS.MAX_PRODUCT_SLOTS_PER_ROW.step}
            discrete_values={true}
            value={maxProductSlotsPerRow}
            className="setting-slider"
            onChange={handleMaxProductSlotsPerRowChange}
          />
          <Label caption={tostring(maxProductSlotsPerRow)} className="setting-value" />

          {/* Max Ingredient Slots */}
          <Label caption={CAPTIONS.MAX_INGREDIENTS_PER_ROW} className="setting-label" />
          <Slider
            minimum_value={SETTINGS.MAX_INGREDIENT_SLOTS_PER_ROW.min}
            maximum_value={SETTINGS.MAX_INGREDIENT_SLOTS_PER_ROW.max}
            value_step={SETTINGS.MAX_INGREDIENT_SLOTS_PER_ROW.step}
            discrete_values={true}
            value={maxIngredientSlotsPerRow}
            className="setting-slider"
            onChange={handleMaxIngredientSlotsPerRowChange}
          />
          <Label caption={tostring(maxIngredientSlotsPerRow)} className="setting-value" />
        </Table>
      </Section>

      {/* Section 3: General Group Preferences */}
      <Section gap="xs">
        <Checkbox state={defaultGroupIsPublic} onChange={handleToggleGroupPublic} caption={CAPTIONS.DEFAULT_PUBLIC_GROUP} />
      </Section>

      {/* Section 4: Bottom Action Footer */}
      <DialogFooter
        onConfirm={handleSave}
        confirmText={CAPTIONS.SAVE}
        onCancel={onClose}
        cancelText={CAPTIONS.CANCEL}
        marginTop="sm"
        marginBottom="xs"
        extra={<Button caption={CAPTIONS.RESET_DEFAULTS} style="button" onClick={handleResetDefaults} />}
      />
    </VStack>
  );
}
