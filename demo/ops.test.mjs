import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFluxHost } from './ops.mjs';

function fixture() {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera( 60, 16 / 9, 0.1, 200 );
  camera.position.set( 0, 25, 30 ); camera.lookAt( 0, 0, 0 );
  for ( const [ id, x, aliases ] of [ [ 'center-walk', -5, [ 'community center', 'centro comunitario' ] ], [ 'park-loop', 5, [ 'park loop', 'circuito del parque' ] ] ] ) {
    const path = new T.Mesh( new T.BoxGeometry( 3, 0.2, 10 ), new T.MeshStandardMaterial() );
    path.position.x = x; path.userData.fluxPath = { id, label: id, aliases, source: 'UNIT TEST FIXTURE', points: [ [ x, 0, -5 ], [ x, 0, 5 ] ] };
    scene.add( path );
  }
  return { scene, camera, host: createFluxHost( { THREE: T, scene, camera } ) };
}
const answer = proposal => async () => JSON.stringify( proposal );

test( 'a model guess cannot bypass genuine two-path ambiguity; clarification resolves it', async () => {
  const { host, scene } = fixture();
  let observed;
  const model = async ( messages, schema ) => {
    observed = JSON.parse( messages[ 1 ].content );
    assert.deepEqual( schema.oneOf[ 0 ].properties.path.enum, [ 'center-walk', 'park-loop' ] );
    return JSON.stringify( { op: 'shade.add', path: 'center-walk', kind: 'canopy' } );
  };
  const result = await host.hear( 'What if we shaded this walkway?', model );
  assert.equal( result.reason, 'ambiguous-path' );
  assert.equal( observed.visiblePaths.length, 2 );
  assert.equal( scene.children.filter( o => o.userData.fluxShade ).length, 0 );
  assert.ok( host.pending );
  assert.equal( ( await host.hear( 'What if we shaded this walkway?', answer( { op: 'shade.width', value: 20 } ) ) ).reason, 'ambiguous-path' );
  for ( const object of scene.children ) assert.notEqual( object.material.emissive.getHex(), 0 );
  const resolved = await host.hear( 'the one by the community center', model );
  assert.equal( resolved.ok, true ); assert.equal( resolved.path, 'center-walk' );
  assert.equal( observed.pending.op, 'shade.add' );
  assert.equal( host.pending, null );
  assert.equal( scene.children.filter( o => o.userData.fluxShade ).length, 1 );
} );

test( 'Spanish target grounding uses the supplied candidate rather than a new geometry ID', async () => {
  const { host } = fixture();
  assert.equal( ( await host.hear( 'Este camino', answer( { op: 'shade.add', path: 'park-loop', kind: 'canopy' } ) ) ).reason, 'ambiguous-path' );
  assert.equal( ( await host.hear( 'El del centro comunitario', answer( { op: 'shade.add', path: 'center-walk', kind: 'canopy' } ) ) ).path, 'center-walk' );
} );

test( 'a single visible candidate makes a deictic reference unambiguous', async () => {
  const { host, scene } = fixture();
  scene.children[ 1 ].visible = false;
  assert.equal( ( await host.hear( 'Shade this walkway', answer( { op: 'shade.add', path: 'center-walk', kind: 'canopy' } ) ) ).ok, true );
} );

test( 'candidate enumeration excludes hidden and out-of-frame paths, and edits stay bounded', () => {
  const { host, scene } = fixture();
  scene.children[ 1 ].visible = false;
  assert.deepEqual( host.candidates().map( p => p.id ), [ 'center-walk' ] );
  assert.equal( host.execute( { op: 'shade.add', path: 'park-loop', kind: 'canopy' } ).reason, 'no-such-path' );
  assert.equal( host.execute( { op: 'shade.add', path: 'center-walk', kind: 'alien' } ).reason, 'out-of-range' );
  const added = host.execute( { op: 'shade.add', path: 'center-walk', kind: 'canopy' } );
  assert.equal( added.ok, true );
  for ( const value of [ 0, 13, NaN, Infinity, '6' ] ) assert.equal( host.execute( { op: 'shade.width', value } ).reason, 'out-of-range' );
  assert.equal( host.execute( { op: 'shade.width', value: 6 } ).ok, true );
  assert.equal( scene.children.find( o => o.userData.fluxShade ).userData.fluxShade.width, 6 );
  assert.equal( host.execute( { op: 'shade.material', id: '__proto__' } ).reason, 'out-of-range' );
  assert.equal( host.execute( { op: 'shade.material', id: 'canvas-teal' } ).ok, true );
  assert.equal( host.execute( { op: 'heat.show', layer: 'fictional' } ).reason, 'no-heat-layer' );
  assert.equal( host.execute( { op: 'toString' } ).reason, 'out-of-range' );
  assert.equal( host.execute( { op: 'shade.width', value: 4, extra: true } ).reason, 'out-of-range' );
  assert.equal( host.execute( { op: 'shade.remove', id: added.id } ).ok, true );
  scene.children[ 0 ].position.x = 10000;
  assert.equal( host.candidates().length, 0 );
} );

test( 'missing models, malformed output and model errors are named failures, never success', async () => {
  const { host } = fixture();
  assert.equal( ( await host.hear( 'Shade this path', null ) ).reason, 'model-unavailable' );
  assert.equal( ( await host.hear( 'Shade this path', async () => 'not JSON' ) ).reason, 'invalid-proposal' );
  assert.equal( ( await host.hear( 'Shade this path', async () => { throw new Error( 'GPU lost' ); } ) ).reason, 'model-error' );
  assert.equal( host.busy, false );
  assert.match( host.journal.at( -1 ).detail, /GPU lost/ );
} );
