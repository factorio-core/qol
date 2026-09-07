import type { PlayerIndex } from 'factorio:runtime';
import { createElement, Fragment, useState, useEffect, useWindow } from 'fcore/react';
import { WindowFrame, SpriteButton, VFlow } from 'fcore/react-components';
import * as Storage from '../storage';
import { BarGroup } from './BarGroup';
import { BarChain } from './BarChain';
import { ChainView } from './ChainView';
import { SettingsView } from './SettingsView';
import { CAPTIONS } from '../constants';

export interface YafcWindowProps {
  /** Player index owning the window. */
  playerIndex: PlayerIndex;
}

/** Main YAFC calculator window hosting group and chain tab bars, production solver views, and settings. */
export function YafcWindow(props: YafcWindowProps) {
  const { playerIndex } = props;
  const allGroups = Storage.useYafcGroups(playerIndex);
  const [settings, setSettings] = useState<Yafc.UserSettingsConfig>(() => Storage.getSettings(playerIndex));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [needsAutoCenter, setNeedsAutoCenter] = useState(false);

  const groupFilter = settings.groupFilter;
  const groups = groupFilter === 'private' ? allGroups.filter((g) => !g.isPublic) : allGroups;

  const win = useWindow(playerIndex);
  const playerState = Storage.getPlayerState(playerIndex);

  const [activeGroupId, setActiveGroupId] = useState<number | undefined>(() => {
    const last = playerState.lastGroupId;
    return last !== undefined && groups.some((g) => g.id === last) ? last : groups[0]?.id;
  });
  const activeGroup = (activeGroupId !== undefined ? groups.find((g) => g.id === activeGroupId) : undefined) || (groups.length > 0 ? groups[0] : undefined);

  const [activeChainId, setActiveChainId] = useState<number | undefined>(() => {
    if (!activeGroup) return undefined;
    const saved = playerState.activeChainByGroup?.[activeGroup.id];
    return saved !== undefined && activeGroup.chainIds.includes(saved) ? saved : activeGroup.chainIds[0];
  });

  const validChainId =
    activeChainId !== undefined && activeGroup?.chainIds.includes(activeChainId)
      ? activeChainId
      : activeGroup
        ? playerState.activeChainByGroup?.[activeGroup.id] !== undefined && activeGroup.chainIds.includes(playerState.activeChainByGroup[activeGroup.id]!)
          ? playerState.activeChainByGroup[activeGroup.id]
          : activeGroup.chainIds[0]
        : undefined;

  const player = typeof game !== 'undefined' && game ? game.get_player(playerIndex) : undefined;
  const res = player?.display_resolution || { width: 1920, height: 1080 };
  const scale = player?.display_scale || 1.0;
  const screenW = res.width / scale;
  const screenH = res.height / scale;

  const winW = Math.floor(screenW * settings.widthRatio);
  const winH = Math.floor(screenH * settings.heightRatio);

  useEffect(() => {
    if (needsAutoCenter) {
      win.autoCenter();
      setNeedsAutoCenter(false);
    }
  }, [needsAutoCenter, winW, winH]);

  const handleToggleGroupFilter = () => {
    const nextFilter: 'all' | 'private' = groupFilter === 'private' ? 'all' : 'private';
    const nextSettings: Yafc.UserSettingsConfig = {
      ...settings,
      groupFilter: nextFilter,
    };
    Storage.setSettings(playerIndex, nextSettings);
    setSettings(nextSettings);
  };

  const handleSelectGroup = (groupId: number) => {
    const targetGroup = groups.find((g) => g.id === groupId);
    const savedChainId = targetGroup ? playerState.activeChainByGroup?.[groupId] : undefined;
    const targetChainId = targetGroup && savedChainId !== undefined && targetGroup.chainIds.includes(savedChainId) ? savedChainId : targetGroup?.chainIds[0];

    setActiveGroupId(groupId);
    setActiveChainId(targetChainId);
    Storage.setPlayerActiveGroup(playerIndex, groupId);
    if (targetChainId !== undefined) {
      Storage.setPlayerActiveChain(playerIndex, groupId, targetChainId);
    }
  };

  const handleSelectChain = (chainId: number) => {
    setActiveChainId(chainId);
    if (activeGroup) {
      Storage.setPlayerActiveChain(playerIndex, activeGroup.id, chainId);
    }
  };

  return (
    <WindowFrame
      caption={CAPTIONS.TITLE}
      windowHandle={win}
      style="inside_shallow_frame"
      styles={{ width: winW, height: winH }}
      titleDecoration={
        <Fragment>
          <SpriteButton
            sprite={groupFilter === 'private' ? 'yafc_filter_private' : 'yafc_filter_all'}
            style="frame_action_button"
            tooltip={groupFilter === 'private' ? CAPTIONS.FILTER_PRIVATE_GROUPS : CAPTIONS.FILTER_ALL_GROUPS}
            onClick={handleToggleGroupFilter}
          />
          <SpriteButton
            sprite="react_settings_white"
            style="frame_action_button"
            tooltip={isSettingsOpen ? CAPTIONS.BACK_TO_CALCULATOR : CAPTIONS.TOGGLE_SETTINGS}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          />
        </Fragment>
      }
    >
      <VFlow className="stretch stretch-v">
        {isSettingsOpen ? (
          <SettingsView
            playerIndex={playerIndex}
            currentSettings={settings}
            onSave={(newSettings, isWindowSizeChanged) => {
              Storage.setSettings(playerIndex, newSettings);
              setSettings(newSettings);
              setIsSettingsOpen(false);
              if (isWindowSizeChanged) {
                win.autoCenter();
                setNeedsAutoCenter(true);
              }
            }}
            onClose={() => setIsSettingsOpen(false)}
          />
        ) : (
          <Fragment>
            {/* Group Bar */}
            <BarGroup playerIndex={playerIndex} groups={groups} activeGroupId={activeGroupId} maxWidth={winW} maxRows={settings.maxGroupRows} onSelectGroup={handleSelectGroup} />

            {/* Chain Bar */}
            {activeGroup && <BarChain playerIndex={playerIndex} group={activeGroup} activeChainId={validChainId} maxWidth={winW} maxRows={settings.maxChainRows} onSelectChain={handleSelectChain} />}

            {/* Unified Chain View */}
            <ChainView
              playerIndex={playerIndex}
              groupId={activeGroup?.id}
              chainId={validChainId}
              isPinned={false}
              columnOrder={settings.columnOrder}
              onColumnOrderChange={(newOrder) => {
                setSettings({ ...settings, columnOrder: newOrder });
              }}
            />
          </Fragment>
        )}
      </VFlow>
    </WindowFrame>
  );
}
