import type { LuaForce } from 'factorio:runtime';
import { DEFAULT_QUALITY_ID } from '../constants';
import { getQuality } from './quality';
import { isUnlocked } from './technologies';
import { getAllBeacons, getEffectReceiver, getEntityMaxModuleSlots } from './entities';
import { getFluidFuels, getResourceName, getResourceTemperature } from './resources';

/** Checks if a fuel resource is compatible with a machine's burner energy source. */
export function isFuelValidForMachine(machine: Yafc.MachineInfo, fuel: Yafc.FuelResource): boolean {
  if (machine.burner === undefined) return false;
  const fuelName = getResourceName(fuel);
  for (const catList of machine.burner.compatibleFuels) {
    for (const f of catList) {
      if (f.name === fuelName) return true;
    }
  }
  return false;
}

/** Resolves the default fuel for a machine, picking highest unlocked tier. */
export function getDefaultFuelForMachine(machine: Yafc.MachineInfo, force: LuaForce): Yafc.FuelResource | undefined {
  if (machine.burner !== undefined) {
    const groups = machine.burner.compatibleFuels;
    if (groups.length === 0) return undefined;

    for (const catList of groups) {
      for (let i = catList.length - 1; i >= 0; i--) {
        const fuel = catList[i];
        if (isUnlocked(force, fuel)) {
          return fuel;
        }
      }
    }
    const firstCat = groups[0];
    return firstCat !== undefined && firstCat.length > 0 ? firstCat[firstCat.length - 1] : undefined;
  }

  if (machine.energySource?.type === 'fluid') {
    const fluids = getFluidFuels();
    for (let i = fluids.length - 1; i >= 0; i--) {
      const fluid = fluids[i];
      if (isUnlocked(force, fluid)) {
        return fluid;
      }
    }
    return fluids.length > 0 ? fluids[fluids.length - 1] : undefined;
  }

  return undefined;
}

/** Resolves the effective quality tier for a machine or beacon, respecting fixedQuality. */
export function resolveEntityQuality(entity: Yafc.EntityInfo, chosenQuality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): Yafc.QualityInfo {
  if (chosenQuality.name === DEFAULT_QUALITY_ID) return chosenQuality;
  if ('fixedQuality' in entity && entity.fixedQuality !== undefined) {
    return getQuality(entity.fixedQuality) ?? chosenQuality;
  }
  return chosenQuality;
}

export const resolveMachineQuality = resolveEntityQuality;

/** Resolves the effective quality tier for a recipe, respecting canSetQuality. */
export function resolveRecipeQuality(recipe: Yafc.RecipeInfo, chosenQuality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): Yafc.QualityInfo {
  if (chosenQuality.name === DEFAULT_QUALITY_ID) return chosenQuality;
  if (recipe.canSetQuality === false) {
    return getQuality(DEFAULT_QUALITY_ID)!;
  }
  return chosenQuality;
}

/** Resolves effective quality tier for a resource (items support quality, fluids/energy default to normal). */
export function resolveResourceQuality(resource: Yafc.ResourceInfo, chosenQuality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): Yafc.QualityInfo {
  if (chosenQuality.name === DEFAULT_QUALITY_ID) return chosenQuality;
  if (resource.type !== 'item') {
    return getQuality(DEFAULT_QUALITY_ID)!;
  }
  return chosenQuality;
}

/** Resolves valid installable modules for a specific machine or beacon and recipe combination. */
export function getValidModulesForEntityAndRecipe(entity: Yafc.EntityInfo, recipe?: Yafc.RecipeInfo): Yafc.ModuleInfo[] {
  if (!('compatibleModules' in entity) || !entity.compatibleModules || entity.compatibleModules.length === 0) {
    return [];
  }
  const entityModules = entity.compatibleModules;
  if (!recipe || recipe.allowedModules === undefined) {
    return entityModules;
  }

  const allowed = recipe.allowedModules;
  const list: Yafc.ModuleInfo[] = [];
  for (const mod of entityModules) {
    if (allowed.includes(mod)) {
      list.push(mod);
    }
  }
  return list;
}

/** Resolves valid broadcastable modules for a beacon, machine, and recipe combination. */
export function getValidModulesForBeaconAndRecipe(beacon: Yafc.BeaconInfo, machine?: Yafc.MachineInfo, recipe?: Yafc.RecipeInfo): Yafc.ModuleInfo[] {
  if (!beacon.compatibleModules || beacon.compatibleModules.length === 0) {
    return [];
  }
  if (machine !== undefined) {
    const receiver = getEffectReceiver(machine);
    if (receiver?.uses_beacon_effects === false) {
      return [];
    }
  }
  const targetModules = machine ? getValidModulesForEntityAndRecipe(machine, recipe) : recipe?.allowedModules;
  if (targetModules === undefined) {
    return beacon.compatibleModules;
  }
  if (targetModules.length === 0) {
    return [];
  }
  const list: Yafc.ModuleInfo[] = [];
  for (const mod of beacon.compatibleModules) {
    if (targetModules.includes(mod)) {
      list.push(mod);
    }
  }
  return list;
}

/**
 * Returns true if this machine and recipe combination can accept internal modules.
 */
export function isModuleAllowedForRecipe(machine: Yafc.MachineInfo, recipe: Yafc.RecipeInfo, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): boolean {
  const receiver = getEffectReceiver(machine);
  if (receiver?.uses_module_effects === false) return false;
  if ((getEntityMaxModuleSlots(machine, quality) || 0) <= 0) return false;
  if (!('compatibleModules' in machine) || !machine.compatibleModules || machine.compatibleModules.length === 0) return false;
  if (recipe.allowedModules === undefined) return true;
  if (recipe.allowedModules.length === 0) return false;

  for (const mod of machine.compatibleModules) {
    if (recipe.allowedModules.some((m) => m.name === mod.name)) {
      return true;
    }
  }
  return false;
}

/** Returns true if this machine and recipe combination can receive beacon effects. */
export function isBeaconAllowedForRecipe(machine: Yafc.MachineInfo, recipe: Yafc.RecipeInfo): boolean {
  const receiver = getEffectReceiver(machine);
  if (receiver?.uses_beacon_effects === false) return false;
  const beacons = getAllBeacons();
  if (beacons.length === 0) return false;
  if (recipe.allowedModules !== undefined && recipe.allowedModules.length === 0) return false;
  if (!('compatibleModules' in machine) || !machine.compatibleModules || machine.compatibleModules.length === 0) return false;

  for (const mod of machine.compatibleModules) {
    if (recipe.allowedModules !== undefined && !recipe.allowedModules.some((m) => m.name === mod.name)) {
      continue;
    }
    for (const b of beacons) {
      if (b.compatibleModules !== undefined && b.compatibleModules.some((m) => m.name === mod.name)) {
        return true;
      }
    }
  }
  return false;
}

/** Resolves the default machine capable of crafting a recipe, picking highest unlocked tier. */
export function getDefaultMachineForRecipe(recipe: Yafc.RecipeInfo, force: LuaForce): Yafc.MachineInfo | undefined {
  const groups = recipe.compatibleMachines;
  if (groups.length === 0) return undefined;

  for (const group of groups) {
    for (let i = group.length - 1; i >= 0; i--) {
      const machine = group[i];
      if (isUnlocked(force, machine)) {
        return machine;
      }
    }
  }
  const firstGroup = groups[0];
  return firstGroup !== undefined && firstGroup.length > 0 ? firstGroup[firstGroup.length - 1] : undefined;
}

/** Checks whether a given resource participates as an input ingredient or output product in a recipe. */
export function isResourceValidForRecipe(
  recipe: Yafc.RecipeInfo,
  resourceName: string,
  options?: {
    resourceType?: Yafc.ResourceType;
    quality?: Yafc.QualityInfo;
    temperature?: number;
    ioType?: 'input' | 'output';
  },
): boolean {
  const ioType = options?.ioType;
  const resType = options?.resourceType;
  const temp = options?.temperature;

  let hasInput = false;
  let hasOutput = false;

  if (ioType === undefined || ioType === 'input') {
    for (const ing of recipe.ingredients) {
      if (resType !== undefined && ing.resource.type !== resType) continue;
      const ingName = getResourceName(ing.resource);
      if (ingName !== resourceName) continue;
      if (temp !== undefined) {
        if (ing.minimumTemperature !== undefined && temp < ing.minimumTemperature) continue;
        if (ing.maximumTemperature !== undefined && temp > ing.maximumTemperature) continue;
        const ingTemp = getResourceTemperature(ing.resource);
        if (ingTemp !== undefined && ingTemp !== temp) continue;
      }
      hasInput = true;
      break;
    }
  }

  if (ioType === undefined || ioType === 'output') {
    for (const prod of recipe.products) {
      if (resType !== undefined && prod.resource.type !== resType) continue;
      const prodName = getResourceName(prod.resource);
      if (prodName !== resourceName) continue;
      if (temp !== undefined) {
        const prodTemp = getResourceTemperature(prod.resource);
        if (prodTemp !== undefined && prodTemp !== temp) continue;
      }
      hasOutput = true;
      break;
    }
  }

  if (ioType === 'input') return hasInput;
  if (ioType === 'output') return hasOutput;
  return hasInput || hasOutput;
}
