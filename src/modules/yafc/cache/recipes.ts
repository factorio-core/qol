import type { LuaEntityPrototype, LuaRecipePrototype, LuaFluidPrototype, Product } from 'factorio:runtime';
import { DEFAULT_QUALITY_ID, IGNORED_ITEM_GROUPS_SET, VIRTUAL_RECIPE_PREFIX, VIRTUAL_GROUP, VIRTUAL_GROUP_ORDER, VIRTUAL_SUBGROUPS, VIRTUAL_SUBGROUP_ORDERS, CAPTIONS } from '../constants';
import { buildQualityMetric, getQuality, resolveQualityValue } from './quality';
import { comparePrototypeOrder } from './common';
import { getTechUnlock } from './technologies';
import { areObjectsEqual } from 'fcore/utils/table';
import { getCompatibleModulesForReceiver } from './modules';
import { getItem, getResourceGroups, getOrCreateFluid, getCompatibleFluids, getHeat, getElectricity, areResourcesEqual } from './resources';
import { getAllMachines, getEntityOrder, getMachinesForCraftingCategory, getFilteredDrills, getMachineMaxEnergyProduction, getMachineFluidUsagePerTick } from './entities';
import { calculateBoilerFluidFlow, calculateGeneratorPower } from '../utils/physics';

/** Checks if a string contains the given substring without pattern matching. */
function containsSubstring(str: string | undefined, substr: string): boolean {
  if (!str) return false;
  const [pos] = string.find(str, substr, 1, true);
  return pos !== undefined;
}

/** In-memory dictionary of recipes indexed by name. */
const recipesById: Record<string, Yafc.RecipeInfo> = {};

/** In-memory recipes producing an item resource. */
const recipesByProductItem: Record<string, Yafc.RecipeInfo[]> = {};

/** In-memory recipes producing a fluid resource (indexed by name@T and name@*). */
const recipesByProductFluid: Record<string, Yafc.RecipeInfo[]> = {};

/** In-memory recipes producing heat. */
const recipesByProductHeat: Yafc.RecipeInfo[] = [];

/** In-memory recipes producing electricity. */
const recipesByProductElectricity: Yafc.RecipeInfo[] = [];

/** In-memory recipes consuming an item resource. */
const recipesByIngredientItem: Record<string, Yafc.RecipeInfo[]> = {};

/** In-memory recipes consuming a fluid resource. */
const recipesByIngredientFluid: Record<string, Yafc.RecipeInfo[]> = {};

/** In-memory recipes consuming heat. */
const recipesByIngredientHeat: Yafc.RecipeInfo[] = [];

/** In-memory recipes consuming electricity. */
const recipesByIngredientElectricity: Yafc.RecipeInfo[] = [];

/** In-memory recipe UI groups. */
const recipeGroups: Yafc.RecipeGroupInfo[] = [];

/** In-memory recipe UI groups indexed by name. */
const recipeGroupsById: Record<string, Yafc.RecipeGroupInfo> = {};

/** Resolves the effective quality of a recipe ingredient or product based on recipe quality. */
export function getResourceEffectiveQuality(flow: Yafc.RecipeIngredient | Yafc.RecipeProduct, recipeQuality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): Yafc.QualityInfo {
  if (flow.resource.type !== 'item') {
    return getQuality(DEFAULT_QUALITY_ID)!;
  }
  if (flow.quality === undefined) {
    return recipeQuality;
  }
  const qName = resolveQualityValue(flow.quality, recipeQuality);
  return getQuality(qName) ?? recipeQuality;
}

/** Collects fluid producing recipes into the destination set. */
function collectRecipesProducingFluid(name: string, out: LuaTable<Yafc.RecipeInfo, boolean>, temperature?: number, minTemperature?: number, maxTemperature?: number): void {
  // 1. Fast path: if no temperature bounds specified -> direct O(1) lookup
  if (temperature === undefined && minTemperature === undefined && maxTemperature === undefined) {
    const list = recipesByProductFluid[`${name}@*`];
    if (list !== undefined) {
      for (const r of list) out.set(r, true);
    }
    return;
  }

  // 2. If exact temperature is specified without min/max bounds
  if (temperature !== undefined && minTemperature === undefined && maxTemperature === undefined) {
    const list = recipesByProductFluid[`${name}@${temperature}`];
    if (list !== undefined) {
      for (const r of list) out.set(r, true);
    }
    return;
  }

  // 3. Query discrete temperature variants within range ($O(1)$ memoized)
  const compatibleFluids = getCompatibleFluids(name, minTemperature, maxTemperature);
  for (const fluid of compatibleFluids) {
    const list = recipesByProductFluid[`${fluid.base.name}@${fluid.temperature}`];
    if (list !== undefined) {
      for (const r of list) out.set(r, true);
    }
  }
}

/** Collects fluid consuming recipes into the destination set. */
function collectRecipesConsumingFluid(name: string, out: LuaTable<Yafc.RecipeInfo, boolean>, temperature?: number): void {
  const allConsuming = recipesByIngredientFluid[name];
  if (!allConsuming) return;

  // 1. Fast path: if no temperature filter -> instant collection without ingredient scans
  if (temperature === undefined) {
    for (const r of allConsuming) out.set(r, true);
    return;
  }

  // 2. Filter consuming recipes by temperature bounds
  for (const r of allConsuming) {
    for (const ing of r.ingredients) {
      if (ing.resource.type === 'fluid' && ing.resource.base.name === name) {
        if ((ing.minimumTemperature === undefined || temperature >= ing.minimumTemperature) && (ing.maximumTemperature === undefined || temperature <= ing.maximumTemperature)) {
          out.set(r, true);
          break;
        }
      }
    }
  }
}

/** Collects recipes related to a specific pinned resource flow into the candidate set. */
function collectRecipesByResource(filter: Yafc.RecipeFilter, out: LuaTable<Yafc.RecipeInfo, boolean>): void {
  const { filterType, type, name, temperature, minTemperature, maxTemperature } = filter;
  if (!filterType || !type || !name) return;

  if (filterType === 'product') {
    switch (type) {
      case 'item': {
        const list = recipesByProductItem[name];
        if (list !== undefined) {
          for (const r of list) out.set(r, true);
        }
        break;
      }
      case 'fluid':
        collectRecipesProducingFluid(name, out, temperature, minTemperature, maxTemperature);
        break;
      case 'heat':
        for (const r of recipesByProductHeat) out.set(r, true);
        break;
      case 'electricity':
        for (const r of recipesByProductElectricity) out.set(r, true);
        break;
    }
  } else if (filterType === 'ingredient') {
    switch (type) {
      case 'item': {
        const list = recipesByIngredientItem[name];
        if (list !== undefined) {
          for (const r of list) out.set(r, true);
        }
        break;
      }
      case 'fluid':
        collectRecipesConsumingFluid(name, out, temperature);
        break;
      case 'heat':
        for (const r of recipesByIngredientHeat) out.set(r, true);
        break;
      case 'electricity':
        for (const r of recipesByIngredientElectricity) out.set(r, true);
        break;
    }
  }
}

/** Returns all top-level recipe UI group nodes. */
export function getRecipeGroups(): readonly Yafc.RecipeGroupInfo[] {
  return recipeGroups;
}

/** Resolves a recipe definition by its identifier name. */
export function getRecipe(name: string): Yafc.RecipeInfo | undefined {
  return recipesById[name];
}

/** Scans resources matching search query and collects associated recipes into candidate set. */
function collectRecipesByResourceSearch(filter: Yafc.RecipeFilter, out: LuaTable<Yafc.RecipeInfo, boolean>): void {
  const { search, matcher, filterType } = filter;
  const hasSearch = (search !== undefined && search.trim().length > 0) || matcher !== undefined;
  if (!hasSearch) return;
  const query = search !== undefined ? search.toLowerCase().trim() : '';

  const isMatch = function (this: void, lowerName: string, resType?: string): boolean {
    return matcher !== undefined ? matcher(lowerName, resType) : containsSubstring(lowerName, query);
  };

  const matchProducts = filterType !== 'ingredient';
  const matchIngredients = filterType !== 'product';
  const seenFluids: Record<string, boolean> = {};

  // 1. Items and Fluids from registered resource groups
  for (const group of getResourceGroups()) {
    for (const sg of group.subgroups) {
      for (const res of sg.resources) {
        if (res.type === 'item') {
          if (isMatch(res.lowerName, 'item')) {
            if (matchProducts) {
              const list = recipesByProductItem[res.name];
              if (list !== undefined) {
                for (const r of list) out.set(r, true);
              }
            }
            if (matchIngredients) {
              const list = recipesByIngredientItem[res.name];
              if (list !== undefined) {
                for (const r of list) out.set(r, true);
              }
            }
          }
        } else if (res.type === 'fluid') {
          const fluidBaseName = res.base.name;
          if (!seenFluids[fluidBaseName]) {
            seenFluids[fluidBaseName] = true;
            if (isMatch(res.base.lowerName, 'fluid')) {
              if (matchProducts) {
                const list = recipesByProductFluid[`${fluidBaseName}@*`];
                if (list !== undefined) {
                  for (const r of list) out.set(r, true);
                }
              }
              if (matchIngredients) {
                const list = recipesByIngredientFluid[fluidBaseName];
                if (list !== undefined) {
                  for (const r of list) out.set(r, true);
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Virtual resources (Heat & Electricity)
  if (isMatch('heat')) {
    if (matchProducts) {
      for (const r of recipesByProductHeat) out.set(r, true);
    }
    if (matchIngredients) {
      for (const r of recipesByIngredientHeat) out.set(r, true);
    }
  }

  if (isMatch('electricity')) {
    if (matchProducts) {
      for (const r of recipesByProductElectricity) out.set(r, true);
    }
    if (matchIngredients) {
      for (const r of recipesByIngredientElectricity) out.set(r, true);
    }
  }
}

/** Queries and filters recipes, returning non-empty arrays grouped by subgroup. */
export function getRecipeSubgroups(filter: Yafc.RecipeFilter = {}): readonly (readonly Yafc.RecipeInfo[])[] {
  const { filterType, type, name, group = 'all', search, matcher } = filter;

  const hasSearch = (search !== undefined && search.trim().length > 0) || matcher !== undefined;

  // 1. Build candidate set via O(1) reverse indexes (exact resource or resource search)
  let candidateSet: LuaTable<Yafc.RecipeInfo, boolean> | undefined;
  if (name !== undefined && type !== undefined && filterType !== undefined) {
    candidateSet = new LuaTable<Yafc.RecipeInfo, boolean>();
    collectRecipesByResource(filter, candidateSet);
  } else if (hasSearch) {
    candidateSet = new LuaTable<Yafc.RecipeInfo, boolean>();
    collectRecipesByResourceSearch(filter, candidateSet);
  }

  // 2. Resolve target group tabs to scan
  const targetGroups: readonly Yafc.RecipeGroupInfo[] = group === 'all' ? recipeGroups : recipeGroupsById[group] !== undefined ? [recipeGroupsById[group]] : [];

  // 3. Scan and collect matching recipes inside each subgroup in native order
  const result: (readonly Yafc.RecipeInfo[])[] = [];

  for (const g of targetGroups) {
    for (const sg of g.subgroups) {
      let matchedInSubgroup: Yafc.RecipeInfo[] | undefined;

      for (const recipe of sg.recipes) {
        // Candidate check (O(1))
        if (candidateSet !== undefined && !candidateSet.get(recipe)) {
          continue;
        }

        if (matchedInSubgroup === undefined) matchedInSubgroup = [];
        matchedInSubgroup.push(recipe);
      }

      if (matchedInSubgroup !== undefined) {
        result.push(matchedInSubgroup);
      }
    }
  }

  return result;
}

/**
 * Adds an ingredient to a recipe's ingredients list, collapsing duplicate entries into a single flow.
 * Two ingredients are merged if:
 * 1. Their resources match (`areResourcesEqual`).
 * 2. Their temperature bounds match (minimumTemperature and maximumTemperature for fluids).
 * 3. Their quality scaling metric matches (`areObjectsEqual`).
 */
function addCollapsedIngredient(list: Yafc.RecipeIngredient[], ingredient: Yafc.RecipeIngredient): void {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (
      areResourcesEqual(item.resource, ingredient.resource) &&
      item.minimumTemperature === ingredient.minimumTemperature &&
      item.maximumTemperature === ingredient.maximumTemperature &&
      areObjectsEqual(item.quality, ingredient.quality)
    ) {
      item.amount += ingredient.amount;
      return;
    }
  }
  list.push(ingredient);
}

/**
 * Adds a product to a recipe's products list, collapsing duplicate entries into a single flow.
 * Two products are merged if:
 * 1. Their resources match (`areResourcesEqual`).
 * 2. Their productivity exemption status matches (`ignoredByProductivity`).
 * 3. Their quality scaling metric matches (`areObjectsEqual`).
 */
function addCollapsedProduct(list: Yafc.RecipeProduct[], product: Yafc.RecipeProduct): void {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const bothIgnored = (item.ignoredByProductivity === true) === (product.ignoredByProductivity === true);
    if (areResourcesEqual(item.resource, product.resource) && bothIgnored && areObjectsEqual(item.quality, product.quality)) {
      item.amount += product.amount;
      return;
    }
  }
  list.push(product);
}

/** Parses a standard LuaRecipePrototype into RecipeInfo. */
function parseStandardRecipe(proto: LuaRecipePrototype): Yafc.RecipeInfo {
  const name = proto.name;
  const unlock = getTechUnlock(name);

  const ingredients: Yafc.RecipeIngredient[] = [];
  if (proto.ingredients !== undefined) {
    for (let i = 0; i < proto.ingredients.length; i++) {
      const ing = proto.ingredients[i];
      let fluidTemp: number | undefined;
      if (ing.type === 'fluid') {
        if (ing.temperature !== undefined) {
          fluidTemp = ing.temperature;
        } else if (ing.minimum_temperature !== undefined) {
          fluidTemp = ing.minimum_temperature;
        } else if (ing.maximum_temperature !== undefined) {
          fluidTemp = ing.maximum_temperature;
        }
      }
      const res = ing.type === 'fluid' ? getOrCreateFluid(ing.name, fluidTemp) : getItem(ing.name);
      if (res !== undefined) {
        const isFluid = res.type === 'fluid';
        const quality = !isFluid ? buildQualityMetric((q) => proto.get_ingredient_quality(i + 1, q)?.name, true) : undefined;
        addCollapsedIngredient(ingredients, {
          resource: res,
          amount: ing.amount !== undefined ? ing.amount : 0,
          quality,
          minimumTemperature: ing.type === 'fluid' ? ing.minimum_temperature : undefined,
          maximumTemperature: ing.type === 'fluid' ? ing.maximum_temperature : undefined,
        });
      }
    }
  }

  const products: Yafc.RecipeProduct[] = [];
  if (proto.products !== undefined) {
    for (let i = 0; i < proto.products.length; i++) {
      const prod = proto.products[i];
      const res = prod.type === 'fluid' ? getOrCreateFluid(prod.name, prod.temperature) : getItem(prod.name);
      if (res !== undefined) {
        const amount = proto.get_product_amount(i + 1) || 0;
        const isFluid = res.type === 'fluid';
        const quality = !isFluid ? buildQualityMetric((q) => proto.get_product_quality(i + 1, q)?.name, true) : undefined;

        addCollapsedProduct(products, {
          resource: res,
          amount,
          ignoredByProductivity: prod.ignored_by_productivity !== undefined && prod.ignored_by_productivity !== 0,
          quality,
        });
      }
    }
  }

  const compatibleMachines: Yafc.MachineInfo[][] = [];
  if (proto.categories !== undefined) {
    for (const cat of proto.categories) {
      const machines = getMachinesForCraftingCategory(cat);
      if (machines.length > 0) {
        compatibleMachines.push(machines as Yafc.MachineInfo[]);
      }
    }
  }

  let allowedModules: Yafc.ModuleInfo[] | undefined;
  allowedModules = getCompatibleModulesForReceiver(proto.allowed_module_categories, proto.allowed_effects);

  return {
    name,
    sprite: `recipe/${name}`,
    localisedName: proto.localised_name,
    technologyName: unlock?.techName,
    compatibleMachines,
    ingredients,
    products,
    energy: proto.energy !== undefined ? proto.energy : 1,
    maximumProductivity: proto.maximum_productivity,
    allowedModules,
    canSetQuality: proto.can_set_quality,
    isVirtual: false,
  };
}

/** Calculates expected yield of a product prototype per cycle considering probability and extras. */
function calculateExpectedProductAmount(prod: Product): number {
  const indepProb = prod.independent_probability;
  const sharedProb = prod.shared_probability.max - prod.shared_probability.min;
  const prob = indepProb * sharedProb;

  const extra = prod.type === 'item' && prod.extra_count_fraction !== undefined ? prod.extra_count_fraction : 0;

  let baseAmount = 0;
  if (prod.amount !== undefined) {
    baseAmount = prod.amount;
  } else if (prod.amount_min !== undefined && prod.amount_max !== undefined) {
    baseAmount = (prod.amount_min + prod.amount_max) / 2;
  } else if (prod.amount_min !== undefined) {
    baseAmount = prod.amount_min;
  } else if (prod.amount_max !== undefined) {
    baseAmount = prod.amount_max;
  }

  return (baseAmount + extra) * prob;
}

/** Constructs a virtual recipe for extracting minable ground resources. */
function parseMinableResourceRecipe(proto: LuaEntityPrototype): Yafc.RecipeInfo | undefined {
  const mp = proto.mineable_properties;
  if (!mp || !mp.minable || !mp.products || mp.products.length === 0) return undefined;

  const resName = proto.name;
  const recipeName = `${VIRTUAL_RECIPE_PREFIX.MINING}${resName}`;

  let requiresFluid = false;
  const ingredients: Yafc.RecipeIngredient[] = [];
  if (mp.required_fluid !== undefined && mp.fluid_amount !== undefined) {
    requiresFluid = true;
    const res = getOrCreateFluid(mp.required_fluid);
    ingredients.push({
      resource: res,
      amount: mp.fluid_amount,
    });
  }

  const products: Yafc.RecipeProduct[] = [];
  let producesFluid = false;
  for (const prod of mp.products) {
    let res: Yafc.ResourceInfo | undefined = undefined;
    if (prod.type === 'fluid') {
      producesFluid = true;
      res = getOrCreateFluid(prod.name, prod.temperature);
    } else {
      res = getItem(prod.name);
    }

    if (res !== undefined) {
      const amount = calculateExpectedProductAmount(prod);
      addCollapsedProduct(products, {
        resource: res,
        amount,
        ignoredByProductivity: prod.ignored_by_productivity !== undefined && prod.ignored_by_productivity !== 0,
      });
    }
  }

  const compatibleDrills = proto.resource_category !== undefined ? getFilteredDrills(proto.resource_category, requiresFluid, producesFluid) : [];
  const compatibleMachines: Yafc.MachineInfo[][] = compatibleDrills.length > 0 ? [compatibleDrills as Yafc.MachineInfo[]] : [];

  return {
    name: recipeName,
    sprite: `entity/${resName}`,
    localisedName: proto.localised_name,
    compatibleMachines,
    ingredients,
    products,
    energy: mp.mining_time !== undefined ? mp.mining_time : 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing fluid extraction by an offshore pump. */
function parseOffshorePumpRecipe(fluidName: string, fluidProto: LuaFluidPrototype, offshorePumps: readonly Yafc.OffshorePumpInfo[]): Yafc.RecipeInfo {
  const fluidRes = getOrCreateFluid(fluidName);

  return {
    name: `${VIRTUAL_RECIPE_PREFIX.OFFSHORE_PUMP}${fluidName}`,
    sprite: `fluid/${fluidName}`,
    localisedName: fluidProto.localised_name,
    compatibleMachines: [offshorePumps as Yafc.MachineInfo[]],
    ingredients: [],
    products: [{ resource: fluidRes, amount: 1 }],
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing thermodynamic fluid heating in a boiler. */
function parseBoilerRecipe(machine: Yafc.BoilerInfo): Yafc.RecipeInfo | undefined {
  const inFb = machine.inputFluidBox;
  const outFb = machine.outputFluidBox;
  if (!inFb?.filter || !outFb?.filter) return undefined;

  const inFluidBase = inFb.filter.base;
  const targetTemp = machine.targetTemperature || outFb.minimumTemperature || outFb.filter.base.defaultTemperature;

  const minTemp = inFb.minimumTemperature;
  const maxTemp = inFb.maximumTemperature !== undefined ? inFb.maximumTemperature : targetTemp;

  const nominalInTemp = minTemp !== undefined ? minTemp : inFluidBase.defaultTemperature;
  if (nominalInTemp >= targetTemp) return undefined;

  const outFluid = getOrCreateFluid(outFb.filter.base.name, targetTemp);
  const energyUsageJPerTick = resolveQualityValue(machine.energyUsage) || 0;
  const fluidUsage = calculateBoilerFluidFlow(energyUsageJPerTick, inFluidBase.heatCapacity, nominalInTemp, targetTemp);
  if (fluidUsage <= 0) return undefined;

  const recipeName = `${VIRTUAL_RECIPE_PREFIX.BOILER}${machine.name}`;
  const localisedName = machine.localisedName;

  // In Factorio 2.0, boiler input fluid consumption was reduced by a factor of 10
  const ingredients: Yafc.RecipeIngredient[] = [
    {
      resource: inFb.filter,
      amount: fluidUsage / 10,
      minimumTemperature: minTemp,
      maximumTemperature: maxTemp,
    },
  ];
  if (machine.energySource?.type === 'heat') {
    ingredients.push({ resource: getHeat(), amount: energyUsageJPerTick });
  }

  return {
    name: recipeName,
    sprite: `entity/${machine.name}`,
    localisedName,
    compatibleMachines: [[machine]],
    ingredients,
    products: [{ resource: outFluid, amount: fluidUsage }],
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing power generation in a fluid generator. */
function parseGeneratorRecipe(machine: Yafc.GeneratorInfo): Yafc.RecipeInfo | undefined {
  const inFb = machine.inputFluidBox;
  if (!inFb?.filter) return undefined;

  const fluidUsage = getMachineFluidUsagePerTick(machine);
  if (fluidUsage === undefined || fluidUsage <= 0) return undefined;

  const inFluidBase = inFb.filter.base;
  const minTemp = inFb.minimumTemperature;
  const maxTemp = machine.maximumTemperature || inFb.maximumTemperature;
  const nominalTemp = machine.maximumTemperature || inFb.minimumTemperature || inFb.filter.temperature;

  const powerJPerTick = calculateGeneratorPower(fluidUsage, inFluidBase.heatCapacity, inFluidBase.defaultTemperature, nominalTemp, machine.maximumTemperature);
  if (powerJPerTick <= 0) return undefined;

  const recipeName = `${VIRTUAL_RECIPE_PREFIX.GENERATOR}${machine.name}`;
  const localisedName = machine.localisedName;

  const ingredients: Yafc.RecipeIngredient[] = [
    {
      resource: inFb.filter,
      amount: fluidUsage,
      minimumTemperature: minTemp,
      maximumTemperature: maxTemp,
    },
  ];
  const products: Yafc.RecipeProduct[] = [{ resource: getElectricity(), amount: powerJPerTick }];

  if (machine.spentFluid) {
    products.push({
      resource: machine.spentFluid.fluid,
      amount: fluidUsage * (machine.spentFluid.amount !== undefined ? machine.spentFluid.amount : 1.0),
    });
  }

  return {
    name: recipeName,
    sprite: `entity/${machine.name}`,
    localisedName,
    compatibleMachines: [[machine]],
    ingredients,
    products,
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing heat production in a reactor. */
function parseReactorRecipe(machine: Yafc.ReactorInfo): Yafc.RecipeInfo | undefined {
  const energyJPerTick = resolveQualityValue(machine.energyUsage) || 0;

  return {
    name: `${VIRTUAL_RECIPE_PREFIX.REACTOR}${machine.name}`,
    sprite: `entity/${machine.name}`,
    localisedName: machine.localisedName,
    compatibleMachines: [[machine]],
    ingredients: [],
    products: [{ resource: getHeat(), amount: energyJPerTick }],
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing plasma heating in a fusion reactor. */
function parseFusionReactorRecipe(machine: Yafc.FusionReactorInfo): Yafc.RecipeInfo | undefined {
  const inFb = machine.inputFluidBox;
  const outFb = machine.outputFluidBox;
  if (!inFb?.filter || !outFb?.filter) return undefined;

  const inFluid = inFb.filter;
  const outFluid = outFb.filter;
  const fluidUsage = resolveQualityValue(machine.maxFluidUsage) || 0;
  if (fluidUsage <= 0) return undefined;

  const powerInput = resolveQualityValue(machine.energyUsage) || 0;

  const ingredients: Yafc.RecipeIngredient[] = [
    {
      resource: inFluid,
      amount: fluidUsage,
      minimumTemperature: inFb.minimumTemperature,
      maximumTemperature: inFb.maximumTemperature,
    },
  ];
  if (powerInput > 0) {
    ingredients.push({ resource: getElectricity(), amount: powerInput });
  }

  const products: Yafc.RecipeProduct[] = [{ resource: outFluid, amount: fluidUsage }];

  return {
    name: `${VIRTUAL_RECIPE_PREFIX.REACTOR}${machine.name}`,
    sprite: `entity/${machine.name}`,
    localisedName: machine.localisedName,
    compatibleMachines: [[machine]],
    ingredients,
    products,
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing power and fluid output in a fusion generator. */
function parseFusionGeneratorRecipe(machine: Yafc.FusionGeneratorInfo): Yafc.RecipeInfo | undefined {
  const inFb = machine.inputFluidBox;
  if (!inFb?.filter) return undefined;

  const inFluid = inFb.filter;
  const fluidUsage = getMachineFluidUsagePerTick(machine);
  if (fluidUsage === undefined || fluidUsage <= 0) return undefined;
  const prodJPerTick = getMachineMaxEnergyProduction(machine);
  const powerJPerTick = prodJPerTick !== undefined && prodJPerTick > 0 ? prodJPerTick : 0;

  const ingredients: Yafc.RecipeIngredient[] = [
    {
      resource: inFluid,
      amount: fluidUsage,
      minimumTemperature: inFb.minimumTemperature,
      maximumTemperature: inFb.maximumTemperature,
    },
  ];
  const products: Yafc.RecipeProduct[] = [{ resource: getElectricity(), amount: powerJPerTick }];

  if (machine.outputFluidBox?.filter) {
    products.push({
      resource: machine.outputFluidBox.filter,
      amount: fluidUsage,
    });
  }

  return {
    name: `${VIRTUAL_RECIPE_PREFIX.GENERATOR}${machine.name}`,
    sprite: `entity/${machine.name}`,
    localisedName: machine.localisedName,
    compatibleMachines: [[machine]],
    ingredients,
    products,
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing electrical power generation in a burner generator. */
function parseBurnerGeneratorRecipe(machine: Yafc.BurnerGeneratorInfo): Yafc.RecipeInfo | undefined {
  const prodJPerTick = getMachineMaxEnergyProduction(machine);
  const powerJPerTick = prodJPerTick !== undefined && prodJPerTick > 0 ? prodJPerTick : 0;
  if (powerJPerTick <= 0) return undefined;

  return {
    name: `${VIRTUAL_RECIPE_PREFIX.BURNER_GENERATOR}${machine.name}`,
    sprite: `entity/${machine.name}`,
    localisedName: machine.localisedName,
    compatibleMachines: [[machine]],
    ingredients: [],
    products: [{ resource: getElectricity(), amount: powerJPerTick }],
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Constructs a virtual recipe representing fuel and oxidizer consumption by a space platform rocket thruster. */
function parseThrusterRecipe(machine: Yafc.ThrusterInfo): Yafc.RecipeInfo | undefined {
  const fuelFb = machine.fuelFluidBox;
  const oxFb = machine.oxidizerFluidBox;
  const ingredients: Yafc.RecipeIngredient[] = [];

  const fluidUsage = machine.maxFluidUsage !== undefined && machine.maxFluidUsage > 0 ? machine.maxFluidUsage : 1;

  if (fuelFb?.filter) {
    ingredients.push({
      resource: fuelFb.filter,
      amount: fluidUsage,
      minimumTemperature: fuelFb.minimumTemperature,
      maximumTemperature: fuelFb.maximumTemperature,
    });
  }
  if (oxFb?.filter) {
    ingredients.push({
      resource: oxFb.filter,
      amount: fluidUsage,
      minimumTemperature: oxFb.minimumTemperature,
      maximumTemperature: oxFb.maximumTemperature,
    });
  }

  if (ingredients.length === 0) return undefined;

  return {
    name: `${VIRTUAL_RECIPE_PREFIX.THRUSTER}${machine.name}`,
    sprite: `entity/${machine.name}`,
    localisedName: machine.localisedName,
    compatibleMachines: [[machine]],
    ingredients,
    products: [],
    energy: 1.0,
    canSetQuality: false,
    isVirtual: true,
  };
}

/** Registers a recipe into the global catalog, product/ingredient reverse indexes, and target UI subgroup. */
function registerRecipe(recipe: Yafc.RecipeInfo, subgroupId: string, order: string, subgroupsById: Record<string, Yafc.RecipeSubGroupInfo>, recipeOrderMap: Record<string, string>): void {
  if (recipesById[recipe.name] !== undefined) return;
  recipesById[recipe.name] = recipe;
  recipeOrderMap[recipe.name] = order;

  for (const prod of recipe.products) {
    const res = prod.resource;
    switch (res.type) {
      case 'item': {
        let list = recipesByProductItem[res.name];
        if (!list) {
          list = [];
          recipesByProductItem[res.name] = list;
        }
        list.push(recipe);
        break;
      }
      case 'fluid': {
        const key = `${res.base.name}@${res.temperature}`;
        let list = recipesByProductFluid[key];
        if (!list) {
          list = [];
          recipesByProductFluid[key] = list;
        }
        list.push(recipe);

        const wildcardKey = `${res.base.name}@*`;
        let baseList = recipesByProductFluid[wildcardKey];
        if (!baseList) {
          baseList = [];
          recipesByProductFluid[wildcardKey] = baseList;
        }
        baseList.push(recipe);
        break;
      }
      case 'heat':
        recipesByProductHeat.push(recipe);
        break;
      case 'electricity':
        recipesByProductElectricity.push(recipe);
        break;
    }
  }

  for (const ing of recipe.ingredients) {
    const res = ing.resource;
    switch (res.type) {
      case 'item': {
        let list = recipesByIngredientItem[res.name];
        if (!list) {
          list = [];
          recipesByIngredientItem[res.name] = list;
        }
        list.push(recipe);
        break;
      }
      case 'fluid': {
        let list = recipesByIngredientFluid[res.base.name];
        if (!list) {
          list = [];
          recipesByIngredientFluid[res.base.name] = list;
        }
        list.push(recipe);
        break;
      }
      case 'heat':
        recipesByIngredientHeat.push(recipe);
        break;
      case 'electricity':
        recipesByIngredientElectricity.push(recipe);
        break;
    }
  }

  const subgroup = subgroupsById[subgroupId];
  if (subgroup !== undefined) {
    subgroup.recipes.push(recipe);
  }
}

/** Scans standard recipes, ground resources, and thermodynamic entities to construct RecipeCatalog in-place. */
export function buildRecipeCatalog(): void {
  const groupOrderMap: Record<string, string> = {};
  const subgroupOrderMap: Record<string, string> = {};
  const recipeOrderMap: Record<string, string> = {};
  const subgroupsById: Record<string, Yafc.RecipeSubGroupInfo> = {};
  const groups: Yafc.RecipeGroupInfo[] = [];

  // 1. Initialize Item Groups
  for (const [name, proto] of pairs(prototypes.item_group)) {
    if (IGNORED_ITEM_GROUPS_SET[name]) continue;
    groupOrderMap[name] = proto.order || 'z';
    const groupObj: Yafc.RecipeGroupInfo = {
      name,
      localisedName: proto.localised_name || ['item-group-name.' + name],
      sprite: `item-group/${name}`,
      subgroups: [],
    };
    groups.push(groupObj);
    recipeGroupsById[name] = groupObj;
  }

  // 1b. Ensure Virtual YAFC Item Group exists for virtual recipes
  if (!recipeGroupsById[VIRTUAL_GROUP.YAFC]) {
    const yafcGroupObj: Yafc.RecipeGroupInfo = {
      name: VIRTUAL_GROUP.YAFC,
      localisedName: CAPTIONS.YAFC_GROUP_TITLE,
      sprite: 'yafc_logo',
      subgroups: [],
    };
    groups.push(yafcGroupObj);
    recipeGroupsById[VIRTUAL_GROUP.YAFC] = yafcGroupObj;
    groupOrderMap[VIRTUAL_GROUP.YAFC] = VIRTUAL_GROUP_ORDER;
  }

  // 2. Initialize Item Subgroups
  for (const [name, proto] of pairs(prototypes.item_subgroup)) {
    const group = recipeGroupsById[proto.group.name];
    if (group !== undefined) {
      subgroupOrderMap[name] = proto.order || 'z';
      const subgroupObj: Yafc.RecipeSubGroupInfo = {
        name,
        recipes: [],
      };
      group.subgroups.push(subgroupObj);
      subgroupsById[name] = subgroupObj;
    }
  }

  // 2b. Ensure Virtual Subgroups exist in YAFC group
  for (const [_, sgName] of pairs(VIRTUAL_SUBGROUPS)) {
    if (!subgroupsById[sgName]) {
      const sgObj: Yafc.RecipeSubGroupInfo = {
        name: sgName,
        recipes: [],
      };
      recipeGroupsById[VIRTUAL_GROUP.YAFC].subgroups.push(sgObj);
      subgroupsById[sgName] = sgObj;
      subgroupOrderMap[sgName] = VIRTUAL_SUBGROUP_ORDERS[sgName] || 'z';
    }
  }

  // 3. Register virtual machine recipes and collect offshore pumps
  const allMachinesList = getAllMachines();
  const allOffshorePumps: Yafc.OffshorePumpInfo[] = [];

  for (const machine of allMachinesList) {
    let recipe: Yafc.RecipeInfo | undefined;
    let subgroupId: string = VIRTUAL_SUBGROUPS.ENERGY;

    switch (machine.type) {
      case 'boiler':
        recipe = parseBoilerRecipe(machine);
        subgroupId = VIRTUAL_SUBGROUPS.BOILER;
        break;
      case 'generator':
        recipe = parseGeneratorRecipe(machine);
        subgroupId = VIRTUAL_SUBGROUPS.GENERATOR;
        break;
      case 'reactor':
        recipe = parseReactorRecipe(machine);
        subgroupId = VIRTUAL_SUBGROUPS.REACTOR;
        break;
      case 'fusion-reactor':
        recipe = parseFusionReactorRecipe(machine);
        subgroupId = VIRTUAL_SUBGROUPS.REACTOR;
        break;
      case 'fusion-generator':
        recipe = parseFusionGeneratorRecipe(machine);
        subgroupId = VIRTUAL_SUBGROUPS.GENERATOR;
        break;
      case 'burner-generator':
        recipe = parseBurnerGeneratorRecipe(machine);
        subgroupId = VIRTUAL_SUBGROUPS.GENERATOR;
        break;
      case 'thruster':
        recipe = parseThrusterRecipe(machine);
        subgroupId = VIRTUAL_SUBGROUPS.THRUSTER;
        break;
      case 'offshore-pump':
        allOffshorePumps.push(machine);
        break;
    }

    if (recipe !== undefined) {
      const order = getEntityOrder(machine.name);
      registerRecipe(recipe, subgroupId, order, subgroupsById, recipeOrderMap);
    }
  }

  // 4. Standard crafting recipes
  for (const [_, proto] of pairs(prototypes.get_recipe_filtered([{ filter: 'hidden', invert: true }]))) {
    const subgroup = proto.subgroup?.name || 'other';
    const standardRecipe = parseStandardRecipe(proto);
    registerRecipe(standardRecipe, subgroup, proto.order || 'z', subgroupsById, recipeOrderMap);
  }

  // 5. Minable ground resources
  for (const [_, proto] of pairs(
    prototypes.get_entity_filtered([
      { filter: 'type', type: 'resource' },
      { filter: 'hidden', invert: true, mode: 'and' },
    ]),
  )) {
    const minableRecipe = parseMinableResourceRecipe(proto);
    if (minableRecipe !== undefined) {
      registerRecipe(minableRecipe, VIRTUAL_SUBGROUPS.MINING, proto.order || 'z', subgroupsById, recipeOrderMap);
    }
  }

  // 6. Offshore pump processes
  if (allOffshorePumps.length > 0) {
    const tileFluids: Record<string, LuaFluidPrototype> = {};
    for (const [_, tileProto] of pairs(prototypes.tile)) {
      if (tileProto.fluid !== undefined) {
        tileFluids[tileProto.fluid.name] = tileProto.fluid;
      }
    }

    for (const [fluidName, fluidProto] of pairs(tileFluids)) {
      const pumpRecipe = parseOffshorePumpRecipe(fluidName, fluidProto, allOffshorePumps);
      registerRecipe(pumpRecipe, VIRTUAL_SUBGROUPS.OFFSHORE_PUMP, fluidProto.order || 'z', subgroupsById, recipeOrderMap);
    }
  }

  // 6. Filter empty groups and sort recipes
  const nonEmptyGroups: Yafc.RecipeGroupInfo[] = [];
  for (const group of groups) {
    const nonEmptySubgroups: Yafc.RecipeSubGroupInfo[] = [];
    for (const sg of group.subgroups) {
      const sgRec = sg.recipes;
      if (sgRec.length > 0) {
        sgRec.sort((a, b) => comparePrototypeOrder(recipeOrderMap[a.name], recipeOrderMap[b.name], a.name, b.name));
        nonEmptySubgroups.push(sg);
      }
    }
    if (nonEmptySubgroups.length > 0) {
      nonEmptySubgroups.sort((a, b) => comparePrototypeOrder(subgroupOrderMap[a.name], subgroupOrderMap[b.name], a.name, b.name));
      group.subgroups = nonEmptySubgroups;
      nonEmptyGroups.push(group);
    }
  }

  nonEmptyGroups.sort((a, b) => comparePrototypeOrder(groupOrderMap[a.name], groupOrderMap[b.name], a.name, b.name));

  for (const g of nonEmptyGroups) {
    recipeGroups.push(g);
    recipeGroupsById[g.name] = g;
  }
}

/** Returns recipes that produce the specified item as an output product. */
export function getRecipesProducingItem(name: string): readonly Yafc.RecipeInfo[] | undefined {
  return recipesByProductItem[name];
}

/** Returns all recipes that produce the specified fluid and temperature. */
export function getRecipesProducingFluid(name: string, temperature?: number): readonly Yafc.RecipeInfo[] {
  const producersSet = new LuaTable<Yafc.RecipeInfo, boolean>();
  collectRecipesProducingFluid(name, producersSet, temperature);
  const result: Yafc.RecipeInfo[] = [];
  for (const [r] of pairs(producersSet)) {
    result.push(r);
  }
  return result;
}

/**
 * Finalizes the RecipeCatalog by synchronizing virtual recipes (boiler, generator, reactor)
 * with their single compatible machine's technology unlock.
 */
export function finalizeRecipeCatalog(): void {
  for (const [_, recipe] of pairs(recipesById)) {
    if (recipe.compatibleMachines.length === 1 && recipe.compatibleMachines[0].length === 1) {
      const m = recipe.compatibleMachines[0][0];
      if (m.technologyName !== undefined && recipe.technologyName === undefined) {
        recipe.technologyName = m.technologyName;
      }
    }
  }
}
