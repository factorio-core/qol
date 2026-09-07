import { buildTechUnlockMap, clearTechnologyBuildData, getTechnologyTiers } from './technologies';
import { buildQualityCatalog } from './quality';
import { buildModuleCatalog, clearModuleBuildData } from './modules';
import { buildResourceCatalog, finalizeResourceCatalog, clearResourceBuildData, getItem, getResourceGroups } from './resources';
import { buildEntityCatalog, clearEntityBuildData, getAllMachines, getAllBeacons, getEntityPlaceItem } from './entities';
import { buildRecipeCatalog, finalizeRecipeCatalog, getRecipesProducingItem, getRecipesProducingFluid } from './recipes';

// Public Technologies API
export { isUnlocked, getUnlockStatus, getTechnologySciencePack } from './technologies';

// Public Qualities API
export { getQuality, getAllQualities, resolveQualityValue, isQualityUnlocked } from './quality';

// Public Modules API
export { getModule, getAllModules, getModuleEffects } from './modules';

// Public Resources API
export {
  getItem,
  getFluid,
  getFluidBase,
  getHeat,
  getElectricity,
  getFuelsByCategory,
  getFluidFuels,
  getResource,
  getFuel,
  getResourceGroups,
  getResourceSubgroups,
  getResourceName,
  getResourceLowerName,
  getResourceSprite,
  getResourceTemperature,
  areResourcesEqual,
} from './resources';

// Public Entities API
export {
  getMachine,
  getAllMachines,
  getBeacon,
  getAllBeacons,
  getMachineBaseSpeed,
  getMachineMaxEnergyUsage,
  getMachineMaxEnergyProduction,
  getBeaconDistributionEffectivity,
  getMachineFluidUsagePerTick,
  getEffectReceiver,
  getEntityMaxModuleSlots,
} from './entities';

// Public Recipes API
export { getRecipe, getRecipeGroups, getRecipeSubgroups, getResourceEffectiveQuality } from './recipes';

// Relational Queries & Resolution Helpers
export {
  isFuelValidForMachine,
  getDefaultFuelForMachine,
  resolveEntityQuality,
  resolveMachineQuality,
  resolveRecipeQuality,
  resolveResourceQuality,
  getValidModulesForEntityAndRecipe,
  getValidModulesForBeaconAndRecipe,
  isModuleAllowedForRecipe,
  isBeaconAllowedForRecipe,
  getDefaultMachineForRecipe,
  isResourceValidForRecipe,
} from './helpers';

/** Propagates earliest research unlocks from recipes and placing items to resources and machines. */
function syncTechnologyUnlocks(): void {
  const techTiers = getTechnologyTiers();

  for (const group of getResourceGroups()) {
    for (const sg of group.subgroups) {
      for (const res of sg.resources) {
        if (res.type === 'item') {
          const list = getRecipesProducingItem(res.name);
          if (list === undefined || list.length === 0) continue;

          let isDefault = false;
          let minRank = 999999;
          let bestTech: string | undefined;

          for (const r of list) {
            if (r.technologyName === undefined) {
              isDefault = true;
              break;
            }
            const rank = techTiers[r.technologyName] ?? 999;
            if (rank < minRank) {
              minRank = rank;
              bestTech = r.technologyName;
            }
          }

          res.technologyName = isDefault ? undefined : bestTech;
        } else if (res.type === 'fluid') {
          const list = getRecipesProducingFluid(res.base.name, res.temperature);
          if (list.length === 0) continue;

          let isDefault = false;
          let minRank = 999999;
          let bestTech: string | undefined;

          for (const r of list) {
            if (r.technologyName === undefined) {
              isDefault = true;
              break;
            }
            const rank = techTiers[r.technologyName] ?? 999;
            if (rank < minRank) {
              minRank = rank;
              bestTech = r.technologyName;
            }
          }

          res.technologyName = isDefault ? undefined : bestTech;
        }
      }
    }
  }

  // Synchronize technology unlocks for all machines and beacons from their placing items
  for (const machine of getAllMachines()) {
    const placingItemName = getEntityPlaceItem(machine.name);
    if (placingItemName !== undefined) {
      const item = getItem(placingItemName);
      if (item !== undefined) {
        machine.technologyName = item.technologyName;
      }
    }
  }

  for (const beacon of getAllBeacons()) {
    const placingItemName = getEntityPlaceItem(beacon.name);
    if (placingItemName !== undefined) {
      const item = getItem(placingItemName);
      if (item !== undefined) {
        beacon.technologyName = item.technologyName;
      }
    }
  }
}

let isInitialized = false;

/** Ensures in-memory prototype catalogs are loaded before querying. */
export function ensureInitialized(): void {
  if (!isInitialized) {
    init();
  }
}

/** Synchronous initialization of all in-memory RAM prototype catalogs. */
export function init(force?: boolean): void {
  if (isInitialized && !force) return;
  isInitialized = true;
  buildTechUnlockMap();
  buildQualityCatalog();
  buildModuleCatalog();
  buildResourceCatalog();
  buildEntityCatalog();
  buildRecipeCatalog();
  finalizeResourceCatalog();
  finalizeRecipeCatalog();
  syncTechnologyUnlocks();

  // Free temporary build-time indexing data from Lua VM RAM
  clearTechnologyBuildData();
  clearModuleBuildData();
  clearEntityBuildData();
  clearResourceBuildData();
}

export const buildAllPrototypeCaches = init;
