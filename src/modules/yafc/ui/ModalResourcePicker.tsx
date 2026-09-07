import type { PlayerIndex, TextFieldGuiElement, GuiLocation } from 'factorio:runtime';
import { createElement, useState, useRef, useEffect, useMemo, useWindow } from 'fcore/react';
import { WindowFrame, Frame, HFlow, VFlow, Label, Input, ScrollPane, Table, SpriteButton } from 'fcore/react-components';
import * as Storage from '../storage';
import * as Cache from '../cache';
import { createSearchMatcher } from 'fcore/utils/translate';
import { CAPTIONS, DEFAULT_QUALITY_ID } from '../constants';
import { QualityList } from './QualityList';
import { SlotView } from './SlotView';

export interface ModalResourcePickerProps {
  /** Player index owning the modal. */
  playerIndex: PlayerIndex;
  /** Optional ID of the parent group. */
  groupId?: number;
  /** Optional ID of the production chain. */
  chainId?: number;
  /** Picker selection mode: 'recipe', 'resource', or 'item'. @default 'recipe' */
  mode?: 'recipe' | 'resource' | 'item';
  /** Filter criteria restricting selectable entries. */
  filter?: Yafc.RecipeFilter;
  /** Initial search text query. */
  initialSearch?: string;
  /** Optional initial screen coordinates. */
  initialLocation?: GuiLocation;
  /** Callback invoked when a recipe is selected. */
  onSelectRecipe?: (this: void, recipeName: string) => void;
  /** Callback invoked when a resource (item or fluid) is selected. */
  onSelectResource?: (this: void, resourceName: string, isFluid: boolean, temperature?: number) => void;
  /** Callback invoked when an item is selected. */
  onSelectItem?: (this: void, itemName: string, isFluid: boolean) => void;
  /** Optional callback invoked on modal close. */
  onClose?: (this: void) => void;
}

/** Modal catalog browser for searching and selecting Factorio recipes, items, and fluid resources. */
export function ModalResourcePicker(props: ModalResourcePickerProps) {
  const { playerIndex, groupId, chainId, mode = 'recipe', filter, initialSearch = '', onSelectRecipe, onSelectResource, onSelectItem, onClose } = props;

  const player = typeof game !== 'undefined' && game ? game.get_player(playerIndex) : undefined;
  const isResourceMode = mode === 'resource' || mode === 'item';

  const [pinnedResource, setPinnedResource] = useState<string | undefined>(filter?.name);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const initialQuality = filter?.quality ?? Cache.getQuality(DEFAULT_QUALITY_ID)!;
  const [selectedQuality, setSelectedQuality] = useState<Yafc.QualityInfo>(initialQuality);
  const [selectedGroup, setSelectedGroup] = useState<string>(filter?.group || 'all');
  const searchInputRef = useRef<TextFieldGuiElement>();

  const minTemp = filter?.minTemperature !== undefined ? tostring(filter.minTemperature) : '';
  const maxTemp = filter?.maxTemperature !== undefined ? tostring(filter.maxTemperature) : '';
  const exactTemp = filter?.temperature !== undefined ? tostring(filter.temperature) : '';

  const win = useWindow(playerIndex, {
    type: 'modal',
    autoCenter: !props.initialLocation,
    initialLocation: props.initialLocation,
    estimatedWidth: 500,
    estimatedHeight: 600,
    onClose,
  });

  // Focus the search input field upon opening or quality change
  useEffect(() => {
    if (searchInputRef.current && searchInputRef.current.valid) {
      searchInputRef.current.focus();
    }
  }, [selectedQuality]);

  const handleSelectQuality = (q: Yafc.QualityInfo) => {
    setSelectedQuality(q);
    if (searchInputRef.current && searchInputRef.current.valid) {
      searchInputRef.current.focus();
    }
  };

  const handleSelectRecipe = (recipeName: string) => {
    const rec = Cache.getRecipe(recipeName);
    const validQuality = rec !== undefined ? Cache.resolveRecipeQuality(rec, selectedQuality) : selectedQuality;
    if (groupId !== undefined && chainId !== undefined) {
      Storage.addRecipeToChain(playerIndex, groupId, chainId, recipeName, validQuality.name);
    }
    if (onSelectRecipe) {
      onSelectRecipe(recipeName);
    }
    win.close();
  };

  const handleSelectResource = (resource: Yafc.ResourceInfo) => {
    const validQuality = Cache.resolveResourceQuality(resource, selectedQuality);
    const resName = Cache.getResourceName(resource);
    const resTemp = Cache.getResourceTemperature(resource);
    if (groupId !== undefined && chainId !== undefined) {
      Storage.setChainTarget(playerIndex, groupId, chainId, resource.type, resName, 1.0, validQuality.name, resTemp);
    }
    if (onSelectResource) {
      onSelectResource(resName, resource.type === 'fluid', resTemp);
    } else if (onSelectItem) {
      onSelectItem(resName, resource.type === 'fluid');
    }
    win.close();
  };

  const currentGroups = isResourceMode ? Cache.getResourceGroups() : Cache.getRecipeGroups();

  const matcher = useMemo(() => {
    return createSearchMatcher(playerIndex, ['item', 'fluid'], searchQuery);
  }, [playerIndex, searchQuery]);

  // Unified query for active subgroups (always returns populated subgroups in native Factorio order)
  const activeSubgroups = useMemo(() => {
    if (isResourceMode) {
      return Cache.getResourceSubgroups({
        group: selectedGroup,
        search: searchQuery,
        matcher,
      });
    }

    const minT = pinnedResource !== undefined && filter?.minTemperature !== undefined ? filter.minTemperature : undefined;
    const maxT = pinnedResource !== undefined && filter?.maxTemperature !== undefined ? filter.maxTemperature : undefined;
    const exactT = pinnedResource !== undefined && filter?.temperature !== undefined ? filter.temperature : undefined;

    return Cache.getRecipeSubgroups({
      filterType: pinnedResource !== undefined ? filter?.filterType : undefined,
      type: pinnedResource !== undefined ? filter?.type : undefined,
      name: pinnedResource,
      search: pinnedResource === undefined ? searchQuery : undefined,
      quality: selectedQuality,
      minTemperature: minT,
      maxTemperature: maxT,
      temperature: exactT,
      group: selectedGroup,
      matcher: pinnedResource === undefined ? matcher : undefined,
    });
  }, [isResourceMode, pinnedResource, filter?.filterType, filter?.type, filter?.minTemperature, filter?.maxTemperature, filter?.temperature, selectedQuality, selectedGroup, searchQuery, matcher]);

  const windowTitle = isResourceMode ? CAPTIONS.ITEM_PICKER_TITLE : CAPTIONS.RECIPE_PICKER_TITLE;

  return (
    <WindowFrame caption={windowTitle} windowHandle={win} draggable={true} className="w-440">
      <Frame direction="vertical" className="w-424 min-w-424 max-w-424 mt-2 p-8">
        {/* Row 1: Search Input */}
        <HFlow className="w-400 items-center gap-x-6 mb-6">
          <Label caption={CAPTIONS.SEARCH} className="font-bold items-center" />
          <Input
            ref={searchInputRef}
            text={searchQuery}
            className="stretch"
            onChange={(text) => {
              setSearchQuery(text);
              if (pinnedResource !== undefined && text.trim().length > 0) {
                setPinnedResource(undefined);
              }
            }}
          />
        </HFlow>

        {/* Row 2: Quality Tab Row under Search Input */}
        <HFlow className="w-400 items-center gap-x-4 mb-6">
          <QualityList selectedQuality={selectedQuality} onSelectQuality={handleSelectQuality} player={player} buttonSize={26} caption="" />
        </HFlow>

        {/* Row 3: Pinned Resource Slot + Temperature Indicators under Quality */}
        {pinnedResource !== undefined && (
          <HFlow className="w-400 items-center gap-x-6 mb-6">
            {(() => {
              const pTemp = exactTemp !== '' ? tonumber(exactTemp) : undefined;
              const resType = filter?.type || 'item';
              const resObj = Cache.getResource(resType, pinnedResource, pTemp);
              return resObj ? <SlotView type="resource" size={40} element={resObj} quality={selectedQuality} player={player} enabled={false} /> : null;
            })()}

            {minTemp !== '' && <Label caption={CAPTIONS.MIN_TEMP_LABEL} className="font-small-bold items-center" />}
            {minTemp !== '' && <Input text={minTemp} enabled={false} className="w-55" />}
            {maxTemp !== '' && <Label caption={CAPTIONS.MAX_TEMP_LABEL} className="font-small-bold items-center ml-4" />}
            {maxTemp !== '' && <Input text={maxTemp} enabled={false} className="w-55" />}
            {exactTemp !== '' && <Label caption={CAPTIONS.EXACT_TEMP_LABEL} className="font-small-bold items-center ml-4" />}
            {exactTemp !== '' && <Input text={exactTemp} enabled={false} className="w-55" />}
          </HFlow>
        )}

        {/* Row 4: Groups Selection Grid */}
        <Table column_count={10} className="w-400 min-w-400 max-w-400">
          <SpriteButton
            key="all"
            sprite="utility/search_icon"
            style={selectedGroup === 'all' ? 'react_slot_button_green' : 'slot_button'}
            className="size-40"
            tooltip={CAPTIONS.ALL_GROUPS}
            onClick={() => {
              setSelectedGroup('all');
              if (searchInputRef.current && searchInputRef.current.valid) {
                searchInputRef.current.focus();
              }
            }}
          />
          {currentGroups.map((g) => (
            <SpriteButton
              key={g.name}
              sprite={g.sprite}
              style={selectedGroup === g.name ? 'react_slot_button_green' : 'slot_button'}
              className="size-40"
              tooltip={g.localisedName}
              onClick={() => {
                setSelectedGroup(g.name);
                if (searchInputRef.current && searchInputRef.current.valid) {
                  searchInputRef.current.focus();
                }
              }}
            />
          ))}
        </Table>
      </Frame>

      {/* Main Content Area: Always structured by Subgroup Grid Rows */}
      <ScrollPane className="w-424 min-w-424 max-w-424 mt-4 h-400" horizontal_scroll_policy="never" vertical_scroll_policy="auto-and-reserve-space">
        {activeSubgroups.length > 0 ? (
          <VFlow className="w-400 gap-y-2">
            {isResourceMode
              ? (activeSubgroups as readonly (readonly Yafc.ResourceInfo[])[]).map((resources, idx) => (
                  <Table key={idx} column_count={10} className="w-400 min-w-400 max-w-400">
                    {resources.map((res: Yafc.ResourceInfo) => {
                      const effQuality = Cache.resolveResourceQuality(res, selectedQuality);
                      const resName = Cache.getResourceName(res);
                      const resTemp = Cache.getResourceTemperature(res);
                      return (
                        <SlotView
                          key={res.type === 'fluid' ? `${resName}@${resTemp}` : resName}
                          type="resource"
                          size={40}
                          element={res}
                          quality={effQuality}
                          player={player}
                          onClick={() => handleSelectResource(res)}
                        />
                      );
                    })}
                  </Table>
                ))
              : (activeSubgroups as readonly (readonly Yafc.RecipeInfo[])[]).map((recipes, idx) => (
                  <Table key={idx} column_count={10} className="w-400 min-w-400 max-w-400">
                    {recipes.map((r: Yafc.RecipeInfo) => {
                      const effQuality = Cache.resolveRecipeQuality(r, selectedQuality);
                      return <SlotView key={r.name} type="recipe" size={40} element={r} quality={effQuality} player={player} onClick={() => handleSelectRecipe(r.name)} />;
                    })}
                  </Table>
                ))}
          </VFlow>
        ) : (
          <Label caption={CAPTIONS.NO_RECIPES_FOUND} className="font-small text-zinc-500 mt-8" />
        )}
      </ScrollPane>
    </WindowFrame>
  );
}
