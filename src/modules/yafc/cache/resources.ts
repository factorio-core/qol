import { IGNORED_ITEM_GROUPS_SET, CAPTIONS, VIRTUAL_GROUP, VIRTUAL_GROUP_ORDER, VIRTUAL_SUBGROUPS, VIRTUAL_SUBGROUP_ORDERS } from '../constants';
import { comparePrototypeOrder } from './common';
import type { SpentFluidSpecification, SpritePath } from 'factorio:runtime';

/** Checks if a string contains the given substring without pattern matching. */
function containsSubstring(str: string | undefined, substr: string): boolean {
  if (!str) return false;
  const [pos] = string.find(str, substr, 1, true);
  return pos !== undefined;
}

/** Singleton flow instance representing thermal energy in Joules. */
const heat: Yafc.HeatInfo = {
  type: 'heat',
  name: 'heat',
  lowerName: 'heat',
  sprite: 'yafc_heat',
  localisedName: CAPTIONS.HEAT,
};

/** Singleton flow instance representing electrical power in Watts. */
const electricity: Yafc.ElectricityInfo = {
  type: 'electricity',
  name: 'electricity',
  lowerName: 'electricity',
  sprite: 'yafc_electricity',
  localisedName: CAPTIONS.ELECTRICITY,
};

/** In-memory items indexed by prototype name. */
const items: Record<string, Yafc.ItemInfo> = {};

/** In-memory base fluids indexed by prototype name. */
const baseFluids: Record<string, Yafc.BaseFluidInfo> = {};

/** In-memory fluid variants grouped by fluid name. */
const fluidsByName: Record<string, Yafc.FluidInfo[]> = {};

/** In-memory discrete fluid instances indexed by name@temperature. */
const fluidsByTemperature: Record<string, Yafc.FluidInfo> = {};

/** In-memory resource UI groups. */
const resourceGroups: Yafc.ResourceGroupInfo[] = [];

/** In-memory resource UI groups indexed by name. */
const resourceGroupsById: Record<string, Yafc.ResourceGroupInfo> = {};

/** Temporary lookup map of resource subgroups used during initial catalog construction. */
let tempResourceSubgroupsById: Record<string, Yafc.ResourceSubGroupInfo> | undefined;

/** Temporary lookup map of fluid subgroup names used during initial catalog construction. */
let tempFluidSubgroupMap: Record<string, string> | undefined;

/** Temporary prototype order map for resources. */
let tempResourceOrderMap: Record<string, string> | undefined;

/** Temporary prototype order map for resource groups. */
let tempGroupOrderMap: Record<string, string> | undefined;

/** Temporary prototype order map for resource subgroups. */
let tempSubgroupOrderMap: Record<string, string> | undefined;

/** Temporary list of all initialized resource groups before final non-empty filtering. */
let tempAllGroups: Yafc.ResourceGroupInfo[] | undefined;

/** In-memory fuel items grouped by burner fuel category. */
const fuelItemsByCategory: Record<string, Yafc.ItemInfo[]> = {};

/** In-memory fluid fuels. */
const fuelFluids: Yafc.FluidInfo[] = [];

/** Returns prototype name identifier for any resource type. */
export function getResourceName(resource: Yafc.ResourceInfo): string {
  if (resource.type === 'fluid') {
    return resource.base.name;
  }
  return resource.name;
}

/** Returns pre-lowercased prototype name identifier for search. */
export function getResourceLowerName(resource: Yafc.ResourceInfo): string {
  if (resource.type === 'fluid') {
    return resource.base.lowerName;
  }
  return resource.lowerName;
}

/** Returns Factorio sprite path for a given resource. */
export function getResourceSprite(resource: Yafc.ResourceInfo): SpritePath {
  if (resource.type === 'fluid') {
    return resource.base.sprite;
  }
  return resource.sprite;
}

/** Returns fluid temperature in °C if resource is a fluid, otherwise undefined. */
export function getResourceTemperature(resource: Yafc.ResourceInfo): number | undefined {
  if (resource.type === 'fluid') {
    return resource.temperature;
  }
  return undefined;
}

/** Checks if two resource instances represent the exact same item, fluid, heat, or electricity. */
export function areResourcesEqual(a: Yafc.ResourceInfo, b: Yafc.ResourceInfo): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;
  if (a.type === 'fluid' && b.type === 'fluid') {
    return a.base.name === b.base.name && a.temperature === b.temperature;
  }
  if (a.type === 'item' && b.type === 'item') {
    return a.name === b.name;
  }
  return a.type === b.type;
}

/** Frees build-time subgroup maps and order caches from RAM. */
export function clearResourceBuildData(): void {
  tempResourceSubgroupsById = undefined;
  tempFluidSubgroupMap = undefined;
  tempResourceOrderMap = undefined;
  tempGroupOrderMap = undefined;
  tempSubgroupOrderMap = undefined;
  tempAllGroups = undefined;
}

/** Factory and cache for discrete FluidInfo instances. */
export function getOrCreateFluid(name: string, temperature?: number): Yafc.FluidInfo {
  const base = baseFluids[name];
  if (!base) {
    error(`Unknown fluid prototype: ${name}`);
  }

  const targetTemp = temperature !== undefined ? temperature : base.defaultTemperature;
  const tempKey = `${name}@${targetTemp}`;

  const existing = fluidsByTemperature[tempKey];
  if (existing !== undefined) {
    return existing;
  }

  const newFluid: Yafc.FluidInfo = {
    type: 'fluid',
    base,
    temperature: targetTemp,
  };

  fluidsByTemperature[tempKey] = newFluid;

  let variants = fluidsByName[name];
  if (!variants) {
    variants = [];
    fluidsByName[name] = variants;
  }
  variants.push(newFluid);
  if (variants.length > 1) {
    variants.sort((a, b) => a.temperature - b.temperature);
  }

  const sgName = tempFluidSubgroupMap?.[name];
  if (sgName !== undefined) {
    const sg = tempResourceSubgroupsById?.[sgName];
    if (sg !== undefined) {
      sg.resources.push(newFluid);
    }
  }

  return newFluid;
}

/** Resolves discrete fluid variants that fall within the specified temperature range. */
export function getCompatibleFluids(fluidName: string, minTemperature?: number, maxTemperature?: number): readonly Yafc.FluidInfo[] {
  const variants = fluidsByName[fluidName];
  if (!variants || variants.length === 0) return [];
  if (minTemperature === undefined && maxTemperature === undefined) return variants;

  const result: Yafc.FluidInfo[] = [];
  for (const fluid of variants) {
    if (minTemperature !== undefined && fluid.temperature < minTemperature) continue;
    if (maxTemperature !== undefined && fluid.temperature > maxTemperature) continue;
    result.push(fluid);
  }
  return result;
}

/** Resolves an item resource descriptor by prototype name. */
export function getItem(name: string): Yafc.ItemInfo | undefined {
  return items[name];
}

/** Resolves a fluid resource at a specific discrete operating temperature. */
export function getFluid(name: string, temperature?: number): Yafc.FluidInfo | undefined {
  return getOrCreateFluid(name, temperature);
}

/** Resolves the base prototype descriptor of a fluid. */
export function getFluidBase(name: string): Yafc.BaseFluidInfo | undefined {
  return baseFluids[name];
}

/** Returns the global thermal energy resource unit. */
export function getHeat(): Yafc.HeatInfo {
  return heat;
}

/** Returns the global electrical energy resource unit. */
export function getElectricity(): Yafc.ElectricityInfo {
  return electricity;
}

/** Returns all combustible item fuels registered under the specified fuel category. */
export function getFuelsByCategory(category: string): readonly Yafc.ItemInfo[] {
  return fuelItemsByCategory[category] || [];
}

/** Returns all combustible fluid fuels. */
export function getFluidFuels(): readonly Yafc.FluidInfo[] {
  return fuelFluids;
}

/** Resolves a resource prototype by type, name, and optional temperature. */
export function getResource(type: Yafc.ResourceType, name: string, temperature?: number): Yafc.ResourceInfo | undefined {
  if (type === 'item') {
    return items[name];
  }
  if (type === 'fluid') {
    return getOrCreateFluid(name, temperature);
  }
  if (type === 'heat') {
    return heat;
  }
  if (type === 'electricity') {
    return electricity;
  }
  return undefined;
}

/** Resolves a combustible fuel resource (item or fluid) by name and type. */
export function getFuel(name: string, type: 'item' | 'fluid' = 'item', temperature?: number): Yafc.FuelResource | undefined {
  if (type === 'item') {
    const itemFuel = items[name];
    if (itemFuel !== undefined && itemFuel.fuelValue !== undefined && itemFuel.fuelValue > 0) {
      return itemFuel;
    }
    return undefined;
  }
  const baseFluid = baseFluids[name];
  if (baseFluid !== undefined && baseFluid.fuelValue !== undefined && baseFluid.fuelValue > 0) {
    return getOrCreateFluid(name, temperature);
  }
  return undefined;
}

/** Parses spent fluid output info from a prototype. */
export function parseSpentFluid(spentFluid: SpentFluidSpecification | undefined): Yafc.SpentFluidInfo | undefined {
  if (spentFluid === undefined || spentFluid.name === undefined) return undefined;
  const base = baseFluids[spentFluid.name];
  if (!base) return undefined;

  const fluidInfo = getOrCreateFluid(spentFluid.name, spentFluid.temperature);

  return {
    fluid: fluidInfo,
    amount: spentFluid.amount,
  };
}

/** Returns all top-level resource UI group nodes. */
export function getResourceGroups(): readonly Yafc.ResourceGroupInfo[] {
  return resourceGroups;
}

/** Queries and filters resources, returning non-empty arrays grouped by subgroup. */
export function getResourceSubgroups(filter: Yafc.ResourceFilter = {}): readonly (readonly Yafc.ResourceInfo[])[] {
  const { type, group = 'all', search, matcher } = filter;

  const hasSearch = (search !== undefined && search.trim().length > 0) || matcher !== undefined;
  const searchQuery = search !== undefined ? search.toLowerCase().trim() : '';

  const targetGroups: readonly Yafc.ResourceGroupInfo[] = group === 'all' ? resourceGroups : resourceGroupsById[group] !== undefined ? [resourceGroupsById[group]] : [];

  const result: (readonly Yafc.ResourceInfo[])[] = [];

  for (const g of targetGroups) {
    for (const sg of g.subgroups) {
      let matchedInSubgroup: Yafc.ResourceInfo[] | undefined;

      for (const res of sg.resources) {
        if (type !== undefined && res.type !== type) {
          continue;
        }

        if (hasSearch) {
          const resLowerName = getResourceLowerName(res);
          const isMatch = matcher !== undefined ? matcher(resLowerName, res.type) : containsSubstring(resLowerName, searchQuery);
          if (!isMatch) {
            continue;
          }
        }

        if (!matchedInSubgroup) matchedInSubgroup = [];
        matchedInSubgroup.push(res);
      }

      if (matchedInSubgroup !== undefined && matchedInSubgroup.length > 0) {
        result.push(matchedInSubgroup);
      }
    }
  }

  return result;
}

/** Scans all item, fluid, and fuel prototypes to construct ResourceCatalog in-place. */
export function buildResourceCatalog(): void {
  const resourceOrderMap: Record<string, string> = {};
  const groupOrderMap: Record<string, string> = {};
  const subgroupOrderMap: Record<string, string> = {};
  const subgroupsById: Record<string, Yafc.ResourceSubGroupInfo> = {};
  const fuelCategories: string[] = [];
  const groups: Yafc.ResourceGroupInfo[] = [];

  // 1. Index item groups
  for (const [name, proto] of pairs(prototypes.item_group)) {
    if (IGNORED_ITEM_GROUPS_SET[name]) continue;
    groupOrderMap[name] = proto.order || 'z';
    const groupObj: Yafc.ResourceGroupInfo = {
      name,
      localisedName: proto.localised_name || ['item-group-name.' + name],
      sprite: `item-group/${name}`,
      subgroups: [],
    };
    groups.push(groupObj);
    resourceGroupsById[name] = groupObj;
  }

  // Ensure virtual YAFC group for virtual resources
  if (!resourceGroupsById[VIRTUAL_GROUP.YAFC]) {
    const yafcGroupObj: Yafc.ResourceGroupInfo = {
      name: VIRTUAL_GROUP.YAFC,
      localisedName: CAPTIONS.YAFC_GROUP_TITLE,
      sprite: 'yafc_logo',
      subgroups: [],
    };
    groups.push(yafcGroupObj);
    resourceGroupsById[VIRTUAL_GROUP.YAFC] = yafcGroupObj;
    groupOrderMap[VIRTUAL_GROUP.YAFC] = VIRTUAL_GROUP_ORDER;
  }

  // 2. Index item subgroups
  for (const [name, proto] of pairs(prototypes.item_subgroup)) {
    const group = resourceGroupsById[proto.group.name];
    if (group !== undefined) {
      subgroupOrderMap[name] = proto.order || 'z';
      const subgroupObj: Yafc.ResourceSubGroupInfo = {
        name,
        resources: [],
      };
      group.subgroups.push(subgroupObj);
      subgroupsById[name] = subgroupObj;
    }
  }

  // Ensure virtual energy subgroup for heat and electricity
  if (!subgroupsById[VIRTUAL_SUBGROUPS.ENERGY]) {
    const energySgObj: Yafc.ResourceSubGroupInfo = {
      name: VIRTUAL_SUBGROUPS.ENERGY,
      resources: [heat, electricity],
    };
    resourceGroupsById[VIRTUAL_GROUP.YAFC].subgroups.push(energySgObj);
    subgroupsById[VIRTUAL_SUBGROUPS.ENERGY] = energySgObj;
    subgroupOrderMap[VIRTUAL_SUBGROUPS.ENERGY] = VIRTUAL_SUBGROUP_ORDERS[VIRTUAL_SUBGROUPS.ENERGY] || 'g';
  }

  tempResourceSubgroupsById = subgroupsById;
  tempResourceOrderMap = resourceOrderMap;
  tempFluidSubgroupMap = {};
  tempGroupOrderMap = groupOrderMap;
  tempSubgroupOrderMap = subgroupOrderMap;
  tempAllGroups = groups;

  const burntResultPending: { item: Yafc.ItemInfo; burntName: string }[] = [];

  // 3. Scan and collect physical items
  for (const [_, proto] of pairs(
    prototypes.get_item_filtered([
      { filter: 'hidden', invert: true },
      { filter: 'flag', flag: 'spawnable', invert: true, mode: 'and' },
    ]),
  )) {
    const groupId = proto.group.name;
    if (IGNORED_ITEM_GROUPS_SET[groupId]) continue;

    const name = proto.name;
    const order = proto.order || 'z';
    resourceOrderMap[name] = order;

    const itemObj: Yafc.ItemInfo = {
      type: 'item',
      name,
      lowerName: string.lower(name),
      sprite: `item/${name}`,
      fuelValue: proto.fuel_value,
      localisedName: proto.localised_name || ['item-name.' + name],
    };

    items[name] = itemObj;

    const subgroup = subgroupsById[proto.subgroup.name];
    if (subgroup !== undefined) {
      subgroup.resources.push(itemObj);
    }

    if (proto.fuel_value && proto.fuel_value > 0 && proto.fuel_category !== undefined) {
      const cat = proto.fuel_category;
      let catList = fuelItemsByCategory[cat];
      if (!catList) {
        catList = [];
        fuelItemsByCategory[cat] = catList;
        fuelCategories.push(cat);
      }
      catList.push(itemObj);

      if (proto.burnt_result !== undefined) {
        burntResultPending.push({ item: itemObj, burntName: proto.burnt_result.name });
      }
    }
  }

  // Resolve burnt results for fuel items
  for (const entry of burntResultPending) {
    entry.item.burntResult = items[entry.burntName];
  }

  const spentFluidPending: { baseFluid: Yafc.BaseFluidInfo; spent: SpentFluidSpecification }[] = [];

  // 4. Scan and collect base fluids
  for (const [_, proto] of pairs(prototypes.get_fluid_filtered([{ filter: 'hidden', invert: true }]))) {
    const groupId = proto.group.name;
    if (IGNORED_ITEM_GROUPS_SET[groupId]) continue;

    const name = proto.name;
    const order = proto.order || 'z';
    resourceOrderMap[name] = order;
    tempFluidSubgroupMap[name] = proto.subgroup.name;

    const defaultTemp = proto.default_temperature;
    const baseFluidObj: Yafc.BaseFluidInfo = {
      name,
      lowerName: string.lower(name),
      sprite: `fluid/${name}`,
      defaultTemperature: defaultTemp,
      heatCapacity: proto.heat_capacity,
      fuelValue: proto.fuel_value,
      localisedName: proto.localised_name || ['fluid-name.' + name],
    };

    baseFluids[name] = baseFluidObj;

    // Instantiating the default fluid automatically registers it into its UI subgroup
    const defaultFluidInstance = getOrCreateFluid(name, defaultTemp);

    if (proto.fuel_value && proto.fuel_value > 0) {
      fuelFluids.push(defaultFluidInstance);

      if (proto.spent_fluid !== undefined) {
        spentFluidPending.push({ baseFluid: baseFluidObj, spent: proto.spent_fluid });
      }
    }
  }

  // Resolve spent fluids for fluid fuels
  for (const entry of spentFluidPending) {
    entry.baseFluid.spentFluid = parseSpentFluid(entry.spent);
  }

  // 5. Sort fuel categories and fluid fuels by fuelValue (ascending)
  for (const cat of fuelCategories) {
    fuelItemsByCategory[cat]?.sort((a, b) => (a.fuelValue || 0) - (b.fuelValue || 0));
  }
  fuelFluids.sort((a, b) => (a.base.fuelValue || 0) - (b.base.fuelValue || 0));
}

/**
 * Finalizes the ResourceCatalog after all standard and virtual recipes have registered discrete fluid temperatures.
 * Sorts resources within subgroups, filters empty subgroups/groups, and sorts groups by prototype order.
 */
export function finalizeResourceCatalog(): void {
  const nonEmptyGroups: Yafc.ResourceGroupInfo[] = [];

  for (const group of tempAllGroups || []) {
    const nonEmptySubgroups: Yafc.ResourceSubGroupInfo[] = [];
    for (const sg of group.subgroups) {
      const sgRes = sg.resources;
      if (sgRes.length > 0) {
        sgRes.sort((a, b) => {
          const aName = getResourceName(a);
          const bName = getResourceName(b);
          if (aName !== bName) {
            const aOrder = tempResourceOrderMap?.[aName] || 'z';
            const bOrder = tempResourceOrderMap?.[bName] || 'z';
            return comparePrototypeOrder(aOrder, bOrder, aName, bName);
          }
          const aTemp = a.type === 'fluid' ? a.temperature : 0;
          const bTemp = b.type === 'fluid' ? b.temperature : 0;
          return aTemp - bTemp;
        });
        nonEmptySubgroups.push(sg);
      }
    }
    if (nonEmptySubgroups.length > 0) {
      nonEmptySubgroups.sort((a, b) => comparePrototypeOrder(tempSubgroupOrderMap?.[a.name], tempSubgroupOrderMap?.[b.name], a.name, b.name));
      group.subgroups = nonEmptySubgroups;
      nonEmptyGroups.push(group);
    }
  }

  nonEmptyGroups.sort((a, b) => comparePrototypeOrder(tempGroupOrderMap?.[a.name], tempGroupOrderMap?.[b.name], a.name, b.name));

  for (const g of nonEmptyGroups) {
    resourceGroups.push(g);
    resourceGroupsById[g.name] = g;
  }
}
