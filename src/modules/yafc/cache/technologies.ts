import type { LuaForce } from 'factorio:runtime';
import { comparePrototypeOrder } from './common';

/** In-memory persistent map of technology names to their highest required science pack item name. */
const technologySciencePacks: Record<string, string> = {};

/** Temporary index mapping recipe names to their unlocking technology metadata. */
let tempTechUnlockMap: Record<string, Yafc.TechUnlockInfo> = {};

/** Temporary science pack progression order ranks. */
let tempScienceTierRanks: Record<string, number> = {};

/** Temporary technology progression tier ranks based on highest required science pack. */
let tempTechnologyTiers: Record<string, number> = {};

/** Resolves unlocking technology metadata for a recipe or entity. */
export function getTechUnlock(name: string): Yafc.TechUnlockInfo | undefined {
  return tempTechUnlockMap[name];
}

/** Returns highest science pack required to research the specified technology. */
export function getTechnologySciencePack(techName: string): string | undefined {
  return technologySciencePacks[techName];
}

/** Returns science pack progression order ranks. */
export function getScienceTierRanks(): Record<string, number> {
  return tempScienceTierRanks;
}

/** Returns technology progression tier ranks based on highest required science pack. */
export function getTechnologyTiers(): Record<string, number> {
  return tempTechnologyTiers;
}

/** Frees build-time technology unlock maps from RAM. */
export function clearTechnologyBuildData(): void {
  tempTechUnlockMap = {};
  tempScienceTierRanks = {};
  tempTechnologyTiers = {};
}

/** Dynamically registers all science packs used in research across all technology prototypes. */
function buildScienceTierRegistry(): void {
  const packs: string[] = [];
  const packMap: Record<string, true> = {};
  const orderMap: Record<string, string> = {};

  for (const [_, tech] of pairs(prototypes.technology)) {
    for (const ing of tech.research_unit_ingredients) {
      const name = ing.name;
      if (packMap[name] === undefined) {
        packMap[name] = true;
        packs.push(name);
        orderMap[name] = prototypes.item[name]?.order || 'z';
      }
    }
  }

  // Sort science packs by pre-cached prototype order
  packs.sort((a, b) => comparePrototypeOrder(orderMap[a], orderMap[b], a, b));

  for (let i = 0; i < packs.length; i++) {
    const packName = packs[i];
    tempScienceTierRanks[packName] = i + 1;
  }
}

/** Scans all technology prototypes to index recipe and entity unlocking metadata. */
export function buildTechUnlockMap(): void {
  buildScienceTierRegistry();

  for (const [techName, techProto] of pairs(prototypes.technology)) {
    let highestTier = -1;
    let highestSciencePack: string | undefined;

    if (techProto.research_unit_ingredients !== undefined) {
      for (const ingredient of techProto.research_unit_ingredients) {
        const tier = tempScienceTierRanks[ingredient.name];
        if (tier > highestTier) {
          highestTier = tier;
          highestSciencePack = ingredient.name;
        }
      }
    }

    if (highestSciencePack !== undefined) {
      technologySciencePacks[techName] = highestSciencePack;
    }
    if (highestTier >= 0) {
      tempTechnologyTiers[techName] = highestTier;
    }

    if (techProto.effects !== undefined) {
      for (const effect of techProto.effects) {
        if (effect.type === 'unlock-recipe') {
          tempTechUnlockMap[effect.recipe] = {
            techName,
          };
        }
      }
    }
  }
}

/** Returns true if an entity or recipe is unlocked for the specified force. */
export function isUnlocked(force: LuaForce, item: Yafc.BaseInfo): boolean {
  if (item.technologyName === undefined) {
    return true;
  }
  return force.technologies[item.technologyName].researched;
}

/** Returns detailed unlock status for an entity or recipe: researched, tech name, and science pack. */
export function getUnlockStatus(force: LuaForce, item: Yafc.BaseInfo): LuaMultiReturn<[boolean, string | undefined, string | undefined]> {
  if (item.technologyName === undefined) {
    return $multi(true, undefined, undefined);
  }
  const researched = force.technologies[item.technologyName].researched;
  return $multi(researched, item.technologyName, technologySciencePacks[item.technologyName]);
}
