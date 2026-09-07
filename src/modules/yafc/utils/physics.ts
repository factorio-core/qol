/** Calculates thermal energy (in Joules) required to heat 1 unit of fluid from inTemp to targetTemp. */
export function getFluidHeatingEnergyPerUnit(heatCapacity: number, inTemp: number, targetTemp: number): number {
  const deltaT = targetTemp - inTemp;
  return deltaT > 0 ? deltaT * heatCapacity : 0;
}

/**
 * Calculates fluid flow rate required by a heating device (boiler, heat exchanger, reactor)
 * to absorb a given power amount in Joules.
 */
export function calculateBoilerFluidFlow(powerJoules: number, heatCapacity: number, inTemp: number, targetTemp: number): number {
  const energyPerUnit = getFluidHeatingEnergyPerUnit(heatCapacity, inTemp, targetTemp);
  return energyPerUnit > 0 ? powerJoules / energyPerUnit : 0;
}

/**
 * Calculates electrical or mechanical power output (in Joules or Watts) produced by a fluid generator/turbine
 * from fluid consumption at a specific input temperature.
 */
export function calculateGeneratorPower(fluidFlow: number, heatCapacity: number, defaultTemp: number, inTemp: number, maxMachineTemp?: number): number {
  const maxTemp = maxMachineTemp !== undefined ? maxMachineTemp : defaultTemp;
  const workingTemp = inTemp > maxTemp ? maxTemp : inTemp;
  const deltaT = workingTemp - defaultTemp;
  return deltaT > 0 ? fluidFlow * heatCapacity * deltaT : 0;
}

/** Calculates burner fuel consumption amount for a given energy requirement and burner effectivity. */
export function calculateBurnerFuelConsumption(energyJoules: number, fuelValueJoules: number, effectivity: number = 1.0): number {
  if (fuelValueJoules <= 0 || effectivity <= 0) return 0;
  return energyJoules / (fuelValueJoules * effectivity);
}
