declare namespace Yafc {
  /**
   * In-memory representation of a Factorio quality tier.
   */
  interface QualityInfo {
    /** Unique prototype name of the quality (e.g. 'normal', 'uncommon', 'rare', 'epic', 'legendary'). */
    name: string;
    /** Localized display string for UI rendering. */
    localisedName: LocalisedString;
    /** Quality level (0 for normal, 1 for uncommon, 2 for rare, 3 for epic, 4 for legendary). */
    level: number;
    /** Direct reference to the next higher quality tier in progression (if available). */
    next?: QualityInfo;
    /** Probability multiplier for upgrading to the next quality tier (e.g. 1.0). */
    nextProbability: number;
    /** Chain probability multiplier for consecutive quality jumps within the same craft (e.g. 0.1). */
    chainProbability: number;
    /** Extra module slot bonuses granted to crafting machines at this quality level. */
    craftingMachineModuleSlotsBonus?: number;
    /** Extra module slot bonuses granted to mining drills at this quality level. */
    miningDrillModuleSlotsBonus?: number;
    /** Extra module slot bonuses granted to beacons at this quality level. */
    beaconModuleSlotsBonus?: number;
  }
}
