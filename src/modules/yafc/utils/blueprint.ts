import type { BlueprintInsertPlan, LuaPlayer } from 'factorio:runtime';

/** Creates a single-machine blueprint with recipe and module insert plans in player cursor. */
export function createMachineBlueprint(player: LuaPlayer, machineName: string, recipeName: string, modules: Yafc.ModuleSlotConfig[], quality?: Yafc.QualityInfo | string): void {
  if (!player || !player.valid) return;

  const qName = typeof quality === 'string' ? quality : (quality?.name ?? 'normal');

  if (player.cursor_stack && player.cursor_stack.valid_for_read) {
    player.clear_cursor();
  }

  const stack = player.cursor_stack;
  if (stack && stack.valid) {
    stack.set_stack({ name: 'blueprint', count: 1 });

    const insertPlans: BlueprintInsertPlan[] = [];
    if (modules && modules.length > 0) {
      let stackIdx = 0;
      for (const m of modules) {
        if (m.name && m.count > 0) {
          const invEntries: { inventory: number; stack: number; count: number }[] = [];
          for (let c = 0; c < m.count; c++) {
            invEntries.push({
              inventory: defines.inventory.crafter_modules,
              stack: stackIdx,
              count: 1,
            });
            stackIdx++;
          }
          insertPlans.push({
            id: { name: m.name, quality: m.quality || 'normal' },
            items: {
              in_inventory: invEntries,
            },
          });
        }
      }
    }

    stack.set_blueprint_entities([
      {
        entity_number: 1,
        name: machineName,
        position: { x: 0, y: 0 },
        recipe: recipeName,
        quality: qName,
        items: insertPlans.length > 0 ? insertPlans : undefined,
      },
    ]);

    player.create_local_flying_text({
      text: `Imported ${machineName} blueprint to cursor`,
      create_at_cursor: true,
    });
  } else {
    player.cursor_ghost = machineName;
  }
}

/** Creates a beacon blueprint with module insert plans in player cursor. */
export function createBeaconBlueprint(player: LuaPlayer, beaconName: string = 'beacon', modules?: Yafc.ModuleSlotConfig[], quality?: Yafc.QualityInfo | string): void {
  if (!player || !player.valid) return;

  const qName = typeof quality === 'string' ? quality : (quality?.name ?? 'normal');

  if (player.cursor_stack && player.cursor_stack.valid_for_read) {
    player.clear_cursor();
  }

  const stack = player.cursor_stack;
  if (stack && stack.valid) {
    stack.set_stack({ name: 'blueprint', count: 1 });

    const insertPlans: BlueprintInsertPlan[] = [];
    if (modules && modules.length > 0) {
      let stackIdx = 0;
      for (const m of modules) {
        if (m.name && m.count > 0) {
          const invEntries: { inventory: number; stack: number; count: number }[] = [];
          for (let c = 0; c < m.count; c++) {
            invEntries.push({
              inventory: defines.inventory.beacon_modules,
              stack: stackIdx,
              count: 1,
            });
            stackIdx++;
          }
          insertPlans.push({
            id: { name: m.name, quality: m.quality || 'normal' },
            items: {
              in_inventory: invEntries,
            },
          });
        }
      }
    }

    stack.set_blueprint_entities([
      {
        entity_number: 1,
        name: beaconName,
        position: { x: 0, y: 0 },
        quality: qName,
        items: insertPlans.length > 0 ? insertPlans : undefined,
      },
    ]);

    player.create_local_flying_text({
      text: `Imported ${beaconName} blueprint to cursor`,
      create_at_cursor: true,
    });
  } else {
    player.cursor_ghost = beaconName;
  }
}
