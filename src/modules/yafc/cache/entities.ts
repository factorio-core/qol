import type { LuaEntityPrototype, LuaFluidBoxPrototype, LuaBurnerPrototype } from 'factorio:runtime';
import type { EffectReceiver } from 'factorio:prototype';
import { getQuality, resolveQualityValue, buildQualityMetric } from './quality';
import { comparePrototypeOrder } from './common';
import { DEFAULT_QUALITY_ID } from '../constants';
import { getCompatibleModulesForReceiver } from './modules';
import { parseSpentFluid, getOrCreateFluid, getFuelsByCategory } from './resources';

/** In-memory dictionary of machines keyed by prototype name. */
const machinesById: Record<string, Yafc.MachineInfo> = {};

/** All registered machines in prototype order. */
const allMachines: Yafc.MachineInfo[] = [];

/** Temporary in-memory machines grouped by crafting category name. */
let tempMachinesByCraftingCategory: Record<string, Yafc.CraftingMachineInfo[]> = {};

/** Temporary in-memory mining drills grouped by resource category name. */
let tempMachinesByResourceCategory: Record<string, Yafc.MiningDrillInfo[]> = {};

/** Temporary mapping of entity names to their placing item prototype names. */
let tempEntityPlaceItemMap: Record<string, string> = {};

/** Temporary mapping of entity names to their prototype order strings. */
let tempEntityOrderMap: Record<string, string> = {};

/** In-memory dictionary of beacon transmitters keyed by prototype name. */
const beaconsById: Record<string, Yafc.BeaconInfo> = {};

/** All registered beacon transmitters in prototype order. */
const allBeacons: Yafc.BeaconInfo[] = [];

/** Resolves a crafting machine, drill, boiler, or generator by its name identifier. */
export function getMachine(name: string): Yafc.MachineInfo | undefined {
  return machinesById[name];
}

/** Returns all registered production machines, drills, boilers, and reactors. */
export function getAllMachines(): readonly Yafc.MachineInfo[] {
  return allMachines;
}

/** Resolves a beacon transmitter by its prototype name. */
export function getBeacon(name: string): Yafc.BeaconInfo | undefined {
  return beaconsById[name];
}

/** Returns all registered beacon transmitter structures. */
export function getAllBeacons(): readonly Yafc.BeaconInfo[] {
  return allBeacons;
}

/** Returns the effect receiver prototype configuration of a machine or beacon. */
export function getEffectReceiver(machine: Yafc.BaseMachineInfo | Yafc.BeaconInfo): EffectReceiver | undefined {
  if ('effectReceiver' in machine && machine.effectReceiver !== undefined) {
    return machine.effectReceiver;
  }
  return undefined;
}

/** Returns the base crafting/mining/pumping speed for a machine at the specified quality, or undefined if not applicable. */
export function getMachineBaseSpeed(machine: Yafc.MachineInfo, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): number | undefined {
  if (machine.type === 'crafting-machine' && machine.craftingSpeed !== undefined) {
    return resolveQualityValue(machine.craftingSpeed, quality);
  }
  if (machine.type === 'mining-drill' && machine.miningSpeed !== undefined) {
    return machine.miningSpeed;
  }
  if (machine.type === 'offshore-pump' && machine.pumpingSpeed !== undefined) {
    return resolveQualityValue(machine.pumpingSpeed, quality);
  }
  if (machine.type === 'boiler' && machine.energyUsage !== undefined) {
    const normalPower = resolveQualityValue(machine.energyUsage);
    const qualityPower = resolveQualityValue(machine.energyUsage, quality);
    return qualityPower / normalPower;
  }
  return undefined;
}

/** Returns the maximum energy usage in Watts for a machine or beacon at the specified quality, or undefined if unpowered. */
export function getMachineMaxEnergyUsage(machine: Yafc.BaseMachineInfo | Yafc.BeaconInfo, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): number | undefined {
  return machine.energyUsage !== undefined ? resolveQualityValue(machine.energyUsage, quality) : undefined;
}

/** Returns the maximum energy output rate in Watts at the specified quality, or undefined if not producing power. */
export function getMachineMaxEnergyProduction(machine: Yafc.BaseMachineInfo, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): number | undefined {
  return machine.maxEnergyProduction !== undefined ? resolveQualityValue(machine.maxEnergyProduction, quality) : undefined;
}

/** Returns the effective transmission efficiency of a beacon at the specified quality tier, or undefined. */
export function getBeaconDistributionEffectivity(beacon: Yafc.BeaconInfo, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): number | undefined {
  return beacon.distributionEffectivity !== undefined ? resolveQualityValue(beacon.distributionEffectivity, quality) : undefined;
}

/** Returns the fluid consumption per tick for a generator, fusion generator, or fusion reactor at the specified quality tier, or undefined. */
export function getMachineFluidUsagePerTick(
  machine: Yafc.GeneratorInfo | Yafc.FusionReactorInfo | Yafc.FusionGeneratorInfo,
  quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!,
): number | undefined {
  if (machine.type === 'generator' && machine.fluidUsagePerTick !== undefined) {
    return resolveQualityValue(machine.fluidUsagePerTick, quality);
  }
  if ('maxFluidUsage' in machine && machine.maxFluidUsage !== undefined) {
    return resolveQualityValue(machine.maxFluidUsage, quality);
  }
  return undefined;
}

/** Temporary internal memoized cache for filtered mining drill arrays. */
let tempFilteredDrillsCache: Record<string, readonly Yafc.MiningDrillInfo[]> = {};

/** Frees build-time machine category maps and drill caches from RAM. */
export function clearEntityBuildData(): void {
  tempMachinesByCraftingCategory = {};
  tempMachinesByResourceCategory = {};
  tempFilteredDrillsCache = {};
  tempEntityPlaceItemMap = {};
  tempEntityOrderMap = {};
}

/** Resolves placing item name for an entity during catalog construction. */
export function getEntityPlaceItem(name: string): string | undefined {
  return tempEntityPlaceItemMap[name];
}

/** Resolves prototype order string for an entity during catalog construction. */
export function getEntityOrder(name: string): string {
  return tempEntityOrderMap[name] || 'z';
}

/** Returns compatible crafting machines registered for a specific crafting category. */
export function getMachinesForCraftingCategory(cat: string): readonly Yafc.CraftingMachineInfo[] {
  return tempMachinesByCraftingCategory[cat] || [];
}

/** Returns an immutable cached array of mining drills matching the resource category and fluid I/O constraints. */
export function getFilteredDrills(category: string, requiresFluid: boolean, producesFluid: boolean): readonly Yafc.MiningDrillInfo[] {
  const key = `${category}@${requiresFluid ? '1' : '0'}:${producesFluid ? '1' : '0'}`;
  let list = tempFilteredDrillsCache[key];
  if (list !== undefined) return list;

  const raw = tempMachinesByResourceCategory[category];
  if (raw === undefined || raw.length === 0) {
    list = [];
    tempFilteredDrillsCache[key] = list;
    return list;
  }

  const filtered: Yafc.MiningDrillInfo[] = [];
  for (const drill of raw) {
    if (requiresFluid && !drill.supportsFluidInput) continue;
    if (producesFluid && !drill.supportsFluidOutput) continue;
    filtered.push(drill);
  }

  list = filtered;
  tempFilteredDrillsCache[key] = list;
  return list;
}

/** Inspects a native LuaFluidBoxPrototype to extract fluid filtering and temperature bounds. */
function parseFluidBox(fbProto: LuaFluidBoxPrototype): Yafc.FluidBoxInfo {
  const filterName = fbProto.filter?.name;
  let fluidInfo: Yafc.FluidInfo | undefined;

  if (filterName !== undefined) {
    let temp: number | undefined;
    if (fbProto.minimum_temperature !== undefined) {
      temp = fbProto.minimum_temperature;
    } else if (fbProto.maximum_temperature !== undefined) {
      temp = fbProto.maximum_temperature;
    }
    fluidInfo = getOrCreateFluid(filterName, temp);
  }

  return {
    filter: fluidInfo,
    productionType: fbProto.production_type,
    minimumTemperature: fbProto.minimum_temperature,
    maximumTemperature: fbProto.maximum_temperature,
  };
}

/** Extracts input and output fluidboxes from an entity prototype. */
function getEntityFluidBoxes(proto: LuaEntityPrototype): { inputs: Yafc.FluidBoxInfo[]; outputs: Yafc.FluidBoxInfo[] } {
  const inputs: Yafc.FluidBoxInfo[] = [];
  const outputs: Yafc.FluidBoxInfo[] = [];

  if (proto.fluidbox_prototypes !== undefined) {
    for (const fb of proto.fluidbox_prototypes) {
      const parsed = parseFluidBox(fb);
      let isInput = fb.production_type === 'input' || fb.production_type === 'input-output';
      let isOutput = fb.production_type === 'output' || fb.production_type === 'input-output';

      if (!isInput && !isOutput) {
        let hasExplicitOutput = false;
        let hasExplicitInput = false;
        if (fb.pipe_connections !== undefined && fb.pipe_connections.length > 0) {
          for (const conn of fb.pipe_connections) {
            if (conn.flow_direction === 'output') hasExplicitOutput = true;
            if (conn.flow_direction === 'input') hasExplicitInput = true;
            if (conn.flow_direction === 'input-output') {
              hasExplicitInput = true;
              hasExplicitOutput = true;
            }
          }
        }
        if (hasExplicitInput) isInput = true;
        if (hasExplicitOutput) isOutput = true;

        if (!hasExplicitInput && !hasExplicitOutput) {
          isInput = true;
          isOutput = true;
        }
      }

      if (isInput) {
        inputs.push(parsed);
      }
      if (isOutput) {
        outputs.push(parsed);
      }
    }
  }
  return { inputs, outputs };
}

/** Inspects a native LuaBurnerPrototype to extract burner fuel categories and combustion effectivity. */
function parseBurnerEnergySource(burner: LuaBurnerPrototype): Yafc.BurnerEnergySourceInfo {
  const compatibleFuels: Yafc.ItemInfo[][] = [];

  if (burner.fuel_categories !== undefined) {
    for (const [catName] of pairs(burner.fuel_categories)) {
      const fuelsInCat = getFuelsByCategory(catName);
      if (fuelsInCat !== undefined && fuelsInCat.length > 0) {
        compatibleFuels.push(fuelsInCat as Yafc.ItemInfo[]);
      }
    }
  }

  return {
    type: 'burner',
    effectivity: burner.effectivity,
    compatibleFuels,
  };
}

/** Inspects a native LuaEntityPrototype to extract and normalize its energy source. */
function parseEnergySource(proto: LuaEntityPrototype): Yafc.EnergySourceInfo | undefined {
  const es = proto.electric_energy_source_prototype;
  if (es !== undefined) {
    return {
      type: 'electric',
      drain: es.drain,
    };
  }

  const burnerSource = proto.burner_prototype;
  if (burnerSource != undefined) {
    return parseBurnerEnergySource(burnerSource);
  }

  const fluidSource = proto.fluid_energy_source_prototype;
  if (fluidSource !== undefined) {
    return {
      type: 'fluid',
      effectivity: fluidSource.effectivity,
      burnsFluid: fluidSource.burns_fluid,
      scaleFluidUsage: fluidSource.scale_fluid_usage,
      destroyNonFuelFluid: fluidSource.destroy_non_fuel_fluid,
      fluidUsagePerTick: fluidSource.fluid_usage_per_tick,
      maximumTemperature: fluidSource.maximum_temperature,
      spentFluid: parseSpentFluid(fluidSource.spent_fluid),
    };
  }

  const heatSource = proto.heat_energy_source_prototype;
  if (heatSource !== undefined) {
    return { type: 'heat' };
  }

  const voidSource = proto.void_energy_source_prototype;
  if (voidSource !== undefined) {
    return { type: 'void' };
  }

  return undefined;
}

/** Precomputes module slot capacity for machines and beacons across all qualities. */
function buildModuleInventorySize(proto: LuaEntityPrototype, bonusType: 'crafting-machine' | 'mining-drill' | 'beacon'): Yafc.QualityScaled<number> | undefined {
  const baseSlots = proto.module_inventory_size;
  if (!baseSlots || baseSlots <= 0) {
    return undefined;
  }

  if (!proto.quality_affects_module_slots) {
    return baseSlots;
  }

  const machineBonusOverride = bonusType === 'crafting-machine' ? proto.module_slots_quality_bonus : undefined;

  return buildQualityMetric((q) => {
    const qInfo = getQuality(q);
    let bonus = 0;

    if (bonusType === 'crafting-machine') {
      const entityBonus = machineBonusOverride?.[q];
      if (entityBonus !== undefined) {
        bonus = entityBonus;
      } else if (qInfo?.craftingMachineModuleSlotsBonus !== undefined) {
        bonus = qInfo.craftingMachineModuleSlotsBonus;
      }
    } else if (bonusType === 'mining-drill') {
      if (qInfo?.miningDrillModuleSlotsBonus !== undefined) {
        bonus = qInfo.miningDrillModuleSlotsBonus;
      }
    } else if (bonusType === 'beacon') {
      if (qInfo?.beaconModuleSlotsBonus !== undefined) {
        bonus = qInfo.beaconModuleSlotsBonus;
      }
    }

    return baseSlots + bonus;
  });
}

/** Scans all entity prototypes from the game engine and indexes them into machine and beacon catalogs. */
export function buildEntityCatalog(): void {
  /** Factory creating a normalized base machine record populated with common energy and unlock properties. */
  function createBaseMachine<T extends Yafc.BaseMachineInfo>(proto: LuaEntityPrototype, type: string): T {
    const name = proto.name;
    const energyUsageMetric = buildQualityMetric((q) => proto.get_max_energy_usage(q));
    const energyProdMetric = buildQualityMetric((q) => proto.get_max_energy_production(q));

    return {
      type,
      name,
      localisedName: proto.localised_name,
      energyUsage: energyUsageMetric !== 0 ? energyUsageMetric : undefined,
      maxEnergyProduction: energyProdMetric !== 0 ? energyProdMetric : undefined,
      energySource: parseEnergySource(proto),
      burner: proto.burner_prototype !== undefined ? parseBurnerEnergySource(proto.burner_prototype) : undefined,
    } as unknown as T;
  }

  for (const [_, proto] of pairs(
    prototypes.get_entity_filtered([
      {
        filter: 'type',
        type: [
          'assembling-machine',
          'furnace',
          'rocket-silo',
          'mining-drill',
          'offshore-pump',
          'boiler',
          'generator',
          'burner-generator',
          'reactor',
          'fusion-reactor',
          'fusion-generator',
          'thruster',
          'beacon',
        ],
      },
      { filter: 'hidden', invert: true, mode: 'and' },
    ]),
  )) {
    const name = proto.name;
    const order = proto.order || 'z';
    tempEntityOrderMap[name] = order;

    if (proto.items_to_place_this && proto.items_to_place_this.length > 0) {
      tempEntityPlaceItemMap[name] = proto.items_to_place_this[0].name;
    }

    switch (proto.type) {
      case 'assembling-machine':
      case 'furnace':
      case 'rocket-silo': {
        const m = createBaseMachine<Yafc.CraftingMachineInfo>(proto, 'crafting-machine');
        m.craftingSpeed = buildQualityMetric((q) => proto.get_crafting_speed(q));
        m.moduleInventorySize = buildModuleInventorySize(proto, 'crafting-machine');
        if (proto.module_inventory_size && proto.module_inventory_size > 0) {
          m.compatibleModules = getCompatibleModulesForReceiver(proto.allowed_module_categories, proto.allowed_effects);
        }
        m.effectReceiver = proto.effect_receiver;
        m.fixedQuality = proto.fixed_quality?.name;
        machinesById[name] = m;
        allMachines.push(m);

        if (proto.crafting_categories !== undefined) {
          for (const [cat] of pairs(proto.crafting_categories)) {
            let catList = tempMachinesByCraftingCategory[cat];
            if (!catList) {
              catList = [];
              tempMachinesByCraftingCategory[cat] = catList;
            }
            catList.push(m);
          }
        }
        break;
      }
      case 'mining-drill': {
        const m = createBaseMachine<Yafc.MiningDrillInfo>(proto, 'mining-drill');
        m.miningSpeed = proto.mining_speed;
        m.usesForceMiningProductivityBonus = proto.uses_force_mining_productivity_bonus;
        m.moduleInventorySize = buildModuleInventorySize(proto, 'mining-drill');
        if (proto.module_inventory_size && proto.module_inventory_size > 0) {
          m.compatibleModules = getCompatibleModulesForReceiver(proto.allowed_module_categories, proto.allowed_effects);
        }
        m.effectReceiver = proto.effect_receiver;

        const fb = getEntityFluidBoxes(proto);
        if (fb.inputs.length > 0) m.supportsFluidInput = true;
        if (fb.outputs.length > 0) m.supportsFluidOutput = true;

        // In Factorio, mining drills with fluidboxes (e.g. electric-mining-drill or big-mining-drill)
        // define input_fluid_box for mining fluids like sulfuric acid for uranium ore.
        if (proto.fluidbox_prototypes !== undefined && proto.fluidbox_prototypes.length > 0) {
          for (const box of proto.fluidbox_prototypes) {
            if (box.production_type !== 'output') {
              m.supportsFluidInput = true;
            }
            if (box.production_type === 'output' || box.production_type === 'input-output') {
              m.supportsFluidOutput = true;
            }
          }
        }

        machinesById[name] = m;
        allMachines.push(m);

        if (proto.resource_categories !== undefined) {
          for (const [cat] of pairs(proto.resource_categories)) {
            let catList = tempMachinesByResourceCategory[cat];
            if (!catList) {
              catList = [];
              tempMachinesByResourceCategory[cat] = catList;
            }
            catList.push(m);
          }
        }
        break;
      }
      case 'offshore-pump': {
        const m = createBaseMachine<Yafc.OffshorePumpInfo>(proto, 'offshore-pump');
        m.pumpingSpeed = buildQualityMetric((q) => proto.get_pumping_speed(q));
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'boiler': {
        const m = createBaseMachine<Yafc.BoilerInfo>(proto, 'boiler');
        const fb = getEntityFluidBoxes(proto);
        m.targetTemperature = proto.target_temperature;
        m.boilerMode = proto.boiler_mode;
        m.inputFluidBox = fb.inputs[0];
        m.outputFluidBox = fb.outputs[0];
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'generator': {
        const m = createBaseMachine<Yafc.GeneratorInfo>(proto, 'generator');
        const fb = getEntityFluidBoxes(proto);
        m.maximumTemperature = proto.maximum_temperature;
        m.spentFluid = parseSpentFluid(proto.spent_fluid);
        m.fluidUsagePerTick = buildQualityMetric((q) => proto.get_fluid_usage_per_tick(q));
        m.inputFluidBox = fb.inputs[0];
        m.outputFluidBox = fb.outputs[0];
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'burner-generator': {
        const m = createBaseMachine<Yafc.BurnerGeneratorInfo>(proto, 'burner-generator');
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'reactor': {
        const m = createBaseMachine<Yafc.ReactorInfo>(proto, 'reactor');
        m.neighbourBonus = proto.neighbour_bonus;
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'fusion-reactor': {
        const m = createBaseMachine<Yafc.FusionReactorInfo>(proto, 'fusion-reactor');
        const fb = getEntityFluidBoxes(proto);
        m.neighbourBonus = proto.neighbour_bonus;
        m.maxFluidUsage = buildQualityMetric((q) => proto.get_fluid_usage_per_tick(q));
        m.inputFluidBox = fb.inputs[0];
        m.outputFluidBox = fb.outputs[0];
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'fusion-generator': {
        const m = createBaseMachine<Yafc.FusionGeneratorInfo>(proto, 'fusion-generator');
        const fb = getEntityFluidBoxes(proto);
        m.maxFluidUsage = buildQualityMetric((q) => proto.get_fluid_usage_per_tick(q));
        m.inputFluidBox = fb.inputs[0];
        m.outputFluidBox = fb.outputs[0];
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'thruster': {
        const m = createBaseMachine<Yafc.ThrusterInfo>(proto, 'thruster');
        const fb = getEntityFluidBoxes(proto);
        const maxPerf = proto.max_performance;
        if (maxPerf !== undefined) {
          m.maxFluidUsage = maxPerf.fluid_usage !== undefined ? maxPerf.fluid_usage : undefined;
        }
        m.fuelFluidBox = fb.inputs[0];
        m.oxidizerFluidBox = fb.inputs[1];
        machinesById[name] = m;
        allMachines.push(m);
        break;
      }
      case 'beacon': {
        const b = createBaseMachine<Yafc.BeaconInfo>(proto, 'beacon');
        const baseDistEff = proto.distribution_effectivity;
        const distBonusPerLevel = proto.distribution_effectivity_bonus_per_quality_level;
        let distMetric: Yafc.QualityScaled<number> | undefined;
        if (baseDistEff !== undefined) {
          if (distBonusPerLevel !== undefined && distBonusPerLevel !== 0) {
            distMetric = buildQualityMetric((q) => {
              const qInfo = getQuality(q);
              const level = qInfo?.level !== undefined ? qInfo.level : 0;
              return baseDistEff + distBonusPerLevel * level;
            });
          } else {
            distMetric = baseDistEff;
          }
        }

        b.profile = proto.profile;
        b.beaconCounter = proto.beacon_counter;
        b.distributionEffectivity = distMetric;
        b.moduleInventorySize = buildModuleInventorySize(proto, 'beacon');
        b.compatibleModules = getCompatibleModulesForReceiver(proto.allowed_module_categories, proto.allowed_effects);
        b.effectReceiver = proto.effect_receiver;

        beaconsById[name] = b;
        allBeacons.push(b);
        break;
      }
    }
  }

  // Sort crafting machines and drills by prototype order
  allMachines.sort((a, b) => comparePrototypeOrder(tempEntityOrderMap[a.name], tempEntityOrderMap[b.name], a.name, b.name));

  for (const [_, machineList] of pairs(tempMachinesByCraftingCategory)) {
    machineList.sort((a, b) => comparePrototypeOrder(tempEntityOrderMap[a.name], tempEntityOrderMap[b.name], a.name, b.name));
  }
  for (const [_, machineList] of pairs(tempMachinesByResourceCategory)) {
    machineList.sort((a, b) => comparePrototypeOrder(tempEntityOrderMap[a.name], tempEntityOrderMap[b.name], a.name, b.name));
  }
  allBeacons.sort((a, b) => comparePrototypeOrder(tempEntityOrderMap[a.name], tempEntityOrderMap[b.name], a.name, b.name));
}

/** Calculates total module inventory capacity for an entity at a specific quality level. */
export function getEntityMaxModuleSlots(entity: Yafc.EntityInfo, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): number | undefined {
  if ('moduleInventorySize' in entity && entity.moduleInventorySize !== undefined) {
    return resolveQualityValue(entity.moduleInventorySize, quality);
  }
  return undefined;
}
