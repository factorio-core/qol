import type { PlayerIndex, GuiLocation } from 'factorio:runtime';
import { createElement, useState, useWindow } from 'fcore/react';
import { WindowFrame, Frame, ScrollPane, HFlow, VFlow, Label, Button, Input } from 'fcore/react-components';
import * as Storage from '../storage';
import * as Cache from '../cache';
import { SETTINGS, DEFAULT_QUALITY_ID, CAPTIONS } from '../constants';
import { QualityList } from './QualityList';
import { SlotView } from './SlotView';

export interface ModalBeaconSelectorProps {
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
  /** Optional initial screen coordinates. */
  initialLocation?: GuiLocation;
  /** Optional callback invoked on modal close. */
  onClose?: (this: void) => void;
  /** 0-based index of the beacon configuration to edit. */
  beaconIndex?: number;
}

/** Modal dialog for configuring beacon types, module contents, qualities, and counts. */
export function ModalBeaconSelector(props: ModalBeaconSelectorProps) {
  const { playerIndex, groupId, chainId, recipeId, recipeVersion, onClose, beaconIndex } = props;
  const chain = Storage.useYafcChain(playerIndex, groupId, chainId);
  const recipe = chain?.recipes[recipeId];

  const win = useWindow(playerIndex, {
    type: 'modal',
    autoCenter: !props.initialLocation,
    initialLocation: props.initialLocation,
    estimatedWidth: 460,
    estimatedHeight: 480,
    onClose,
  });

  const player = typeof game !== 'undefined' && game ? game.get_player(playerIndex) : undefined;

  const initialBeacon = recipe?.machine.beacons && recipe.machine.beacons.length > (beaconIndex || 0) ? recipe.machine.beacons[beaconIndex || 0] : undefined;

  const defaultBeacon = Cache.getAllBeacons()[0];
  const [beaconName, setBeaconName] = useState<string>(initialBeacon?.name !== undefined ? initialBeacon.name : defaultBeacon !== undefined ? defaultBeacon.name : 'beacon');
  const [beaconQuality, setBeaconQuality] = useState<Yafc.QualityInfo>(() => Cache.getQuality(initialBeacon?.quality !== undefined ? initialBeacon.quality : DEFAULT_QUALITY_ID)!);
  const [beaconCountText, setBeaconCountText] = useState<string>(tostring(initialBeacon?.count !== undefined ? initialBeacon.count : SETTINGS.DEFAULT_BEACON_COUNT));
  const [modules, setModules] = useState<Yafc.ModuleSlotConfig[]>(() => {
    return initialBeacon?.modules ? [...initialBeacon.modules] : [];
  });
  const [selectedQuality, setSelectedQuality] = useState<Yafc.QualityInfo>(() => Cache.getQuality(DEFAULT_QUALITY_ID)!);

  const beacon = Cache.getBeacon(beaconName) !== undefined ? Cache.getBeacon(beaconName) : defaultBeacon;
  const recipeInfo = recipe?.recipeName ? Cache.getRecipe(recipe.recipeName) : undefined;
  const machineInfo = recipe?.machine.name ? Cache.getMachine(recipe.machine.name) : undefined;
  const validModules = beacon !== undefined ? Cache.getValidModulesForBeaconAndRecipe(beacon, machineInfo, recipeInfo) : [];

  const maxSlots = (beacon !== undefined ? Cache.getEntityMaxModuleSlots(beacon, beaconQuality) : undefined) || 0;
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
    const count = tonumber(beaconCountText) || 0;
    const existing = recipe?.machine.beacons ? [...recipe.machine.beacons] : [];
    const targetIdx = beaconIndex !== undefined ? beaconIndex : 0;

    if (count > 0 && beaconName) {
      const newConfig: Yafc.BeaconConfig = {
        name: beaconName,
        count,
        quality: beaconQuality.name,
        modules,
      };
      if (targetIdx < existing.length) {
        existing[targetIdx] = newConfig;
      } else {
        existing.push(newConfig);
      }
    } else if (targetIdx < existing.length) {
      existing.splice(targetIdx, 1);
    }

    Storage.setRecipeBeacons(playerIndex, groupId, chainId, recipeId, existing, recipeVersion);
    win.close();
  };

  const handleRemove = () => {
    const existing = recipe?.machine.beacons ? [...recipe.machine.beacons] : [];
    const targetIdx = beaconIndex !== undefined ? beaconIndex : 0;
    if (targetIdx < existing.length) {
      existing.splice(targetIdx, 1);
      Storage.setRecipeBeacons(playerIndex, groupId, chainId, recipeId, existing, recipeVersion);
    }
    win.close();
  };

  return (
    <WindowFrame
      caption={beaconIndex !== undefined && beaconIndex > 0 ? CAPTIONS.CONFIGURE_BEACON_INDEXED(beaconIndex + 1) : CAPTIONS.CONFIGURE_BEACONS_TITLE}
      windowHandle={win}
      draggable={true}
      className="w-480"
    >
      <Frame direction="vertical" className="mt-2 p-8">
        {/* Beacon configuration bar */}
        <HFlow className="items-center gap-x-6 mb-8">
          <Label caption={CAPTIONS.BEACON_COUNT} className="font-bold" />
          <Input text={beaconCountText} className="w-60 h-26 font-bold" onChange={(t: string) => setBeaconCountText(t)} />
          <Label caption={CAPTIONS.BEACON_TYPE_LABEL} className="font-bold ml-8" />
          {Cache.getAllBeacons().map((b: Yafc.BeaconInfo) => (
            <SlotView key={b.name} type="entity" element={b} quality={beaconQuality} isSelected={beaconName === b.name} size={36} player={player} onClick={() => setBeaconName(b.name)} />
          ))}
        </HFlow>

        {/* Modules inserted into beacon */}
        <HFlow className="modal-header-compact">
          <Label caption={CAPTIONS.BEACON_MODULES_STATUS(totalUsedSlots, maxSlots)} className="font-bold" />
          <Button caption={CAPTIONS.CLEAR_MODULES} style="mini_button" onClick={() => setModules([])} />
        </HFlow>

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
        <QualityList
          selectedQuality={beaconQuality}
          onSelectQuality={(q) => {
            setSelectedQuality(q);
            setBeaconQuality(q);
          }}
          player={player}
          buttonSize={28}
        />

        {/* Beacon Allowed Modules Picker */}
        <Label caption={CAPTIONS.ALLOWED_BEACON_MODULES} className="font-semibold mb-4" />
        <ScrollPane className="modal-scroll mb-8">
          <VFlow className="gap-y-4">
            {validModules.map((mod) => {
              const eff = Cache.getModuleEffects(mod, selectedQuality);
              const effStr: string[] = [];
              if (eff?.speed !== undefined && eff.speed !== 0) effStr.push(`Speed: +${eff.speed * 100}%`);
              if (eff?.consumption !== undefined && eff.consumption !== 0) effStr.push(`Power: +${eff.consumption * 100}%`);
              if (eff?.pollution !== undefined && eff.pollution !== 0) effStr.push(`Pollution: ${eff.pollution > 0 ? '+' : ''}${eff.pollution * 100}%`);

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
          <Button caption={(recipe?.machine.beacons?.length || 0) > 1 ? CAPTIONS.REMOVE_THIS_BEACON : CAPTIONS.REMOVE_BEACON} style="red_button" onClick={handleRemove} />
          <Button caption={CAPTIONS.SAVE_APPLY} style="confirm_button" onClick={handleConfirm} />
        </HFlow>
      </Frame>
    </WindowFrame>
  );
}
