import type { LocalisedString, SpritePath } from 'factorio:runtime';

declare global {
  namespace Yafc {
    /** Discriminator union of all supported physical and virtual resource flow types. */
    type ResourceType = 'item' | 'fluid' | 'heat' | 'electricity';

    /**
     * Base descriptor shared by all resource flow types.
     */
    interface BaseResourceInfo extends BaseInfo {
      /** Discriminator for resource category. */
      type: ResourceType;
      /** Factorio sprite path for GUI rendering. */
      sprite: SpritePath;
      /** Pre-lowercased name for zero-allocation search matching. */
      lowerName: string;
      /** Optional localized display name. */
      localisedName?: LocalisedString;
    }

    /**
     * Represents a physical Factorio item resource.
     */
    interface ItemInfo extends BaseResourceInfo {
      /** Discriminator. */
      type: 'item';
      /** Prototype name of the item. */
      name: string;
      /** Fuel value in Joules if combustible. */
      fuelValue?: number;
      /** Byproduct item produced when this item is burned as fuel. */
      burntResult?: ItemInfo;
    }

    /**
     * Base physical prototype properties of a fluid.
     */
    interface BaseFluidInfo extends BaseInfo {
      /** Prototype name of the fluid. */
      name: string;
      /** Pre-lowercased name for zero-allocation search matching. */
      lowerName: string;
      /** Factorio sprite path. */
      sprite: SpritePath;
      /** Optional localized display name. */
      localisedName?: LocalisedString;
      /** Default ambient temperature in °C. */
      defaultTemperature: number;
      /** Heat capacity in Joules / (°C * unit). */
      heatCapacity: number;
      /** Fuel value in Joules if combustible as fluid fuel. */
      fuelValue?: number;
      /** Byproduct spent fluid produced when consumed. */
      spentFluid?: SpentFluidInfo;
    }

    /**
     * Represents spent byproduct fluid emitted when fluid fuel or generator steam is consumed.
     */
    interface SpentFluidInfo {
      /** Instantiated fluid resource at byproduct temperature. */
      fluid: FluidInfo;
      /** Byproduct output ratio multiplier per unit of input consumed (defaults to 1.0). */
      amount?: number;
    }

    /**
     * Instantiated fluid resource at a specific discrete operating temperature.
     */
    interface FluidInfo extends BaseInfo {
      /** Discriminator. */
      type: 'fluid';
      /** Underlying base fluid prototype descriptor. */
      base: BaseFluidInfo;
      /** Operating temperature in °C. */
      temperature: number;
    }

    /**
     * Thermal energy resource unit for reactors, heat pipes, and heat exchangers.
     */
    interface HeatInfo extends BaseResourceInfo {
      /** Discriminator. */
      type: 'heat';
      /** Constant identifier ('heat'). */
      name: string;
      /** Localized display caption. */
      localisedName: LocalisedString;
    }

    /**
     * Electrical energy resource unit for generators, solar panels, and accumulators.
     */
    interface ElectricityInfo extends BaseResourceInfo {
      /** Discriminator. */
      type: 'electricity';
      /** Constant identifier ('electricity'). */
      name: string;
      /** Localized display caption. */
      localisedName: LocalisedString;
    }

    /**
     * UI Subgroup node containing indexed resources.
     */
    interface ResourceSubGroupInfo {
      /** Subgroup identifier. */
      name: string;
      /** Child resources contained in this subgroup. */
      resources: ResourceInfo[];
    }

    /**
     * UI Group node containing resource subgroups.
     */
    interface ResourceGroupInfo {
      /** Group identifier. */
      name: string;
      /** Localized display caption. */
      localisedName: LocalisedString;
      /** Sprite path for the group icon. */
      sprite: SpritePath;
      /** Child subgroups contained in this group. */
      subgroups: ResourceSubGroupInfo[];
    }

    type FuelResource = ItemInfo | FluidInfo;
    type ResourceInfo = ItemInfo | FluidInfo | HeatInfo | ElectricityInfo;

    /**
     * Unified search and filtering criteria for querying items, fluids, and virtual energy resources.
     */
    interface ResourceFilter {
      /** Resource type filter ('item', 'fluid', 'heat', 'electricity'). If omitted, searches across all types. */
      type?: ResourceType;
      /** UI Item Group identifier ('all' or group name). If omitted or 'all', searches across all groups. */
      group?: string;
      /** Free-form search text query for localized substring search. */
      search?: string;
      /** Optional custom matcher predicate (e.g. from createSearchMatcher). */
      matcher?: (this: void, name: string, type?: string) => boolean;
    }
  }
}
