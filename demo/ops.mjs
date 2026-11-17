export function createFluxHost( { THREE: T, scene, camera, changed = () => {}, commit = null } ) {
  const kinds = [ 'canopy', 'sail', 'trees' ];
  const materials = { 'canvas-sand': '#e5c58b', 'canvas-teal': '#168e93', timber: '#947052' };
  let selected = null, serial = 0, pending = null, busy = false;
  const journal = [];
  const refuse = ( reason, detail ) => ( { ok: false, reason, detail } );
  const log = result => { journal.push( { at: new Date().toISOString(), ...result } ); return result; };
  const replace = ( add, remove = null ) => {
    if ( commit ) commit( add, remove );
    else { if ( remove ) scene.remove( remove ); if ( add ) scene.add( add ); }
    changed();
  };
  function candidates() {
    camera.updateMatrixWorld();
    scene.updateMatrixWorld( true );
    const frustum = new T.Frustum().setFromProjectionMatrix( new T.Matrix4().multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ) );
    const out = [];
    scene.traverse( object => {
      if ( ! object.userData.fluxPath ) return;
      for ( let p = object; p; p = p.parent ) if ( ! p.visible ) return;
      if ( ! frustum.intersectsBox( new T.Box3().setFromObject( object ) ) ) return;
      const { id, label, aliases, source } = object.userData.fluxPath;
      out.push( { id, label, aliases, source } );
    } );
    return out.sort( ( a, b ) => a.id.localeCompare( b.id ) );
  }
  function makeShade( path, kind, settings ) {
    const group = new T.Group();
    group.name = settings.id;
    group.userData.fluxShade = { ...settings, path: path.userData.fluxPath.id, kind };
    const fabric = new T.MeshStandardMaterial( { color: materials[ settings.material ], roughness: 0.85, side: T.DoubleSide } );
    const post = new T.MeshStandardMaterial( { color: '#475153', roughness: 0.8 } );
    const points = path.userData.fluxPath.points;
    const mesh = ( geometry, material, position, parent ) => {
      const object = new T.Mesh( geometry, material );
      object.position.set( ...position ); object.castShadow = true; object.receiveShadow = true;
      parent.add( object ); return object;
    };
    for ( let i = 1; i < points.length; i ++ ) {
      const a = new T.Vector3( ...points[ i - 1 ] ), b = new T.Vector3( ...points[ i ] );
      const length = a.distanceTo( b );
      if ( length < 0.2 ) continue;
      const part = new T.Group(), middle = a.clone().add( b ).multiplyScalar( 0.5 );
      part.position.copy( middle ); part.rotation.y = Math.atan2( b.x - a.x, b.z - a.z ); group.add( part );
      if ( kind === 'trees' ) {
        const n = Math.max( 2, Math.ceil( length / 7 ) );
        for ( let j = 0; j < n; j ++ ) for ( const side of [ -1, 1 ] ) {
          const x = side * ( settings.width / 2 + 1.5 ), z = ( j / ( n - 1 ) - 0.5 ) * length;
          mesh( new T.CylinderGeometry( 0.16, 0.24, settings.height ), post, [ x, settings.height / 2, z ], part );
          mesh( new T.SphereGeometry( settings.width / 2, 12, 8 ), new T.MeshStandardMaterial( { color: '#527b51', roughness: 1 } ), [ x, settings.height, z ], part );
        }
      } else {
        const roof = mesh( new T.BoxGeometry( settings.width, 0.13, length + 0.5 ), fabric, [ 0, settings.height, 0 ], part );
        if ( kind === 'sail' ) {
          roof.geometry.dispose();
          roof.geometry = new T.ConeGeometry( settings.width * 0.7, 0.8, 4, 1, true );
          roof.scale.z = length / settings.width; roof.rotation.y = Math.PI / 4;
        }
        for ( const x of [ -settings.width / 2, settings.width / 2 ] ) for ( const z of [ -length / 2, length / 2 ] ) {
          mesh( new T.CylinderGeometry( 0.1, 0.1, settings.height ), post, [ x, settings.height / 2, z ], part );
        }
      }
    }
    return group;
  }
  function pathById( id ) {
    let found = null;
    scene.traverse( o => { if ( o.userData.fluxPath?.id === id ) found = o; } );
    return found;
  }
  const selectedShade = () => scene.children.find( o => o.userData.fluxShade?.id === selected );
  function resize( key, value, min, max ) {
    if ( typeof value !== 'number' || ! Number.isFinite( value ) || value < min || value > max ) return refuse( 'out-of-range', `${ key } must be ${ min } to ${ max } metres.` );
    const old = selectedShade();
    if ( ! old ) return refuse( 'no-such-path', 'Add or select a shade proposal before revising it.' );
    const settings = { ...old.userData.fluxShade, [ key ]: value };
    replace( makeShade( pathById( settings.path ), settings.kind, settings ), old );
    return { ok: true, id: selected, [ key ]: value };
  }
  const shade = {
    add( id, kind ) {
      if ( ! kinds.includes( kind ) ) return refuse( 'out-of-range', `kind must be ${ kinds.join( ', ' ) }.` );
      if ( ! candidates().some( p => p.id === id ) ) return refuse( 'no-such-path', `No visible candidate path named ${ String( id ) }.` );
      const settings = { id: `shade-${ String( ++serial ).padStart( 3, '0' ) }`, width: 4, height: 3.5, material: 'canvas-sand' };
      replace( makeShade( pathById( id ), kind, settings ) ); selected = settings.id;
      return { ok: true, id: selected, path: id, kind };
    },
    width: value => resize( 'width', value, 1, 12 ),
    height: value => resize( 'height', value, 2.2, 8 ),
    material( id ) {
      if ( ! Object.hasOwn( materials, id ) ) return refuse( 'out-of-range', `material must be ${ Object.keys( materials ).join( ', ' ) }.` );
      const old = selectedShade();
      if ( ! old ) return refuse( 'no-such-path', 'No shade proposal is selected.' );
      const settings = { ...old.userData.fluxShade, material: id };
      replace( makeShade( pathById( settings.path ), settings.kind, settings ), old );
      return { ok: true, id: selected, material: id };
    },
    remove( id ) {
      const object = scene.children.find( o => o.userData.fluxShade?.id === id );
      if ( ! object ) return refuse( 'no-such-path', `No shade proposal named ${ String( id ) }.` );
      replace( null, object ); if ( selected === id ) selected = null;
      return { ok: true, id };
    }
  };
  const view = {
    focus( id ) {
      const object = pathById( id ) || scene.children.find( o => o.userData.fluxShade?.id === id );
      if ( ! object ) return refuse( 'no-such-path', `No path or proposal named ${ String( id ) }.` );
      const center = new T.Box3().setFromObject( object ).getCenter( new T.Vector3() );
      camera.lookAt( center ); changed(); return { ok: true, id };
    },
    orbit( degrees ) {
      if ( ! Number.isFinite( degrees ) || Math.abs( degrees ) > 180 ) return refuse( 'out-of-range', 'orbit must be -180 to 180 degrees.' );
      camera.position.applyAxisAngle( new T.Vector3( 0, 1, 0 ), degrees * Math.PI / 180 );
      camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld(); changed();
      return { ok: true, degrees };
    }
  };
  const heat = {
    show: layer => refuse( 'no-heat-layer', `No licensed, pinned heat layer is installed (${ String( layer ) }). Beat 8 is not enabled.` ),
    hide: () => ( { ok: true, visible: false } )
  };
  function execute( proposal ) {
    if ( ! proposal || typeof proposal !== 'object' || Array.isArray( proposal ) ) return log( refuse( 'out-of-range', 'An operation must be an object from the documented grammar.' ) );
    const operations = {
      'shade.add': [ shade.add, [ 'path', 'kind' ] ], 'shade.width': [ shade.width, [ 'value' ] ],
      'shade.height': [ shade.height, [ 'value' ] ], 'shade.material': [ shade.material, [ 'id' ] ],
      'shade.remove': [ shade.remove, [ 'id' ] ], 'view.focus': [ view.focus, [ 'id' ] ],
      'view.orbit': [ view.orbit, [ 'value' ] ], 'heat.show': [ heat.show, [ 'layer' ] ], 'heat.hide': [ heat.hide, [] ]
    };
    const spec = Object.hasOwn( operations, proposal.op ) ? operations[ proposal.op ] : null;
    if ( ! spec || Object.keys( proposal ).some( key => key !== 'op' && ! spec[ 1 ].includes( key ) ) || spec[ 1 ].some( key => ! Object.hasOwn( proposal, key ) ) ) return log( refuse( 'out-of-range', 'Unknown operation, missing argument or extra argument.' ) );
    return log( { op: proposal.op, ...spec[ 0 ]( ...spec[ 1 ].map( key => proposal[ key ] ) ) } );
  }
  function highlight( ids ) {
    scene.traverse( o => {
      if ( ! o.userData.fluxPath ) return;
      o.traverse( child => {
        if ( child.isMesh && child.material.emissive ) child.material.emissive.set( ids.includes( o.userData.fluxPath.id ) ? '#b76515' : '#000000' );
      } );
    } );
    changed();
  }
  function schema( paths ) {
    const operation = ( op, properties = {} ) => ( {
      type: 'object', additionalProperties: false, properties: { op: { const: op }, ...properties }, required: [ 'op', ...Object.keys( properties ) ]
    } );
    const str = { type: 'string' }, num = { type: 'number' };
    return { oneOf: [
      operation( 'shade.add', { path: { enum: paths.map( p => p.id ) }, kind: { enum: kinds } } ),
      operation( 'shade.width', { value: num } ), operation( 'shade.height', { value: num } ),
      operation( 'shade.material', { id: { enum: Object.keys( materials ) } } ), operation( 'shade.remove', { id: str } ),
      operation( 'view.focus', { id: str } ), operation( 'view.orbit', { value: num } ),
      operation( 'heat.show', { layer: str } ), operation( 'heat.hide' ),
      operation( 'refuse', { reason: { enum: [ 'ambiguous-path', 'no-such-path', 'out-of-range', 'no-heat-layer' ] }, detail: str } )
    ] };
  }
  async function hear( text, model, notify = () => {} ) {
    if ( busy ) return log( refuse( 'busy', 'A model request is already in progress.' ) );
    if ( typeof text !== 'string' || ! text.trim() ) return log( refuse( 'out-of-range', 'An actual transcript is required.' ) );
    const paths = candidates();
    notify( { phase: 'candidates', paths, text } );
    if ( ! paths.length ) return log( refuse( 'no-such-path', 'No walkways intersect the current view.' ) );
    if ( typeof model !== 'function' ) return log( refuse( 'model-unavailable', 'Load a real Strata model before sending the transcript.' ) );
    busy = true;
    const started = performance.now();
    try {
      const messages = [
        { role: 'system', content: 'You select ONE JSON operation, not JavaScript. Never invent numbers, IDs or geometry. shade.add(path,kind) proposes shade over a named visible path; kind is canopy unless sail or trees was explicitly requested. shade.width(value) and shade.height(value) ONLY revise an existing selected shade when a numeric size was spoken. shade.material(id) changes its material; shade.remove(id) removes it. view.focus(id) and view.orbit(value) move the view. heat.show(layer) requires a published layer; heat.hide() hides it. If two visible paths fit "this walkway" or "este camino", return {"op":"refuse","reason":"ambiguous-path","detail":"Two paths fit. Which walkway?"}. Do not guess a path. If pending is shade.add and the clarification names a candidate alias, return shade.add with THAT candidate ID and pending.kind. A question asking to shade is shade.add, NEVER shade.width. Output JSON only, matching the supplied grammar.' },
        { role: 'user', content: JSON.stringify( { transcript: text, visiblePaths: paths, pending, selectedShade: selected, materials: Object.keys( materials ), heatLayers: [] } ) }
      ];
      const raw = await model( messages, schema( paths ) );
      let proposal;
      try { proposal = JSON.parse( raw ); }
      catch { return log( refuse( 'invalid-proposal', 'The model did not return valid JSON. Nothing was changed.' ) ); }
      if ( ! proposal || typeof proposal !== 'object' || Array.isArray( proposal ) ) return log( refuse( 'invalid-proposal', 'The model must select an operation object.' ) );
      notify( { phase: 'model', raw, elapsedMs: performance.now() - started } );
      const normalized = text.toLowerCase().normalize( 'NFD' ).replace( /[\u0300-\u036f]/g, '' );
      const explicit = paths.filter( p => [ p.id, ...p.aliases ].some( alias => normalized.includes( alias ) ) );
      const shadeRequest = proposal.op === 'shade.add' || proposal.op === 'refuse' && proposal.reason === 'ambiguous-path' || ! selected && /\b(shade|shaded|shading|sombra)\b/.test( normalized );
      if ( shadeRequest && paths.length > 1 && explicit.length !== 1 ) {
        pending = { op: 'shade.add', kind: kinds.includes( proposal.kind ) ? proposal.kind : pending?.kind || 'canopy', transcript: text };
        highlight( paths.map( p => p.id ) );
        return log( { ...refuse( 'ambiguous-path', `${ paths.length } walkways are visible. "${ text }" does not name one uniquely. Which walkway: ${ paths.map( p => p.label ).join( ' or ' ) }?` ), model: proposal, elapsedMs: performance.now() - started } );
      }
      if ( proposal.op === 'refuse' ) {
        if ( ! [ 'ambiguous-path', 'no-such-path', 'out-of-range', 'no-heat-layer' ].includes( proposal.reason ) || typeof proposal.detail !== 'string' || Object.keys( proposal ).some( key => ! [ 'op', 'reason', 'detail' ].includes( key ) ) ) return log( refuse( 'invalid-proposal', 'The model refusal is outside the closed grammar.' ) );
        return log( refuse( proposal.reason, proposal.detail ) );
      }
      if ( proposal.op === 'shade.add' && ( explicit.length === 1 ? explicit[ 0 ].id !== proposal.path : paths.length !== 1 || paths[ 0 ].id !== proposal.path ) ) return log( refuse( 'ambiguous-path', 'The selected path is not uniquely grounded in the transcript. Please name a candidate.' ) );
      const result = execute( proposal );
      if ( result.ok ) { pending = null; highlight( [] ); }
      return result;
    } catch ( error ) {
      return log( refuse( 'model-error', String( error.message || error ) ) );
    } finally { busy = false; }
  }
  return { candidates, shade, view, heat, execute, hear, journal, highlight, get pending() { return pending; }, get busy() { return busy; } };
}
