import type { PlayerIndex, LuaPlayer, LocalisedString } from 'factorio:runtime';
import { createElement } from 'fcore/react';
import { HFlow, Label } from 'fcore/react-components';
import { DEFAULT_QUALITY_ID, CAPTIONS } from '../constants';
import * as Cache from '../cache';
import { SlotView } from './SlotView';

export interface QualityListProps {
  /** Currently selected quality identifier. @default 'normal' */
  selectedQuality?: Yafc.QualityInfo;
  /** Callback triggered when a quality button is clicked. */
  onSelectQuality: (this: void, quality: Yafc.QualityInfo) => void;
  /** Player context to query unlocked qualities in current force. */
  player?: LuaPlayer;
  /** Player index if player object is not readily available. */
  playerIndex?: PlayerIndex;
  /** Whether selection is disabled. @default false */
  disabled?: boolean;
  /** Fixed quality enforced by prototype. */
  fixedQuality?: Yafc.QualityInfo;
  /** Optional caption label displayed before buttons. */
  caption?: LocalisedString | string;
  /** Button size in pixels. */
  buttonSize: number;
}

/**
 * Quality selection widget displaying interactive slot buttons with native quality icons and tooltips.
 * Automatically filters or displays unlocked quality tiers for the active player's force.
 * Returns null if the game has 1 or fewer available qualities.
 */
export function QualityList(props: QualityListProps) {
  const defaultQuality = Cache.getQuality(DEFAULT_QUALITY_ID)!;
  const { selectedQuality = defaultQuality, onSelectQuality, player: propPlayer, playerIndex, disabled = false, fixedQuality, caption = CAPTIONS.QUALITY_LABEL, buttonSize } = props;

  let player = propPlayer;
  if (player === undefined && playerIndex !== undefined && typeof game !== 'undefined' && game) {
    player = game.get_player(playerIndex);
  }

  const allQualities = Cache.getAllQualities();

  // If the game does not have multiple quality prototypes, don't render widget
  if (allQualities.length <= 1) {
    return null;
  }

  const effectiveQuality = fixedQuality || selectedQuality;

  return (
    <HFlow className="items-center gap-x-4">
      {caption !== '' && caption !== undefined && <Label caption={caption} className="font-semibold mr-4" />}
      {allQualities.map((q) => {
        const isSelected = effectiveQuality === q;
        const isClickable = !disabled && !fixedQuality;

        return (
          <SlotView
            key={q.name}
            type="quality"
            element={q}
            size={buttonSize}
            isSelected={isSelected}
            player={player}
            enabled={isClickable || isSelected}
            onClick={() => {
              if (isClickable) {
                onSelectQuality(q);
              }
            }}
          />
        );
      })}
    </HFlow>
  );
}
