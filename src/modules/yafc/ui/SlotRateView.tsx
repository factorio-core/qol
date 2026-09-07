import type { PlayerIndex, LocalisedString, OnGuiClickEvent, MouseButtonFlagsWrite, LuaPlayer } from 'factorio:runtime';
import { createElement, createRoot, type ReactNode } from 'fcore/react';
import { VFlow, Label, Input, SpriteButton } from 'fcore/react-components';
import * as Storage from '../storage';
import * as Cache from '../cache';
import { SlotView } from './SlotView';
import { ModalRecipePicker } from './ModalRecipePicker';
import { ModalMachineSelector } from './ModalMachineSelector';
import { ModalFuelSelector } from './ModalFuelSelector';
import { ModalModuleSelector } from './ModalModuleSelector';
import { ModalBeaconSelector } from './ModalBeaconSelector';
import { CAPTIONS } from '../constants';

export interface RecipeRowContext {
  /** Player index owning the view. */
  playerIndex: PlayerIndex;
  /** ID of the parent group. */
  groupId: number;
  /** ID of the production chain. */
  chainId: number;
  /** Recipe row configuration. */
  recipe: Yafc.RecipeConfig;
  /** Whether constraint editing mode is active for this row. */
  isAddingConstraint?: boolean;
  /** Callback invoked when constraint editing finishes. */
  onConstraintDone?: (this: void) => void;
}

export type SlotRateViewProps =
  | {
      type: 'product';
      size: number;
      flow: Yafc.RecipeOutputFlow;
      context: RecipeRowContext;
    }
  | {
      type: 'ingredient';
      size: number;
      flow: Yafc.RecipeInputFlow;
      context: RecipeRowContext;
    }
  | {
      type: 'machine';
      size: number;
      machineCount?: number;
      context: RecipeRowContext;
    }
  | {
      type: 'fuel';
      size: number;
      fuelRate?: number;
      fuel?: Yafc.ResourceInfo;
      context: RecipeRowContext;
    }
  | {
      type: 'spent-fuel';
      size: number;
      resource: Yafc.ResourceInfo;
      rate?: number;
      player?: LuaPlayer;
    }
  | {
      type: 'module';
      size: number;
      module: { name: string; count: number; quality?: string };
      context: RecipeRowContext;
      isBeacon?: boolean;
      beaconIndex?: number;
    }
  | {
      type: 'beacon';
      size: number;
      beacon: Yafc.BeaconConfig;
      beaconIndex?: number;
      context: RecipeRowContext;
    }
  | {
      type?: 'resource';
      size: number;
      element?: Yafc.ResourceInfo;
      resource?: Yafc.ResourceInfo;
      resourceType?: Yafc.ResourceType;
      name?: string;
      quality?: Yafc.QualityInfo;
      temperature?: number;
      minTemperature?: number;
      maxTemperature?: number;
      isTarget?: boolean;
      rateHeight?: number;
      player?: LuaPlayer;
      rateCaption?: string;
      rateType?: 'positive' | 'negative';
      tooltip?: LocalisedString;
      mouse_button_filter?: MouseButtonFlagsWrite;
      onClick?: (this: void, e?: OnGuiClickEvent) => void;
      bottomElement?: ReactNode;
    };

/**
 * Autonomous 40px slot component with rate/count label or constraint input underneath.
 * Automatically resolves element visuals, rate text, colors, tooltips, constraint updates, and modals.
 */
export function SlotRateView(props: SlotRateViewProps) {
  const getPlayer = (idx: PlayerIndex): LuaPlayer | undefined => {
    return typeof game !== 'undefined' && game ? game.get_player(idx) : undefined;
  };

  switch (props.type) {
    case 'product': {
      const { flow, context } = props;
      const res = flow.product.resource;
      const resName = Cache.getResourceName(res);
      const resTemp = Cache.getResourceTemperature(res);
      const isConstraint = flow.isConstraint === true;
      const showInput = isConstraint || context.isAddingConstraint === true;
      const rateText = string.format('%.1f', flow.rate);

      return (
        <VFlow className="rate-cell">
          <SlotView
            type="product"
            size={props.size}
            element={flow.product}
            quality={flow.quality}
            temperature={resTemp}
            player={getPlayer(context.playerIndex)}
            tooltip={['yafc.product-slot-tooltip', string.format('%.2f', flow.rate)]}
          />
          {showInput ? (
            <Input
              text={string.format('%.2f', flow.rate)}
              style="short_number_textfield"
              className="rate-input"
              lose_focus_on_confirm={true}
              onConfirm={(valText) => {
                const val = tonumber(valText);
                Storage.updateRecipe(context.playerIndex, context.groupId, context.chainId, context.recipe.id, {
                  fixedConstraint:
                    val !== undefined && val > 0
                      ? {
                          type: 'resource',
                          ioType: 'output',
                          resourceType: res.type,
                          resourceName: resName,
                          quality: flow.quality.name,
                          temperature: resTemp,
                          ratePerSec: val,
                        }
                      : undefined,
                });
                context.onConstraintDone?.();
              }}
            />
          ) : (
            <Label caption={rateText} className={isConstraint ? 'rate-label font-small-semibold text-amber-400' : 'rate-label font-small-semibold text-emerald-400'} />
          )}
        </VFlow>
      );
    }

    case 'ingredient': {
      const { flow, context } = props;
      const res = flow.ingredient.resource;
      const resName = Cache.getResourceName(res);
      const isConstraint = flow.isConstraint === true;
      const showInput = isConstraint || context.isAddingConstraint === true;
      const rateText = string.format('%.1f', flow.rate);

      return (
        <VFlow className="rate-cell">
          <SlotView
            type="ingredient"
            size={props.size}
            element={flow.ingredient}
            quality={flow.quality}
            minTemperature={flow.ingredient.minimumTemperature}
            maxTemperature={flow.ingredient.maximumTemperature}
            player={getPlayer(context.playerIndex)}
            tooltip={['yafc.ingredient-slot-tooltip', string.format('%.2f', flow.rate)]}
            onClick={(e) => {
              const p = getPlayer(context.playerIndex);
              if (p) {
                createRoot(
                  p.gui.screen,
                  createElement(ModalRecipePicker, {
                    playerIndex: context.playerIndex,
                    groupId: context.groupId,
                    chainId: context.chainId,
                    filter: {
                      filterType: 'product',
                      type: res.type,
                      name: resName,
                      quality: flow.quality,
                      minTemperature: flow.ingredient.minimumTemperature,
                      maxTemperature: flow.ingredient.maximumTemperature,
                    },
                    initialLocation: e?.cursor_display_location,
                  }),
                );
              }
            }}
          />
          {showInput ? (
            <Input
              text={string.format('%.2f', flow.rate)}
              style="short_number_textfield"
              className="rate-input"
              lose_focus_on_confirm={true}
              onConfirm={(valText) => {
                const val = tonumber(valText);
                Storage.updateRecipe(context.playerIndex, context.groupId, context.chainId, context.recipe.id, {
                  fixedConstraint:
                    val !== undefined && val > 0
                      ? {
                          type: 'resource',
                          ioType: 'input',
                          resourceType: res.type,
                          resourceName: resName,
                          quality: flow.quality.name,
                          temperature: flow.ingredient.minimumTemperature ?? flow.ingredient.maximumTemperature,
                          ratePerSec: val,
                        }
                      : undefined,
                });
                context.onConstraintDone?.();
              }}
            />
          ) : (
            <Label caption={rateText} className="rate-label font-small-semibold text-amber-400" />
          )}
        </VFlow>
      );
    }

    case 'machine': {
      const { machineCount, context } = props;
      const machineInfo = Cache.getMachine(context.recipe.machine.name);
      if (machineInfo === undefined) return undefined;

      const isConstraint = context.recipe.fixedConstraint?.type === 'buildings';
      const showInput = isConstraint || context.isAddingConstraint === true;
      const countText = machineCount !== undefined ? `x${string.format('%.2f', machineCount)}` : undefined;
      const inputValue =
        context.recipe.fixedConstraint?.type === 'buildings' ? string.format('%.2f', context.recipe.fixedConstraint.count) : machineCount !== undefined ? string.format('%.2f', machineCount) : '';

      return (
        <VFlow className="rate-cell">
          <SlotView
            type="entity"
            size={props.size}
            element={machineInfo}
            quality={context.recipe.machine.quality ? Cache.getQuality(context.recipe.machine.quality) : undefined}
            player={getPlayer(context.playerIndex)}
            tooltip={CAPTIONS.SELECT_MACHINE_QUALITY_TOOLTIP}
            onClick={(e) => {
              const p = getPlayer(context.playerIndex);
              if (p) {
                createRoot(
                  p.gui.screen,
                  createElement(ModalMachineSelector, {
                    playerIndex: context.playerIndex,
                    groupId: context.groupId,
                    chainId: context.chainId,
                    recipeId: context.recipe.id,
                    recipeVersion: context.recipe.version,
                    recipeName: context.recipe.recipeName,
                    currentMachineName: context.recipe.machine.name,
                    currentQuality: context.recipe.machine.quality,
                    initialLocation: e?.cursor_display_location,
                  }),
                );
              }
            }}
          />
          {showInput ? (
            <Input
              text={inputValue}
              style="short_number_textfield"
              className="rate-input"
              lose_focus_on_confirm={true}
              onConfirm={(valText) => {
                const val = tonumber(valText);
                Storage.updateRecipe(context.playerIndex, context.groupId, context.chainId, context.recipe.id, {
                  fixedConstraint: val !== undefined && val > 0 ? { type: 'buildings', count: val } : undefined,
                });
                context.onConstraintDone?.();
              }}
            />
          ) : (
            <Label caption={countText} className={isConstraint ? 'rate-label font-small-semibold text-amber-400' : 'rate-label font-small-semibold text-zinc-200'} />
          )}
        </VFlow>
      );
    }

    case 'fuel': {
      const { fuelRate, context } = props;
      const currentFuel = props.fuel ?? (context.recipe.machine.fuel ? Cache.getFuel(context.recipe.machine.fuel) : undefined);
      if (currentFuel === undefined) {
        return (
          <VFlow className="rate-cell">
            <SpriteButton
              sprite="utility/add_white"
              style="slot_button"
              className="size-40"
              styles={{ width: props.size, height: props.size }}
              tooltip={CAPTIONS.SELECT_BURNER_FUEL_TOOLTIP}
              onClick={(e) => {
                const p = getPlayer(context.playerIndex);
                if (p) {
                  createRoot(
                    p.gui.screen,
                    createElement(ModalFuelSelector, {
                      playerIndex: context.playerIndex,
                      groupId: context.groupId,
                      chainId: context.chainId,
                      recipeId: context.recipe.id,
                      recipeVersion: context.recipe.version,
                      machineName: context.recipe.machine.name,
                      currentFuel: context.recipe.machine.fuel,
                      initialLocation: e?.cursor_display_location,
                    }),
                  );
                }
              }}
            />
            <Label caption={CAPTIONS.FUEL_COLUMN} className="rate-label font-small text-amber-400" />
          </VFlow>
        );
      }

      const isConstraint = context.recipe.fixedConstraint?.type === 'fuel';
      const showInput = isConstraint || context.isAddingConstraint === true;
      const rateText = fuelRate !== undefined ? `${string.format('%.1f', fuelRate)}/s` : undefined;
      const inputValue = fuelRate !== undefined ? string.format('%.2f', fuelRate) : '';

      return (
        <VFlow className="rate-cell">
          <SlotView
            type="resource"
            size={props.size}
            element={currentFuel}
            player={getPlayer(context.playerIndex)}
            tooltip={CAPTIONS.SELECT_FUEL_TOOLTIP}
            onClick={(e) => {
              const p = getPlayer(context.playerIndex);
              if (p) {
                createRoot(
                  p.gui.screen,
                  createElement(ModalFuelSelector, {
                    playerIndex: context.playerIndex,
                    groupId: context.groupId,
                    chainId: context.chainId,
                    recipeId: context.recipe.id,
                    recipeVersion: context.recipe.version,
                    machineName: context.recipe.machine.name,
                    currentFuel: context.recipe.machine.fuel,
                    initialLocation: e?.cursor_display_location,
                  }),
                );
              }
            }}
          />
          {showInput ? (
            <Input
              text={inputValue}
              style="short_number_textfield"
              className="rate-input"
              lose_focus_on_confirm={true}
              onConfirm={(valText) => {
                const val = tonumber(valText);
                Storage.updateRecipe(context.playerIndex, context.groupId, context.chainId, context.recipe.id, {
                  fixedConstraint: val !== undefined && val > 0 ? { type: 'fuel', ratePerSec: val } : undefined,
                });
                context.onConstraintDone?.();
              }}
            />
          ) : (
            <Label caption={rateText} className="rate-label font-small-semibold text-amber-400" />
          )}
        </VFlow>
      );
    }

    case 'spent-fuel': {
      const { resource, rate, player } = props;
      const rateText = rate !== undefined ? `${string.format('%.1f', rate)}/s` : undefined;

      return (
        <VFlow className="rate-cell">
          <SlotView type="resource" size={props.size} element={resource} player={player} tooltip={CAPTIONS.SPENT_FUEL_BYPRODUCT_TOOLTIP} />
          <Label caption={rateText} className="rate-label font-small-semibold text-emerald-400" />
        </VFlow>
      );
    }

    case 'module': {
      const { module, context, isBeacon } = props;
      const modItem = Cache.getItem(module.name);
      if (modItem === undefined) return undefined;

      return (
        <VFlow className="rate-cell">
          <SlotView
            type="resource"
            size={props.size}
            element={modItem}
            quality={module.quality ? Cache.getQuality(module.quality) : undefined}
            player={getPlayer(context.playerIndex)}
            tooltip={isBeacon ? CAPTIONS.CONFIGURE_BEACONS_TOOLTIP : CAPTIONS.CONFIGURE_MODULES_TOOLTIP}
            onClick={(e) => {
              const p = getPlayer(context.playerIndex);
              if (p) {
                createRoot(
                  p.gui.screen,
                  isBeacon
                    ? createElement(ModalBeaconSelector, {
                        playerIndex: context.playerIndex,
                        groupId: context.groupId,
                        chainId: context.chainId,
                        recipeId: context.recipe.id,
                        recipeVersion: context.recipe.version,
                        beaconIndex: props.beaconIndex ?? 0,
                        initialLocation: e?.cursor_display_location,
                      })
                    : createElement(ModalModuleSelector, {
                        playerIndex: context.playerIndex,
                        groupId: context.groupId,
                        chainId: context.chainId,
                        recipeId: context.recipe.id,
                        recipeVersion: context.recipe.version,
                        machineName: context.recipe.machine.name,
                        recipeName: context.recipe.recipeName,
                        initialLocation: e?.cursor_display_location,
                      }),
                );
              }
            }}
          />
          <Label caption={`x${module.count}`} className="rate-label font-small-semibold text-zinc-200" />
        </VFlow>
      );
    }

    case 'beacon': {
      const { beacon, context, beaconIndex } = props;
      const beaconEntity = Cache.getBeacon(beacon.name);
      if (beaconEntity === undefined) return undefined;

      return (
        <VFlow className="rate-cell">
          <SlotView
            type="entity"
            size={props.size}
            element={beaconEntity}
            quality={beacon.quality ? Cache.getQuality(beacon.quality) : undefined}
            player={getPlayer(context.playerIndex)}
            tooltip={CAPTIONS.CONFIGURE_BEACONS_TOOLTIP}
            onClick={(e) => {
              const p = getPlayer(context.playerIndex);
              if (p) {
                createRoot(
                  p.gui.screen,
                  createElement(ModalBeaconSelector, {
                    playerIndex: context.playerIndex,
                    groupId: context.groupId,
                    chainId: context.chainId,
                    recipeId: context.recipe.id,
                    recipeVersion: context.recipe.version,
                    beaconIndex: beaconIndex ?? 0,
                    initialLocation: e?.cursor_display_location,
                  }),
                );
              }
            }}
          />
          <Label caption={`x${beacon.count}`} className="rate-label font-small-semibold text-zinc-200" />
        </VFlow>
      );
    }

    case 'resource':
    default: {
      let res = props.element ?? props.resource;
      if (res === undefined && props.name !== undefined) {
        const resType = (props.resourceType || 'item') as Yafc.ResourceType;
        res = Cache.getResource(resType, props.name, props.temperature);
      }
      if (res === undefined) {
        return undefined;
      }

      const slotSize = props.size;
      const rateHeight = props.rateHeight ?? 15;

      const rateClass = props.rateType === 'positive' ? 'rate-label-pos' : props.rateType === 'negative' ? 'rate-label-neg' : 'rate-label';

      return (
        <VFlow className="rate-cell">
          <SlotView
            type="resource"
            element={res}
            quality={props.quality}
            player={props.player}
            temperature={props.temperature}
            minTemperature={props.minTemperature}
            maxTemperature={props.maxTemperature}
            isTarget={props.isTarget}
            size={slotSize}
            tooltip={props.tooltip}
            mouse_button_filter={props.mouse_button_filter}
            onClick={props.onClick}
          />
          {props.bottomElement !== undefined ? (
            props.bottomElement
          ) : props.rateCaption !== undefined ? (
            <Label caption={props.rateCaption} className={rateClass} />
          ) : (
            <VFlow styles={{ width: slotSize, height: rateHeight }} />
          )}
        </VFlow>
      );
    }
  }
}
