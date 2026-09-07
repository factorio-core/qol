export type ModModuleName = 'yafc';

/** Checks if a specific sub-module of qol is enabled in startup settings. */
export function isModuleEnabled(moduleName: ModModuleName): boolean {
  if (typeof settings !== 'undefined' && settings !== undefined && settings.startup !== undefined) {
    const setting = settings.startup[`qol-enable-${moduleName}`];
    if (setting !== undefined) {
      return setting.value === true;
    }
  }
  return true;
}
