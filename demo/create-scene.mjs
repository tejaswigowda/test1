import * as T from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeSurface } from './surfaces.mjs';

const read = name => readFile( new URL( name, import.meta.url ), 'utf8' );
const paths = JSON.parse( await read( 'data/mesa-paths.geojson' ) );
const buildings = JSON.parse( await read( 'data/mesa-buildings.geojson' ) );
const origin = [ -111.667328704, 33.431791272 ];
const project = ( [ lon, lat ], y = 0 ) => [ ( lon - origin[ 0 ] ) * 111320 * Math.cos( origin[ 1 ] * Math.PI / 180 ), y, -( lat - origin[ 1 ] ) * 111320 ];
const scene = new T.Scene();
scene.name = 'FutureFlux / Red Mountain, Mesa';
scene.background = new T.Color( '#afc3d0' );
scene.fog = new T.Fog( '#afc3d0', 390, 900 );
scene.userData = {
  flux: {
    version: 1, site: 'Red Mountain Multigenerational Center, Mesa, Arizona',
    crs: 'Local tangent approximation: x east, y up, z south; metres',
    origin, heat: { enabled: false, reason: 'no-heat-layer: EDI metadata/reuse licence not accessible' },
    speech: 'Synthetic Dub test speech, NOT a person speaking; original FX3 unmet.',
    source: 'City of Mesa Parks/ParkFinder/MapServer/19 and OpenData/CommunityMaps/MapServer/6',
    licence: 'City of Mesa Data Terms of Use License Agreement',
    attribution: 'City of Mesa GIS / FutureFlux representative reconstruction',
    modifications: 'Projected to local metres; assumed path widths and building height; arranged context; original seeded surface textures and illustrative golden-hour lighting, not surveyed appearance or a solar study.',
    look: { shadows: true, shadowType: T.PCFShadowMap, toneMapping: T.ACESFilmicToneMapping, toneMappingExposure: 0.95 }
  }
};
const material = ( color, extra = {} ) => new T.MeshStandardMaterial( { color, roughness: 0.94, ...extra } );
const sand = makeSurface( T, 'Procedural desert gravel', '#cfbda2', [ 36, 36 ], 11, 0.12 );
const planting = makeSurface( T, 'Procedural planted ground', '#7b895b', [ 24, 7 ], 23, 0.08 );
const roof = makeSurface( T, 'Procedural mineral roof', '#ddd4c4', [ 0.22, 0.22 ], 37, 0.04 );
const stucco = makeSurface( T, 'Procedural warm stucco', '#eee4d0', [ 0.75, 0.75 ], 41, 0.055 );
const foliage = makeSurface( T, 'Procedural foliage', '#56784d', [ 3, 2 ], 53, 0.18 );
const paving = makeSurface( T, 'Procedural jointed paving', '#e1d7c3', [ 1, 1 ], 67, 0.025, true );
function mesh( name, geometry, mat, position, parent = scene ) {
  const m = new T.Mesh( geometry, mat ); m.name = name;
  m.position.set( ...position ); m.castShadow = m.receiveShadow = true; parent.add( m ); return m;
}
mesh( 'Representative desert ground', new T.BoxGeometry( 430, 1, 420 ), sand, [ 0, -0.6, -10 ] );
mesh( 'Representative planted zone', new T.BoxGeometry( 240, 0.1, 70 ), planting, [ 5, -0.03, -85 ] );
const footprint = buildings.features[ 0 ];
const shape = new T.Shape( footprint.geometry.coordinates[ 0 ].map( coordinate => {
  const [ x, , z ] = project( coordinate ); return new T.Vector2( x, -z );
} ) );
const buildingGeometry = new T.ExtrudeGeometry( shape, { depth: 6, bevelEnabled: false } );
const center = mesh( 'Community center / sourced footprint, assumed 6m height', buildingGeometry, [ roof, stucco ], [ 0, 0.05, 0 ] );
center.rotation.x = -Math.PI / 2;
center.userData = { source: 'City of Mesa building OBJECTID 53258', modifications: 'Height is representative, not surveyed.' };
const selected = [
  { objectid: 30121, id: 'center-walk', label: 'Walkway by the community center', aliases: [ 'center-walk', 'community center', 'centro comunitario' ], color: '#d2bc8e' },
  { objectid: 30046, id: 'park-loop', label: 'Walkway along the park loop', aliases: [ 'park-loop', 'park loop', 'circuito del parque' ], color: '#dcd6c1' }
];
for ( const spec of selected ) {
  const feature = paths.features.find( f => f.id === spec.objectid );
  if ( ! feature || feature.geometry.type !== 'LineString' ) throw new Error( `Missing sourced path ${spec.objectid}` );
  const group = new T.Group(); group.name = spec.label;
  const points = feature.geometry.coordinates.map( coordinate => project( coordinate, 0.12 ) );
  group.userData.fluxPath = { id: spec.id, label: spec.label, aliases: spec.aliases, points, source: `Mesa OBJECTID ${spec.objectid} / ${feature.properties.FACILITYID}` };
  scene.add( group );
  for ( let i = 1; i < points.length; i ++ ) {
    const a = new T.Vector3( ...points[ i - 1 ] ), b = new T.Vector3( ...points[ i ] );
    const surface = paving.clone();
    surface.map = paving.map.clone(); surface.map.repeat.set( 1, a.distanceTo( b ) / 3.3 ); surface.map.needsUpdate = true;
    surface.bumpMap = surface.map;
    const piece = mesh( `${spec.id} / ${i}`, new T.BoxGeometry( 3.3, 0.18, a.distanceTo( b ) + 0.1 ), surface, a.clone().add( b ).multiplyScalar( 0.5 ).toArray(), group );
    piece.rotation.y = Math.atan2( b.x - a.x, b.z - a.z );
  }
}
for ( const [ x, z, radius ] of [ [ -68, -68, 6 ], [ -30, -94, 5 ], [ 4, -93, 5 ], [ 38, -100, 6 ], [ 65, -75, 4 ], [ 85, 30, 4 ], [ -82, 38, 4 ], [ 68, 62, 4 ] ] ) {
  mesh( 'Arranged contextual tree / not surveyed', new T.CylinderGeometry( 0.25, 0.4, 4, 8 ), material( '#8a7554' ), [ x, 2, z ] );
  mesh( 'Contextual canopy', new T.SphereGeometry( radius, 14, 9 ), foliage, [ x, 6.8, z ] ).scale.y = 0.8;
}
for ( const [ x, z, color ] of [ [ 39, 39, '#305d70' ], [ 42, 40, '#b77f50' ], [ 39, 43, '#f1ead6' ], [ 35, 40, '#536d54' ] ] ) {
  mesh( 'Arranged participant', new T.CapsuleGeometry( 0.28, 1.05, 4, 8 ), material( color ), [ x, 0.95, z ] );
  mesh( 'Participant head', new T.SphereGeometry( 0.24, 10, 8 ), material( '#bf9979' ), [ x, 1.85, z ] );
}
const hemi = new T.HemisphereLight( '#bfd9ed', '#9d7954', 0.9 ); hemi.name = 'Cool sky / warm ground bounce'; scene.add( hemi );
const sun = new T.DirectionalLight( '#ffe0b0', 4.6 ); sun.name = 'Illustrative golden-hour key / not a dated solar study';
sun.position.set( -95, 55, 60 ); sun.castShadow = true; sun.shadow.mapSize.set( 2048, 2048 );
Object.assign( sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 1, far: 400 } );
sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.08; sun.shadow.radius = 3; scene.add( sun );
const rim = new T.DirectionalLight( '#b5cce6', 0.65 ); rim.name = 'Cool edge fill / illustrative'; rim.position.set( 90, 60, -100 ); scene.add( rim );
const camera = new T.PerspectiveCamera( 43, 16 / 9, 0.1, 2000 );
camera.name = 'FutureFlux overview'; camera.position.set( 130, 115, 160 ); camera.lookAt( 0, 0, -16 ); camera.updateMatrixWorld();
const ops = ( await read( 'ops.mjs' ) ).replace( 'export function', 'function' );
const panel = ( await read( 'panel.mjs' ) ).replace( 'export function', 'function' );
const script = `${ops}\n${panel}\nlet disposeFlux;\nfunction init(){disposeFlux=mountFluxPanel(createFluxHost({THREE,scene,camera}),window.editor?.aiEngine);}\nfunction stop(){if(disposeFlux)disposeFlux();}`;
scene.updateMatrixWorld( true );
const json = {
  metadata: { type: 'App', version: 1, generator: 'FutureFlux / sourced Mesa scene' },
  project: { renderer: 'WebGLRenderer', ...scene.userData.flux.look },
  camera: camera.toJSON(), controls: { center: [ 0, 0, -16 ] }, scene: scene.toJSON(), animations: [],
  scripts: { [ scene.uuid ]: [ { name: 'FutureFlux live operations + disclosure panel', source: script } ] },
  history: { undos: [], redos: [] }, backgroundType: 'Color', environmentType: 'None'
};
const serialized = JSON.stringify( json );
await writeFile( new URL( '../flux.json', import.meta.url ), serialized );
await writeFile( new URL( 'scene.json', import.meta.url ), serialized );
const names = [ '../flux.json', 'scene.json', 'data/mesa-paths.geojson', 'data/mesa-buildings.geojson', 'data/mesa-center.geojson', 'surfaces.mjs', 'ops.mjs', 'panel.mjs', 'install.mjs', 'run.mjs', 'ops.md', 'PROVENANCE.md', 'NOTES.md', 'validation.json', 'speech/english.srt', 'speech/clarify.srt', 'speech/spanish.srt', 'speech/clarify-es.srt' ];
const hashes = await Promise.all( names.map( async name => `${createHash( 'sha256' ).update( await readFile( new URL( name, import.meta.url ) ) ).digest( 'hex' )}  ${name}` ) );
await writeFile( new URL( 'files.sha256', import.meta.url ), hashes.join( '\n' ) + '\n' );
console.log( `Created flux.json and demo/scene.json (${serialized.length} bytes); real Mesa paths 30121 and 30046.` );
