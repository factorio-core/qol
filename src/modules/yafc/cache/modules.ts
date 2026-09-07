import { resolveQualityValue, buildQualityMetric, getQuality } from './quality';
import { comparePrototypeOrder } from './common';
import { DEFAULT_QUALITY_ID } from '../constants';

/** In-memory dictionary of installable modules keyed by prototype name. */
const modulesById: Record<string, Yafc.ModuleInfo> = {};

/** All registered installable modules. */
const allModules: Yafc.ModuleInfo[] = [];

/** Temporary in-memory modules grouped by module category name. */
let tempModulesByCategory: Record<string, Yafc.ModuleInfo[]> = {};

/** Temporary internal memoization cache for receiver module compatibility lookups. */
let tempCompatibleModulesCache: Record<string, Yafc.ModuleInfo[]> = {};

/** Frees build-time module resolution caches from RAM. */
export function clearModuleBuildData(): void {
  tempModulesByCategory = {};
  tempCompatibleModulesCache = {};
}

/** Resolves an installable module descriptor by its name identifier. */
export function getModule(name: string): Yafc.ModuleInfo | undefined {
  return modulesById[name];
}

/** Returns all registered installable modules. */
export function getAllModules(): readonly Yafc.ModuleInfo[] {
  return allModules;
}

/** Resolves module effect stats for a specific quality level. */
export function getModuleEffects(mod: Yafc.ModuleInfo, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): Yafc.ModuleEffects {
  return resolveQualityValue<Yafc.ModuleEffects>(mod.effects, quality);
}

/** Precomputes all valid module items that can be inserted into an entity receiver based on allowed categories and effects. */
export function getCompatibleModulesForReceiver(allowedCats: Record<string, true> | undefined, allowedEffects: Record<string, boolean> | undefined): Yafc.ModuleInfo[] {
  let catKey = 'all';
  if (allowedCats !== undefined) {
    catKey = '';
    for (const [cat] of pairs(allowedCats)) {
      catKey += cat + ',';
    }
  }

  let effKey = 'all';
  if (allowedEffects !== undefined) {
    effKey = '';
    if (allowedEffects.consumption) effKey += 'c';
    if (allowedEffects.speed) effKey += 's';
    if (allowedEffects.productivity) effKey += 'p';
    if (allowedEffects.pollution) effKey += 'o';
    if (allowedEffects.quality) effKey += 'q';
  }

  const key = catKey + ':' + effKey;
  const cached = tempCompatibleModulesCache[key];
  if (cached !== undefined) {
    return cached;
  }

  const list: Yafc.ModuleInfo[] = [];

  for (const [cat, modsInCat] of pairs(tempModulesByCategory)) {
    if (allowedCats !== undefined && allowedCats[cat] !== true) {
      continue;
    }
    for (const mod of modsInCat) {
      if (allowedEffects !== undefined) {
        const eff = getModuleEffects(mod);
        if (
          (eff.speed !== undefined && eff.speed > 0 && !allowedEffects.speed) ||
          (eff.productivity !== undefined && eff.productivity > 0 && !allowedEffects.productivity) ||
          (eff.consumption !== undefined && eff.consumption > 0 && !allowedEffects.consumption) ||
          (eff.pollution !== undefined && eff.pollution > 0 && !allowedEffects.pollution) ||
          (eff.quality !== undefined && eff.quality > 0 && !allowedEffects.quality)
        ) {
          continue;
        }
      }
      list.push(mod);
    }
  }

  tempCompatibleModulesCache[key] = list;
  return list;
}

/** Scans all module prototypes from the game engine and indexes them into ModuleCatalog. */
export function buildModuleCatalog(): void {
  const moduleOrderMap: Record<string, string> = {};

  for (const [_, proto] of pairs(
    prototypes.get_item_filtered([
      { filter: 'type', type: 'module' },
      { filter: 'hidden', invert: true, mode: 'and' },
    ]),
  )) {
    const name = proto.name;
    const category = proto.category!;
    moduleOrderMap[name] = proto.order || 'z';

    const effects = buildQualityMetric<Yafc.ModuleEffects>((q) => {
      const eff = proto.get_module_effects(q);
      return {
        speed: eff?.speed,
        productivity: eff?.productivity,
        consumption: eff?.consumption,
        pollution: eff?.pollution,
        quality: eff?.quality,
      };
    });

    const modInfo: Yafc.ModuleInfo = {
      name,
      localisedName: proto.localised_name || ['item-name.' + name],
      effects: effects!,
    };

    modulesById[name] = modInfo;
    allModules.push(modInfo);

    let catList = tempModulesByCategory[category];
    if (!catList) {
      catList = [];
      tempModulesByCategory[category] = catList;
    }
    catList.push(modInfo);
  }

  allModules.sort((a, b) => comparePrototypeOrder(moduleOrderMap[a.name], moduleOrderMap[b.name], a.name, b.name));

  for (const [_, catList] of pairs(tempModulesByCategory)) {
    catList.sort((a, b) => comparePrototypeOrder(moduleOrderMap[a.name], moduleOrderMap[b.name], a.name, b.name));
  }
}
