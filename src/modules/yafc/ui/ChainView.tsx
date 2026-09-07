import type { PlayerIndex, LocalisedString, SpritePath } from 'factorio:runtime';
import { createElement, Fragment, useState, useEffect, useMemo, createRoot, useDragReorder } from 'fcore/react';
import { Frame, HFlow, VFlow, SpriteButton, Sprite, Label, Input, Button, ScrollPane, Table, ConfirmDelete } from 'fcore/react-components';
import * as Storage from '../storage';
import { solveProductionChain } from '../solver/ModelBuilder';
import { formatPower } from '../utils/format';
import * as Cache from '../cache';
import { ModalResourcePicker } from './ModalResourcePicker';
import { ModalRecipePicker } from './ModalRecipePicker';
import { ModalModuleSelector } from './ModalModuleSelector';
import { ModalBeaconSelector } from './ModalBeaconSelector';
import { SlotView } from './SlotView';
import { SlotRateView, type RecipeRowContext } from './SlotRateView';
import { CAPTIONS, DEFAULT_COLUMN_ORDER, SETTINGS, COMPONENT_NAMES, DEFAULT_QUALITY_ID } from '../constants';

export interface ChainViewProps {
  /** Player index owning the view. */
  playerIndex: PlayerIndex;
  /** Optional ID of the parent group. */
  groupId?: number;
  /** Optional ID of the production chain to display. */
  chainId?: number;
  /** Whether this chain is currently pinned to the HUD. */
  isPinned?: boolean;
  /** Custom column ordering for the production table. */
  columnOrder?: Yafc.TableColumnId[];
  /** Callback invoked when columns are reordered. */
  onColumnOrderChange?: (this: void, newOrder: Yafc.TableColumnId[]) => void;
}

const COLUMN_HEADER_LABELS: Record<Yafc.TableColumnId, { label: LocalisedString }> = {
  recipe: { label: CAPTIONS.RECIPE_COLUMN },
  machine: { label: CAPTIONS.MACHINE_COLUMN },
  effects: { label: CAPTIONS.EFFECTS_COLUMN },
  energy: { label: CAPTIONS.ENERGY_COLUMN },
  fuel: { label: CAPTIONS.FUEL_COLUMN },
  modules: { label: CAPTIONS.MODULES_COLUMN },
  beacons: { label: CAPTIONS.BEACONS_COLUMN },
  products: { label: CAPTIONS.PRODUCTS_COLUMN },
  ingredients: { label: CAPTIONS.INGREDIENTS_COLUMN },
  actions: { label: CAPTIONS.ACTIONS_COLUMN },
};

/** Formats a decimal fraction into a human-readable percentage string. */
function formatPercentValue(val: number, withSign = false): string {
  const pct = val * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded % 1 === 0) {
    if (withSign && rounded > 0) {
      return `+${rounded}`;
    }
    return tostring(rounded);
  }
  if (withSign && rounded > 0) {
    return string.format('+%.1f', rounded);
  }
  return string.format('%.1f', rounded);
}

/** Constructs rich tooltip breakdown for a machine effect stat. */
function buildEffectTooltip(titleKey: string, stat: Yafc.RecipeEffectStat): LocalisedString {
  const valueStr = `${formatPercentValue(stat.value, true)}%`;
  const tooltipParts: (string | LocalisedString)[] = ['', '[font=default-bold]', [titleKey], ': [/font]', valueStr];
  if (stat.isCapped) {
    tooltipParts.push(['yafc.effect-capped']);
  }
  tooltipParts.push('\n  ', ['yafc.effect-base', formatPercentValue(stat.base, false)]);
  if (stat.fromModules !== 0) {
    tooltipParts.push('\n  ', ['yafc.effect-modules', formatPercentValue(stat.fromModules, true)]);
  }
  if (stat.fromBeacons !== 0) {
    tooltipParts.push('\n  ', ['yafc.effect-beacons', formatPercentValue(stat.fromBeacons, true)]);
  }
  if (stat.fromResearch !== undefined && stat.fromResearch > 0) {
    tooltipParts.push('\n  ', ['yafc.effect-research', formatPercentValue(stat.fromResearch, true)]);
  }
  if (stat.max !== undefined) {
    tooltipParts.push('\n  ', ['yafc.effect-limit-max', formatPercentValue(stat.max, false)]);
  }
  if (stat.min !== undefined) {
    tooltipParts.push('\n  ', ['yafc.effect-limit-min', formatPercentValue(stat.min, false)]);
  }
  return tooltipParts as unknown as LocalisedString;
}

/** Retrieves localized display name for a recipe prototype. */
function getRecipeDisplayName(recipeName: string): LocalisedString {
  return Cache.getRecipe(recipeName)?.localisedName ?? ['recipe-name.' + recipeName];
}

/** Renders an interactive target goal slot with configurable production rate. */
function TargetSlot(props: { playerIndex: PlayerIndex; groupId: number; chainId: number; target: Yafc.TargetConstraint; targetIndex: number }) {
  const { playerIndex, groupId, chainId, target, targetIndex } = props;

  const [text, setText] = useState(() => string.format('%.2f', target.ratePerSec));

  useEffect(() => {
    setText(string.format('%.2f', target.ratePerSec));
  }, [target.ratePerSec]);

  return (
    <SlotRateView
      type="resource"
      size={40}
      resourceType={target.resourceType}
      name={target.name}
      quality={Cache.getQuality(target.quality || DEFAULT_QUALITY_ID)}
      temperature={target.temperature}
      isTarget={true}
      tooltip={['yafc.target-slot-tooltip', string.format('%.2f', target.ratePerSec)]}
      mouse_button_filter={['left', 'right']}
      onClick={(e) => {
        if (e?.button === defines.mouse_button_type.right) {
          Storage.removeChainTarget(playerIndex, groupId, chainId, target.resourceType, target.name, target.quality, target.temperature);
        } else if (e?.button === defines.mouse_button_type.left && e?.shift) {
          Storage.setChainPrimaryTarget(playerIndex, groupId, chainId, targetIndex);
        }
      }}
      bottomElement={
        <Input
          text={text}
          style="short_number_textfield"
          className={target.ratePerSec < 0 ? 'rate-input font-bold text-red-400' : 'rate-input font-bold'}
          tooltip={CAPTIONS.TARGET_INPUT_HINT_TOOLTIP}
          onChange={(newText: string) => {
            setText(newText);
            const val = tonumber(newText);
            if (val !== undefined) {
              Storage.setChainTarget(playerIndex, groupId, chainId, target.resourceType, target.name, val, target.quality, target.temperature);
            }
          }}
        />
      }
    />
  );
}

/** Production chain workspace rendering the summary panel, target goals, and solved recipe matrix. */
export function ChainView(props: ChainViewProps) {
  const { playerIndex, groupId, chainId, isPinned, columnOrder = DEFAULT_COLUMN_ORDER, onColumnOrderChange } = props;
  const chain = Storage.useYafcChain(playerIndex, groupId, chainId);
  const playerState = Storage.getPlayerState(playerIndex);

  const player = typeof game !== 'undefined' && game ? game.get_player(playerIndex) : undefined;

  const summary = useMemo<Yafc.SolvedChainSummary | undefined>(() => {
    return chain !== undefined && player !== undefined ? solveProductionChain(chain, player.force) : undefined;
  }, [chain, player?.force]);

  const recipes = useMemo(() => (chain !== undefined ? Storage.getChainRecipes(chain) : []), [chain]);

  const reorder = useDragReorder<Yafc.RecipeConfig, number>({
    items: recipes,
    getId: (r) => r.id,
    onCommit: (orderedIds) => {
      if (groupId !== undefined && chain !== undefined) {
        Storage.reorderRecipes(playerIndex, groupId, chain.id, orderedIds);
      }
    },
  });

  const [addingConstraintRecipeId, setAddingConstraintRecipeId] = useState<number | undefined>(undefined);

  const activeColumnOrder = useMemo(() => {
    const cols = columnOrder ?? DEFAULT_COLUMN_ORDER;
    const filtered = cols.filter((id) => id !== ('index' as Yafc.TableColumnId));
    if (!filtered.includes('effects')) {
      const machineIdx = filtered.indexOf('machine');
      if (machineIdx !== -1) {
        filtered.splice(machineIdx + 1, 0, 'effects');
      } else {
        filtered.push('effects');
      }
    }
    if (!filtered.includes('fuel')) {
      const energyIdx = filtered.indexOf('energy');
      if (energyIdx !== -1) {
        filtered.splice(energyIdx + 1, 0, 'fuel');
      } else {
        filtered.push('fuel');
      }
    }
    return filtered;
  }, [columnOrder]);

  const colReorder = useDragReorder<Yafc.TableColumnId, Yafc.TableColumnId>({
    items: activeColumnOrder,
    getId: (colId) => colId,
    onCommit: (newOrder) => {
      Storage.setColumnOrder(playerIndex, newOrder);
      onColumnOrderChange?.(newOrder);
    },
  });

  const userSettings = playerState?.settings;
  const maxModSetting = userSettings?.maxModuleSlotsPerRow ?? SETTINGS.MAX_MODULE_SLOTS_PER_ROW.default;
  const maxBeaconSetting = userSettings?.maxBeaconSlotsPerRow ?? SETTINGS.MAX_BEACON_SLOTS_PER_ROW.default;
  const maxProdSetting = userSettings?.maxProductSlotsPerRow ?? SETTINGS.MAX_PRODUCT_SLOTS_PER_ROW.default;
  const maxIngrSetting = userSettings?.maxIngredientSlotsPerRow ?? SETTINGS.MAX_INGREDIENT_SLOTS_PER_ROW.default;

  const { moduleCols, beaconModuleCols, productCols, ingredientCols } = useMemo(() => {
    let maxModules = 1;
    let maxBeaconMods = 1;
    let maxProducts = 1;
    let maxIngredients = 1;

    if (summary !== undefined) {
      for (const recipe of recipes) {
        const r = summary.recipeResults[recipe.id];

        const mods = recipe.machine.modules || [];
        const activeMods = mods.filter((m) => (m.count || 0) > 0).length;
        if (activeMods > maxModules) {
          maxModules = activeMods;
        }

        const beacons = recipe.machine.beacons || [];
        for (const beacon of beacons) {
          if (beacon && beacon.count > 0 && beacon.name) {
            const beaconModCount = (beacon.modules || []).filter((m) => (m.count || 0) > 0).length;
            if (beaconModCount > maxBeaconMods) {
              maxBeaconMods = beaconModCount;
            }
          }
        }

        const outCount = r?.outputFlows?.length || 0;
        if (outCount > maxProducts) {
          maxProducts = outCount;
        }

        const inCount = r?.inputFlows?.length || 0;
        if (inCount > maxIngredients) {
          maxIngredients = inCount;
        }
      }
    }

    return {
      moduleCols: Math.min(maxModSetting, maxModules),
      beaconModuleCols: Math.min(maxBeaconSetting, maxBeaconMods),
      productCols: Math.min(maxProdSetting, maxProducts),
      ingredientCols: Math.min(maxIngrSetting, maxIngredients),
    };
  }, [summary, recipes, maxModSetting, maxBeaconSetting, maxProdSetting, maxIngrSetting]);

  if (groupId === undefined || chainId === undefined || chain === undefined) {
    return (
      <Frame direction="vertical" className="stretch stretch-v p-16">
        <Label caption={CAPTIONS.CHAIN_EMPTY_HINT} className="font-bold text-dim" />
      </Frame>
    );
  }

  if (chain.isValid === false) {
    return (
      <Frame direction="vertical" className="stretch stretch-v p-24 items-center justify-center">
        <Sprite sprite="yafc_questionmark" className="size-48 mb-8" />
        <Label caption={CAPTIONS.CHAIN_UNAVAILABLE_TITLE} className="chain-empty-title" />
        <Label caption={CAPTIONS.CHAIN_UNAVAILABLE_DESC} className="chain-empty-desc" />
        <Button
          caption={CAPTIONS.DELETE_CHAIN}
          style="red_button"
          onClick={() => {
            Storage.deleteChain(playerIndex, groupId, chain.id);
          }}
        />
      </Frame>
    );
  }

  if (summary === undefined) {
    return (
      <Frame direction="vertical" className="stretch stretch-v p-16">
        <Label caption={CAPTIONS.CHAIN_EMPTY_HINT} className="font-bold text-dim" />
      </Frame>
    );
  }

  const rawIngredients = summary.inputFlows;
  const extraProducts = summary.outputFlows;
  const targets = chain.targets || [];

  const handleAddDesired = (resourceType: Yafc.ResourceType, name: string, targetRate: number, quality?: Yafc.QualityInfo, temperature?: number) => {
    const rate = targetRate !== 0 ? targetRate : 1.0;
    Storage.setChainTarget(playerIndex, groupId, chain.id, resourceType, name, rate, quality?.name, temperature);
  };

  return (
    <VFlow className="stretch stretch-v gap-y-6">
      {/* ==================================================================== */}
      {/* 1. SUMMARY PANEL (Toolbar, Status, Desired, Ingredients, Products) */}
      {/* ==================================================================== */}
      <Frame direction="vertical" className="stretch">
        {/* 0. Top Toolbar (Add Recipe + Pin HUD) */}
        <HFlow className="items-center mb-2">
          <SpriteButton
            sprite="yafc_add_recipe"
            style="slot_button"
            className="size-40"
            tooltip={CAPTIONS.ADD_RECIPE}
            onClick={(e) => {
              createRoot(
                game.get_player(playerIndex)!.gui.screen,
                createElement(ModalRecipePicker, {
                  playerIndex,
                  groupId,
                  chainId: chain.id,
                  initialLocation: e?.cursor_display_location,
                }),
              );
            }}
          />
          <SpriteButton
            sprite={isPinned ? 'react_pin_black' : 'react_pin_white'}
            style={isPinned ? 'react_slot_button_yellow' : 'slot_button'}
            className="size-40"
            tooltip={isPinned ? CAPTIONS.UNPIN_HUD : CAPTIONS.PIN_HUD}
            onClick={() => {
              createRoot(game.get_player(playerIndex)!.gui.screen, COMPONENT_NAMES.YafcPinWindow, {
                playerIndex,
                pinnedGroupId: groupId,
                pinnedChainId: chain.id,
              });
            }}
          />
        </HFlow>

        {/* Error / Status Message Banner if invalid */}
        {summary.statusMessage !== undefined && (
          <Frame direction="horizontal" style="negative_subheader_frame" className="stretch">
            <Label caption={`⚠ ${summary.statusMessage}`} className="banner-error" />
          </Frame>
        )}

        {/* 1. Desired Products Row */}
        <Frame direction="horizontal" style="bordered_frame" className="stretch items-center">
          <HFlow className="stretch items-center">
            <Label caption={CAPTIONS.DESIRED_PRODUCTS} className="row-title-cyan" />
            <ScrollPane className="stretch" horizontal_scroll_policy="auto" vertical_scroll_policy="never">
              <HFlow className="items-center gap-x-6">
                {/* Add Desired Goal Button [+] as the first slot */}
                <VFlow className="justify-center">
                  <SpriteButton
                    sprite="utility/add_white"
                    style="slot_button"
                    className="size-40"
                    tooltip={CAPTIONS.ADD_DESIRED_GOAL}
                    onClick={(e) => {
                      createRoot(
                        game.get_player(playerIndex)!.gui.screen,
                        createElement(ModalResourcePicker, {
                          playerIndex,
                          groupId,
                          chainId: chain.id,
                          mode: 'resource',
                          initialLocation: e?.cursor_display_location,
                        }),
                      );
                    }}
                  />
                  <Label caption="+" className="font-small-bold text-muted text-center h-15" />
                </VFlow>

                {targets.map((tgt, index) => (
                  <TargetSlot
                    key={`${tgt.resourceType}_${tgt.name}_${tgt.quality || 'normal'}_${tgt.temperature}`}
                    playerIndex={playerIndex}
                    groupId={groupId}
                    chainId={chain.id}
                    target={tgt}
                    targetIndex={index}
                  />
                ))}
              </HFlow>
            </ScrollPane>
          </HFlow>
        </Frame>

        {/* 2. Summary Ingredients Row (Electricity as first slot) */}
        <Frame direction="horizontal" style="bordered_frame" className="stretch items-center">
          <HFlow className="stretch items-center">
            <Label caption={CAPTIONS.SUMMARY_INGREDIENTS} className="row-title-neg" />
            <ScrollPane className="stretch" horizontal_scroll_policy="auto" vertical_scroll_policy="never">
              <HFlow className="items-center gap-x-6">
                {/* Electricity slot */}
                {summary.totalPowerWatts > 0 && (
                  <VFlow className="justify-center">
                    <SpriteButton sprite="yafc_electricity" style="slot_button" className="size-40" tooltip={['yafc.power-slot-tooltip', formatPower(summary.totalPowerWatts)]} />
                    <Label caption={formatPower(summary.totalPowerWatts)} className="power-label" />
                  </VFlow>
                )}

                {/* Input ingredients */}
                {rawIngredients.map((f) => {
                  const netConsumed = -f.netRate;
                  const resName = Cache.getResourceName(f.resource);
                  const resTemp = Cache.getResourceTemperature(f.resource);
                  return (
                    <SlotRateView
                      key={`${f.resource.type}_${resName}_${f.quality.name}_${resTemp}_${f.minTemperature}_${f.maxTemperature}`}
                      type="resource"
                      size={40}
                      resource={f.resource}
                      quality={f.quality}
                      minTemperature={f.minTemperature}
                      maxTemperature={f.maxTemperature}
                      tooltip={['yafc.ingredient-slot-tooltip', string.format('%.2f', netConsumed)]}
                      rateCaption={`${string.format('%.1f', netConsumed)}/s`}
                      rateType="negative"
                      onClick={() => handleAddDesired(f.resource.type, resName, -netConsumed, f.quality, resTemp)}
                    />
                  );
                })}
              </HFlow>
            </ScrollPane>
          </HFlow>
        </Frame>

        {/* 3. Extra Products Row */}
        <Frame direction="horizontal" style="bordered_frame" className="stretch items-center">
          <HFlow className="stretch items-center">
            <Label caption={CAPTIONS.EXTRA_PRODUCTS} className="row-title-pos" />
            <ScrollPane className="stretch" horizontal_scroll_policy="auto" vertical_scroll_policy="never">
              <HFlow className="items-center gap-x-6">
                {extraProducts.length === 0
                  ? undefined
                  : extraProducts.map((f) => {
                      const resName = Cache.getResourceName(f.resource);
                      const resTemp = Cache.getResourceTemperature(f.resource);
                      return (
                        <SlotRateView
                          key={`${f.resource.type}_${resName}_${f.quality.name}_${resTemp}`}
                          type="resource"
                          size={40}
                          resource={f.resource}
                          quality={f.quality}
                          tooltip={['yafc.product-slot-tooltip', string.format('%.2f', f.surplusRate)]}
                          rateCaption={`${string.format('%.1f', f.surplusRate)}/s`}
                          rateType="positive"
                          onClick={() => handleAddDesired(f.resource.type, resName, f.surplusRate, f.quality, resTemp)}
                        />
                      );
                    })}
              </HFlow>
            </ScrollPane>
          </HFlow>
        </Frame>
      </Frame>

      {/* ==================================================================== */}
      {/* 2. PRODUCTION TABLE                                                  */}
      {/* ==================================================================== */}
      <Frame direction="vertical" className="stretch stretch-v">
        <ScrollPane className="stretch stretch-v" horizontal_scroll_policy="auto" vertical_scroll_policy="auto">
          <Table column_count={colReorder.items.length + 1} style="react_bordered_table">
            {/* 1. Header Row */}
            {colReorder.items.map((colId) => {
              const meta = COLUMN_HEADER_LABELS[colId];
              const isDragging = colReorder.isDragging(colId);
              const labelCaption = meta?.label ?? colId;
              return (
                <Frame key={`hdr_${colId}`} direction="horizontal" style="react_subheader_frame" className="justify-center items-center">
                  <Button
                    key={isDragging ? `ghost_col_${colId}` : `btn_col_${colId}`}
                    caption={labelCaption}
                    tooltip={isDragging ? CAPTIONS.PLACEMENT_PREVIEW_TOOLTIP : ['', labelCaption, '\n', ['yafc.drag-column-hint']]}
                    style={isDragging ? 'react_reorder_button' : 'react_transparent_button'}
                    className="stretch h-full font-bold text-center justify-center items-center px-2"
                    mouse_button_filter={['left', 'right']}
                    {...(isDragging ? colReorder.getGhostProps(colId) : colReorder.getItemProps(colId))}
                  />
                </Frame>
              );
            })}
            {/* Header spacer to absorb remaining table width */}
            <Frame direction="horizontal" style="react_subheader_frame" className="stretch" />

            {/* 2. Recipe Data Rows */}
            {reorder.items.map((recipe) => {
              const r = summary.recipeResults[recipe.id];

              const recipeInfo = Cache.getRecipe(recipe.recipeName);
              const machineInfo = Cache.getMachine(recipe.machine.name);
              const isUnlocked = recipeInfo !== undefined && player !== undefined ? Cache.isUnlocked(player.force, recipeInfo) : true;

              const totalWatts = r?.powerWatts || 0;

              const rowContext: RecipeRowContext = {
                playerIndex,
                groupId,
                chainId: chain.id,
                recipe,
                isAddingConstraint: addingConstraintRecipeId === recipe.id,
                onConstraintDone: () => setAddingConstraintRecipeId(undefined),
              };

              return (
                <Fragment key={`recipe_${recipe.id}`}>
                  {colReorder.items.map((colId) => {
                    switch (colId) {
                      case 'recipe': {
                        const isDragging = reorder.isDragging(recipe.id);

                        return (
                          <HFlow key={`col_rcp_${recipe.id}`} className="justify-center items-center gap-x-xs">
                            {recipeInfo && (
                              <SlotView type="recipe" size={40} element={recipeInfo} quality={recipe.recipeQuality ? Cache.getQuality(recipe.recipeQuality) : undefined} player={player} />
                            )}
                            <Button
                              key={isDragging ? `ghost_rcp_${recipe.id}` : `btn_rcp_${recipe.id}`}
                              caption={getRecipeDisplayName(recipe.recipeName)}
                              tooltip={isDragging ? CAPTIONS.PLACEMENT_PREVIEW_TOOLTIP : recipe.recipeName + '\n(Shift + Left Click to drag & reorder)'}
                              style={isDragging ? 'react_reorder_button' : !isUnlocked ? 'react_locked_transparent_button' : 'react_transparent_button'}
                              className={isDragging ? 'h-40 text-center justify-center items-center font-bold px-2' : 'h-40 text-center justify-center items-center font-semibold px-2'}
                              mouse_button_filter={['left', 'right']}
                              {...(isDragging ? reorder.getGhostProps(recipe.id) : reorder.getItemProps(recipe.id))}
                            />
                          </HFlow>
                        );
                      }

                      case 'machine': {
                        return (
                          <HFlow key={`col_mch_${recipe.id}`} className="justify-center items-center">
                            <SlotRateView type="machine" size={40} machineCount={r?.machineCount} context={rowContext} />
                          </HFlow>
                        );
                      }

                      case 'effects': {
                        const eff = r?.effects;
                        const activeEffects: { stat: Yafc.RecipeEffectStat; titleKey: string; sprite: SpritePath }[] = [];
                        if (eff !== undefined) {
                          if (Math.abs(eff.speed.value) > 0.0001 || eff.speed.fromModules !== 0 || eff.speed.fromBeacons !== 0) {
                            activeEffects.push({ stat: eff.speed, titleKey: 'yafc.effect-speed', sprite: 'yafc_effect_speed' });
                          }
                          if (eff.productivity.value > 0.0001 || (eff.productivity.fromResearch !== undefined && eff.productivity.fromResearch > 0)) {
                            activeEffects.push({ stat: eff.productivity, titleKey: 'yafc.effect-productivity', sprite: 'yafc_effect_productivity' });
                          }
                          if (Math.abs(eff.consumption.value) > 0.0001 || eff.consumption.fromModules !== 0 || eff.consumption.fromBeacons !== 0) {
                            activeEffects.push({ stat: eff.consumption, titleKey: 'yafc.effect-consumption', sprite: 'yafc_effect_consumption' });
                          }
                          if (eff.quality.value > 0.0001) {
                            activeEffects.push({ stat: eff.quality, titleKey: 'yafc.effect-quality', sprite: 'yafc_effect_quality' });
                          }
                        }

                        if (activeEffects.length === 0) {
                          return <HFlow key={`col_eff_${recipe.id}`} className="justify-center items-center" />;
                        }

                        return (
                          <VFlow key={`col_eff_${recipe.id}`} className="justify-center items-center gap-y-xs px-xs">
                            {activeEffects.map((item) => {
                              const caption =
                                item.stat.max !== undefined
                                  ? `${formatPercentValue(item.stat.value, true)}% (max ${formatPercentValue(item.stat.max, true)}%)`
                                  : `${formatPercentValue(item.stat.value, true)}%`;
                              const tooltip = buildEffectTooltip(item.titleKey, item.stat);

                              return (
                                <HFlow key={item.titleKey} className="justify-center items-center gap-x-xs">
                                  <Sprite sprite={item.sprite} className="size-16" resize_to_sprite={false} tooltip={tooltip} />
                                  <Label caption={caption} tooltip={tooltip} className={item.stat.isCapped ? 'font-small text-warning' : 'font-small'} />
                                </HFlow>
                              );
                            })}
                          </VFlow>
                        );
                      }

                      case 'energy': {
                        return (
                          <VFlow key={`col_nrg_${recipe.id}`} className="justify-center items-center">
                            <SpriteButton sprite="yafc_electricity" style="slot_button" className="size-40" tooltip={['yafc.power-slot-tooltip', formatPower(totalWatts)]} />
                            <Label caption={formatPower(totalWatts)} className="power-label" />
                          </VFlow>
                        );
                      }

                      case 'fuel': {
                        const isBurner = recipe.machine.fuel !== undefined || (machineInfo !== undefined && machineInfo.burner !== undefined);

                        return (
                          <HFlow key={`col_fl_${recipe.id}`} className="justify-center items-center gap-x-xs">
                            {isBurner ? (
                              <>
                                <SlotRateView type="fuel" size={40} fuelRate={r?.fuelRate} context={rowContext} />
                                {r?.spentFuel !== undefined && <SlotRateView type="spent-fuel" size={40} resource={r.spentFuel} rate={r.spentFuelRate} player={player} />}
                              </>
                            ) : undefined}
                          </HFlow>
                        );
                      }

                      case 'modules': {
                        const mods = recipe.machine.modules || [];
                        const activeMods = mods.filter((m) => (m.count || 0) > 0);
                        const isModuleAllowed =
                          r?.isModuleAllowed ??
                          (machineInfo !== undefined && recipeInfo !== undefined
                            ? Cache.isModuleAllowedForRecipe(machineInfo, recipeInfo, Cache.getQuality(recipe.machine.quality || DEFAULT_QUALITY_ID)!)
                            : false);

                        return (
                          <HFlow key={`col_mod_${recipe.id}`} className="justify-center items-center">
                            {!isModuleAllowed ? undefined : activeMods.length === 0 ? (
                              <VFlow className="justify-center items-center">
                                <SpriteButton
                                  sprite="utility/add_white"
                                  style="slot_button"
                                  className="size-40"
                                  tooltip={CAPTIONS.CONFIGURE_MODULES_TOOLTIP}
                                  onClick={(e) => {
                                    createRoot(
                                      game.get_player(playerIndex)!.gui.screen,
                                      createElement(ModalModuleSelector, {
                                        playerIndex,
                                        groupId,
                                        chainId: chain.id,
                                        recipeId: recipe.id,
                                        recipeVersion: recipe.version,
                                        machineName: recipe.machine.name,
                                        recipeName: recipe.recipeName,
                                        initialLocation: e?.cursor_display_location,
                                      }),
                                    );
                                  }}
                                />
                                <VFlow className="w-40 h-15" />
                              </VFlow>
                            ) : (
                              <Table column_count={moduleCols} className="gap-xs">
                                {activeMods.map((m) => (
                                  <SlotRateView key={`${m.name}_${m.quality || 'normal'}`} type="module" size={40} module={m} context={rowContext} />
                                ))}
                              </Table>
                            )}
                          </HFlow>
                        );
                      }

                      case 'beacons': {
                        const isBeaconAllowed = r?.isBeaconAllowed ?? (machineInfo !== undefined && recipeInfo !== undefined ? Cache.isBeaconAllowedForRecipe(machineInfo, recipeInfo) : false);
                        const beacons = recipe.machine.beacons || [];
                        const activeBeacons = beacons.filter((b) => b && b.count > 0 && b.name);

                        return (
                          <HFlow key={`col_bcn_${recipe.id}`} className="justify-center items-center">
                            {!isBeaconAllowed ? undefined : activeBeacons.length === 0 ? (
                              <VFlow className="justify-center items-center">
                                <SpriteButton
                                  sprite="utility/add_white"
                                  style="slot_button"
                                  className="size-40"
                                  tooltip={CAPTIONS.CONFIGURE_BEACONS_TOOLTIP}
                                  onClick={(e) => {
                                    createRoot(
                                      game.get_player(playerIndex)!.gui.screen,
                                      createElement(ModalBeaconSelector, {
                                        playerIndex,
                                        groupId,
                                        chainId: chain.id,
                                        recipeId: recipe.id,
                                        recipeVersion: recipe.version,
                                        beaconIndex: 0,
                                        initialLocation: e?.cursor_display_location,
                                      }),
                                    );
                                  }}
                                />
                                <VFlow className="w-40 h-15" />
                              </VFlow>
                            ) : (
                              <VFlow className="justify-center items-center gap-y-xs">
                                {activeBeacons.map((beacon, bIdx) => {
                                  const bMods = (beacon.modules || []).filter((m) => (m.count || 0) > 0);
                                  return (
                                    <HFlow key={`bcn_row_${bIdx}_${beacon.name}_${beacon.quality || 'normal'}`} className="justify-center items-center gap-x-xs">
                                      <SlotRateView type="beacon" size={40} beacon={beacon} beaconIndex={bIdx} context={rowContext} />
                                      {bMods.length > 0 && (
                                        <Table column_count={beaconModuleCols} className="gap-xs">
                                          {bMods.map((m) => (
                                            <SlotRateView
                                              key={`bcn_mod_${m.name}_${m.quality || 'normal'}`}
                                              type="module"
                                              size={40}
                                              module={m}
                                              context={rowContext}
                                              isBeacon={true}
                                              beaconIndex={bIdx}
                                            />
                                          ))}
                                        </Table>
                                      )}
                                    </HFlow>
                                  );
                                })}
                                {activeBeacons.length < 4 && (
                                  <Button
                                    caption={CAPTIONS.ADD_BEACON}
                                    style="mini_button"
                                    tooltip={CAPTIONS.ADD_BEACON_TOOLTIP}
                                    onClick={(e) => {
                                      createRoot(
                                        game.get_player(playerIndex)!.gui.screen,
                                        createElement(ModalBeaconSelector, {
                                          playerIndex,
                                          groupId,
                                          chainId: chain.id,
                                          recipeId: recipe.id,
                                          recipeVersion: recipe.version,
                                          beaconIndex: activeBeacons.length,
                                          initialLocation: e?.cursor_display_location,
                                        }),
                                      );
                                    }}
                                  />
                                )}
                              </VFlow>
                            )}
                          </HFlow>
                        );
                      }

                      case 'products': {
                        const recipeOutputs = r?.outputFlows || [];
                        return (
                          <HFlow key={`col_prd_${recipe.id}`} className="justify-center items-center">
                            {recipeOutputs.length === 0 ? undefined : (
                              <Table column_count={productCols} className="gap-xs">
                                {recipeOutputs.map((flow) => {
                                  const res = flow.product.resource;
                                  const resName = Cache.getResourceName(res);
                                  const resTemp = Cache.getResourceTemperature(res);
                                  return <SlotRateView key={`${res.type}_${resName}_${flow.quality.name}_${resTemp}`} type="product" size={40} flow={flow} context={rowContext} />;
                                })}
                              </Table>
                            )}
                          </HFlow>
                        );
                      }

                      case 'ingredients': {
                        const recipeInputs = r?.inputFlows || [];
                        return (
                          <HFlow key={`col_ing_${recipe.id}`} className="justify-center items-center">
                            {recipeInputs.length === 0 ? undefined : (
                              <Table column_count={ingredientCols} className="gap-xs">
                                {recipeInputs.map((flow) => {
                                  const res = flow.ingredient.resource;
                                  const resName = Cache.getResourceName(res);
                                  return (
                                    <SlotRateView
                                      key={`${res.type}_${resName}_${flow.quality.name}_${flow.ingredient.minimumTemperature}_${flow.ingredient.maximumTemperature}`}
                                      type="ingredient"
                                      size={40}
                                      flow={flow}
                                      context={rowContext}
                                    />
                                  );
                                })}
                              </Table>
                            )}
                          </HFlow>
                        );
                      }

                      case 'actions': {
                        const hasConstraint = r?.hasConstraint ?? recipe.fixedConstraint !== undefined;
                        const isAdding = addingConstraintRecipeId === recipe.id;
                        return (
                          <HFlow key={`col_act_${recipe.id}`} className="justify-center items-center gap-x-xs">
                            {/* Add / Remove Constraint */}
                            <SpriteButton
                              sprite="utility/bookmark"
                              style={hasConstraint || isAdding ? 'react_slot_button_yellow' : 'slot_button'}
                              className="size-24"
                              tooltip={hasConstraint ? CAPTIONS.CONSTRAINT_REMOVE : isAdding ? CAPTIONS.CONSTRAINT_CANCEL : CAPTIONS.CONSTRAINT_ADD}
                              onClick={() => {
                                if (hasConstraint) {
                                  Storage.updateRecipe(playerIndex, groupId, chain.id, recipe.id, {
                                    fixedConstraint: undefined,
                                  });
                                  setAddingConstraintRecipeId(undefined);
                                } else {
                                  setAddingConstraintRecipeId(isAdding ? undefined : recipe.id);
                                }
                              }}
                            />
                            {/* Delete Recipe with self-contained ConfirmDelete */}
                            <ConfirmDelete
                              size={24}
                              sprite="utility/trash"
                              style="slot_button"
                              tooltip={CAPTIONS.DELETE_RECIPE}
                              tooltipConfirm={CAPTIONS.CONFIRM_DELETE_RECIPE}
                              onConfirm={() => {
                                Storage.removeRecipeFromChain(playerIndex, groupId, chain.id, recipe.id);
                              }}
                            />
                          </HFlow>
                        );
                      }

                      default:
                        return null;
                    }
                  })}
                  {/* Trailing row spacer to absorb remaining width */}
                  <HFlow key={`spacer_${recipe.id}`} className="stretch" />
                </Fragment>
              );
            })}
          </Table>
        </ScrollPane>
      </Frame>
    </VFlow>
  );
}
