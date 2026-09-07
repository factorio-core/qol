import type { PlayerIndex, ElemID, ScrollPaneGuiElement, LocalisedString, SpritePath } from 'factorio:runtime';
import { createElement, Fragment, useDragReorder, useRef, useEffect, useMemo } from 'fcore/react';
import { Frame, HFlow, VFlow, SpriteButton, ScrollPane, ConfirmDelete } from 'fcore/react-components';
import * as Storage from '../storage';
import * as Cache from '../cache';
import { CAPTIONS, DEFAULT_QUALITY_ID } from '../constants';

const TAB_HEIGHT = 40;
const CONTROL_BTN_SIZE = 15;

export interface BarChainProps {
  /** Player index owning or viewing the chain bar. */
  playerIndex: PlayerIndex;
  /** Current active group configuration. */
  group: Yafc.GroupConfig;
  /** Selected chain ID. */
  activeChainId?: number;
  /** Maximum available width in pixels. */
  maxWidth: number;
  /** Maximum visible rows before scrolling. */
  maxRows: number;
  /** Callback invoked when a chain tab is selected. */
  onSelectChain: (this: void, chainId: number) => void;
}

interface ChainVisual {
  sprite: SpritePath;
  quality?: Yafc.QualityInfo;
  elemTooltip?: ElemID;
  tooltip?: LocalisedString;
}

/** Resolves display sprite, quality, and tooltip for a chain tab button. */
function resolveChainVisual(chain: Yafc.ChainConfig): ChainVisual {
  if (chain.isValid === false) {
    return {
      sprite: 'yafc_questionmark',
      tooltip: CAPTIONS.CHAIN_UNAVAILABLE_TITLE,
    };
  }

  // 1. Primary target or first target if available
  const targets = chain.targets;
  if (targets && targets.length > 0) {
    const primaryIdx = chain.primaryTargetIndex ?? 0;
    const target = targets[primaryIdx] ?? targets[0];
    const quality = target.quality && target.quality !== DEFAULT_QUALITY_ID ? Cache.getQuality(target.quality) : undefined;

    switch (target.resourceType) {
      case 'item':
        return {
          sprite: `item/${target.name}`,
          quality,
          elemTooltip: { type: 'item', name: target.name },
        };
      case 'fluid':
        return {
          sprite: `fluid/${target.name}`,
          quality,
          elemTooltip: { type: 'fluid', name: target.name },
        };
      case 'heat':
        return {
          sprite: Cache.getHeat().sprite,
          quality,
          tooltip: Cache.getHeat().localisedName,
        };
      case 'electricity':
        return {
          sprite: Cache.getElectricity().sprite,
          quality,
          tooltip: Cache.getElectricity().localisedName,
        };
    }
  }

  // 2. Default when no targets
  return {
    sprite: 'yafc_questionmark',
    tooltip: CAPTIONS.CHAIN_TOOLTIP,
  };
}

/** Wraps chain tab items into discrete horizontal row buckets. */
function splitChainsIntoRows(chains: Yafc.ChainConfig[], maxRowWidth: number): Yafc.ChainConfig[][] {
  if (chains.length === 0) return [[]];

  const rows: Yafc.ChainConfig[][] = [];
  let currentRow: Yafc.ChainConfig[] = [];
  // Row 0 starts with the Add Button (40px)
  let currentWidth: number = TAB_HEIGHT;

  for (const c of chains) {
    const itemW = TAB_HEIGHT;

    if (currentRow.length > 0 && currentWidth + itemW > maxRowWidth) {
      rows.push(currentRow);
      currentRow = [c];
      currentWidth = itemW;
    } else {
      currentRow.push(c);
      currentWidth += itemW;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

/** Renders horizontal tab bar for switching, adding, deleting, and reordering production chains. */
export function BarChain(props: BarChainProps) {
  const { playerIndex, group, activeChainId, maxWidth, maxRows, onSelectChain } = props;

  const scrollPaneRef = useRef<ScrollPaneGuiElement>();
  const chains = Storage.useYafcChains(playerIndex, group.id);
  const prevChainCountRef = useRef<number>(chains.length);

  const reorder = useDragReorder<Yafc.ChainConfig, number>({
    items: chains,
    getId: (c) => c.id,
    onCommit: (orderedIds) => {
      Storage.reorderChains(playerIndex, group.id, orderedIds);
    },
  });

  const handleDeleteChain = (chainId: number) => {
    const nextChainId = Storage.deleteChain(playerIndex, group.id, chainId);
    if (nextChainId !== undefined) {
      onSelectChain(nextChainId);
    }
  };

  // Auto-scroll to bottom whenever new chains are added
  useEffect(() => {
    if (chains.length > prevChainCountRef.current) {
      const sp = scrollPaneRef.current;
      if (sp && sp.valid && sp.scroll_to_bottom) {
        sp.scroll_to_bottom();
      }
    }
    prevChainCountRef.current = chains.length;
  }, [chains.length]);

  const availableWidth = Math.max(200, maxWidth - 24);
  const rows = useMemo(() => splitChainsIntoRows(reorder.items, availableWidth), [reorder.items, availableWidth]);
  const tabAreaHeight = Math.min(rows.length, maxRows) * TAB_HEIGHT;

  return (
    <Frame
      direction="horizontal"
      className="stretch p-0"
      styles={{
        height: tabAreaHeight,
        maximal_height: TAB_HEIGHT * maxRows,
      }}
    >
      <ScrollPane
        ref={scrollPaneRef}
        className="stretch"
        styles={{
          height: tabAreaHeight,
          minimal_height: TAB_HEIGHT,
          maximal_height: TAB_HEIGHT * maxRows,
        }}
        horizontal_scroll_policy="never"
        vertical_scroll_policy={rows.length > maxRows ? 'auto-and-reserve-space' : 'never'}
      >
        <VFlow className="stretch">
          {rows.map((row, rIdx) => (
            <HFlow key={rIdx} className="tab-row">
              {rIdx === 0 && (
                <SpriteButton
                  key="btn_add_chain"
                  sprite="yafc_add_chain"
                  style="slot_button"
                  className="size-40"
                  tooltip={CAPTIONS.ADD_CHAIN}
                  onClick={() => {
                    const newChainId = Storage.createChain(playerIndex, group.id);
                    if (newChainId !== undefined) onSelectChain(newChainId);
                    const sp = scrollPaneRef.current;
                    if (sp && sp.valid && sp.scroll_to_bottom) {
                      sp.scroll_to_bottom();
                    }
                  }}
                />
              )}
              {row.map((chain) => {
                const isSelected = activeChainId === chain.id;
                const isGhost = reorder.isDragging(chain.id);
                const isInvalid = chain.isValid === false;
                const visual = resolveChainVisual(chain);
                const buttonStyle = isInvalid ? (isSelected ? 'react_slot_button_red' : 'slot_button') : isSelected ? 'image_tab_selected_slot' : 'image_tab_slot';

                return (
                  <HFlow key={chain.id} className="items-start h-40">
                    {isGhost ? (
                      <SpriteButton
                        key={`ghost_${chain.id}`}
                        sprite={visual.sprite}
                        quality={visual.quality?.name}
                        style="react_slot_button_green"
                        className="size-40"
                        toggled={true}
                        mouse_button_filter={['left', 'right']}
                        tooltip={CAPTIONS.PLACEMENT_PREVIEW_TOOLTIP}
                        {...reorder.getGhostProps(chain.id)}
                      />
                    ) : (
                      <Fragment>
                        <SpriteButton
                          key={`btn_tab_${chain.id}`}
                          sprite={visual.sprite}
                          quality={visual.quality?.name}
                          style={buttonStyle}
                          className="size-40"
                          toggled={isSelected}
                          mouse_button_filter={['left', 'right']}
                          elem_tooltip={visual.elemTooltip}
                          tooltip={visual.tooltip}
                          {...reorder.getItemProps(chain.id, {
                            onClickNormal: () => onSelectChain(chain.id),
                          })}
                        />

                        {isSelected && !reorder.draggedId && (
                          <ConfirmDelete overlay size={CONTROL_BTN_SIZE} tooltip={CAPTIONS.DELETE_CHAIN} tooltipConfirm={CAPTIONS.CONFIRM_DELETE_CHAIN} onConfirm={() => handleDeleteChain(chain.id)} />
                        )}
                      </Fragment>
                    )}
                  </HFlow>
                );
              })}
            </HFlow>
          ))}
        </VFlow>
      </ScrollPane>
    </Frame>
  );
}
