declare namespace Yafc {
  /**
   * Numeric stat modifiers provided by a module.
   */
  interface ModuleEffects {
    /** Crafting / mining / research speed multiplier bonus. */
    speed?: number;
    /** Productivity bonus multiplier (extra items produced without consuming ingredients). */
    productivity?: number;
    /** Energy consumption multiplier modifier. */
    consumption?: number;
    /** Pollution emission multiplier modifier. */
    pollution?: number;
    /** Quality probability bonus (Space Age 2.0). */
    quality?: number;
  }

  /**
   * In-memory representation of an installable module item.
   */
  interface ModuleInfo {
    /** Unique item prototype name of the module. */
    name: string;
    /** Localized display name. */
    localisedName: LocalisedString;
    /** Module effect modifiers scaled by module item quality tier. */
    effects: QualityScaled<ModuleEffects>;
  }
}
