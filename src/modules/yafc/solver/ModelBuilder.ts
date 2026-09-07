import type { LuaForce } from 'factorio:runtime';
import { calculateMachineStats } from './RecipeCalculations';
import { SimplexConstraint, SimplexProblem, SimplexSolver } from './Simplex';
import * as Cache from '../cache';
import { DEFAULT_QUALITY_ID } from '../constants';

/** Individual commodity tracked in the LP constraint matrix by resource and quality tier. */
interface UniqueGood {
  readonly resource: Yafc.ResourceInfo;
  readonly quality: Yafc.QualityInfo;
}

/** Mutable accumulator for building ResourceFlowSummary across the entire chain. */
interface MutableResourceFlowSummary {
  readonly resource: Yafc.ResourceInfo;
  readonly quality: Yafc.QualityInfo;
  minTemperature?: number;
  maxTemperature?: number;
  producedRate: number;
  consumedRate: number;
  netRate: number;
  targetRate?: number;
  surplusRate: number;
}

/** Searches for an existing good index in the unique goods list. */
function findGoodIndex(goods: UniqueGood[], res: Yafc.ResourceInfo, q: Yafc.QualityInfo): number {
  for (let i = 0; i < goods.length; i++) {
    if (Cache.areResourcesEqual(goods[i].resource, res) && goods[i].quality === q) {
      return i;
    }
  }
  return -1;
}

/** Ensures a good (resource + quality) exists in the goods list and returns its matrix index. */
function ensureGood(goods: UniqueGood[], res: Yafc.ResourceInfo, q: Yafc.QualityInfo): number {
  const idx = findGoodIndex(goods, res, q);
  if (idx >= 0) return idx;
  goods.push({ resource: res, quality: q });
  return goods.length - 1;
}

/** Creates a zero-initialized numeric array of specified length without intermediate tables. */
function createZeroArray(len: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < len; i++) {
    arr.push(0);
  }
  return arr;
}

/**
 * Solves a complete production chain DAG and returns the mathematical flow summary.
 *
 * Pipeline:
 * 1. Precalculate 1-machine base stats for each recipe row (`calculateMachineStats`).
 * 2. Scan produced fluid temperatures to dynamically resolve generic fluid inputs (e.g. Steam at 165°C / 500°C).
 * 3. Discover all unique goods (resource + quality pairs) across recipes and chain targets.
 * 4. Construct the Simplex constraint matrix:
 *    - Decision variables x_i: Number of machines for recipe i.
 *    - Objective: Minimize total machine count (min sum x_i).
 *    - Flow balances: sum(prodRate_r * x_r) - sum(ingrRate_r * x_r) == targetRate.
 *    - User pinned constraints: fixed machines, fixed resource rate, or fixed fuel rate.
 * 5. Solve LP problem using Two-Phase Simplex solver.
 * 6. Scale flows and energy by solved machine counts (x_i * baseRate) and build chain flow summaries.
 */
export function solveProductionChain(chain: Yafc.ChainConfig, force: LuaForce): Yafc.SolvedChainSummary | undefined {
  if (chain.isValid === false) {
    return undefined;
  }

  const recipes: Yafc.RecipeConfig[] = [];
  for (const id of chain.recipeIds) {
    const r = chain.recipes[id];
    if (r) recipes.push(r);
  }
  const numRecipes = recipes.length;

  // If no recipes are in the chain, return empty feasible summary
  if (numRecipes === 0) {
    return {
      chainId: chain.id,
      isFeasible: true,
      hasDeadlocks: false,
      isValid: true,
      totalPowerWatts: 0,
      recipeResults: {},
      targetFlows: [],
      inputFlows: [],
      outputFlows: [],
      summaryFlows: [],
    };
  }

  // ===========================================================================
  // Step 1: Precalculate machine stats for all recipes (normalized for 1 machine)
  // ===========================================================================
  const validStats: Yafc.SolvedRecipeResult[] = [];
  for (const r of recipes) {
    validStats.push(calculateMachineStats(r, force));
  }

  // ===========================================================================
  // Step 2: Collect discrete fluid temperatures produced in this chain
  // Used to bind input fluid requirements (e.g. steam >= 165°C) to exact produced fluids.
  // ===========================================================================
  const chainProducedFluids: Record<string, Yafc.FluidInfo[]> = {};
  for (let i = 0; i < numRecipes; i++) {
    for (const p of validStats[i].outputFlows) {
      if (p.product.resource.type === 'fluid') {
        const f = p.product.resource;
        const list = chainProducedFluids[f.base.name] || (chainProducedFluids[f.base.name] = []);
        let exists = false;
        for (const existing of list) {
          if (existing.temperature === f.temperature) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          list.push(f);
        }
      }
    }
    const sf = validStats[i].spentFuel;
    if (sf !== undefined && sf.type === 'fluid') {
      const list = chainProducedFluids[sf.base.name] || (chainProducedFluids[sf.base.name] = []);
      let exists = false;
      for (const existing of list) {
        if (existing.temperature === sf.temperature) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        list.push(sf);
      }
    }
  }
  if (chain.targets !== undefined) {
    for (const tgt of chain.targets) {
      if (tgt !== undefined && tgt.resourceType === 'fluid') {
        const res = Cache.getResource('fluid', tgt.name, tgt.temperature);
        if (res !== undefined && res.type === 'fluid') {
          const list = chainProducedFluids[res.base.name] || (chainProducedFluids[res.base.name] = []);
          let exists = false;
          for (const existing of list) {
            if (existing.temperature === res.temperature) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            list.push(res);
          }
        }
      }
    }
  }

  /** Resolves an ingredient to an exact fluid produced in the chain within temperature constraints. */
  function resolveIngredientResource(ing: Yafc.RecipeInputFlow): Yafc.ResourceInfo {
    const res = ing.ingredient.resource;
    if (res.type !== 'fluid') return res;

    const available = chainProducedFluids[res.base.name];
    if (!available || available.length === 0) return res;

    const minT = ing.ingredient.minimumTemperature;
    const maxT = ing.ingredient.maximumTemperature;
    if (minT === undefined && maxT === undefined) {
      return available[0];
    }

    for (const produced of available) {
      const t = produced.temperature;
      if ((minT === undefined || t >= minT) && (maxT === undefined || t <= maxT)) {
        return produced;
      }
    }
    return res;
  }

  // ===========================================================================
  // Step 3: Discover all unique goods across recipe inputs, outputs, fuels & chain targets
  // ===========================================================================
  const defaultQuality = Cache.getQuality(DEFAULT_QUALITY_ID)!;
  const allGoods: UniqueGood[] = [];
  const targetRateByGoodIndex: Record<number, number> = {};

  for (let i = 0; i < numRecipes; i++) {
    const stats = validStats[i];
    for (const p of stats.outputFlows) {
      ensureGood(allGoods, p.product.resource, p.quality);
    }
    for (const ing of stats.inputFlows) {
      const res = resolveIngredientResource(ing);
      ensureGood(allGoods, res, ing.quality);
    }
    if (stats.spentFuel !== undefined && stats.spentFuelRate !== undefined && stats.spentFuelRate > 0) {
      ensureGood(allGoods, stats.spentFuel, defaultQuality);
    }
    if (stats.fuel !== undefined && stats.fuelRate !== undefined && stats.fuelRate > 0) {
      ensureGood(allGoods, stats.fuel, defaultQuality);
    }
  }

  if (chain.targets && chain.targets.length > 0) {
    for (const tgt of chain.targets) {
      if (tgt !== undefined && tgt.ratePerSec !== 0) {
        const q = Cache.getQuality(tgt.quality || DEFAULT_QUALITY_ID)!;
        const res = Cache.getResource(tgt.resourceType, tgt.name, tgt.temperature);

        if (res !== undefined) {
          const gIdx = ensureGood(allGoods, res, q);
          targetRateByGoodIndex[gIdx] = tgt.ratePerSec;
        }
      }
    }
  }

  const numGoods = allGoods.length;

  // ===========================================================================
  // Step 4: Formulate Linear Programming System
  // Decision variables x_0 .. x_{numRecipes-1}: Number of machines for recipe i.
  // Objective: Minimize total machine count (min sum 1.0 * x_i).
  // ===========================================================================
  const constraints: SimplexConstraint[] = [];
  const objectiveCoefficients: number[] = [];

  for (let i = 0; i < numRecipes; i++) {
    // Base objective: minimize total machine count
    objectiveCoefficients.push(1.0);
  }

  // 4a. Material balance constraints for each unique good:
  // sum(prodRate_r * x_r) - sum(ingrRate_r * x_r) == targetRate (or >= targetRate for outputs)
  for (let g = 0; g < numGoods; g++) {
    const good = allGoods[g];
    const targetRate = targetRateByGoodIndex[g] !== undefined ? targetRateByGoodIndex[g] : 0;
    const coeffs: number[] = [];
    let hasProduction = false;
    let hasConsumption = false;

    for (let r = 0; r < numRecipes; r++) {
      const stats = validStats[r];
      let prodRate = 0;
      let ingrRate = 0;

      for (const p of stats.outputFlows) {
        if (Cache.areResourcesEqual(p.product.resource, good.resource) && p.quality === good.quality) {
          prodRate += p.rate;
        }
      }
      if (stats.spentFuel !== undefined && stats.spentFuelRate !== undefined && stats.spentFuelRate > 0 && good.quality === defaultQuality && Cache.areResourcesEqual(stats.spentFuel, good.resource)) {
        prodRate += stats.spentFuelRate;
      }

      for (const ing of stats.inputFlows) {
        const res = resolveIngredientResource(ing);
        if (Cache.areResourcesEqual(res, good.resource) && ing.quality === good.quality) {
          ingrRate += ing.rate;
        }
      }
      if (stats.fuel !== undefined && stats.fuelRate !== undefined && stats.fuelRate > 0 && good.quality === defaultQuality && Cache.areResourcesEqual(stats.fuel, good.resource)) {
        ingrRate += stats.fuelRate;
      }

      const netCoeff = prodRate - ingrRate;
      coeffs.push(netCoeff);
      if (prodRate > 0) hasProduction = true;
      if (ingrRate > 0) hasConsumption = true;
    }

    if (targetRate !== 0) {
      if (targetRate > 0 && hasProduction && !hasConsumption) {
        // Pure output good: allow overproduction (produce >= targetRate)
        constraints.push({
          coefficients: coeffs,
          relation: '>=',
          rhs: targetRate,
        });
      } else if (targetRate < 0 && !hasProduction && hasConsumption) {
        // Pure input good: net output >= targetRate (i.e. consume <= -targetRate)
        constraints.push({
          coefficients: coeffs,
          relation: '>=',
          rhs: targetRate,
        });
      } else {
        // Intermediate or balanced good with target: exact match required
        constraints.push({
          coefficients: coeffs,
          relation: '==',
          rhs: targetRate,
        });
      }
    } else {
      // Internal intermediate good without explicit target:
      // Allow surplus (production >= consumption) to prevent multi-product recipe deadlocks (e.g. oil refining)
      if (hasProduction && hasConsumption) {
        constraints.push({
          coefficients: coeffs,
          relation: '>=',
          rhs: 0,
        });
      }
    }
  }

  // 4b. User-pinned constraints (fixed machines, resource throughput, or fuel rate)
  for (let i = 0; i < numRecipes; i++) {
    const row = recipes[i];
    const stats = validStats[i];
    const fixed = row.fixedConstraint;

    if (fixed !== undefined) {
      let fixedMachines: number | undefined;

      if (fixed.type === 'buildings' && fixed.count > 0) {
        // Pinned to exact number of machines
        fixedMachines = fixed.count;
      } else if (fixed.type === 'resource' && fixed.ratePerSec > 0) {
        // Pinned to specific input or output resource flow rate (items/s or fluid/s)
        const q = Cache.getQuality(fixed.quality || DEFAULT_QUALITY_ID)!;
        let unitRatePerMachine = 0;

        if (fixed.ioType === 'output') {
          for (const p of stats.outputFlows) {
            if (fixed.resourceType !== undefined && p.product.resource.type !== fixed.resourceType) continue;
            const pName = Cache.getResourceName(p.product.resource);
            const pTemp = Cache.getResourceTemperature(p.product.resource);
            if (pName === fixed.resourceName && (fixed.temperature === undefined || pTemp === fixed.temperature) && p.quality === q) {
              unitRatePerMachine += p.rate;
            }
          }
          if (unitRatePerMachine === 0 && stats.spentFuel !== undefined && stats.spentFuelRate !== undefined && q === defaultQuality) {
            const sfName = Cache.getResourceName(stats.spentFuel);
            const sfTemp = Cache.getResourceTemperature(stats.spentFuel);
            if (
              (fixed.resourceType === undefined || fixed.resourceType === stats.spentFuel.type) &&
              sfName === fixed.resourceName &&
              (fixed.temperature === undefined || sfTemp === fixed.temperature)
            ) {
              unitRatePerMachine += stats.spentFuelRate;
            }
          }
        } else if (fixed.ioType === 'input') {
          for (const ing of stats.inputFlows) {
            const res = resolveIngredientResource(ing);
            if (fixed.resourceType !== undefined && res.type !== fixed.resourceType) continue;
            const ingName = Cache.getResourceName(res);
            const ingTemp = Cache.getResourceTemperature(res);
            if (ingName === fixed.resourceName && (fixed.temperature === undefined || ingTemp === fixed.temperature) && ing.quality === q) {
              unitRatePerMachine += ing.rate;
            }
          }
          if (unitRatePerMachine === 0 && stats.fuel !== undefined && stats.fuelRate !== undefined && q === defaultQuality) {
            const fName = Cache.getResourceName(stats.fuel);
            const fTemp = Cache.getResourceTemperature(stats.fuel);
            if ((fixed.resourceType === undefined || fixed.resourceType === stats.fuel.type) && fName === fixed.resourceName && (fixed.temperature === undefined || fTemp === fixed.temperature)) {
              unitRatePerMachine += stats.fuelRate;
            }
          }
        }

        if (unitRatePerMachine > 0) {
          fixedMachines = fixed.ratePerSec / unitRatePerMachine;
        }
      } else if (fixed.type === 'fuel' && fixed.ratePerSec > 0 && stats.fuelRate && stats.fuelRate > 0) {
        // Pinned to specific burner fuel consumption rate
        fixedMachines = fixed.ratePerSec / stats.fuelRate;
      }

      if (fixedMachines !== undefined) {
        // Constraint: x_i == fixedMachines
        const coeffs = createZeroArray(numRecipes);
        coeffs[i] = 1.0;
        constraints.push({
          coefficients: coeffs,
          relation: '==',
          rhs: fixedMachines,
        });
      }
    }
  }

  // ===========================================================================
  // Step 5: Solve Linear Programming System using Two-Phase Simplex
  // ===========================================================================
  const problem: SimplexProblem = {
    numVariables: numRecipes,
    objectiveCoefficients,
    constraints,
  };

  const result = SimplexSolver.solve(problem);

  // If simplex is infeasible (e.g. no targets set yet), fallback to default 1 machine for root recipe
  let solution = result.solution;
  let allZero = true;
  for (const v of solution) {
    if (v !== 0) {
      allZero = false;
      break;
    }
  }
  if (!result.feasible || allZero) {
    if (!chain.targets || chain.targets.length === 0) {
      solution = createZeroArray(numRecipes);
      solution[0] = 1; // Default to 1 full machine for root recipe
    }
  }

  // ===========================================================================
  // Step 6: Scale Results & Build SolvedRecipeResult & Flow Summaries
  // ===========================================================================
  const recipeResults: Record<number, Yafc.SolvedRecipeResult> = {};
  const summaryFlowsList: MutableResourceFlowSummary[] = [];

  function getOrCreateSummary(res: Yafc.ResourceInfo, q: Yafc.QualityInfo): MutableResourceFlowSummary {
    for (let i = 0; i < summaryFlowsList.length; i++) {
      if (Cache.areResourcesEqual(summaryFlowsList[i].resource, res) && summaryFlowsList[i].quality === q) {
        return summaryFlowsList[i];
      }
    }
    const item: MutableResourceFlowSummary = {
      resource: res,
      quality: q,
      producedRate: 0,
      consumedRate: 0,
      netRate: 0,
      surplusRate: 0,
    };
    summaryFlowsList.push(item);
    return item;
  }

  let totalPowerWatts = 0;

  for (let i = 0; i < numRecipes; i++) {
    const row = recipes[i];
    const stats = validStats[i];
    const fixed = row.fixedConstraint;

    const isMachineCountConstraint = fixed?.type === 'buildings';
    const machineCount = isMachineCountConstraint ? fixed.count : solution[i] || 0;

    const inputFlows: Yafc.RecipeInputFlow[] = [];
    const outputFlows: Yafc.RecipeOutputFlow[] = [];

    for (const ingr of stats.inputFlows) {
      const res = resolveIngredientResource(ingr);
      const resName = Cache.getResourceName(res);
      const resTemp = Cache.getResourceTemperature(res);
      let rate = ingr.rate * machineCount;
      let isConstraint: boolean | undefined = undefined;

      if (
        fixed !== undefined &&
        fixed.type === 'resource' &&
        fixed.ioType === 'input' &&
        (fixed.resourceType === undefined || fixed.resourceType === res.type) &&
        fixed.resourceName === resName &&
        (fixed.quality === undefined || fixed.quality === ingr.quality.name) &&
        (fixed.temperature === undefined || fixed.temperature === resTemp)
      ) {
        isConstraint = true;
        rate = fixed.ratePerSec;
      }

      const effectiveIngredient: Yafc.RecipeIngredient =
        res !== ingr.ingredient.resource
          ? {
              ...ingr.ingredient,
              resource: res,
            }
          : ingr.ingredient;

      inputFlows.push({
        ingredient: effectiveIngredient,
        quality: ingr.quality,
        amount: ingr.amount,
        rate,
        isConstraint,
      });

      const sum = getOrCreateSummary(res, ingr.quality);
      sum.consumedRate += rate;
      if (res.type === 'fluid' && res === ingr.ingredient.resource) {
        if (ingr.ingredient.minimumTemperature !== undefined) {
          sum.minTemperature = sum.minTemperature !== undefined ? Math.max(sum.minTemperature, ingr.ingredient.minimumTemperature) : ingr.ingredient.minimumTemperature;
        }
        if (ingr.ingredient.maximumTemperature !== undefined) {
          sum.maxTemperature = sum.maxTemperature !== undefined ? Math.min(sum.maxTemperature, ingr.ingredient.maximumTemperature) : ingr.ingredient.maximumTemperature;
        }
      }
    }

    for (const prod of stats.outputFlows) {
      const res = prod.product.resource;
      const resName = Cache.getResourceName(res);
      const resTemp = Cache.getResourceTemperature(res);
      let rate = prod.rate * machineCount;
      let isConstraint: boolean | undefined = undefined;

      if (
        fixed !== undefined &&
        fixed.type === 'resource' &&
        fixed.ioType === 'output' &&
        (fixed.resourceType === undefined || fixed.resourceType === res.type) &&
        fixed.resourceName === resName &&
        (fixed.quality === undefined || fixed.quality === prod.quality.name) &&
        (fixed.temperature === undefined || fixed.temperature === resTemp)
      ) {
        isConstraint = true;
        rate = fixed.ratePerSec;
      }

      outputFlows.push({
        product: prod.product,
        quality: prod.quality,
        amount: prod.amount,
        rate,
        isConstraint,
      });

      const sum = getOrCreateSummary(res, prod.quality);
      sum.producedRate += rate;
    }

    const recipePowerWatts = machineCount * stats.powerWatts;
    if (stats.machine?.energySource?.type === 'electric') {
      totalPowerWatts += recipePowerWatts;
    }

    const isFuelConstraint = fixed?.type === 'fuel';
    const fuelRate = isFuelConstraint ? fixed.ratePerSec : stats.fuelRate ? stats.fuelRate * machineCount : undefined;

    const spentFuelRate = stats.spentFuelRate ? stats.spentFuelRate * machineCount : undefined;

    if (stats.fuel !== undefined && fuelRate !== undefined && fuelRate > 0) {
      const sum = getOrCreateSummary(stats.fuel, defaultQuality);
      sum.consumedRate += fuelRate;
    }

    if (stats.spentFuel !== undefined && spentFuelRate !== undefined && spentFuelRate > 0) {
      const sum = getOrCreateSummary(stats.spentFuel, defaultQuality);
      sum.producedRate += spentFuelRate;
    }

    recipeResults[row.id] = {
      recipeId: row.id,
      recipe: stats.recipe,
      machine: stats.machine,
      machineCount,
      hasConstraint: fixed !== undefined ? true : undefined,
      isMachineCountConstraint: isMachineCountConstraint ? true : undefined,
      isModuleAllowed: stats.isModuleAllowed,
      isBeaconAllowed: stats.isBeaconAllowed,
      effects: stats.effects,
      powerWatts: recipePowerWatts,
      fuel: stats.fuel,
      fuelRate,
      isFuelConstraint: isFuelConstraint ? true : undefined,
      spentFuel: stats.spentFuel,
      spentFuelRate,
      inputFlows,
      outputFlows,
    };
  }

  // ===========================================================================
  // Step 7: Partition net resource flows into UI summary groups:
  // - targetFlows: Goals explicitly configured by the user.
  // - inputFlows: External raw materials that must be supplied from outside (net < 0).
  // - outputFlows: Usable surplus goods produced beyond target requirements.
  // ===========================================================================
  const targetFlows: Yafc.ResourceFlowSummary[] = [];
  const inputFlows: Yafc.ResourceFlowSummary[] = [];
  const outputFlows: Yafc.ResourceFlowSummary[] = [];

  for (const summary of summaryFlowsList) {
    const net = summary.producedRate - summary.consumedRate;
    const gIdx = findGoodIndex(allGoods, summary.resource, summary.quality);
    const targetRate = gIdx >= 0 ? targetRateByGoodIndex[gIdx] : undefined;

    summary.netRate = net;
    summary.targetRate = targetRate;
    summary.surplusRate = targetRate !== undefined ? Math.max(0, net - targetRate) : Math.max(0, net);

    // Target flow matching user goal
    if (targetRate !== undefined) {
      targetFlows.push(summary);
    }
    // Deficit: requires external supply
    if (net < -0.001) {
      inputFlows.push(summary);
    }
    // Surplus: available for export or further production
    if (summary.surplusRate > 0.001) {
      outputFlows.push(summary);
    }
  }

  return {
    chainId: chain.id,
    isFeasible: result.feasible,
    hasDeadlocks: !result.feasible,
    totalPowerWatts,
    recipeResults,
    targetFlows,
    inputFlows,
    outputFlows,
    summaryFlows: summaryFlowsList,
  };
}
