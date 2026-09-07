import type { PlayerIndex } from 'factorio:runtime';
import * as Cache from '../cache';
import { DEFAULT_QUALITY_ID } from '../constants';
import { validateAndClampModules, validateAndClampBeacons } from './validation';
import { notifyChainUpdated } from './events';
import { getGroup } from './groups';
import { getChain } from './chains';

/** Allocates next unique recipe ID within a chain. */
export function getNextRecipeId(chain: Yafc.ChainConfig): number {
  chain.nextRecipeId ??= 1;
  return chain.nextRecipeId++;
}

/** Returns all recipes belonging to a chain in stored order. */
export function getChainRecipes(chain: Yafc.ChainConfig): Yafc.RecipeConfig[] {
  const list: Yafc.RecipeConfig[] = [];
  for (const id of chain.recipeIds) {
    const r = chain.recipes[id];
    if (r) list.push(r);
  }
  return list;
}

/** Adds a recipe to a chain, auto-populating default machine, quality, and fuel. */
export function addRecipeToChain(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeName: string, quality: string = DEFAULT_QUALITY_ID): void {
  const group = getGroup(groupId);
  if (!group) return;

  const chain = getChain(group, chainId);
  if (!chain) return;

  const recipeId = getNextRecipeId(chain);
  const player = game.get_player(playerIndex)!;
  const recipeInfo = Cache.getRecipe(recipeName);
  if (recipeInfo === undefined) return;

  const defaultMachine = Cache.getDefaultMachineForRecipe(recipeInfo, player.force);
  const defaultMachineName = defaultMachine?.name || '';
  const qObj = Cache.getQuality(quality) ?? Cache.getQuality(DEFAULT_QUALITY_ID)!;
  const validRecipeQuality = Cache.resolveRecipeQuality(recipeInfo, qObj).name;
  const validMachineQuality = defaultMachine !== undefined ? Cache.resolveMachineQuality(defaultMachine, qObj).name : quality;
  const defaultFuel = defaultMachine !== undefined ? Cache.getDefaultFuelForMachine(defaultMachine, player.force) : undefined;

  const recipe: Yafc.RecipeConfig = {
    id: recipeId,
    version: 1,
    recipeName,
    recipeQuality: validRecipeQuality,
    machine: {
      name: defaultMachineName,
      quality: validMachineQuality,
      modules: [],
      beacons: [],
      fuel: defaultFuel !== undefined ? Cache.getResourceName(defaultFuel) : undefined,
    },
  };

  chain.recipes[recipeId] = recipe;
  chain.recipeIds.push(recipeId);

  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
}

/** Updates a recipe configuration in storage with optimistic version concurrency. */
export function updateRecipe(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeId: number, update: Partial<Yafc.RecipeConfig>, expectedVersion?: number): boolean {
  const group = getGroup(groupId);
  if (!group) return false;

  const chain = getChain(group, chainId);
  if (!chain) return false;

  const recipe = chain.recipes[recipeId];
  if (!recipe) return false;

  if (expectedVersion !== undefined && recipe.version !== expectedVersion) {
    return false;
  }

  Object.assign(recipe, update);
  recipe.version++;
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
  return true;
}

/** Updates crafting machine for a recipe, clamping module slots and resolving fuel. */
export function setRecipeMachine(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeId: number, machineName: string, machineQuality: string, expectedVersion: number): boolean {
  const group = getGroup(groupId);
  if (!group) return false;

  const chain = getChain(group, chainId);
  if (!chain) return false;

  const recipe = chain.recipes[recipeId];
  if (!recipe) return false;

  if (recipe.version !== expectedVersion) {
    return false;
  }

  recipe.machine.name = machineName;
  const machine = Cache.getMachine(machineName);
  const mqObj = Cache.getQuality(machineQuality) ?? Cache.getQuality(DEFAULT_QUALITY_ID)!;
  recipe.machine.quality = machine !== undefined ? Cache.resolveMachineQuality(machine, mqObj).name : machineQuality;

  const recipeInfo = Cache.getRecipe(recipe.recipeName);
  const effMqObj = Cache.getQuality(recipe.machine.quality);
  // Auto-clamp existing modules to new machine's slot capacity and restrictions
  recipe.machine.modules = machine !== undefined ? validateAndClampModules(machine, recipe.machine.modules || [], effMqObj, recipeInfo) : [];
  // Auto-clamp beacons
  recipe.machine.beacons = validateAndClampBeacons(recipe.machine.beacons || []);
  // Update fuel:
  const isBurner = machine !== undefined && (machine.burner !== undefined || machine.energySource?.type === 'fluid');
  if (!isBurner) {
    recipe.machine.fuel = undefined;
  } else {
    const currentFuel = recipe.machine.fuel !== undefined ? Cache.getFuel(recipe.machine.fuel) : undefined;
    if (currentFuel === undefined || machine === undefined || !Cache.isFuelValidForMachine(machine, currentFuel)) {
      const player = game.get_player(playerIndex)!;
      const defaultFuel = machine !== undefined ? Cache.getDefaultFuelForMachine(machine, player.force) : undefined;
      recipe.machine.fuel = defaultFuel !== undefined ? Cache.getResourceName(defaultFuel) : undefined;
    }
  }
  recipe.version++;
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
  return true;
}

/** Updates crafting machine quality tier for a recipe and clamps module slots. */
export function setRecipeMachineQuality(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeId: number, quality: string, expectedVersion: number): boolean {
  const group = getGroup(groupId);
  if (!group) return false;

  const chain = getChain(group, chainId);
  if (!chain) return false;

  const recipe = chain.recipes[recipeId];
  if (!recipe) return false;

  if (recipe.version !== expectedVersion) {
    return false;
  }

  const machine = Cache.getMachine(recipe.machine.name);
  const recipeInfo = Cache.getRecipe(recipe.recipeName);
  const qObj = Cache.getQuality(quality) ?? Cache.getQuality(DEFAULT_QUALITY_ID)!;
  recipe.machine.quality = machine !== undefined ? Cache.resolveMachineQuality(machine, qObj).name : quality;
  const effMqObj = Cache.getQuality(recipe.machine.quality);
  recipe.machine.modules = machine !== undefined ? validateAndClampModules(machine, recipe.machine.modules || [], effMqObj, recipeInfo) : [];
  recipe.version++;
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
  return true;
}

/** Sets module configuration for a recipe's crafting machine. */
export function setRecipeModules(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeId: number, modules: Yafc.ModuleSlotConfig[], expectedVersion: number): boolean {
  const group = getGroup(groupId);
  if (!group) return false;

  const chain = getChain(group, chainId);
  if (!chain) return false;

  const recipe = chain.recipes[recipeId];
  if (!recipe) return false;

  if (recipe.version !== expectedVersion) {
    return false;
  }

  const machine = Cache.getMachine(recipe.machine.name);
  const recipeInfo = Cache.getRecipe(recipe.recipeName);
  const mqObj = Cache.getQuality(recipe.machine.quality || DEFAULT_QUALITY_ID);
  // Validate and clamp module count and compatibility against current machine and recipe
  recipe.machine.modules = machine !== undefined ? validateAndClampModules(machine, modules, mqObj, recipeInfo) : [];
  recipe.version++;
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
  return true;
}

/** Sets beacon transmitter configuration for a recipe's machine. */
export function setRecipeBeacons(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeId: number, beacons: Yafc.BeaconConfig[], expectedVersion: number): boolean {
  const group = getGroup(groupId);
  if (!group) return false;

  const chain = getChain(group, chainId);
  if (!chain) return false;

  const recipe = chain.recipes[recipeId];
  if (!recipe) return false;

  if (recipe.version !== expectedVersion) {
    return false;
  }

  // Validate and clamp beacon module count and restrictions
  recipe.machine.beacons = validateAndClampBeacons(beacons);
  recipe.version++;
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
  return true;
}

/** Sets combustible burner fuel for a recipe's crafting machine. */
export function setRecipeFuel(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeId: number, fuelName: string, expectedVersion: number): boolean {
  const group = getGroup(groupId);
  if (!group) return false;

  const chain = getChain(group, chainId);
  if (!chain) return false;

  const recipe = chain.recipes[recipeId];
  if (!recipe) return false;

  if (recipe.version !== expectedVersion) {
    return false;
  }

  const machine = Cache.getMachine(recipe.machine.name);
  const fuel = Cache.getFuel(fuelName);

  if (machine !== undefined && fuel !== undefined && Cache.isFuelValidForMachine(machine, fuel)) {
    recipe.machine.fuel = fuelName;
  } else {
    recipe.machine.fuel = undefined;
  }
  recipe.version++;
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
  return true;
}

/** Removes a recipe from a chain and notifies subscribers. */
export function removeRecipeFromChain(playerIndex: PlayerIndex, groupId: number, chainId: number, recipeId: number): void {
  const group = getGroup(groupId);
  if (!group) return;

  const chain = getChain(group, chainId);
  if (!chain) return;

  chain.recipes[recipeId] = undefined;
  const idx = chain.recipeIds.indexOf(recipeId);
  if (idx !== -1) {
    chain.recipeIds.splice(idx, 1);
    notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
  }
}

/** Updates visual display order of recipes within a chain. */
export function reorderRecipes(playerIndex: PlayerIndex, groupId: number, chainId: number, orderedIds: number[]): void {
  const group = getGroup(groupId);
  if (!group) return;

  const chain = getChain(group, chainId);
  if (!chain) return;

  chain.recipeIds = orderedIds;
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
}
