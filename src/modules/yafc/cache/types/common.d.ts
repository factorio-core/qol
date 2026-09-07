declare namespace Yafc {
  /**
   * Represents a property that can either be a uniform scalar value across all quality tiers
   * or a dictionary mapping each QualityID to its corresponding tier value.
   */
  type QualityScaled<T> = T | Record<string, T>;

  /**
   * Base prototype unlock information associated with technologies.
   */
  interface BaseInfo {
    /** Technology internal name required to unlock this recipe or machine. */
    technologyName?: string;
  }
}
