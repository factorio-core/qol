import type { EffectReceiver, LocalisedString } from 'factorio:runtime';

declare global {
  namespace Yafc {
    /** Discriminator union of supported entity energy source paradigms. */
    type EnergySourceType = 'electric' | 'burner' | 'fluid' | 'heat' | 'void';

    /**
     * Burner combustion energy source.
     */
    interface BurnerEnergySourceInfo {
      /** Discriminator. */
      type: 'burner';
      /** Combustion thermal efficiency (e.g. 1.0 for 100%). */
      effectivity?: number;
      /** Combustible fuel items compatible with this burner, grouped by fuel category. */
      compatibleFuels: ItemInfo[][];
    }

    /**
     * Fluid combustion energy source.
     */
    interface FluidEnergySourceInfo {
      /** Discriminator. */
      type: 'fluid';
      /** Fluid combustion efficiency multiplier. */
      effectivity?: number;
      /** Whether this source burns fuel fluid. */
      burnsFluid?: boolean;
      /** Whether fluid consumption scales dynamically with energy output load. */
      scaleFluidUsage?: boolean;
      /** Whether non-fuel fluid is voided/destroyed. */
      destroyNonFuelFluid?: boolean;
      /** Fixed fluid consumption rate per tick. */
      fluidUsagePerTick?: number;
      /** Maximum allowed fluid temperature. */
      maximumTemperature?: number;
      /** Spent byproduct fluid emitted when fluid is burned. */
      spentFluid?: SpentFluidInfo;
    }

    /**
     * Electrical grid energy source.
     */
    interface ElectricEnergySourceInfo {
      /** Discriminator. */
      type: 'electric';
      /** Passive idle power drain in Watts. */
      drain?: number;
    }

    /**
     * Thermal heat pipe energy source.
     */
    interface HeatEnergySourceInfo {
      /** Discriminator. */
      type: 'heat';
    }

    /**
     * Free / void energy source requiring no fuel or power input.
     */
    interface VoidEnergySourceInfo {
      /** Discriminator. */
      type: 'void';
    }

    /** Union type of normalized machine energy sources. */
    type EnergySourceInfo = ElectricEnergySourceInfo | BurnerEnergySourceInfo | FluidEnergySourceInfo | HeatEnergySourceInfo | VoidEnergySourceInfo;

    /**
     * Base interface for placeable physical world entities.
     */
    interface BaseEntityInfo extends BaseInfo {
      /** Localized display name. */
      localisedName: LocalisedString;
      /** Entity prototype name. */
      name: string;
    }

    /**
     * Base descriptor for energy-consuming or energy-producing machines.
     */
    interface BaseMachineInfo extends BaseEntityInfo {
      /** Nominal active energy consumption in Watts across quality tiers. */
      energyUsage?: QualityScaled<number>;
      /** Normalized energy source definition. */
      energySource?: EnergySourceInfo;
      /** Fast burner energy source reference if burner-powered. */
      burner?: BurnerEnergySourceInfo;
      /** Maximum energy production in Watts across quality tiers (for generators/reactors). */
      maxEnergyProduction?: QualityScaled<number>;
    }

    /**
     * Interface for entities capable of receiving module items and beacon broadcasts.
     */
    interface ModuleReceiverInfo {
      /** Total module inventory capacity across quality tiers. */
      moduleInventorySize?: QualityScaled<number>;
      /** Precomputed list of module items compatible with this receiver. */
      compatibleModules?: ModuleInfo[];
      /** Factorio 2.0 effect receiver specification (beacon transmission limits). */
      effectReceiver?: EffectReceiver;
    }

    /**
     * Crafting machine (assembling machine, furnace, rocket silo).
     */
    interface CraftingMachineInfo extends BaseMachineInfo, ModuleReceiverInfo {
      /** Discriminator. */
      type: 'crafting-machine';
      /** Crafting speed multiplier across quality tiers. */
      craftingSpeed?: QualityScaled<number>;
      /** Fixed quality tier enforced by machine prototype if applicable. */
      fixedQuality?: string;
      /** Fixed recipe enforced by machine prototype if applicable. */
      fixedRecipe?: string;
    }

    /**
     * Resource extraction drill (electric mining drill, pumpjack, big mining drill).
     */
    interface MiningDrillInfo extends BaseMachineInfo, ModuleReceiverInfo {
      /** Discriminator. */
      type: 'mining-drill';
      /** Base mining speed in resource units / second. */
      miningSpeed?: number;
      /** Whether force mining productivity research applies to this drill. */
      usesForceMiningProductivityBonus?: boolean;
      /** Whether drill has input fluidbox connections for mining fluid (e.g. sulfuric acid for uranium). */
      supportsFluidInput?: boolean;
      /** Whether drill has output fluidbox connections for fluid resource output (e.g. crude oil). */
      supportsFluidOutput?: boolean;
    }

    /**
     * Water / liquid pumping station.
     */
    interface OffshorePumpInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'offshore-pump';
      /** Pumping throughput in fluid units / second across quality tiers. */
      pumpingSpeed?: QualityScaled<number>;
    }

    /**
     * Fluid heating boiler or heat exchanger.
     */
    interface BoilerInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'boiler';
      /** Target output fluid temperature in °C. */
      targetTemperature?: number;
      /** Boiler operating mode ('heat-fluid-inside' or 'heat-fluid-shallow'). */
      boilerMode?: string;
      /** Input fluidbox connection. */
      inputFluidBox?: FluidBoxInfo;
      /** Output heated fluidbox connection. */
      outputFluidBox?: FluidBoxInfo;
    }

    /**
     * Fluid steam turbine or steam engine electrical generator.
     */
    interface GeneratorInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'generator';
      /** Maximum operating fluid temperature in °C. */
      maximumTemperature?: number;
      /** Spent byproduct fluid (e.g. low-temp water). */
      spentFluid?: SpentFluidInfo;
      /** Fluid consumption rate in units / tick across quality tiers. */
      fluidUsagePerTick?: QualityScaled<number>;
      /** Input fluidbox connection. */
      inputFluidBox?: FluidBoxInfo;
      /** Output fluidbox connection. */
      outputFluidBox?: FluidBoxInfo;
    }

    /**
     * Fuel-burning electrical generator.
     */
    interface BurnerGeneratorInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'burner-generator';
    }

    /**
     * Nuclear fission reactor.
     */
    interface ReactorInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'reactor';
      /** Neighbour adjacency bonus factor (e.g. 1.0 for +100% per adjacent reactor). */
      neighbourBonus?: number;
    }

    /**
     * Fusion plasma reactor (Space Age 2.0).
     */
    interface FusionReactorInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'fusion-reactor';
      /** Neighbour adjacency bonus factor. */
      neighbourBonus?: number;
      /** Plasma fluid consumption rate in units / tick across quality tiers. */
      maxFluidUsage?: QualityScaled<number>;
      /** Input fluidbox connection. */
      inputFluidBox?: FluidBoxInfo;
      /** Output fluidbox connection. */
      outputFluidBox?: FluidBoxInfo;
    }

    /**
     * Fusion generator converting plasma to electricity (Space Age 2.0).
     */
    interface FusionGeneratorInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'fusion-generator';
      /** Plasma consumption rate in units / tick across quality tiers. */
      maxFluidUsage?: QualityScaled<number>;
      /** Input fluidbox connection. */
      inputFluidBox?: FluidBoxInfo;
      /** Output fluidbox connection. */
      outputFluidBox?: FluidBoxInfo;
    }

    /**
     * Spacecraft rocket thruster (Space Age 2.0).
     */
    interface ThrusterInfo extends BaseMachineInfo {
      /** Discriminator. */
      type: 'thruster';
      /** Maximum fuel fluid consumption rate in units / tick. */
      maxFluidUsage?: number;
      /** Fuel fluidbox connection. */
      fuelFluidBox?: FluidBoxInfo;
      /** Oxidizer fluidbox connection. */
      oxidizerFluidBox?: FluidBoxInfo;
    }

    /** Union type of all supported machine entities. */
    type MachineInfo =
      CraftingMachineInfo | MiningDrillInfo | OffshorePumpInfo | BoilerInfo | GeneratorInfo | BurnerGeneratorInfo | ReactorInfo | FusionReactorInfo | FusionGeneratorInfo | ThrusterInfo;

    /**
     * Module effect broadcasting beacon transmitter.
     */
    interface BeaconInfo extends BaseEntityInfo, ModuleReceiverInfo {
      /** Discriminator. */
      type: 'beacon';
      /** Base distribution efficiency factor across quality tiers. */
      distributionEffectivity?: QualityScaled<number>;
      /** Idle / operating energy consumption in Watts across quality tiers. */
      energyUsage?: QualityScaled<number>;
      /** Space Age 2.0 diminishing returns profile multipliers by beacon count. */
      profile?: number[];
      /** Beacon counter scoping mode ('total' or 'same_type'). */
      beaconCounter?: 'total' | 'same_type';
    }

    /** Union type of all production machines and beacon transmitters. */
    type EntityInfo = MachineInfo | BeaconInfo;

    /**
     * Fluidbox pipe connection specification on an entity.
     */
    interface FluidBoxInfo {
      /** Filtered fluid instance. */
      filter?: FluidInfo;
      /** Fluidbox production direction. */
      productionType?: 'input' | 'output' | 'input-output' | 'none';
      /** Minimum allowed fluid temperature in °C. */
      minimumTemperature?: number;
      /** Maximum allowed fluid temperature in °C. */
      maximumTemperature?: number;
    }
  }
}
