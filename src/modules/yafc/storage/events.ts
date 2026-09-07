import type { PlayerIndex } from 'factorio:runtime';
import { raise } from 'fcore/utils/event';
import { EVENTS } from '../constants';

/** Initializes persistent storage table for YAFC state if uninitialized. */
export function initStorage(): void {
  storage.yafc ??= {
    nextGroupId: 1,
    groupIds: [],
    groups: {},
    playerState: {},
  };
}

/** Emits an event indicating group membership or ordering has changed. */
export function notifyGroupsChanged(isPublic: boolean, playerIndex?: PlayerIndex): void {
  const payload: Yafc.EventGroupsChangedPayload = { isPublic, playerIndex };
  raise(EVENTS.GROUPS_CHANGED, payload);
}

/** Emits an event indicating chain membership or ordering has changed. */
export function notifyChainsChanged(groupId: number, isPublic: boolean, playerIndex?: PlayerIndex): void {
  const payload: Yafc.EventChainsChangedPayload = { groupId, isPublic, playerIndex };
  raise(EVENTS.CHAINS_CHANGED, payload);
}

/** Emits an event indicating chain contents or calculations have updated. */
export function notifyChainUpdated(groupId: number, chainId: number, isPublic: boolean, playerIndex?: PlayerIndex): void {
  const payload: Yafc.EventChainUpdatedPayload = { groupId, chainId, isPublic, playerIndex };
  raise(EVENTS.CHAIN_UPDATED, payload);
}
