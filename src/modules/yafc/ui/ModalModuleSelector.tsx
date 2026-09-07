import type { PlayerIndex, GuiLocation } from 'factorio:runtime';
import { createElement, useState, useWindow } from 'fcore/react';
import { WindowFrame, Frame, ScrollPane, HFlow, VFlow, Label, Button } from 'fcore/react-components';
import * as Storage from '../storage';
import * as Cache from '../cache';
import { CAPTIONS, DEFAULT_QUALITY_ID } from '../constants';
import { QualityList } from './QualityList';
import { SlotView } from './SlotView';

export interface ModalModuleSelectorProps {
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
  /** Recipe prototype name. */
  recipeName: string;
  /** Optional initial screen coordinates. */
  initialLocation?: GuiLocation;
  /** Optional callback invoked on modal close. */
  onClose?: (this: void) => void;
}

/** Modal dialog for configuring module items and quality tiers inserted into a crafting machine. */
export function ModalModuleSelector(props: ModalModuleSelectorProps) {
  const { playerIndex, groupId, chainId, recipeId, recipeVersion, machineName, recipeName, onClose } = props;

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
  const recipeConfig = chain?.recipes[recipeId];

  const machine = Cache.getMachine(machineName);
  const recipeInfo = Cache.getRecipe(recipeName);

  if (!machine || !recipeInfo) {
    return (
      <WindowFrame caption={CAPTIONS.MODULE_SELECTOR_TITLE} onClose={win.close}>
        <Label caption={CAPTIONS.MACHINE_NOT_FOUND} />
      </WindowFrame>
    );
  }

  const machineQuality = Cache.getQuality(recipeConfig?.machine.quality || DEFAULT_QUALITY_ID);
  const maxSlots = Cache.getEntityMaxModuleSlots(machine, machineQuality) || 0;

  const [modules, setModules] = useState<Yafc.ModuleSlotConfig[]>(() => {
    return recipeConfig?.machine.modules !== undefined ? [...recipeConfig.machine.modules] : [];
  });
  const [selectedQuality, setSelectedQuality] = useState<Yafc.QualityInfo>(() => Cache.getQuality(DEFAULT_QUALITY_ID)!);

  const validModules = Cache.getValidModulesForEntityAndRecipe(machine, recipeInfo);

  const totalUsedSlots = modules.reduce((sum, m) => sum + m.count, 0);

  const handleAddModule = (modName: string) => {
    if (totalUsedSlots >= maxSlots) return;

    const existingIdx = modules.findIndex((m) => m.name === modName && (m.quality || DEFAULT_QUALITY_ID) === selectedQuality.name);
    let newMods = [...modules];
    if (existingIdx !== -1) {
      newMods[existingIdx] = {
        ...newMods[existingIdx],
        count: newMods[existingIdx].count + 1,
      };
    } else {
      newMods.push({
        name: modName,
        count: 1,
        quality: selectedQuality.name,
      });
    }
    setModules(newMods);
  };

  const handleRemoveModule = (modName: string, modQuality?: string) => {
    const q = modQuality || DEFAULT_QUALITY_ID;
    const existingIdx = modules.findIndex((m) => m.name === modName && (m.quality || DEFAULT_QUALITY_ID) === q);
    if (existingIdx === -1) return;

    let newMods = [...modules];
    if (newMods[existingIdx].count > 1) {
      newMods[existingIdx] = {
        ...newMods[existingIdx],
        count: newMods[existingIdx].count - 1,
      };
    } else {
      newMods.splice(existingIdx, 1);
    }
    setModules(newMods);
  };

  const handleConfirm = () => {
    Storage.setRecipeModules(playerIndex, groupId, chainId, recipeId, modules, recipeVersion);
    win.close();
  };

  return (
    <WindowFrame caption={CAPTIONS.MODULE_SELECTOR_TITLE} windowHandle={win} draggable={true} className="w-460">
      <Frame direction="vertical" className="mt-2 p-8">
        {/* Header summary of slots */}
        <HFlow className="modal-header-compact">
          <Label caption={CAPTIONS.SLOTS_USED_STATUS(totalUsedSlots, maxSlots)} className={totalUsedSlots > maxSlots ? 'font-bold text-red-500' : 'font-bold text-white'} />
          <Button caption={CAPTIONS.CLEAR_ALL} style="mini_button" onClick={() => setModules([])} />
        </HFlow>

        {/* Currently configured modules grid */}
        <Frame direction="horizontal" style="bordered_frame" className="h-50 mb-8">
          <HFlow className="items-center gap-x-6 mt-4 ml-4">
            {modules.map((m, idx) => (
              <HFlow key={`${m.name}_${m.quality || DEFAULT_QUALITY_ID}_${idx}`} className="items-center gap-x-2">
                <SlotView
                  type="resource"
                  element={Cache.getItem(m.name)!}
                  quality={m.quality ? Cache.getQuality(m.quality) : undefined}
                  size={36}
                  player={player}
                  onClick={() => handleRemoveModule(m.name, m.quality)}
                />
                <Label caption={`x${m.count}`} className="font-bold" />
              </HFlow>
            ))}
            {modules.length === 0 && <Label caption={CAPTIONS.NO_MODULES_INSERTED} className="font-small text-zinc-500" />}
          </HFlow>
        </Frame>

        {/* Space Age Quality Selector */}
        <QualityList selectedQuality={selectedQuality} onSelectQuality={setSelectedQuality} player={player} buttonSize={28} />

        {/* Module Picker Catalog */}
        <Label caption={CAPTIONS.CLICK_ADD_OR_FILL} className="font-semibold mb-4" />
        <ScrollPane className="modal-scroll mb-8">
          <VFlow className="gap-y-4">
            {validModules.map((mod) => {
              const eff = Cache.getModuleEffects(mod, selectedQuality);
              const effStr: string[] = [];
              if (eff?.speed !== undefined && eff.speed !== 0) effStr.push(`Speed: +${eff.speed * 100}%`);
              if (eff?.productivity !== undefined && eff.productivity !== 0) effStr.push(`Prod: +${eff.productivity * 100}%`);
              if (eff?.consumption !== undefined && eff.consumption !== 0) effStr.push(`Power: +${eff.consumption * 100}%`);
              if (eff?.pollution !== undefined && eff.pollution !== 0) effStr.push(`Pollution: ${eff.pollution > 0 ? '+' : ''}${eff.pollution * 100}%`);
              if (eff?.quality !== undefined && eff.quality !== 0) effStr.push(`Quality: +${eff.quality * 100}%`);

              return (
                <Frame key={mod.name} direction="horizontal" className="stretch">
                  <HFlow className="items-center gap-x-8">
                    <SlotView type="resource" size={40} element={Cache.getItem(mod.name)!} quality={selectedQuality} player={player} onClick={() => handleAddModule(mod.name)} />
                    <VFlow className="w-180">
                      <Label caption={mod.localisedName} className="font-bold" />
                      <Label caption={effStr.join(' | ')} className="stat-label text-zinc-300" />
                    </VFlow>
                    <Button caption="+1" style="button" onClick={() => handleAddModule(mod.name)} />
                    <Button
                      caption={CAPTIONS.FILL_SLOTS(maxSlots)}
                      style="button"
                      onClick={() => {
                        if (maxSlots > 0) {
                          setModules([{ name: mod.name, count: maxSlots, quality: selectedQuality.name }]);
                        }
                      }}
                    />
                  </HFlow>
                </Frame>
              );
            })}
          </VFlow>
        </ScrollPane>

        {/* Footer Actions */}
        <HFlow className="modal-actions">
          <Button caption={CAPTIONS.SAVE_APPLY} style="confirm_button" onClick={handleConfirm} />
        </HFlow>
      </Frame>
    </WindowFrame>
  );
}
