import type { LuaPlayer, LocalisedString, ElemType, PrototypeWithQuality, OnGuiClickEvent, MouseButtonFlagsWrite, SpritePath } from 'factorio:runtime';
import { createElement } from 'fcore/react';
import { ChooseElemSlot, SpriteSlot, Label, Sprite } from 'fcore/react-components';
import type { ButtonStyles } from 'fcore/styles';
import * as Cache from '../cache';
import { DEFAULT_QUALITY_ID, VIRTUAL_RECIPE_PREFIX } from '../constants';
import { formatTemperature, formatPower, formatAmount, combineLocalisedStrings } from '../utils/format';

export type SlotType = 'recipe' | 'resource' | 'ingredient' | 'product' | 'entity' | 'quality';

export type SlotElement = Yafc.RecipeInfo | Yafc.ResourceInfo | Yafc.EntityInfo | Yafc.QualityInfo | Yafc.RecipeIngredient | Yafc.RecipeProduct;

export interface BaseSlotViewProps {
  /** Quality tier overlaying quality icon in bottom-left. */
  quality?: Yafc.QualityInfo;
  /** Active player context for automatic research unlock detection. */
  player?: LuaPlayer;
  /** Selected state applying green button highlight. */
  isSelected?: boolean;
  /** Target state applying blue button highlight. */
  isTarget?: boolean;
  /** Custom button style override. */
  style?: ButtonStyles;
  /** Slot button size in pixels. */
  size: number;
  /** Explicit badge text override. */
  badge?: string;
  /** Custom tooltip override. */
  tooltip?: LocalisedString;
  /** Whether interaction is enabled. @default true */
  enabled?: boolean;
  /** Mouse button filter. */
  mouse_button_filter?: MouseButtonFlagsWrite;
  /** Click handler. */
  onClick?: (this: void, e?: OnGuiClickEvent) => void;
  /** Style modifications dictionary. */
  styles?: Record<string, unknown>;
}

export type SlotViewProps = BaseSlotViewProps &
  (
    | {
        type: 'recipe';
        element: Yafc.RecipeInfo;
      }
    | {
        type: 'ingredient';
        element: Yafc.RecipeIngredient;
        minTemperature?: number;
        maxTemperature?: number;
      }
    | {
        type: 'product';
        element: Yafc.RecipeProduct;
        temperature?: number;
      }
    | {
        type: 'resource';
        element: Yafc.ResourceInfo;
        temperature?: number;
        minTemperature?: number;
        maxTemperature?: number;
      }
    | {
        type: 'entity';
        element: Yafc.EntityInfo;
      }
    | {
        type: 'quality';
        element: Yafc.QualityInfo;
      }
  );

/** Formats a temperature value with unit suffix. */
function formatTemp(temp: number): string {
  return `${formatTemperature(temp)}C`;
}

/** Formats temperature requirement ranges or thresholds for fluid tooltips. */
function formatFluidTemperatureRequirement(minTemp?: number, maxTemp?: number, exactTemp?: number, defaultTemp: number = 15): string | undefined {
  if (minTemp !== undefined && maxTemp !== undefined) {
    if (minTemp === maxTemp) {
      return ` (${formatTemp(minTemp)})`;
    }
    return ` (${formatTemp(minTemp)} - ${formatTemp(maxTemp)})`;
  }
  if (minTemp !== undefined) {
    if (minTemp === defaultTemp) {
      return undefined;
    }
    return ` (≥ ${formatTemp(minTemp)})`;
  }
  if (maxTemp !== undefined) {
    return ` (≤ ${formatTemp(maxTemp)})`;
  }
  if (exactTemp !== undefined) {
    if (exactTemp === defaultTemp) {
      return undefined;
    }
    return ` (${formatTemp(exactTemp)})`;
  }
  return undefined;
}

/**
 * Builds a rich Factorio tooltip for virtual / procedural recipes matching native Factorio recipe tooltips.
 * Exactly mirrors native Factorio recipe tooltips:
 * - Title: [font=default-bold]Name (Recipe)[/font]
 * - Category headings: [font=default-bold][color=255,230,192]Heading:[/color][/font]
 * - Ingredients & Products:
 *   - [icon] [font=default-bold]amount ×[/font] LocalisedName
 *   - [clock] [font=default-bold]energy s[/font] Crafting time
 * - Made in:
 *   - [entity=name] Machine Name
 * No empty blank line gaps (\n\n eliminated).
 */
export function buildVirtualRecipeTooltip(recipe: Yafc.RecipeInfo): LocalisedString {
  const lines: (string | number | LocalisedString)[] = [];

  // Title: Name (Recipe)
  lines.push('[font=default-bold]', recipe.localisedName, ' (', ['description.recipe'], ')[/font]');

  const isMining = recipe.name.startsWith(VIRTUAL_RECIPE_PREFIX.MINING);
  const rateMultiplier = isMining ? 1 : 60;

  // 1. Ingredients section
  if (recipe.ingredients.length > 0) {
    lines.push('\n[font=default-bold][color=255,230,192]', ['description.ingredients'], ':[/color][/font]');
    for (const ing of recipe.ingredients) {
      const res = ing.resource;
      const effectiveAmount = ing.amount * rateMultiplier;

      if (res.type === 'electricity' || res.type === 'heat') {
        const sprite = res.type === 'electricity' ? 'yafc_electricity' : 'yafc_heat';
        lines.push(`\n[img=${sprite}] [font=default-bold]${formatPower(effectiveAmount)}[/font] `, res.localisedName);
      } else {
        const iconTag = res.type === 'item' ? `[item=${res.name}]` : `[fluid=${res.base.name}]`;
        let locName: LocalisedString = res.type === 'fluid' ? res.base.localisedName || res.base.name : res.localisedName || res.name;

        if (res.type === 'fluid') {
          const tempSuffix = formatFluidTemperatureRequirement(ing.minimumTemperature, ing.maximumTemperature, res.temperature, res.base.defaultTemperature);
          if (tempSuffix !== undefined) {
            locName = ['', locName, tempSuffix];
          }
        }

        lines.push(`\n${iconTag} [font=default-bold]${formatAmount(effectiveAmount)} \u00D7[/font] `, locName);
      }
    }
    lines.push(`\n[img=utility/clock] [font=default-bold]${formatAmount(recipe.energy)} s[/font] `, ['description.crafting-time']);
  } else {
    // If no ingredients, show crafting time directly
    lines.push(`\n[img=utility/clock] [font=default-bold]${formatAmount(recipe.energy)} s[/font] `, ['description.crafting-time']);
  }

  // 2. Products section
  if (recipe.products.length > 0) {
    lines.push('\n[font=default-bold][color=255,230,192]', ['description.products'], ':[/color][/font]');
    for (const prod of recipe.products) {
      const res = prod.resource;
      const effectiveAmount = prod.amount * rateMultiplier;

      if (res.type === 'electricity' || res.type === 'heat') {
        const sprite = res.type === 'electricity' ? 'yafc_electricity' : 'yafc_heat';
        lines.push(`\n[img=${sprite}] [font=default-bold]${formatPower(effectiveAmount)}[/font] `, res.localisedName);
      } else {
        const iconTag = res.type === 'item' ? `[item=${res.name}]` : `[fluid=${res.base.name}]`;
        let locName: LocalisedString = res.type === 'fluid' ? res.base.localisedName || res.base.name : res.localisedName || res.name;

        if (res.type === 'fluid') {
          const tempSuffix = formatFluidTemperatureRequirement(undefined, undefined, res.temperature, res.base.defaultTemperature);
          if (tempSuffix !== undefined) {
            locName = ['', locName, tempSuffix];
          }
        }

        lines.push(`\n${iconTag} [font=default-bold]${formatAmount(effectiveAmount)} \u00D7[/font] `, locName);
      }
    }
  }

  // 3. Made in section
  if (recipe.compatibleMachines.length > 0) {
    const seenMachines: Record<string, boolean> = {};
    const machineList: Yafc.MachineInfo[] = [];
    for (const tier of recipe.compatibleMachines) {
      for (const m of tier) {
        if (!seenMachines[m.name]) {
          seenMachines[m.name] = true;
          machineList.push(m);
        }
      }
    }

    if (machineList.length > 0) {
      lines.push('\n[font=default-bold][color=255,230,192]', ['description.made-in'], ':[/color][/font]');
      const maxCount = Math.min(machineList.length, 10);
      for (let i = 0; i < maxCount; i++) {
        const m = machineList[i];
        lines.push(`\n[entity=${m.name}] `, m.localisedName);
      }
      if (machineList.length > maxCount) {
        lines.push(`\n... (+${machineList.length - maxCount})`);
      }
    }
  }

  return combineLocalisedStrings(lines);
}

/** Universal Factorio slot button rendering items, fluids, recipes, entities, and qualities. */
export function SlotView(props: SlotViewProps) {
  const { quality, player, isSelected = false, isTarget = false, style: propStyle, size, mouse_button_filter, enabled = true, onClick, styles: customStyles, tooltip } = props;

  let resolvedSprite: SpritePath = '';
  let resolvedBadge: string | undefined = props.badge;
  let resolvedTemp: number | undefined;
  let resolvedName: string | undefined;
  let baseInfoForUnlock: Yafc.BaseInfo | undefined;
  let isVirtualRecipe = false;
  let recipeObj: Yafc.RecipeInfo | undefined;
  let resourceObj: Yafc.ResourceInfo | undefined;

  switch (props.type) {
    case 'recipe': {
      recipeObj = props.element;
      resolvedName = props.element.name;
      resolvedSprite = props.element.sprite;
      baseInfoForUnlock = props.element;
      isVirtualRecipe = props.element.isVirtual;
      break;
    }
    case 'ingredient': {
      const res = props.element.resource;
      resourceObj = res;
      resolvedName = Cache.getResourceName(res);
      resolvedSprite = Cache.getResourceSprite(res);
      const minT = props.minTemperature !== undefined ? props.minTemperature : props.element.minimumTemperature;
      const maxT = props.maxTemperature !== undefined ? props.maxTemperature : props.element.maximumTemperature;

      if (resolvedBadge === undefined) {
        if (minT !== undefined || maxT !== undefined) {
          if (minT !== undefined && maxT !== undefined) {
            if (minT === maxT) {
              resolvedBadge = formatTemperature(minT);
            } else {
              resolvedBadge = `${string.format('%.0f', minT)}-${formatTemperature(maxT)}`;
            }
          } else if (minT !== undefined) {
            resolvedBadge = `≥${formatTemperature(minT)}`;
          } else if (maxT !== undefined) {
            resolvedBadge = `≤${formatTemperature(maxT)}`;
          }
        }
      }
      baseInfoForUnlock = res;
      break;
    }
    case 'product': {
      const res = props.element.resource;
      resourceObj = res;
      resolvedName = Cache.getResourceName(res);
      resolvedSprite = Cache.getResourceSprite(res);
      resolvedTemp = props.temperature !== undefined ? props.temperature : Cache.getResourceTemperature(res);

      if (resolvedBadge === undefined && resolvedTemp !== undefined) {
        resolvedBadge = formatTemperature(resolvedTemp);
      }
      baseInfoForUnlock = res;
      break;
    }
    case 'resource': {
      resourceObj = props.element;
      resolvedName = Cache.getResourceName(props.element);
      resolvedSprite = Cache.getResourceSprite(props.element);
      resolvedTemp = props.temperature !== undefined ? props.temperature : Cache.getResourceTemperature(props.element);
      const minT = props.minTemperature;
      const maxT = props.maxTemperature;

      if (resolvedBadge === undefined) {
        if (minT !== undefined || maxT !== undefined) {
          if (minT !== undefined && maxT !== undefined) {
            if (minT === maxT) {
              resolvedBadge = formatTemperature(minT);
            } else {
              resolvedBadge = `${string.format('%.0f', minT)}-${formatTemperature(maxT)}`;
            }
          } else if (minT !== undefined) {
            resolvedBadge = `≥${formatTemperature(minT)}`;
          } else if (maxT !== undefined) {
            resolvedBadge = `≤${formatTemperature(maxT)}`;
          }
        } else if (resolvedTemp !== undefined) {
          resolvedBadge = formatTemperature(resolvedTemp);
        }
      }
      baseInfoForUnlock = props.element;
      break;
    }
    case 'entity': {
      resolvedName = props.element.name;
      resolvedSprite = `entity/${props.element.name}`;
      baseInfoForUnlock = props.element;
      break;
    }
    case 'quality': {
      resolvedName = props.element.name;
      resolvedSprite = `quality/${props.element.name}`;
      break;
    }
  }

  // 1. Resolve unlock status
  let isTechUnlocked = true;
  let sciencePack: string | undefined;

  if (player) {
    if (baseInfoForUnlock) {
      const [unlocked, _, pack] = Cache.getUnlockStatus(player.force, baseInfoForUnlock);
      isTechUnlocked = unlocked;
      sciencePack = pack;
    } else if (props.type === 'quality' && props.element) {
      isTechUnlocked = Cache.isQualityUnlocked(player.force, props.element);
    }
  }

  const hasQuality = props.type !== 'quality' && quality !== undefined && quality.name !== DEFAULT_QUALITY_ID;
  let isQualityUnlocked = true;
  if (hasQuality && player) {
    isQualityUnlocked = Cache.isQualityUnlocked(player.force, quality);
  }

  const isFullyUnlocked = isTechUnlocked && isQualityUnlocked;

  // 2. Resolve button style
  let buttonStyle: ButtonStyles = propStyle || 'slot_button';
  if (isSelected) {
    buttonStyle = 'react_selected_slot_button_green';
  } else if (isTarget) {
    buttonStyle = 'react_selected_slot_button_blue';
  } else if (!isFullyUnlocked) {
    buttonStyle = 'react_slot_button_red';
  }

  // 3. Resolve tooltips & choose-elem prototype info
  let resolvedTooltip: LocalisedString | undefined;

  let canUseChooseElem = false;
  let elemType: ElemType | undefined;
  let elemValue: string | PrototypeWithQuality | undefined;

  switch (props.type) {
    case 'recipe':
      if (isVirtualRecipe && recipeObj) {
        resolvedTooltip = buildVirtualRecipeTooltip(recipeObj);
      } else if (resolvedName !== undefined) {
        canUseChooseElem = true;
        if (hasQuality) {
          elemType = 'recipe-with-quality';
          elemValue = { name: resolvedName, quality: quality!.name };
        } else {
          elemType = 'recipe';
          elemValue = resolvedName;
        }
      }
      break;

    case 'ingredient':
    case 'product':
    case 'resource': {
      if (resourceObj !== undefined) {
        if (resourceObj.type === 'item') {
          canUseChooseElem = true;
          if (hasQuality) {
            elemType = 'item-with-quality';
            elemValue = { name: resourceObj.name, quality: quality!.name };
          } else {
            elemType = 'item';
            elemValue = resourceObj.name;
          }
        } else if (resourceObj.type === 'fluid') {
          canUseChooseElem = true;
          elemType = 'fluid';
          elemValue = resourceObj.base.name;
        } else if (resourceObj.type === 'heat') {
          resolvedTooltip = Cache.getHeat().localisedName;
        } else if (resourceObj.type === 'electricity') {
          resolvedTooltip = Cache.getElectricity().localisedName;
        }
      }
      break;
    }

    case 'entity':
      if (resolvedName !== undefined) {
        canUseChooseElem = true;
        if (hasQuality) {
          elemType = 'entity-with-quality';
          elemValue = { name: resolvedName, quality: quality!.name };
        } else {
          elemType = 'entity';
          elemValue = resolvedName;
        }
      }
      break;

    case 'quality': {
      resolvedTooltip = props.element.localisedName || props.element.name;
      break;
    }
  }

  if (tooltip !== undefined) {
    resolvedTooltip = tooltip;
    canUseChooseElem = false;
  }

  const hasBottomBadge = !isTechUnlocked && sciencePack !== undefined;

  const topLeftBadge =
    resolvedBadge !== undefined ? (
      <Label
        caption={resolvedBadge}
        styles={{
          font: 'count-font',
          font_color: { r: 1.0, g: 0.85, b: 0.4 },
          top_margin: -4,
        }}
      />
    ) : undefined;

  const bottomRightBadge =
    hasBottomBadge && sciencePack !== undefined ? (
      <Sprite
        sprite={`item/${sciencePack}`}
        className=""
        styles={{
          right_margin: 4,
          bottom_margin: 8,
        }}
      />
    ) : undefined;

  if (canUseChooseElem && elemType !== undefined && elemValue !== undefined) {
    return (
      <ChooseElemSlot
        elem_type={elemType}
        elem_value={elemValue}
        topLeft={topLeftBadge}
        bottomRight={bottomRightBadge}
        size={size}
        style={buttonStyle}
        tooltip={resolvedTooltip}
        enabled={enabled}
        onClick={onClick}
        styles={customStyles}
      />
    );
  }

  return (
    <SpriteSlot
      sprite={resolvedSprite}
      quality={hasQuality ? quality!.name : undefined}
      topLeft={topLeftBadge}
      bottomRight={bottomRightBadge}
      size={size}
      style={buttonStyle}
      tooltip={resolvedTooltip}
      enabled={enabled}
      mouse_button_filter={mouse_button_filter}
      onClick={onClick}
      styles={customStyles}
    />
  );
}
