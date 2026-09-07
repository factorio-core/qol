import type { PlayerIndex } from 'factorio:runtime';
import { useState, useEffect, useEvent } from 'fcore/react';
import { EVENTS } from '../constants';
import { getGroups, getGroup } from './groups';
import { getChain, getGroupChains } from './chains';

/** Reactive hook subscribing to YAFC production groups for a player. */
export function useYafcGroups(playerIndex: PlayerIndex): Yafc.GroupConfig[] {
  const [groups, setGroups] = useState<Yafc.GroupConfig[]>(() => getGroups(playerIndex));

  useEvent<Yafc.EventGroupsChangedPayload>(EVENTS.GROUPS_CHANGED, (e) => {
    if (e.isPublic || e.playerIndex === playerIndex) {
      setGroups([...getGroups(playerIndex)]);
    }
  });

  return groups;
}

/** Reactive hook subscribing to chains of a specific group. */
export function useYafcChains(playerIndex: PlayerIndex, groupId: number): Yafc.ChainConfig[] {
  const [chains, setChains] = useState<Yafc.ChainConfig[]>(() => {
    const group = getGroup(groupId);
    return group ? getGroupChains(group) : [];
  });

  useEffect(() => {
    const group = getGroup(groupId);
    setChains(group ? [...getGroupChains(group)] : []);
  }, [groupId]);

  useEvent<Yafc.EventChainsChangedPayload>(EVENTS.CHAINS_CHANGED, (e) => {
    if (e.groupId === groupId && (e.isPublic || e.playerIndex === playerIndex)) {
      const group = getGroup(groupId);
      setChains(group ? [...getGroupChains(group)] : []);
    }
  });

  return chains;
}

/** Reactive hook subscribing to an individual production chain. */
export function useYafcChain(playerIndex: PlayerIndex, groupId?: number, chainId?: number): Yafc.ChainConfig | undefined {
  const [chain, setChain] = useState<Yafc.ChainConfig | undefined>(() => {
    if (!groupId || !chainId) return undefined;
    const group = getGroup(groupId);
    return group ? getChain(group, chainId) : undefined;
  });

  useEffect(() => {
    if (!groupId || !chainId) {
      setChain(undefined);
      return;
    }
    const group = getGroup(groupId);
    const c = group ? getChain(group, chainId) : undefined;
    setChain(c ? { ...c } : undefined);
  }, [groupId, chainId]);

  useEvent<Yafc.EventChainUpdatedPayload>(EVENTS.CHAIN_UPDATED, (e) => {
    if (e.groupId === groupId && e.chainId === chainId && (e.isPublic || e.playerIndex === playerIndex)) {
      const group = getGroup(groupId);
      const c = group ? getChain(group, chainId) : undefined;
      setChain(c ? { ...c } : undefined);
    }
  });

  return chain;
}
