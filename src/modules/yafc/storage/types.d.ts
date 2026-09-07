import type { PlayerIndex, SpritePath } from 'factorio:runtime';

declare global {
  namespace Yafc {
    /**
     * Production table column identifiers.
     */
    type TableColumnId = 'recipe' | 'machine' | 'energy' | 'fuel' | 'modules' | 'beacons' | 'effects' | 'products' | 'ingredients' | 'actions';

    /**
     * User-configurable settings for YAFC calculator.
     */
    interface UserSettingsConfig {
      /** Relative window width ratio (0.5 to 1.0) relative to screen resolution */
      widthRatio: number;
      /** Relative window height ratio (0.5 to 1.0) relative to screen resolution */
      heightRatio: number;
      /** Maximum number of rows displayed for groups bar (1 to 3) */
      maxGroupRows: number;
      /** Maximum number of rows displayed for chains bar (1 to 3) */
      maxChainRows: number;
      /** Maximum module slots rendered per row in table (1 to 6) */
      maxModuleSlotsPerRow: number;
      /** Maximum beacon slots rendered per row in table (1 to 4) */
      maxBeaconSlotsPerRow: number;
      /** Maximum product slots rendered per row in table (1 to 6) */
      maxProductSlotsPerRow: number;
      /** Maximum ingredient slots rendered per row in table (1 to 6) */
      maxIngredientSlotsPerRow: number;
      /** Ordered list of table column IDs */
      columnOrder: TableColumnId[];
      /** Whether newly created groups are public (shared with team) by default */
      defaultGroupIsPublic: boolean;
      /** Filter mode for visible group tabs: 'all' (public + private) or 'private' (private only) */
      groupFilter: 'all' | 'private';
    }

    /**
     * Persistent state per player.
     */
    interface PlayerState {
      /** User-configured settings */
      settings?: UserSettingsConfig;
      /** ID of the last active group opened by this player */
      lastGroupId?: number;
      /** Map of groupId -> active chainId selected by this player */
      activeChainByGroup?: Record<number, number>;
    }

    interface ModuleSlotConfig {
      name: string;
      quality?: string;
      count: number;
    }

    interface BeaconConfig {
      name: string;
      quality?: string;
      count: number;
      modules: ModuleSlotConfig[];
    }

    interface MachineConfig {
      name: string;
      quality?: string;
      fuel?: string;
      modules: ModuleSlotConfig[];
      beacons?: BeaconConfig[];
    }

    type FixedRecipeConstraint =
      | {
          readonly type: 'buildings';
          readonly count: number;
        }
      | {
          readonly type: 'resource';
          readonly ioType: 'input' | 'output';
          readonly resourceType?: ResourceType;
          readonly resourceName: string;
          readonly quality?: string;
          readonly temperature?: number;
          readonly ratePerSec: number;
        }
      | {
          readonly type: 'fuel';
          readonly ratePerSec: number;
        };

    interface RecipeConfig {
      id: number;
      version: number;
      recipeName: string;
      recipeQuality?: string;
      machine: MachineConfig;
      fixedConstraint?: FixedRecipeConstraint;
    }

    interface TargetConstraint {
      readonly resourceType: ResourceType;
      readonly name: string;
      readonly quality?: string;
      readonly temperature?: number;
      readonly ratePerSec: number;
    }

    interface ChainConfig {
      id: number;
      primaryTargetIndex?: number;
      recipes: Record<number, RecipeConfig | undefined>;
      recipeIds: number[];
      targets: TargetConstraint[];
      isValid?: boolean;
      nextRecipeId?: number;
    }

    interface GroupConfig {
      id: number;
      name: string;
      icon?: SpritePath;
      isPublic: boolean;
      ownerPlayerIndex: PlayerIndex;
      nextChainId?: number;
      chainIds: number[];
      chains: Record<number, ChainConfig | undefined>;
    }

    interface StorageSchema {
      groups: Record<number, GroupConfig | undefined>;
      groupIds: number[];
      playerState: Record<PlayerIndex, PlayerState>;
      nextGroupId: number;
    }

    interface EventGroupsChangedPayload {
      isPublic: boolean;
      playerIndex?: PlayerIndex;
    }

    interface EventChainsChangedPayload {
      groupId: number;
      isPublic: boolean;
      playerIndex?: PlayerIndex;
    }

    interface EventChainUpdatedPayload {
      groupId: number;
      chainId: number;
      isPublic: boolean;
      playerIndex?: PlayerIndex;
    }
  }
}
