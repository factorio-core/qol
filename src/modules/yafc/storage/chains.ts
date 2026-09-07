import type { PlayerIndex } from 'factorio:runtime';
import { DEFAULT_QUALITY_ID } from '../constants';
import { notifyChainsChanged, notifyChainUpdated } from './events';
import { setPlayerActiveChain } from './playerState';
import { getGroup } from './groups';

/** Resolves a chain configuration by ID within a group. */
export function getChain(group: Yafc.GroupConfig, chainId: number): Yafc.ChainConfig | undefined {
  return group.chains[chainId];
}

/** Returns all chains belonging to a group in stored order. */
export function getGroupChains(group: Yafc.GroupConfig): Yafc.ChainConfig[] {
  const list: Yafc.ChainConfig[] = [];
  for (const id of group.chainIds) {
    const c = group.chains[id];
    if (c) list.push(c);
  }
  return list;
}

/** Creates a new chain in a group and activates it for player. */
export function createChain(playerIndex: PlayerIndex, groupId: number): number | undefined {
  const group = getGroup(groupId);
  if (!group) return undefined;

  const chainId = group.nextChainId ?? group.chainIds.length + 1;
  group.nextChainId = chainId + 1;

  const chain: Yafc.ChainConfig = {
    id: chainId,
    recipes: {},
    recipeIds: [],
    targets: [],
    isValid: true,
    nextRecipeId: 1,
  };

  group.chains[chainId] = chain;
  group.chainIds.push(chainId);
  setPlayerActiveChain(playerIndex, groupId, chainId);
  notifyChainsChanged(groupId, group.isPublic, playerIndex);
  return chainId;
}

/** Deletes a chain from a group and updates player active chain state. */
export function deleteChain(playerIndex: PlayerIndex, groupId: number, chainId: number): number | undefined {
  const group = getGroup(groupId);
  if (!group) return undefined;

  group.chains[chainId] = undefined;
  const idx = group.chainIds.indexOf(chainId);
  if (idx !== -1) {
    group.chainIds.splice(idx, 1);
  }

  const state = storage.yafc!.playerState[playerIndex];
  let nextChainId: number | undefined = group.chainIds[0];
  if (state?.activeChainByGroup?.[groupId] === chainId) {
    state.activeChainByGroup[groupId] = nextChainId;
  } else if (state?.activeChainByGroup?.[groupId] !== undefined) {
    nextChainId = state.activeChainByGroup[groupId];
  }

  notifyChainsChanged(groupId, group.isPublic, playerIndex);
  return nextChainId;
}

/** Updates visual display order of chains in a group. */
export function reorderChains(playerIndex: PlayerIndex, groupId: number, orderedIds: number[]): void {
  const group = getGroup(groupId);
  if (!group) return;

  group.chainIds = orderedIds;
  notifyChainsChanged(groupId, group.isPublic, playerIndex);
}

/** Adds or updates a target production goal constraint for a chain. */
export function setChainTarget(
  playerIndex: PlayerIndex,
  groupId: number,
  chainId: number,
  resourceType: Yafc.ResourceType,
  name: string,
  ratePerSec: number,
  quality: string = DEFAULT_QUALITY_ID,
  temperature?: number,
): void {
  const group = getGroup(groupId);
  if (!group) return;

  const chain = getChain(group, chainId);
  if (!chain) return;

  if (!chain.targets) chain.targets = [];

  const existingIdx = chain.targets.findIndex((t) => t.resourceType === resourceType && t.name === name && (t.quality || DEFAULT_QUALITY_ID) === quality && t.temperature === temperature);

  const targetEntry: Yafc.TargetConstraint = {
    resourceType,
    name,
    ratePerSec,
    quality,
    temperature,
  };

  if (existingIdx !== -1) {
    chain.targets[existingIdx] = targetEntry;
  } else {
    chain.targets.push(targetEntry);
  }

  notifyChainsChanged(groupId, group.isPublic, playerIndex);
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
}

/** Removes a target production goal constraint from a chain. */
export function removeChainTarget(
  playerIndex: PlayerIndex,
  groupId: number,
  chainId: number,
  resourceType: Yafc.ResourceType,
  name: string,
  quality: string = DEFAULT_QUALITY_ID,
  temperature?: number,
): void {
  const group = getGroup(groupId);
  if (!group) return;

  const chain = getChain(group, chainId);
  if (!chain) return;

  if (chain.targets !== undefined) {
    const idx = chain.targets.findIndex((t) => t.resourceType === resourceType && t.name === name && (t.quality || DEFAULT_QUALITY_ID) === quality && t.temperature === temperature);
    if (idx !== -1) {
      chain.targets.splice(idx, 1);
      if (chain.primaryTargetIndex !== undefined) {
        if (idx === chain.primaryTargetIndex) {
          chain.primaryTargetIndex = undefined;
        } else if (idx < chain.primaryTargetIndex) {
          chain.primaryTargetIndex--;
        }
      }
    }
  }

  notifyChainsChanged(groupId, group.isPublic, playerIndex);
  notifyChainUpdated(groupId, chainId, group.isPublic, playerIndex);
}

/** Sets which target goal constraint supplies the display icon for the chain. */
export function setChainPrimaryTarget(playerIndex: PlayerIndex, groupId: number, chainId: number, targetIndex: number): void {
  const group = getGroup(groupId);
  if (!group) return;

  const chain = getChain(group, chainId);
  if (!chain) return;

  if (chain.primaryTargetIndex !== targetIndex) {
    chain.primaryTargetIndex = targetIndex;
    notifyChainsChanged(groupId, group.isPublic, playerIndex);
  }
}

export const setChainIconFromTarget = setChainPrimaryTarget;
