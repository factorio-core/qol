import type { LocalisedString, SpritePath } from 'factorio:runtime';

declare global {
  namespace Yafc {
    /**
     * Material ingredient consumption descriptor in a recipe.
     */
    interface RecipeIngredient {
      /** Input resource flow (item, fluid, electricity, or heat). */
      resource: ResourceInfo;
      /** Amount consumed per recipe craft operation. */
      amount: number;
      /** Output item quality mapped across recipe quality tiers. */
      quality?: QualityScaled<string>;
      /** Minimum acceptable fluid input temperature in °C. */
      minimumTemperature?: number;
      /** Maximum acceptable fluid input temperature in °C. */
      maximumTemperature?: number;
    }

    /**
     * Material product output descriptor in a recipe.
     */
    interface RecipeProduct {
      /** Output resource flow (item, fluid, electricity, or heat). */
      resource: ResourceInfo;
      /** Expected output yield amount per craft operation. */
      amount: number;
      /** Whether this product is excluded from productivity module bonus scaling. */
      ignoredByProductivity?: boolean;
      /** Output product quality mapped across recipe quality tiers. */
      quality?: QualityScaled<string>;
    }

    /**
     * Recipe crafting process specification (standard crafting, ground mining, or thermodynamic process).
     */
    interface RecipeInfo extends BaseInfo {
      /** Unique recipe identifier name. */
      name: string;
      /** Primary Factorio sprite path for UI display. */
      sprite: SpritePath;
      /** Localized recipe display name. */
      localisedName: LocalisedString;
      /** Machines capable of executing this recipe grouped by category tier. */
      compatibleMachines: MachineInfo[][];
      /** List of input ingredients consumed per craft. */
      ingredients: RecipeIngredient[];
      /** List of output products generated per craft. */
      products: RecipeProduct[];
      /** Crafting duration in crafting energy seconds. */
      energy: number;
      /** Maximum productivity bonus cap (e.g. 3.0 for +300%) if capped by prototype. */
      maximumProductivity?: number;
      /** Explicitly allowed modules permitted for this recipe if restricted by prototype. */
      allowedModules?: ModuleInfo[];
      /** Whether this recipe allows setting quality tiers (false for recycling / uncrafting / mining). */
      canSetQuality?: boolean;
      /** Whether this recipe is a virtual procedural recipe (e.g. mining, boiler, generator). */
      isVirtual: boolean;
    }

    /**
     * Subgroup of recipes in catalog view.
     */
    interface RecipeSubGroupInfo {
      /** Subgroup identifier. */
      name: string;
      /** Member recipes. */
      recipes: RecipeInfo[];
    }

    /**
     * Primary recipe group tab in catalog view.
     */
    interface RecipeGroupInfo {
      /** Group identifier. */
      name: string;
      /** Localized group display title. */
      localisedName: LocalisedString;
      /** Sprite path for the group icon. */
      sprite: SpritePath;
      /** Subgroups contained in this group. */
      subgroups: RecipeSubGroupInfo[];
    }

    /**
     * Unified search and filtering criteria for querying crafting recipes.
     * Any omitted field is unconstrained (searches across all values).
     */
    interface RecipeFilter {
      /** Target role: 'product' (recipes producing it) or 'ingredient' (recipes consuming it). If omitted, searches across all recipes. */
      filterType?: 'product' | 'ingredient';
      /** Resource type filter ('item', 'fluid', 'heat', 'electricity'). */
      type?: ResourceType;
      /** Prototype name identifier (Item name, Fluid base name, etc.). */
      name?: string;
      /** Exact discrete temperature in °C. */
      temperature?: number;
      /** Minimum allowable fluid temperature in °C. */
      minTemperature?: number;
      /** Maximum allowable fluid temperature in °C. */
      maxTemperature?: number;
      /** Quality tier filter. */
      quality?: Yafc.QualityInfo;
      /** Item group filter ('all' or group name, e.g. 'production'). If omitted or 'all', searches across all groups. */
      group?: string;
      /** Free-form search text query for localized substring search. */
      search?: string;
      /** Optional custom matcher predicate (e.g. from createSearchMatcher). */
      matcher?: (this: void, name: string, type?: string) => boolean;
    }
  }
}
