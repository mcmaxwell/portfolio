# Assets

Every third-party asset in the repository has one row below.
Unknown fields are written as "unknown - to confirm by owner" and are never guessed.
"Date checked" is the date the license or terms page was read by a person; no terms page was fetched or read while preparing this file, so every date is "not checked".

## Notes

1. Mixamo (Adobe): animations and characters downloaded from the Mixamo site are generally understood to be free to use in personal, commercial and non-profit projects, but not to be redistributed as a standalone asset library.
   This statement is background knowledge, not a verified reading of the current terms.
   The owner must confirm the current Mixamo terms before launch.
2. Avaturn: the avatar was generated with Avaturn (https://avaturn.me).
   Avaturn terms for exported avatars were not checked.
   The owner must confirm that the terms allow public web use of the exported model.
3. Derived files carry the terms of their source.
   The stripped clips contain only rotation keyframes (no mesh, skin, material or texture).

## Avatar

| File | Origin | Provider and author | License or terms | Downloaded by and when | Derived outputs and modifications |
|---|---|---|---|---|---|
| `public/avatar.glb` | https://avaturn.me | Avaturn; the avatar depicts the site owner | See note 2; date checked: not checked | unknown - to confirm by owner; added to the repo on 2026-07-02 (commit a891bc4) | clothing bake of 2026-10-06 (see below); otherwise unmodified; loaded by the hero and by the game (shared `useGLTF` cache) |

### Avatar clothing bake

The original Avaturn export (commit a891bc4, 13,986,728 bytes, sha256 `d8d0a77ef9fe8db121440647bcc40239d0be0e27d4c6f7aba83116ba299fef0c`) shows dark and skin-coloured specks at the collar, sleeve openings and hem.
`public/avatar.glb` now has the fix baked in (13,941,696 bytes) by `scripts/bake-avatar-look.mjs` (logic in `scripts/lib/avatar-bake.mjs`):

- the shirt atlas (`avaturn_look_1_material`, a JPEG) has its black padding dilated with the island colour and is re-encoded at quality 92;
- the shirt material is single sided;
- the 170 pants triangles (`avaturn_look_0`) whose three vertices lie under the shirt are removed (the body mesh had none), and so are 60 chest-side neck triangles of `Head_Mesh` under the same rule, after keeping one ring of triangles next to the uncovered neck (removing that ring opened a dark see-through slit at the collar rim);
- skin vertices under the shirt (422 of `Body_Mesh`: tucked until they sit 4 mm under the shirt, at most 12 mm; 55 of `Head_Mesh`: 2 mm and at most 3 mm, because a deeper neck tuck narrows the visible neck) that lie closer to the shirt surface than that, or outside it, are tucked inward along their normal, which closes the single-pixel skin dots at the collar rim, the sleeve hems and the chest that the lift alone left (QA round 2, F5; the cause was skin triangles within a few millimetres of, or poking through, the shirt, mostly the neck base at the collar and the arm tubes at the sleeve openings);
- pants and shirt vertices are pushed 0.7 mm and 1.5 mm along welded normals so body, pants and shirt layer without z-fighting (this replaces the former runtime polygon offset);
- a root `extras.avatarLookBake` marker records the bake.

Meshes, morph targets, skin, joints, animation and every other texture are unchanged (node scale values within 1e-7 of one are written as exactly one by the glTF writer).
Re-run: the script refuses an already baked input and requires the original, so extract it from git and pass it in:

```
git show a891bc4:public/avatar.glb > /path/to/avatar.original.glb
node scripts/bake-avatar-look.mjs --original /path/to/avatar.original.glb
```

The output is byte-identical on every run.
Tool: `jpeg-js` 0.4.4 (dev dependency, pure JavaScript, so the bytes do not depend on the platform).

## Existing Mixamo gesture clips (hero)

All nine files share: origin https://www.mixamo.com, provider Adobe Mixamo, terms per note 1 (date checked: not checked), downloaded by and when: unknown - to confirm by owner (added to the repo on 2026-07-02, commit a891bc4), exported with the Mixamo Beta mesh included (about 98% of each file is mesh data).

| File | Mixamo animation (as recorded by the M0 audit or the owner) | Derived outputs and modifications |
|---|---|---|
| `public/animations/walk.glb` | walk (exact Mixamo title unknown - to confirm by owner; 1.4 s, 42 frames) | hero only. The game copy `assets-src/mixamo/walk.glb` and its stripped clip were superseded by the 2026-10-06 Walking download and removed from the game |
| `public/animations/run.glb` | "Run Forward Arc Left" (title per the Boss; 0.767 s, 23 frames; travels about 31 degrees off forward, Hips yaw drifts about 36 degrees per loop) | hero only. The game copy `assets-src/mixamo/run.glb` and its stripped clip were superseded by the 2026-10-06 Running download (the Arc Left run travelled off forward) and removed from the game |
| `public/animations/wave.glb` | wave (exact Mixamo title unknown - to confirm by owner) | none |
| `public/animations/dance.glb` | dance (exact Mixamo title unknown - to confirm by owner) | none (no file added: the game's beacon celebration loads this existing gesture at run time, `components/game/clips.ts`, first 3.6 s, rotation tracks only) |
| `public/animations/silly_dance.glb` | silly dance (exact Mixamo title unknown - to confirm by owner) | none |
| `public/animations/zombie.glb` | zombie (exact Mixamo title unknown - to confirm by owner) | none |
| `public/animations/defeated.glb` | defeated (exact Mixamo title unknown - to confirm by owner) | none |
| `public/animations/dodge.glb` | dodge (exact Mixamo title unknown - to confirm by owner) | none |
| `public/animations/climb.glb` | climb (exact Mixamo title unknown - to confirm by owner) | none |

## Game source clips (`assets-src/mixamo`)

Six FBX files, downloaded from Mixamo by the site owner and supplied to the repository on 2026-10-06.
The FBX files are not committed, because raw Mixamo downloads include the Mixamo character and are not redistributable from a public repository.
To re-run `npm run strip-clips`, download each title below from mixamo.com (FBX Binary, Without Skin, 30 fps) into `assets-src/mixamo/` under the file name listed.
Each was exported with the Mixamo character mesh included (about 1.8 to 2.3 MB per file).
Terms: note 1 (date checked: not checked).
The earlier walk and run copies (`assets-src/mixamo/walk.glb`, `run.glb`, byte copies of `public/animations/walk.glb` and `run.glb`) are superseded and removed from this directory; the hero keeps its own files under `public/animations`.

| File | Origin | Mixamo animation title | Provider | Provided by owner (download date) | License note | Frames and loop period |
|---|---|---|---|---|---|---|
| `assets-src/mixamo/Idle.fbx` | https://www.mixamo.com | Idle | Adobe Mixamo | 2026-10-06 | note 1 | 250 frames, 8.333 s |
| `assets-src/mixamo/Walking.fbx` | https://www.mixamo.com | Walking | Adobe Mixamo | 2026-10-06 | note 1 | 31 frames, 1.033 s, straight (Hips heading 0 degrees) |
| `assets-src/mixamo/Running.fbx` | https://www.mixamo.com | Running | Adobe Mixamo | 2026-10-06 | note 1 | 19 frames, 0.633 s, straight (Hips heading 0 degrees) |
| `assets-src/mixamo/Jump.fbx` | https://www.mixamo.com | Jump | Adobe Mixamo | 2026-10-06 | note 1 | 65 frames, 2.167 s (crouch, take-off at frame 23, touchdown at frame 39) |
| `assets-src/mixamo/Falling Idle.fbx` | https://www.mixamo.com | Falling Idle | Adobe Mixamo | 2026-10-06 | note 1 | 21 frames, 0.700 s |
| `assets-src/mixamo/Hard Landing.fbx` | https://www.mixamo.com | Hard Landing | Adobe Mixamo | 2026-10-06 | note 1 | 60 frames, 2.000 s |

## Game clips (`public/game/clips`)

Generated by `npm run strip-clips` (`scripts/strip-clips.mjs`), which reads the FBX files above with three's `FBXLoader` in Node.
Per clip the script: removes the `mixamorig` prefix from node names; keeps only rotation tracks whose target is in the avatar joint list read from `public/avatar.glb` (51 per clip); drops the Hips tracks of every clip except `fall` and `land` (rest-rotation mismatch of about 89 degrees on the other sources and root motion; physics owns the position); drops translation tracks; writes no mesh, skin, material or texture; and, for looping clips, drops the duplicated last keyframe only when every track ends on its first value and shifts the keys by one frame so the clip duration equals the true loop period.
`idle` is also resampled (tolerance 0.0005) to stay under 100 KB; `jump` keeps only source frames 21 to 39 (the airborne part, because the motor leaves the ground the moment the key is pressed).
`land` and `fall` keep a Hips height (QA round 2, F1): with the Hips stripped the folded legs of the Hard Landing left both feet 0.84 to 0.95 m in the air, and the Falling Idle feet hung 0.4 m above the capsule bottom.
`land` keeps source frames 2 to 58 (touchdown, crouch, rise; frame 0 is still airborne and frame 59 starts the wrap), the Hips rotation as authored, and a Hips translation track: x and z are the source pelvis travel scaled to the avatar, y is derived per frame so the avatar's lowest foot or toe joint stands on the ground (the pelvis height matches the source within 0.031 m).
The one-knee landing's trailing foot hangs up to 0.13 m high, so `scripts/lib/plant-feet.mjs` lowers it with a two-bone leg IK (largest drop 0.092 m on 35 of 57 frames) and both feet end within 0.05 m of the ground.
`fall` ships only a vertical Hips translation derived the same way, so the feet stay on the capsule bottom and a touchdown starts from the ground.
The avatar skeleton for these solves is read from `public/avatar.glb` by `scripts/lib/avatar-rig.mjs`.
Ground speeds are measured by `node scripts/measure-clips.mjs`.

| File | Source (Mixamo) | Clip title | Provided by owner | License note | Modifications | Size |
|---|---|---|---|---|---|---|
| `public/game/clips/idle.glb` | `assets-src/mixamo/Idle.fbx` | Idle | 2026-10-06 | note 1 and note 3 | rotation-only, Hips removed, resampled | 15.5 KB |
| `public/game/clips/walk.glb` | `assets-src/mixamo/Walking.fbx` | Walking | 2026-10-06 | note 1 and note 3 | rotation-only, Hips removed, loop trimmed (31 frames) | 31.0 KB |
| `public/game/clips/run.glb` | `assets-src/mixamo/Running.fbx` | Running | 2026-10-06 | note 1 and note 3 | rotation-only, Hips removed, loop trimmed (19 frames) | 26.8 KB |
| `public/game/clips/jump.glb` | `assets-src/mixamo/Jump.fbx` | Jump | 2026-10-06 | note 1 and note 3 | rotation-only, Hips removed, frames 21 to 39 only (0.6 s) | 26.7 KB |
| `public/game/clips/fall.glb` | `assets-src/mixamo/Falling Idle.fbx` | Falling Idle | 2026-10-06 | note 1 and note 3 | rotation plus a planted vertical Hips translation, loop trimmed (21 frames) | 25.8 KB |
| `public/game/clips/land.glb` | `assets-src/mixamo/Hard Landing.fbx` | Hard Landing | 2026-10-06 | note 1 and note 3 | rotations plus Hips rotation and translation, frames 2 to 58 (1.867 s), trailing foot lowered by leg IK | 51.1 KB |

Superseded and unused: the previous `walk` (about 0.95 m/s) and the "Run Forward Arc Left" run (travelled about 31 degrees off forward) no longer ship in `public/game/clips`; the old stripped files were overwritten by the clips above.

## Fonts (`app/fonts/jetbrains-mono`)

JetBrains Mono is self-hosted through `next/font/local` in `app/layout.tsx` (it replaces `next/font/google`, so `npm run build` needs no network).
The files are copied unmodified from the npm package `@fontsource/jetbrains-mono` at exactly version 5.3.0 (npm license field OFL-1.1), which repackages the official JetBrains Mono release.
The package is not a dependency of this repo; it was fetched once with `npm pack @fontsource/jetbrains-mono@5.3.0` and only the files below were copied.
Shipped: latin subset, woff2, normal style, weights 400 and 700 only (the site uses the default weight and `font-bold`; no other weight and no italic is used anywhere).
The license file is `app/fonts/jetbrains-mono/OFL.txt` (SIL Open Font License 1.1, copied from the same package); date checked: not checked.

| File | Weight | Size | sha256 |
|---|---|---|---|
| `app/fonts/jetbrains-mono/jetbrains-mono-latin-400-normal.woff2` | 400 | 21,168 bytes | `14425ba9c695763c1547f48a206b7aa60350a33ae23de09f0407877f3fcd89eb` |
| `app/fonts/jetbrains-mono/jetbrains-mono-latin-700-normal.woff2` | 700 | 21,908 bytes | `d0d4e818808f2a0ba39b2b09d1989366f63494e295f003c7ef436697378507e8` |
| `app/fonts/jetbrains-mono/OFL.txt` | license | - | `403581b69dac5cff4079205e01c6b467e56af449ecbd7247693ddb1baafa005b` |

## World visuals (procedural, no files)

The campus look (milestone 3 visual pass) ships no image, model or font file.
Every texture is drawn on a canvas at runtime by `components/game/world/textures.ts` and `components/game/world/materials.ts` (grass, paving, gravel, plaster, ashlar stone, standing-seam roof, steel, planks, leaves, bark, floor tile, cliff, windows, project screens, beacon pad, light pools).
The sky is a fragment shader (`components/game/world/sky.ts`); trees, lamps, bushes, rocks, windows and trim are instanced primitives from `components/game/world/decor.ts`.
Source and licence: written for this repository, same terms as the repository code; no third-party asset, no network fetch.
Additional first-play bytes: 0 bytes of assets; about 11 KB gzip of game JavaScript (sum of per-chunk gzip, production build before and after: 1,291,564 to 1,302,567 bytes).
Runtime memory: 12 tiling textures (512 x 512 and 256 x 256 with mipmaps) and 11 small canvases, roughly 10 MB of GPU memory.
