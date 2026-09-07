import type { PlayerIndex, SignalID, GuiLocation, SpritePath } from 'factorio:runtime';
import { createElement, useState, useEffect, useWindow } from 'fcore/react';
import { ModalDialog, HStack, FormField, Input, Checkbox, ChooseElemSlot } from 'fcore/react-components';
import * as Storage from '../storage';
import { CAPTIONS } from '../constants';

export interface ModalGroupSettingsProps {
  /** Player index owning the modal. */
  playerIndex: PlayerIndex;
  /** ID of the group being configured. */
  groupId: number;
  /** Optional initial screen coordinates. */
  initialLocation?: GuiLocation;
  /** Optional callback invoked on modal close. */
  onClose?: (this: void) => void;
}

/** Converts a Factorio sprite path to a SignalID object. */
function parseSpriteToSignal(sprite?: SpritePath): SignalID | undefined {
  if (!sprite) return undefined;
  const slashIdx = sprite.indexOf('/');
  if (slashIdx === -1) return undefined;
  const type = sprite.substring(0, slashIdx);
  const name = sprite.substring(slashIdx + 1);
  return {
    type: (type === 'virtual-signal' ? 'virtual' : type) as SignalID['type'],
    name,
  };
}

/** Converts a SignalID object to a Factorio sprite path. */
function parseSignalToSprite(signal?: SignalID): SpritePath | undefined {
  if (!signal || !signal.name) return undefined;
  const type = signal.type || 'item';
  const prefix = type === 'virtual' ? 'virtual-signal' : type;
  return `${prefix}/${signal.name}` as SpritePath;
}

/** Modal dialog for editing group properties such as name, icon, and public visibility. */
export function ModalGroupSettings(props: ModalGroupSettingsProps) {
  const { playerIndex, groupId, onClose } = props;

  const win = useWindow(playerIndex, {
    type: 'modal',
    autoCenter: !props.initialLocation,
    initialLocation: props.initialLocation,
    estimatedWidth: 350,
    estimatedHeight: 220,
    onClose,
  });

  const group = Storage.getGroup(groupId);

  const [name, setName] = useState(group?.name || '');
  const [icon, setIcon] = useState<string | undefined>(group?.icon);
  const [isPublic, setIsPublic] = useState(group?.isPublic || false);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setIcon(group.icon);
      setIsPublic(group.isPublic);
    }
  }, [groupId]);

  if (!group) return undefined;

  const handleSave = () => {
    Storage.updateGroup(playerIndex, {
      ...group,
      name: name.trim() || group.name,
      icon,
      isPublic,
    });
    win.close();
  };

  return (
    <ModalDialog title={CAPTIONS.GROUP_SETTINGS_TITLE} windowHandle={win} onConfirm={handleSave} confirmText={CAPTIONS.SAVE} onCancel={onClose}>
      <HStack gap="md" align="center">
        <FormField label={CAPTIONS.GROUP_ICON}>
          <ChooseElemSlot size={40} elem_type="signal" elem_value={parseSpriteToSignal(icon)} onChange={(sig) => setIcon(parseSignalToSprite(sig))} tooltip={CAPTIONS.SELECT_GROUP_ICON_TOOLTIP} />
        </FormField>

        <FormField label={CAPTIONS.GROUP_NAME}>
          <Input text={name} autoFocus={true} selectAllOnMount={true} className="w-230" onChange={(text) => setName(text)} onConfirm={handleSave} />
        </FormField>
      </HStack>

      <Checkbox state={isPublic} onChange={(checked) => setIsPublic(checked)} caption={CAPTIONS.PUBLIC_GROUP} tooltip={CAPTIONS.PUBLIC_GROUP_TOOLTIP} />
    </ModalDialog>
  );
}
