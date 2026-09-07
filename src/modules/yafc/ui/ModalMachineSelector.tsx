import type { PlayerIndex, GuiLocation } from 'factorio:runtime';
import { createElement, useState, useWindow } from 'fcore/react';
import { ModalDialog, ScrollPane, HStack, VStack, HFlow, Label, Frame } from 'fcore/react-components';
import * as Storage from '../storage';
import * as Cache from '../cache';
import { CAPTIONS, DEFAULT_QUALITY_ID } from '../constants';
import { QualityList } from './QualityList';
import { SlotView } from './SlotView';

export interface ModalMachineSelectorProps {
  /** Player index owning the modal. */
  playerIndex: PlayerIndex;
  /** ID of the parent group. */
  groupId: number;
  /** ID of the production chain. */
  chainId: number;
  /** ID of the recipe row being configured. */
  recipeId: number;
  /** Version counter for concurrency checks. */
  recipeVersion: number;
  /** Recipe prototype name. */
  recipeName: string;
  /** Currently selected machine entity name. */
  currentMachineName?: string;
  /** Currently selected machine quality name. */
  currentQuality?: string;
  /** Optional initial screen coordinates. */
  initialLocation?: GuiLocation;
  /** Callback invoked when a machine is selected. */
  onSelectMachine?: (this: void, machineName: string) => void;
  /** Optional callback invoked on modal close. */
  onClose?: (this: void) => void;
}

/** Modal dialog for choosing a crafting machine and quality tier compatible with a recipe. */
export function ModalMachineSelector(props: ModalMachineSelectorProps) {
  const { playerIndex, groupId, chainId, recipeId, recipeVersion, recipeName, currentMachineName, currentQuality, onSelectMachine, onClose } = props;

  const win = useWindow(playerIndex, {
    type: 'modal',
    autoCenter: !props.initialLocation,
    initialLocation: props.initialLocation,
    estimatedWidth: 460,
    estimatedHeight: 480,
    onClose,
  });

  const player = typeof game !== 'undefined' && game ? game.get_player(playerIndex) : undefined;
  const group = Storage.getGroup(groupId);
  const chain = group !== undefined ? Storage.getChain(group, chainId) : undefined;
  const recipe = chain?.recipes[recipeId];

  const [selectedQuality, setSelectedQuality] = useState<Yafc.QualityInfo>(() => Cache.getQuality(currentQuality || recipe?.machine.quality || DEFAULT_QUALITY_ID)!);

  const machineGroups = Cache.getRecipe(recipeName)?.compatibleMachines || [];
  let totalMachines = 0;
  for (const group of machineGroups) {
    totalMachines += group.length;
  }

  const handleSelect = (machineName: string) => {
    const machine = Cache.getMachine(machineName)!;
    const validQuality = Cache.resolveMachineQuality(machine, selectedQuality);
    Storage.setRecipeMachine(playerIndex, groupId, chainId, recipeId, machineName, validQuality.name, recipeVersion);
    if (onSelectMachine) {
      onSelectMachine(machineName);
    }
    win.close();
  };

  return (
    <ModalDialog title={CAPTIONS.MACHINE_SELECTOR_TITLE} windowHandle={win} noFooter onCancel={onClose}>
      <HFlow className="modal-header">
        <Label caption={CAPTIONS.RECIPE_MACHINES_COUNT(recipeName, totalMachines)} className="font-bold" />
        <QualityList selectedQuality={selectedQuality} onSelectQuality={setSelectedQuality} player={player} buttonSize={26} />
      </HFlow>

      <ScrollPane className="modal-scroll">
        <VStack gap="xs" stretch>
          {machineGroups.map((group, groupIdx) => (
            <VStack key={groupIdx} gap="xs" stretch>
              {group.map((machine) => {
                const isSelected = machine.name === currentMachineName;
                const effMachineQuality = Cache.resolveMachineQuality(machine, selectedQuality);
                const maxEnergy = Cache.getMachineMaxEnergyUsage(machine, effMachineQuality);
                const powerKw = maxEnergy !== undefined ? (maxEnergy * 60) / 1000 : 0;
                const slots = Cache.getEntityMaxModuleSlots(machine, effMachineQuality) || 0;
                const speed = Cache.getMachineBaseSpeed(machine, effMachineQuality);

                return (
                  <Frame key={machine.name} direction="horizontal" style={isSelected ? 'bordered_frame' : undefined} className="stretch">
                    <HStack gap="sm" align="center" stretch className="ml-4">
                      <SlotView type="entity" size={40} element={machine} quality={effMachineQuality} isSelected={isSelected} player={player} onClick={() => handleSelect(machine.name)} />

                      <VStack gap="none" className="w-280">
                        <Label caption={machine.localisedName} className="font-bold" />
                        <Label
                          caption={speed !== undefined && speed > 0 ? CAPTIONS.SPEED_SLOTS_STATUS(string.format('%.2f', speed), slots) : CAPTIONS.SLOTS_COUNT(slots)}
                          className="stat-label text-zinc-300"
                        />
                        {powerKw > 0 && <Label caption={CAPTIONS.POWER_KW(string.format('%.0f', powerKw))} className="stat-label text-sky-400" />}
                      </VStack>
                    </HStack>
                  </Frame>
                );
              })}
            </VStack>
          ))}
        </VStack>
      </ScrollPane>
    </ModalDialog>
  );
}
