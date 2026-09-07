import type { LuaForce } from 'factorio:runtime';
import * as Cache from '../cache';
import { DEFAULT_QUALITY_ID } from '../constants';
import { calculateBurnerFuelConsumption } from '../utils/physics';

/**
 * Calculates probabilistic quality distribution for a product based on quality bonuses.
 * Simulates Factorio 2.0 quality upgrade rolls across sequential quality tiers:
 * - baseProb: chance to stay at current quality.
 * - upgradeChance: chance to roll into next quality tier.
 * - chainProb: chance to keep upgrading to higher tiers.
 */
function getQualityProbabilities(baseQuality: Yafc.QualityInfo, qualityBonus: number): { quality: Yafc.QualityInfo; prob: number }[] {
  if (baseQuality.next === undefined) {
    return [{ quality: baseQuality, prob: 1.0 }];
  }

  const upgradeChance = Math.min(1.0, qualityBonus * baseQuality.nextProbability);
  const baseProb = Math.max(0, 1.0 - upgradeChance);

  const result: { quality: Yafc.QualityInfo; prob: number }[] = [];
  result.push({ quality: baseQuality, prob: baseProb });

  let remUpgrade = upgradeChance;
  let current: Yafc.QualityInfo | undefined = baseQuality.next;

  while (current !== undefined) {
    if (current.next === undefined) {
      result.push({ quality: current, prob: remUpgrade });
      break;
    } else {
      const chainProb = current.chainProbability;
      const stayProb = remUpgrade * Math.max(0, 1.0 - chainProb);
      result.push({ quality: current, prob: stayProb });
      remUpgrade = remUpgrade * chainProb;
      current = current.next;
    }
  }
  return result;
}

/**
 * Computes the normalized SolvedRecipeResult for a single machine (N = 1).
 *
 * Calculates:
 * 1. Base crafting speed & power scaled by machine quality tier.
 * 2. Additive effects from internal modules & external beacons (with profile efficiency).
 * 3. Effective craft time: duration / (craftingSpeed * speedMultiplier).
 * 4. Product output flows scaled by productivity and quality probabilities.
 * 5. Ingredient input flows.
 * 6. Burner fuel consumption and spent byproduct generation (if burner).
 */
export function calculateMachineStats(recipe: Yafc.RecipeConfig, force: LuaForce): Yafc.SolvedRecipeResult {
  const recipeInfo = Cache.getRecipe(recipe.recipeName)!;
  const machine = Cache.getMachine(recipe.machine.name)!;

  // 1. Base machine ratings scaled by quality
  const machineQuality = Cache.getQuality(recipe.machine.quality || DEFAULT_QUALITY_ID)!;
  const recipeQuality = Cache.getQuality(recipe.recipeQuality || DEFAULT_QUALITY_ID)!;
  const isModuleAllowed = Cache.isModuleAllowedForRecipe(machine, recipeInfo, machineQuality);
  const isBeaconAllowed = Cache.isBeaconAllowedForRecipe(machine, recipeInfo);
  const baseCraftingSpeed = Cache.getMachineBaseSpeed(machine, machineQuality) || 1.0;

  // maxEnergyUsage is in Joules per tick (J/tick), convert to Watts: (J/tick * 60)
  const maxEnergyUsage = Cache.getMachineMaxEnergyUsage(machine, machineQuality);
  const basePowerWatts = maxEnergyUsage !== undefined ? maxEnergyUsage * 60 : 0;

  // 2. Base machine effect receiver properties
  const receiver = Cache.getEffectReceiver(machine);
  const be = receiver?.base_effect;
  const baseSpeed = be?.speed ?? 0;
  const baseProd = be?.productivity ?? 0;
  const baseConsumption = be?.consumption ?? 0;
  const baseQuality = be?.quality ?? 0;

  // 3. Internal modules in machine
  let modSpeed = 0;
  let modProd = 0;
  let modConsumption = 0;
  let modQuality = 0;

  const canUseModules = receiver?.uses_module_effects !== false;
  if (canUseModules && recipe.machine.modules !== undefined) {
    for (const modEntry of recipe.machine.modules) {
      const modInfo = Cache.getModule(modEntry.name);
      if (modInfo === undefined) continue;
      const count = modEntry.count;
      const mQuality = Cache.getQuality(modEntry.quality || DEFAULT_QUALITY_ID)!;
      const eff = Cache.getModuleEffects(modInfo, mQuality);

      if (eff.speed !== undefined) modSpeed += eff.speed * count;
      if (eff.productivity !== undefined) modProd += eff.productivity * count;
      if (eff.consumption !== undefined) modConsumption += eff.consumption * count;
      if (eff.quality !== undefined) modQuality += eff.quality * count;
    }
  }

  // 4. External beacons affecting the machine (with Factorio 2.0 transmission profiles)
  let beaconSpeed = 0;
  let beaconProd = 0;
  let beaconConsumption = 0;
  let beaconQuality = 0;

  const canUseBeacons = receiver?.uses_beacon_effects !== false;
  const beacons = recipe.machine.beacons;
  if (canUseBeacons && beacons !== undefined && beacons.length > 0) {
    for (const beacon of beacons) {
      if (beacon.count > 0 && beacon.modules && beacon.modules.length > 0) {
        const beaconInfo = Cache.getBeacon(beacon.name);
        if (beaconInfo === undefined) continue;
        const beaconCount = beacon.count;
        const bQuality = Cache.getQuality(beacon.quality || DEFAULT_QUALITY_ID)!;
        const distEff = Cache.getBeaconDistributionEffectivity(beaconInfo, bQuality);
        const distributionEffectivity = distEff !== undefined ? distEff : 0;

        // Factorio 2.0 diminishing returns profile
        let profileEfficiency = 1.0;
        if (beaconInfo.profile !== undefined && beaconInfo.profile.length > 0) {
          const idx = Math.min(beaconCount, beaconInfo.profile.length) - 1;
          profileEfficiency = beaconInfo.profile[idx] !== undefined ? beaconInfo.profile[idx] : 1.0 / Math.sqrt(beaconCount);
        }

        const baseBeaconFactor = beaconCount * profileEfficiency * distributionEffectivity;

        for (const modEntry of beacon.modules) {
          const modInfo = Cache.getModule(modEntry.name);
          if (modInfo === undefined) continue;
          const modCount = modEntry.count;
          const totalFactor = baseBeaconFactor * modCount;
          const bModQuality = Cache.getQuality(modEntry.quality || DEFAULT_QUALITY_ID)!;
          const eff = Cache.getModuleEffects(modInfo, bModQuality);

          if (eff.speed !== undefined) beaconSpeed += eff.speed * totalFactor;
          if (eff.productivity !== undefined) beaconProd += eff.productivity * totalFactor;
          if (eff.consumption !== undefined) beaconConsumption += eff.consumption * totalFactor;
          if (eff.quality !== undefined) beaconQuality += eff.quality * totalFactor;
        }
      }
    }
  }

  // 5. Compute clamped effects and limits
  // --- Speed ---
  const rawSpeed = baseSpeed + modSpeed + beaconSpeed;
  const speedLimits = receiver?.speed_limits;
  const speedLow = speedLimits?.low !== undefined ? speedLimits.low : -0.8;
  const speedHigh = speedLimits?.high !== undefined ? speedLimits.high : 1000;
  const clampedSpeed = Math.min(speedHigh, Math.max(speedLow, rawSpeed));
  const isSpeedCapped = rawSpeed > speedHigh || rawSpeed < speedLow;
  const speedStat: Yafc.RecipeEffectStat = {
    value: clampedSpeed,
    base: baseSpeed,
    fromModules: modSpeed,
    fromBeacons: beaconSpeed,
    max: speedHigh < 1000 ? speedHigh : undefined,
    min: speedLow > -0.8 ? speedLow : undefined,
    isCapped: isSpeedCapped ? true : undefined,
  };

  // --- Productivity ---
  const rawEffectProd = baseProd + modProd + beaconProd;
  const prodLimits = receiver?.productivity_limits;
  const prodLow = prodLimits?.low !== undefined ? prodLimits.low : -0.8;
  const prodHigh = prodLimits?.high !== undefined ? prodLimits.high : 1000;
  const clampedEffectProd = Math.min(prodHigh, Math.max(prodLow, rawEffectProd));

  let researchProd = 0;
  if (machine.type === 'mining-drill' && machine.usesForceMiningProductivityBonus !== false) {
    researchProd = force.mining_drill_productivity_bonus;
  } else if (force.recipes[recipe.recipeName] !== undefined) {
    researchProd = force.recipes[recipe.recipeName].productivity_bonus;
  }

  const rawTotalProd = Math.max(0, clampedEffectProd + researchProd);
  const maxRecipeProd = recipeInfo.maximumProductivity;
  let finalProd = rawTotalProd;
  let isProdCapped = false;
  if (prodHigh < 1000 && rawEffectProd >= prodHigh) {
    isProdCapped = true;
  }
  if (maxRecipeProd !== undefined && finalProd >= maxRecipeProd) {
    finalProd = maxRecipeProd;
    isProdCapped = true;
  }

  const effectiveMaxProd = prodHigh < 1000 && maxRecipeProd !== undefined ? Math.min(prodHigh, maxRecipeProd) : prodHigh < 1000 ? prodHigh : maxRecipeProd;

  const prodStat: Yafc.RecipeEffectStat = {
    value: finalProd,
    base: baseProd,
    fromModules: modProd,
    fromBeacons: beaconProd,
    fromResearch: researchProd > 0 ? researchProd : undefined,
    max: effectiveMaxProd,
    min: prodLow > -0.8 ? prodLow : undefined,
    isCapped: isProdCapped ? true : undefined,
  };

  // --- Consumption ---
  const rawConsumption = baseConsumption + modConsumption + beaconConsumption;
  const consLimits = receiver?.consumption_limits;
  const consLow = consLimits?.low !== undefined ? consLimits.low : -0.8;
  const consHigh = consLimits?.high !== undefined ? consLimits.high : 1000;
  const clampedConsumption = Math.min(consHigh, Math.max(consLow, rawConsumption));
  const isConsCapped = rawConsumption > consHigh || rawConsumption < consLow;
  const consStat: Yafc.RecipeEffectStat = {
    value: clampedConsumption,
    base: baseConsumption,
    fromModules: modConsumption,
    fromBeacons: beaconConsumption,
    max: consHigh < 1000 ? consHigh : undefined,
    min: consLow > -0.8 ? consLow : undefined,
    isCapped: isConsCapped ? true : undefined,
  };

  // --- Quality ---
  const rawQuality = baseQuality + modQuality + beaconQuality;
  const qualityLimits = receiver?.quality_limits;
  const qualityLow = qualityLimits?.low !== undefined ? qualityLimits.low : 0;
  const qualityHigh = qualityLimits?.high !== undefined ? qualityLimits.high : 1000;
  const clampedQuality = Math.min(qualityHigh, Math.max(qualityLow, rawQuality));
  const isQualityCapped = rawQuality > qualityHigh || rawQuality < qualityLow;
  const qualityStat: Yafc.RecipeEffectStat = {
    value: clampedQuality,
    base: baseQuality,
    fromModules: modQuality,
    fromBeacons: beaconQuality,
    max: qualityHigh < 1000 ? qualityHigh : undefined,
    min: qualityLow > 0 ? qualityLow : undefined,
    isCapped: isQualityCapped ? true : undefined,
  };

  const effects: Yafc.SolvedRecipeEffects = {
    speed: speedStat,
    productivity: prodStat,
    consumption: consStat,
    quality: qualityStat,
  };

  // 6. Compute effective craft speed & cycle times
  const finalSpeedMultiplier = Math.max(0.0001, 1.0 + clampedSpeed);
  const finalProductivityMultiplier = 1.0 + finalProd;
  const finalConsumptionMultiplier = Math.max(0.0001, 1.0 + clampedConsumption);

  const energyTimeSec = recipeInfo.energy > 0 ? recipeInfo.energy : 1.0;
  const effectiveCraftTime = energyTimeSec / (baseCraftingSpeed * finalSpeedMultiplier);
  const craftsPerSecondPerMachine = 1.0 / Math.max(0.0001, effectiveCraftTime);

  const outputFlows: Yafc.RecipeOutputFlow[] = [];
  const inputFlows: Yafc.RecipeInputFlow[] = [];

  // 7. Output products (scaled by productivity & quality distribution)
  for (const prod of recipeInfo.products) {
    const isIgnored = prod.ignoredByProductivity === true;
    const prodMultiplier = isIgnored ? 1.0 : finalProductivityMultiplier;
    const baseEffectiveQuality = Cache.getResourceEffectiveQuality(prod, recipeQuality);

    if (prod.resource.type === 'item' && clampedQuality > 0) {
      const distributions = getQualityProbabilities(baseEffectiveQuality, clampedQuality);
      for (const dist of distributions) {
        const amount = prod.amount * prodMultiplier * dist.prob;
        outputFlows.push({
          product: prod,
          quality: dist.quality,
          amount,
          rate: amount * craftsPerSecondPerMachine,
        });
      }
    } else {
      const amount = prod.amount * prodMultiplier;
      outputFlows.push({
        product: prod,
        quality: baseEffectiveQuality,
        amount,
        rate: amount * craftsPerSecondPerMachine,
      });
    }
  }

  // 8. Input ingredients consumed per craft (deduplicated at cache build time)
  for (const ing of recipeInfo.ingredients) {
    const ingQuality = Cache.getResourceEffectiveQuality(ing, recipeQuality);
    inputFlows.push({
      ingredient: ing,
      quality: ingQuality,
      amount: ing.amount,
      rate: ing.amount * craftsPerSecondPerMachine,
    });
  }

  const actualPowerWatts = basePowerWatts * finalConsumptionMultiplier;
  const energyInfo = machine.energySource;

  let fuelResource: Yafc.FuelResource | undefined = undefined;
  let fuelPerCraft: number | undefined = undefined;
  let fuelPerSecondPerMachine: number | undefined = undefined;

  const burnerInfo = machine.burner !== undefined ? machine.burner : energyInfo?.type === 'burner' ? energyInfo : undefined;
  if (burnerInfo !== undefined) {
    const chosenFuelName = recipe.machine.fuel;
    if (chosenFuelName !== undefined) {
      fuelResource = Cache.getFuel(chosenFuelName);
    }
    if (!fuelResource) {
      fuelResource = Cache.getDefaultFuelForMachine(machine, force);
    }
    const fuelValueJoules = fuelResource ? (fuelResource.type === 'fluid' ? fuelResource.base.fuelValue : fuelResource.fuelValue) : undefined;
    const burnerEffectivity = burnerInfo.effectivity !== undefined ? burnerInfo.effectivity : 1.0;
    // maxEnergyProduction is in J/tick, convert to Watts (J/tick * 60)
    const maxEnergyProd = Cache.getMachineMaxEnergyProduction(machine, machineQuality);
    const maxPowerWatts = maxEnergyProd !== undefined ? maxEnergyProd * 60 : 0;
    const effectivePowerWatts = actualPowerWatts > 0 ? actualPowerWatts : maxPowerWatts > 0 ? maxPowerWatts : 0;
    const energyJoulesPerCraft = effectivePowerWatts * effectiveCraftTime;

    if (fuelValueJoules !== undefined && fuelValueJoules > 0) {
      fuelPerCraft = calculateBurnerFuelConsumption(energyJoulesPerCraft, fuelValueJoules, burnerEffectivity);
      fuelPerSecondPerMachine = fuelPerCraft * craftsPerSecondPerMachine;
    }

    let spentFuelResource: Yafc.FuelResource | undefined = undefined;
    let spentFuelPerSecondPerMachine: number | undefined = undefined;

    // Account for burnt result / spent fluid byproduct if burning fuel produces waste
    if (fuelResource && fuelPerCraft !== undefined && fuelPerCraft > 0) {
      if (fuelResource.type === 'item' && fuelResource.burntResult !== undefined) {
        spentFuelResource = fuelResource.burntResult;
        spentFuelPerSecondPerMachine = fuelPerSecondPerMachine;
      } else if (fuelResource.type === 'fluid' && fuelResource.base.spentFluid !== undefined) {
        const spent = fuelResource.base.spentFluid;
        const ratio = spent.amount !== undefined ? spent.amount : 1.0;
        spentFuelResource = spent.fluid;
        spentFuelPerSecondPerMachine = fuelPerSecondPerMachine !== undefined ? fuelPerSecondPerMachine * ratio : undefined;
      }
    }

    return {
      recipeId: recipe.id,
      recipe: recipeInfo,
      machine,
      isModuleAllowed,
      isBeaconAllowed,
      effects,
      machineCount: 1,
      powerWatts: actualPowerWatts,
      fuel: fuelResource,
      fuelRate: fuelPerSecondPerMachine,
      spentFuel: spentFuelResource,
      spentFuelRate: spentFuelPerSecondPerMachine,
      inputFlows,
      outputFlows,
    };
  }

  return {
    recipeId: recipe.id,
    recipe: recipeInfo,
    machine,
    isModuleAllowed,
    isBeaconAllowed,
    effects,
    machineCount: 1,
    powerWatts: actualPowerWatts,
    fuel: fuelResource,
    fuelRate: fuelPerSecondPerMachine,
    inputFlows,
    outputFlows,
  };
}
