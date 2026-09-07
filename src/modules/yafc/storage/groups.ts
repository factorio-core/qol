import type { PlayerIndex } from 'factorio:runtime';
import { notifyGroupsChanged } from './events';
import { getSettings, setPlayerActiveGroup } from './playerState';

/** Allocates next unique group ID. */
export function getNextGroupId(): number {
  return storage.yafc!.nextGroupId++;
}

/** Resolves a group configuration by ID from storage. */
export function getGroup(groupId: number): Yafc.GroupConfig | undefined {
  return storage.yafc!.groups[groupId];
}

/** Returns all groups visible to player (public groups and player-owned private groups). */
export function getGroups(playerIndex: PlayerIndex): Yafc.GroupConfig[] {
  const list: Yafc.GroupConfig[] = [];
  const groups = storage.yafc!.groups;

  for (const id of storage.yafc!.groupIds) {
    const g = groups[id];
    if (g && (g.isPublic || g.ownerPlayerIndex === playerIndex)) {
      list.push(g);
    }
  }

  return list;
}

/** Creates a new group and activates it for player. */
export function createGroup(playerIndex: PlayerIndex, name?: string, isPublic?: boolean): number {
  const groupId = getNextGroupId();
  const existing = getGroups(playerIndex);
  const settings = getSettings(playerIndex);
  const resolvedPublic = isPublic ?? settings.defaultGroupIsPublic;

  const group: Yafc.GroupConfig = {
    id: groupId,
    name: name && name !== '' ? name : `Group ${existing.length + 1}`,
    isPublic: resolvedPublic,
    ownerPlayerIndex: playerIndex,
    nextChainId: 1,
    chainIds: [],
    chains: {},
  };

  storage.yafc!.groups[groupId] = group;
  storage.yafc!.groupIds.push(groupId);
  setPlayerActiveGroup(playerIndex, groupId);

  notifyGroupsChanged(group.isPublic, playerIndex);
  return groupId;
}

/** Updates group configuration in storage and notifies subscribers. */
export function updateGroup(playerIndex: PlayerIndex, group: Yafc.GroupConfig): void {
  storage.yafc!.groups[group.id] = group;
  notifyGroupsChanged(group.isPublic, playerIndex);
}

/** Deletes a group from storage, cleans up player state, and returns next active group ID. */
export function deleteGroup(playerIndex: PlayerIndex, groupId: number): number | undefined {
  const group = getGroup(groupId);
  const isPub = group ? group.isPublic : true;
  storage.yafc!.groups[groupId] = undefined;

  const list = storage.yafc!.groupIds;
  const idx = list.indexOf(groupId);
  if (idx !== -1) {
    list.splice(idx, 1);
  }

  const state = storage.yafc!.playerState[playerIndex];
  let nextGroupId: number | undefined = undefined;
  if (state !== undefined) {
    if (state.lastGroupId === groupId) {
      state.lastGroupId = list[0];
    }
    nextGroupId = state.lastGroupId;
    if (state.activeChainByGroup?.[groupId] !== undefined) {
      state.activeChainByGroup[groupId] = undefined as any;
    }
  }

  notifyGroupsChanged(isPub, playerIndex);
  return nextGroupId;
}

/** Updates visual display order of groups in storage. */
export function reorderGroups(playerIndex: PlayerIndex, orderedIds: number[]): void {
  storage.yafc!.groupIds = orderedIds;
  notifyGroupsChanged(true, playerIndex);
}
