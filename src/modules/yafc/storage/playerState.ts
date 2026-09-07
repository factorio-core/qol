import type { PlayerIndex } from 'factorio:runtime';
import { DEFAULT_USER_SETTINGS } from '../constants';
import { notifyGroupsChanged } from './events';

/** Returns persistent state record for a player, initializing if missing. */
export function getPlayerState(playerIndex: PlayerIndex): Yafc.PlayerState {
  return (storage.yafc!.playerState[playerIndex] ??= {});
}

/** Sets active group tab ID for a player. */
export function setPlayerActiveGroup(playerIndex: PlayerIndex, groupId: number): void {
  const state = getPlayerState(playerIndex);
  state.lastGroupId = groupId;
}

/** Sets active chain tab ID within a group for a player. */
export function setPlayerActiveChain(playerIndex: PlayerIndex, groupId: number, chainId: number): void {
  const state = getPlayerState(playerIndex);
  state.activeChainByGroup ??= {};
  state.activeChainByGroup[groupId] = chainId;
}

/** Returns active chain tab ID within a group for a player. */
export function getPlayerActiveChain(playerIndex: PlayerIndex, groupId: number): number | undefined {
  const state = storage.yafc!.playerState[playerIndex];
  return state?.activeChainByGroup?.[groupId];
}

/** Returns user settings for a player with defaults fallback. */
export function getSettings(playerIndex: PlayerIndex): Yafc.UserSettingsConfig {
  return storage.yafc!.playerState[playerIndex]?.settings ?? DEFAULT_USER_SETTINGS;
}

/** Updates user settings for a player and notifies subscribers. */
export function setSettings(playerIndex: PlayerIndex, settings: Yafc.UserSettingsConfig): void {
  const state = getPlayerState(playerIndex);
  state.settings = settings;
  notifyGroupsChanged(false, playerIndex);
}

/** Updates table column order preference for a player and notifies subscribers. */
export function setColumnOrder(playerIndex: PlayerIndex, columnOrder: Yafc.TableColumnId[]): void {
  const state = getPlayerState(playerIndex);
  const current = state.settings ?? DEFAULT_USER_SETTINGS;
  state.settings = {
    ...current,
    columnOrder,
  };
  notifyGroupsChanged(false, playerIndex);
}
