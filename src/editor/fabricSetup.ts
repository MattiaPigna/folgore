import { Canvas2dFilterBackend, FabricObject, InteractiveFabricObject, setFilterBackend } from 'fabric';
import { installTextEffects } from './textEffects';
import type { AnimConfig } from './videoAnim';
import type { BgFx, ColorFx } from './colorFx';

declare module 'fabric' {
  interface FabricObject {
    id?: string;
    name?: string;
    binding?: string;
    role?: 'background' | 'decor' | 'element';
    assetId?: string | null;
    boxW?: number;
    boxH?: number;
    fitMode?: 'contain' | 'cover';
    autoText?: boolean;
    lockedLayer?: boolean;
    keepCase?: boolean;
    fx?: any;
    groupId?: string;
    groupName?: string;
    textCase?: 'upper' | 'lower' | 'title' | 'none';
    imgFx?: string;
    imgFxAmount?: number;
    /** Goal video only: entrance animation (not used by the static graphics editor). */
    anim?: AnimConfig;
    /** Goal video only: continuous (whole-video) color/glow effect. */
    colorFx?: ColorFx;
    /** Goal video only: continuous animated background effect (meaningful on the background object). */
    bgFx?: BgFx;
  }
  interface SerializedObjectProps {
    id?: string;
    name?: string;
    binding?: string;
    role?: string;
    assetId?: string | null;
    boxW?: number;
    boxH?: number;
    fitMode?: 'contain' | 'cover';
    autoText?: boolean;
    lockedLayer?: boolean;
    keepCase?: boolean;
    fx?: any;
    groupId?: string;
    groupName?: string;
    textCase?: 'upper' | 'lower' | 'title' | 'none';
    imgFx?: string;
    imgFxAmount?: number;
    anim?: AnimConfig;
    colorFx?: ColorFx;
    bgFx?: BgFx;
  }
}

/** Custom props that must survive serialization (Fabric drops unknown props otherwise). */
export const CUSTOM_PROPS: any[] = [
  'id',
  'name',
  'binding',
  'role',
  'assetId',
  'boxW',
  'boxH',
  'fitMode',
  'autoText',
  'lockedLayer',
  'keepCase',
  'fx',
  'groupId',
  'groupName',
  'textCase',
  'imgFx',
  'imgFxAmount',
  'anim',
  'colorFx',
  'bgFx',
  'selectable',
  'evented',
  'lockMovementX',
  'lockMovementY',
  'lockScalingX',
  'lockScalingY',
  'lockRotation',
  'hasControls',
];

let done = false;

export function setupFabric(): void {
  if (done) return;
  done = true;
  // Canvas2D filters: no WebGL texture size limit for large background photos.
  setFilterBackend(new Canvas2dFilterBackend());
  installTextEffects();

  const accent = '#f43f5e';
  InteractiveFabricObject.ownDefaults = {
    ...InteractiveFabricObject.ownDefaults,
    borderColor: accent,
    cornerColor: '#ffffff',
    cornerStrokeColor: accent,
    cornerStyle: 'circle',
    cornerSize: 11,
    transparentCorners: false,
    borderScaleFactor: 1.5,
    padding: 0,
  };
  FabricObject.ownDefaults = { ...FabricObject.ownDefaults, objectCaching: true };
}
