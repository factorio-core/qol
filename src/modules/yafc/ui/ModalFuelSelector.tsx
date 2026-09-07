import type { PlayerIndex, GuiLocation } from 'factorio:runtime';
import { createElement, useWindow } from 'fcore/react';
import { WindowFrame, Frame, HFlow, VFlow, Label, Button } from 'fcore/react-components';
import * as Storage from '../storage';
import * as Cache from '../cache';
import { CAPTIONS } from '../constants';
import { SlotView } from './SlotView';

export interface ModalFuelSelectorProps {
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
  /** Internal prototype name of the crafting machine. */
  machineName: string;
  /** Currently configured fuel resource name. */
  currentFuel?: string;
  /** Optional initial screen coordinates. */
  initialLocation?: GuiLocation;
  /** Callback invoked when a fuel is selected. */
  onSelectFuel?: (this: void, fuelName: string) => void;
  /** Optional callback invoked on modal close. */
  onClose?: (this: void) => void;
}

/** Formats energy in Joules into a human-readable string with metric prefix. */
function formatFuelValue(joules: number): string {
  if (joules >= 1_000_000_000) {
    return `${string.format('%.1f', joules / 1_000_000_000)} GJ`;
  }
  if (joules >= 1_000_000) {
    return `${string.format('%.1f', joules / 1_000_000)} MJ`;
  }
  return `${string.format('%.0f', joules / 1_000)} kJ`;
}

/** Modal dialog for choosing burner and fluid fuel types compatible with a machine. */
export function ModalFuelSelector(props: ModalFuelSelectorProps) {
  const { playerIndex, groupId, chainId, recipeId, recipeVersion, machineName, currentFuel, onClose } = props;

  const win = useWindow(playerIndex, {
    type: 'modal',
    autoCenter: !props.initialLocation,
    initialLocation: props.initialLocation,
    estimatedWidth: 360,
    estimatedHeight: 320,
    onClose,
  });

  const player = typeof game !== 'undefined' && game ? game.get_player(playerIndex) : undefined;
  const machine = Cache.getMachine(machineName);
  if (!machine) return undefined;
  const energySource = machine.energySource;
  const burner = machine.burner !== undefined ? machine.burner : energySource?.type === 'burner' ? energySource : undefined;
  const availableFuels: readonly (readonly Yafc.FuelResource[])[] = burner !== undefined ? burner.compatibleFuels : energySource?.type === 'fluid' ? [Cache.getFluidFuels()] : [];

  const handleSelect = (fuelName: string) => {
    Storage.setRecipeFuel(playerIndex, groupId, chainId, recipeId, fuelName, recipeVersion);
    if (props.onSelectFuel) {
      props.onSelectFuel(fuelName);
    }
    win.close();
  };

  return (
    <WindowFrame caption={CAPTIONS.FUEL_SELECTOR_TITLE} windowHandle={win} draggable={true}>
      <Frame direction="vertical" className="p-8">
        <Label caption={CAPTIONS.SELECT_FUEL} className="font-bold mb-6" />

        {availableFuels.length === 0 ? (
          <Label caption={CAPTIONS.NO_FUEL} className="font-small text-zinc-500" />
        ) : (
          <VFlow className="gap-y-4">
            {availableFuels.map((group) =>
              group.map((fuel) => {
                const fuelName = Cache.getResourceName(fuel);
                const fuelValue = (fuel.type === 'fluid' ? fuel.base.fuelValue : fuel.fuelValue) || 0;
                const isSelected = currentFuel === fuelName;
                return (
                  <Frame key={fuel.type === 'fluid' ? `${fuel.base.name}_${fuel.temperature}` : fuel.name} direction="horizontal" style="bordered_frame" className="stretch">
                    <HFlow className="items-center gap-x-8">
                      <SlotView type="resource" size={40} element={fuel} isSelected={isSelected} player={player} onClick={() => handleSelect(fuelName)} />
                      <VFlow className="stretch-v">
                        <Label caption={fuel.type === 'fluid' ? fuel.base.localisedName : fuel.localisedName} className="font-semibold" />
                        <Label caption={CAPTIONS.FUEL_VALUE(formatFuelValue(fuelValue))} className="stat-label" />
                      </VFlow>
                      <Button caption={isSelected ? CAPTIONS.SELECTED : CAPTIONS.SELECT} style={isSelected ? 'confirm_button' : 'button'} onClick={() => handleSelect(fuelName)} />
                    </HFlow>
                  </Frame>
                );
              }),
            )}
          </VFlow>
        )}
      </Frame>
    </WindowFrame>
  );
}
