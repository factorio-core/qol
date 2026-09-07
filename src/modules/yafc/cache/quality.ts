import type { LuaForce, LuaQualityPrototype } from 'factorio:runtime';
import { areObjectsEqual } from 'fcore/utils/table';
import { DEFAULT_QUALITY_ID } from '../constants';

/** In-memory dictionary of all registered qualities keyed by name. */
const qualitiesById: Record<string, Yafc.QualityInfo> = {};

/** All registered qualities sorted in game unlock order. */
const allQualities: Yafc.QualityInfo[] = [];

/** Resolves a quality-scaled value for a specific target quality tier. */
export function resolveQualityValue<T>(metric: T | Record<string, T> | { readonly [x: string]: T } | undefined, quality: Yafc.QualityInfo = getQuality(DEFAULT_QUALITY_ID)!): T {
  if (typeof metric === 'object' && metric !== null) {
    const record = metric as Record<string, T>;
    const qName = quality.name;
    if (record[qName] !== undefined) {
      return record[qName];
    }
    if (record[DEFAULT_QUALITY_ID] !== undefined) {
      return record[DEFAULT_QUALITY_ID];
    }
  }
  return metric as T;
}

/**
 * Builds a QualityScaled<T> representation across all registered qualities.
 * Compresses uniform metrics into a single primitive value. Returns undefined if returnUndefinedIfScaled is true and all qualities map 1:1.
 */
export function buildQualityMetric<T>(getter: (this: void, qualityName: string) => T | undefined, returnUndefinedIfScaled: boolean = false): Yafc.QualityScaled<T> | undefined {
  const defaultVal = getter(DEFAULT_QUALITY_ID);
  if (defaultVal === undefined) return undefined;

  let isVarying = false;
  let is1to1Scaling = returnUndefinedIfScaled;
  const values: Record<string, T> = {};

  for (const q of allQualities) {
    const val = getter(q.name);
    if (val !== undefined) {
      values[q.name] = val;
      if (!areObjectsEqual(val, defaultVal)) {
        isVarying = true;
      }
      if (returnUndefinedIfScaled && (val as unknown as string) !== q.name) {
        is1to1Scaling = false;
      }
    } else if (returnUndefinedIfScaled) {
      is1to1Scaling = false;
    }
  }

  if (returnUndefinedIfScaled && is1to1Scaling) {
    return undefined;
  }

  return isVarying ? values : defaultVal;
}

/** Populates the in-memory quality catalog following the progression chain from default quality. */
export function buildQualityCatalog(): void {
  let proto: LuaQualityPrototype | undefined = prototypes.quality[DEFAULT_QUALITY_ID];
  let prevInfo: Yafc.QualityInfo | undefined = undefined;

  while (proto !== undefined) {
    const qInfo: Yafc.QualityInfo = {
      name: proto.name,
      level: proto.level,
      localisedName: proto.localised_name,
      nextProbability: proto.next_probability,
      chainProbability: proto.chain_probability,
      craftingMachineModuleSlotsBonus: proto.crafting_machine_module_slots_bonus,
      miningDrillModuleSlotsBonus: proto.mining_drill_module_slots_bonus,
      beaconModuleSlotsBonus: proto.beacon_module_slots_bonus,
    };

    if (prevInfo !== undefined) {
      prevInfo.next = qInfo;
    }

    qualitiesById[proto.name] = qInfo;
    allQualities.push(qInfo);

    prevInfo = qInfo;
    proto = proto.next;
  }
}

/** Resolves a registered quality tier descriptor by its prototype name. */
export function getQuality(name: string): Yafc.QualityInfo | undefined {
  return qualitiesById[name];
}

/** Returns all registered qualities sorted in game unlock order. */
export function getAllQualities(): readonly Yafc.QualityInfo[] {
  return allQualities;
}

/** Checks if a quality tier is researched and unlocked for the given force. */
export function isQualityUnlocked(force: LuaForce, quality: Yafc.QualityInfo): boolean {
  if (quality.name === DEFAULT_QUALITY_ID) {
    return true;
  }
  return force.is_quality_unlocked(quality.name) as unknown as boolean;
}
