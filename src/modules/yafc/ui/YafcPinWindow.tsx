import type { PlayerIndex, SpritePath } from 'factorio:runtime';
import { createElement, Fragment, useMemo, createRoot } from 'fcore/react';
import { WindowFrame, HFlow, Label, SpriteButton, ScrollPane, Table } from 'fcore/react-components';
import { useYafcGroups, useYafcChain, getPlayerActiveChain, getChainRecipes } from '../storage';
import { solveProductionChain } from '../solver/ModelBuilder';
import { createBeaconBlueprint, createMachineBlueprint } from '../utils/blueprint';
import * as Cache from '../cache';
import { CAPTIONS, COMPONENT_NAMES } from '../constants';
import { buildVirtualRecipeTooltip } from './SlotView';

export interface YafcPinWindowProps {
  /** Player index owning the pinned window. */
  playerIndex: PlayerIndex;
  /** Optional pinned group ID. */
  pinnedGroupId?: number;
  /** Optional pinned chain ID. */
  pinnedChainId?: number;
}

/** Compact pinnable HUD window displaying recipe machine counts and direct blueprint actions. */
export function YafcPinWindow(props: YafcPinWindowProps) {
  const { playerIndex, pinnedGroupId, pinnedChainId } = props;
  const groups = useYafcGroups(playerIndex);
  const player = typeof game !== 'undefined' && game ? game.get_player(playerIndex) : undefined;

  const group = pinnedGroupId !== undefined ? groups.find((g) => g.id === pinnedGroupId) : groups[0];
  const targetChainId = pinnedChainId || (group !== undefined ? getPlayerActiveChain(playerIndex, group.id) : undefined) || group?.chainIds?.[0];
  const activeChain = useYafcChain(playerIndex, group?.id, targetChainId);

  const solvedSummary = useMemo(() => (activeChain && player !== undefined ? solveProductionChain(activeChain, player.force) : undefined), [activeChain, player?.force]);

  const handleMachineClick = (recipeName: string, machine: Yafc.MachineConfig) => {
    if (player === undefined) return;
    createMachineBlueprint(player, machine.name, recipeName, machine.modules, machine.quality);
  };

  const handleBeaconClick = (beacon: Yafc.BeaconConfig) => {
    if (player === undefined) return;
    createBeaconBlueprint(player, beacon.name, beacon.modules, beacon.quality);
  };

  if (group === undefined || activeChain === undefined || solvedSummary === undefined) {
    return (
      <WindowFrame caption={CAPTIONS.PIN_TITLE} playerIndex={playerIndex} pinnable={true} defaultPinned={true} singleWindow={false}>
        <Label caption={CAPTIONS.NO_ACTIVE_CHAIN} className="text-base text-zinc-400" />
      </WindowFrame>
    );
  }

  return (
    <WindowFrame
      caption={CAPTIONS.PIN_TITLE}
      playerIndex={playerIndex}
      pinnable={true}
      defaultPinned={true}
      singleWindow={false}
      style="inside_shallow_frame"
      titleDecoration={
        <SpriteButton
          sprite="utility/search_icon"
          style="frame_action_button"
          tooltip={CAPTIONS.OPEN_FULL}
          onClick={() => {
            createRoot(game.get_player(playerIndex)!.gui.screen, COMPONENT_NAMES.YafcWindow, { playerIndex });
          }}
        />
      }
    >
      <ScrollPane className="pin-scroll">
        <Table column_count={5}>
          {/* Table Headers */}
          <Label caption={CAPTIONS.RECIPE_COLUMN} className="font-bold w-60" />
          <Label caption={CAPTIONS.MACHINE_COLUMN} className="font-bold w-60" />
          <Label caption={CAPTIONS.COUNT_COLUMN} className="font-bold w-55" />
          <Label caption={CAPTIONS.MODULES_COLUMN} className="font-bold w-80" />
          <Label caption={CAPTIONS.BEACONS_COLUMN} className="font-bold w-60" />

          {getChainRecipes(activeChain).map((row) => {
            const solved = solvedSummary?.recipeResults[row.id];
            const fixedB = row.fixedConstraint?.type === 'buildings' ? row.fixedConstraint.count : undefined;
            const displayCount = fixedB !== undefined ? fixedB : solved !== undefined ? solved.machineCount : 0;
            const firstBeacon = row.machine.beacons && row.machine.beacons.length > 0 ? row.machine.beacons[0] : undefined;
            const recipeInfo = Cache.getRecipe(row.recipeName);
            const recipeSprite: SpritePath = recipeInfo !== undefined ? recipeInfo.sprite : `recipe/${row.recipeName}`;

            const isVirtual = recipeInfo !== undefined && (recipeInfo.isVirtual === true || row.recipeName.startsWith('yafc-'));

            return (
              <Fragment key={row.id}>
                {/* 1. Recipe */}
                <SpriteButton
                  key={`${row.id}_recipe`}
                  sprite={recipeSprite}
                  style="slot_button"
                  className="size-40"
                  elem_tooltip={isVirtual ? undefined : { type: 'recipe', name: row.recipeName }}
                  tooltip={isVirtual && recipeInfo ? buildVirtualRecipeTooltip(recipeInfo) : undefined}
                />

                {/* 2. Machine */}
                <SpriteButton
                  key={`${row.id}_machine`}
                  sprite={`entity/${row.machine.name}`}
                  style="slot_button"
                  className="size-40"
                  tooltip={CAPTIONS.BLUEPRINT_MACHINE_TOOLTIP(Cache.getMachine(row.machine.name)?.localisedName ?? ['entity-name.' + row.machine.name])}
                  onClick={() => handleMachineClick(row.recipeName, row.machine)}
                />

                {/* 3. Buildings count */}
                <Label
                  key={`${row.id}_count`}
                  caption={string.format('%.2f', displayCount)}
                  className={row.fixedConstraint !== undefined ? 'font-bold text-yellow-400 items-center' : 'font-bold items-center'}
                  tooltip={row.fixedConstraint !== undefined ? CAPTIONS.FIXED_CONSTRAINT_TOOLTIP : CAPTIONS.CALCULATED_COUNT_TOOLTIP}
                />

                {/* 4. Modules in Machine */}
                <HFlow key={`${row.id}_modules`} className="items-center">
                  {row.machine.modules.length > 0 ? (
                    row.machine.modules.map((m, idx) => (
                      <SpriteButton key={`${row.id}_mod_${m.name}_${idx}`} sprite={`item/${m.name}`} style="slot_button" className="size-28" elem_tooltip={{ type: 'item', name: m.name }} />
                    ))
                  ) : (
                    <Label caption="-" className="font-small text-zinc-600 items-center" />
                  )}
                </HFlow>

                {/* 5. Beacon */}
                {firstBeacon ? (
                  <SpriteButton
                    key={`${row.id}_beacon`}
                    sprite={`entity/${firstBeacon.name}`}
                    style="slot_button"
                    className="size-40"
                    tooltip={CAPTIONS.BLUEPRINT_BEACON_TOOLTIP(firstBeacon.count)}
                    onClick={() => handleBeaconClick(firstBeacon)}
                  />
                ) : (
                  <Label key={`${row.id}_no_beacon`} caption="-" className="font-small text-zinc-600 items-center" />
                )}
              </Fragment>
            );
          })}
        </Table>
      </ScrollPane>
    </WindowFrame>
  );
}
