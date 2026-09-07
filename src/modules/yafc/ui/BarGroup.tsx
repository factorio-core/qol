import type { PlayerIndex, ScrollPaneGuiElement } from 'factorio:runtime';
import { createElement, useDragReorder, useRef, useEffect, useMemo, createRoot } from 'fcore/react';
import { Frame, HFlow, VFlow, Button, SpriteButton, ScrollPane, ConfirmDelete, Indicator } from 'fcore/react-components';
import * as Storage from '../storage';
import { ModalGroupSettings } from './ModalGroupSettings';
import { CAPTIONS } from '../constants';

const TAB_HEIGHT = 40;
const CONTROL_BTN_SIZE = 15;
const MAX_GROUP_NAME_LEN = 25;

/** Truncates group name to fit within tab button bounds. */
function formatGroupName(name: string): string {
  if (!name || name.length <= MAX_GROUP_NAME_LEN) return name || '';
  return name.substring(0, MAX_GROUP_NAME_LEN - 3) + '...';
}

/** Estimates group tab button width based on icon presence and label length. */
function getGroupButtonWidth(g: Yafc.GroupConfig): number {
  const formatted = formatGroupName(g.name);
  const nameLen = formatted.length;
  const iconW = g.icon ? 22 : 0;
  // Factorio default-bold font (~7.0px/char) + icon (22px) + side borders (6px)
  return Math.max(TAB_HEIGHT, Math.ceil(nameLen * 7.0 + iconW + 6));
}

/** Partitions groups into wrapped rows constrained by maximum row width. */
function splitGroupsIntoRows(groups: Yafc.GroupConfig[], maxRowWidth: number): Yafc.GroupConfig[][] {
  if (groups.length === 0) return [[]];

  const rows: Yafc.GroupConfig[][] = [];
  let currentRow: Yafc.GroupConfig[] = [];
  // Row 0 starts with the Add Button (40px)
  let currentWidth: number = TAB_HEIGHT;

  for (const g of groups) {
    const itemW = getGroupButtonWidth(g);

    if (currentRow.length > 0 && currentWidth + itemW > maxRowWidth) {
      rows.push(currentRow);
      currentRow = [g];
      currentWidth = itemW;
    } else {
      currentRow.push(g);
      currentWidth += itemW;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

export interface BarGroupProps {
  /** Player index owning the view. */
  playerIndex: PlayerIndex;
  /** List of groups to display as tabs. */
  groups: Yafc.GroupConfig[];
  /** Currently selected group ID. */
  activeGroupId?: number;
  /** Maximum allowable width in pixels. */
  maxWidth: number;
  /** Maximum number of visible tab rows before scrolling. */
  maxRows: number;
  /** Callback invoked when a group tab is selected. */
  onSelectGroup: (this: void, groupId: number) => void;
}

/** Group tab bar with drag-and-drop reordering, row wrapping, and group management actions. */
export function BarGroup(props: BarGroupProps) {
  const { playerIndex, groups, activeGroupId, maxWidth, maxRows, onSelectGroup } = props;

  const scrollPaneRef = useRef<ScrollPaneGuiElement>();
  const prevGroupCountRef = useRef<number>(groups.length);

  const reorder = useDragReorder<Yafc.GroupConfig, number>({
    items: groups,
    getId: (g) => g.id,
    onCommit: (orderedIds) => {
      Storage.reorderGroups(playerIndex, orderedIds);
    },
  });

  const handleDeleteGroup = (groupId: number) => {
    const nextGroupId = Storage.deleteGroup(playerIndex, groupId);
    if (nextGroupId !== undefined) {
      onSelectGroup(nextGroupId);
    }
  };

  // Auto-scroll to bottom whenever new groups are added
  useEffect(() => {
    if (groups.length > prevGroupCountRef.current) {
      const sp = scrollPaneRef.current;
      if (sp && sp.valid && sp.scroll_to_bottom) {
        sp.scroll_to_bottom();
      }
    }
    prevGroupCountRef.current = groups.length;
  }, [groups.length]);

  const availableWidth = Math.max(200, maxWidth - 45);
  const rows = useMemo(() => splitGroupsIntoRows(reorder.items, availableWidth), [reorder.items, availableWidth]);
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
                  key="btn_add_group"
                  sprite="yafc_add_group"
                  style="slot_button"
                  className="size-40"
                  tooltip={CAPTIONS.ADD_GROUP}
                  onClick={() => {
                    const newGroupId = Storage.createGroup(playerIndex);
                    onSelectGroup(newGroupId);
                    const sp = scrollPaneRef.current;
                    if (sp && sp.valid && sp.scroll_to_bottom) {
                      sp.scroll_to_bottom();
                    }
                  }}
                />
              )}
              {row.map((g) => {
                const isSelected = activeGroupId === g.id;
                const isGhost = reorder.isDragging(g.id);

                const signalTag = g.icon ? `[img=${g.icon}] ` : '';
                const displayName = formatGroupName(g.name);
                const buttonCaption = `${signalTag}${displayName}`;

                const buttonTooltip = g.isPublic ? CAPTIONS.GROUP_TOOLTIP_PUBLIC(g.name) : CAPTIONS.GROUP_TOOLTIP_PRIVATE(g.name);

                return (
                  <HFlow key={g.id} className="items-start h-40">
                    <VFlow className="gap-y-0 h-40">
                      {isGhost ? (
                        <Button
                          key={`ghost_${g.id}`}
                          caption={buttonCaption}
                          style="react_tab_button"
                          className="tab-btn"
                          toggled={true}
                          mouse_button_filter={['left', 'right']}
                          tooltip={CAPTIONS.PLACEMENT_PREVIEW_TOOLTIP}
                          {...reorder.getGhostProps(g.id)}
                        />
                      ) : (
                        <Button
                          key={`btn_tab_${g.id}`}
                          caption={buttonCaption}
                          style="react_tab_button"
                          className="tab-btn"
                          toggled={isSelected}
                          mouse_button_filter={['left', 'right']}
                          tooltip={buttonTooltip}
                          {...reorder.getItemProps(g.id, {
                            onClickNormal: () => onSelectGroup(g.id),
                            onRightClick: (ev) => {
                              const player = game.get_player(playerIndex);
                              if (player && player.valid) {
                                createRoot(
                                  player.gui.screen,
                                  createElement(ModalGroupSettings, {
                                    playerIndex,
                                    groupId: g.id,
                                    initialLocation: ev?.cursor_display_location,
                                  }),
                                );
                              }
                            },
                          })}
                        />
                      )}
                      {g.isPublic && (
                        <Indicator
                          color="green"
                          ignored_by_interaction={true}
                          className="size-15"
                          styles={{
                            top_margin: -TAB_HEIGHT,
                            left_margin: 0,
                            bottom_margin: -CONTROL_BTN_SIZE,
                          }}
                        />
                      )}
                    </VFlow>

                    {!isGhost && isSelected && !reorder.draggedId && (
                      <ConfirmDelete overlay size={CONTROL_BTN_SIZE} tooltip={CAPTIONS.DELETE_GROUP} tooltipConfirm={CAPTIONS.CONFIRM_DELETE_GROUP} onConfirm={() => handleDeleteGroup(g.id)} />
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
