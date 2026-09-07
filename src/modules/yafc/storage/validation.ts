import * as Cache from '../cache';
import { DEFAULT_QUALITY_ID } from '../constants';

/** Validates whether a target constraint refers to valid game prototypes, qualities, and parameters. */
export function isTargetValid(target: Yafc.TargetConstraint): boolean {
  const resource = Cache.getResource(target.resourceType, target.name, target.temperature);
  if (resource === undefined) {
    return false;
  }

  // Validate target quality
  if (target.quality !== undefined && target.quality !== DEFAULT_QUALITY_ID) {
    const qObj = Cache.getQuality(target.quality);
    if (qObj === undefined) {
      return false;
    }
    if (Cache.resolveResourceQuality(resource, qObj) !== qObj) {
      return false;
    }
  }

  return true;
}

/** Validates module slots installed in a machine or beacon. */
export function isModuleSlotsValid(modules: Yafc.ModuleSlotConfig[] | undefined, entity: Yafc.EntityInfo, entityQuality?: Yafc.QualityInfo, recipe?: Yafc.RecipeInfo): boolean {
  if (!modules || modules.length === 0) {
    return true;
  }

  const maxSlots = Cache.getEntityMaxModuleSlots(entity, entityQuality) || 0;
  let totalCount = 0;

  const validModules = Cache.getValidModulesForEntityAndRecipe(entity, recipe);
  const validModuleNames: Record<string, true> = {};
  for (const vm of validModules) {
    validModuleNames[vm.name] = true;
  }

  for (const m of modules) {
    if (m.count <= 0) return false;
    totalCount += m.count;

    if (Cache.getModule(m.name) === undefined) {
      return false;
    }
    if (m.quality !== undefined && m.quality !== DEFAULT_QUALITY_ID) {
      if (Cache.getQuality(m.quality) === undefined) {
        return false;
      }
    }
    if (!validModuleNames[m.name]) {
      return false;
    }
  }

  return totalCount <= maxSlots;
}

/** Validates beacon configuration and its module contents. */
export function isBeaconValid(beaconConfig: Yafc.BeaconConfig): boolean {
  if (beaconConfig.count <= 0) return false;

  const beacon = Cache.getBeacon(beaconConfig.name);
  if (beacon === undefined) return false;

  const quality = beaconConfig.quality || DEFAULT_QUALITY_ID;
  const qObj = Cache.getQuality(quality);
  if (qObj === undefined) return false;
  if (Cache.resolveEntityQuality(beacon, qObj) !== qObj) return false;

  return isModuleSlotsValid(beaconConfig.modules, beacon, qObj);
}

/** Validates a single recipe row configuration in a production chain. */
export function isRecipeValid(recipe: Yafc.RecipeConfig): boolean {
  // 1. Recipe existence and quality validation
  const recipeInfo = Cache.getRecipe(recipe.recipeName);
  if (recipeInfo === undefined) return false;

  if (recipe.recipeQuality !== undefined && recipe.recipeQuality !== DEFAULT_QUALITY_ID) {
    const rqObj = Cache.getQuality(recipe.recipeQuality);
    if (rqObj === undefined) return false;
    if (Cache.resolveRecipeQuality(recipeInfo, rqObj) !== rqObj) return false;
  }

  // 2. Machine existence, quality, and recipe compatibility validation
  const machine = Cache.getMachine(recipe.machine.name);
  if (machine === undefined) return false;

  const machineQuality = recipe.machine.quality || DEFAULT_QUALITY_ID;
  const mqObj = Cache.getQuality(machineQuality);
  if (mqObj === undefined) return false;
  if (Cache.resolveEntityQuality(machine, mqObj) !== mqObj) return false;

  let isMachineCompatible = false;
  for (const group of recipeInfo.compatibleMachines) {
    for (const m of group) {
      if (m.name === machine.name) {
        isMachineCompatible = true;
        break;
      }
    }
    if (isMachineCompatible) break;
  }
  if (!isMachineCompatible) return false;

  // 3. Machine module slots validation
  if (!isModuleSlotsValid(recipe.machine.modules, machine, mqObj, recipeInfo)) {
    return false;
  }

  // 4. Machine beacon configurations validation
  if (recipe.machine.beacons !== undefined) {
    for (const b of recipe.machine.beacons) {
      if (!isBeaconValid(b)) return false;
    }
  }

  // 5. Machine burner fuel compatibility validation
  if (recipe.machine.fuel !== undefined) {
    const fuel = Cache.getFuel(recipe.machine.fuel);
    if (fuel === undefined || !Cache.isFuelValidForMachine(machine, fuel)) {
      return false;
    }
  }

  // 6. Fixed constraint validation
  if (recipe.fixedConstraint !== undefined) {
    const fixed = recipe.fixedConstraint;
    if (fixed.type === 'buildings') {
      if (fixed.count <= 0) return false;
    } else if (fixed.type === 'fuel') {
      if (fixed.ratePerSec <= 0) return false;
      // Machine must support burner energy source
      if (machine.burner === undefined) return false;
      if (recipe.machine.fuel !== undefined) {
        const f = Cache.getFuel(recipe.machine.fuel);
        if (f === undefined || !Cache.isFuelValidForMachine(machine, f)) return false;
      }
    } else if (fixed.type === 'resource') {
      if (fixed.ratePerSec === 0) return false;

      // Validate resource prototype existence
      if (fixed.resourceType === 'item') {
        if (Cache.getItem(fixed.resourceName) === undefined) return false;
      } else if (fixed.resourceType === 'fluid') {
        if (Cache.getFluidBase(fixed.resourceName) === undefined) return false;
      } else if (fixed.resourceType !== 'heat' && fixed.resourceType !== 'electricity' && fixed.resourceType !== undefined) {
        return false;
      } else if (fixed.resourceType === undefined) {
        if (Cache.getItem(fixed.resourceName) === undefined && Cache.getFluidBase(fixed.resourceName) === undefined && fixed.resourceName !== 'heat' && fixed.resourceName !== 'electricity') {
          return false;
        }
      }

      // Validate resource quality
      const resQuality = fixed.quality;
      const resQ = Cache.getQuality(resQuality || DEFAULT_QUALITY_ID);
      if (resQuality !== undefined && resQuality !== DEFAULT_QUALITY_ID) {
        if (resQ === undefined) return false;
        const resType: Yafc.ResourceType | undefined =
          fixed.resourceType ?? (Cache.getItem(fixed.resourceName) !== undefined ? 'item' : Cache.getFluidBase(fixed.resourceName) !== undefined ? 'fluid' : undefined);
        if (resType === undefined) return false;
        const resObj = Cache.getResource(resType, fixed.resourceName, fixed.temperature);
        if (resObj === undefined || Cache.resolveResourceQuality(resObj, resQ) !== resQ) return false;
      }

      // Validate resource participation in recipe (matching ioType, resourceType, and temperature)
      if (
        !Cache.isResourceValidForRecipe(recipeInfo, fixed.resourceName, {
          resourceType: fixed.resourceType,
          quality: resQ,
          temperature: fixed.temperature,
          ioType: fixed.ioType,
        })
      ) {
        return false;
      }
    }
  }

  return true;
}

/** Validates an entire production chain (targets and recipe rows). */
export function isChainValid(chain: Yafc.ChainConfig): boolean {
  if (chain.targets !== undefined) {
    for (const target of chain.targets) {
      if (!isTargetValid(target)) {
        return false;
      }
    }
  }

  if (chain.recipeIds !== undefined) {
    for (const id of chain.recipeIds) {
      const recipe = chain.recipes[id];
      if (recipe !== undefined && !isRecipeValid(recipe)) {
        return false;
      }
    }
  }

  return true;
}

/** Validates all chains across all groups in persistent storage. */
export function validateAllChains(): void {
  for (const [_, group] of pairs(storage.yafc!.groups)) {
    if (group !== undefined) {
      for (const [_, chain] of pairs(group.chains)) {
        if (chain !== undefined) {
          chain.isValid = isChainValid(chain);
        }
      }
    }
  }
}

/**
 * Validates and clamps a list of slotted modules so that only compatible modules are kept
 * and their total count does not exceed the machine or beacon's maximum capacity.
 */
export function validateAndClampModules(entity: Yafc.EntityInfo, modules: Yafc.ModuleSlotConfig[], entityQuality?: Yafc.QualityInfo, recipe?: Yafc.RecipeInfo): Yafc.ModuleSlotConfig[] {
  if (modules.length === 0) return [];
  const maxSlots = Cache.getEntityMaxModuleSlots(entity, entityQuality) || 0;
  if (maxSlots <= 0) return [];

  const validModules = Cache.getValidModulesForEntityAndRecipe(entity, recipe);
  if (validModules.length === 0) return [];

  const validModuleNames: Record<string, true> = {};
  for (const mod of validModules) {
    validModuleNames[mod.name] = true;
  }

  const result: Yafc.ModuleSlotConfig[] = [];
  let currentSlots = 0;

  for (const m of modules) {
    if (!validModuleNames[m.name] || m.count <= 0) continue;

    const allowedCount = Math.min(m.count, maxSlots - currentSlots);
    if (allowedCount > 0) {
      result.push({
        name: m.name,
        quality: m.quality,
        count: allowedCount,
      });
      currentSlots += allowedCount;
      if (currentSlots >= maxSlots) break;
    }
  }

  return result;
}

/** Validates a list of beacon configurations and cleans up invalid module counts. */
export function validateAndClampBeacons(beaconConfigs: Yafc.BeaconConfig[]): Yafc.BeaconConfig[] {
  if (beaconConfigs.length === 0) return [];
  const validBeacons: Yafc.BeaconConfig[] = [];

  for (const b of beaconConfigs) {
    if (b.count <= 0) continue;

    const beacon = Cache.getBeacon(b.name);
    if (beacon === undefined) continue;
    const bQuality = Cache.getQuality(b.quality || DEFAULT_QUALITY_ID);
    const validMods = validateAndClampModules(beacon, b.modules, bQuality);

    validBeacons.push({
      name: b.name,
      quality: b.quality,
      count: b.count,
      modules: validMods,
    });
  }

  return validBeacons;
}
