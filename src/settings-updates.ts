const settingTypes = ['bool-setting', 'int-setting', 'double-setting', 'string-setting'] as const;

function changeSetting(settingName: string, settingValue: boolean | number | string): void {
  for (const settingType of settingTypes) {
    const rawRecord = data.raw as unknown as Record<string, Record<string, { default_value?: unknown }> | undefined>;
    const group = rawRecord[settingType];
    if (group && group[settingName]) {
      group[settingName].default_value = settingValue;
    }
  }
}

// flow control
changeSetting('flow-control-new-group', false);
// pumps
changeSetting('osm-pumps-landfill-goes-boom', false);
// qol research
changeSetting('qol-player-reach-research-enabled', false);
// autodeconstruct
changeSetting('autodeconstruct-remove-fluid-drills', false);
// statsgui
changeSetting('statsgui-single-line', false);
changeSetting('statsgui-adjust-for-clock', true);
changeSetting('statsgui-show-sensor-daytime', false);
changeSetting('statsgui-show-sensor-pollution', false);
changeSetting('statsgui-ms-max-speed-vehicle', true);
// additional paste setting
changeSetting('additional-paste-settings-options-requester-multiplier-value', 4);
changeSetting('additional-paste-settings-options-sumup', true);
// nanobots
changeSetting('nanobots-network-limits', false);
// dad-jokes
changeSetting('dj-nsfw', true);
// helmod
changeSetting('helmod_display_all_sheet', true);
