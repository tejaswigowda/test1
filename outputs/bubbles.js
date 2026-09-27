// ── game.js (Bubble Shooter) ───────────────────────────────────────────────────
// Strata Play entry module for outputs/bubbles.glb. This scene ships no physics
// labels (ctx.world is null) and one authored "#Bubble" prototype mesh — every
// bubble in play (the shooter's own bubble, its queue, and the whole hanging
// grid) is a clone of it with its own cloned + recolored material, never a
// shared one. Movement/collision here are plain per-frame math against the
// scene's own authored court (same Table/Rail_Left/Rail_Right span this
// repo's Pong uses).

export default function init( ctx ) {

	const { THREE, $S, input, camera, scene, onFrame, onReset, reset, state } = ctx;

	const bubbleProto = $S( '#Bubble' ).toArray()[ 0 ];
	const bubbleParent = bubbleProto.parent;

	// the re-exported scene's ground/backdrop planes are finite; a matching clear
	// color hides their edges at wide aspect ratios instead of showing void
	scene.background = new THREE.Color( 0x93b48e );

	// ── Sound effects — Web Audio only (no audio files), all routed through
	// ctx.audio.destination so the strata-play header's mute toggle silences
	// every one of these for free, with no mute bookkeeping in this file at all.
	const audioCtx = ctx.audio.context;

	function tone( { freq, duration = 0.12, type = 'sine', gain = 0.2, freqEnd, delay = 0 } ) {

		const start = audioCtx.currentTime + delay;
		const osc = audioCtx.createOscillator();
		const g = audioCtx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime( freq, start );
		if ( freqEnd ) osc.frequency.exponentialRampToValueAtTime( freqEnd, start + duration );
		g.gain.setValueAtTime( gain, start );
		g.gain.exponentialRampToValueAtTime( 0.0001, start + duration );
		osc.connect( g ).connect( ctx.audio.destination );
		osc.start( start );
		osc.stop( start + duration );

	}

	function sfxFire() { tone( { freq: 720, freqEnd: 380, duration: 0.09, type: 'triangle', gain: 0.18 } ); }
	function sfxBounce() { tone( { freq: 260, duration: 0.05, type: 'square', gain: 0.08 } ); }
	function sfxSettle() { tone( { freq: 160, duration: 0.06, type: 'sine', gain: 0.1 } ); }
	function sfxDescend() { tone( { freq: 100, freqEnd: 70, duration: 0.35, type: 'sawtooth', gain: 0.12 } ); }

	function sfxPop( comboSize ) {

		const notes = [ 523.25, 659.25, 783.99, 1046.5 ]; // C5 E5 G5 C6 — bigger combos ring further up the arpeggio
		const count = Math.min( notes.length, Math.max( 1, comboSize - 2 ) );
		for ( let i = 0; i < count; i ++ ) tone( { freq: notes[ i ], duration: 0.14, type: 'sine', gain: 0.16, delay: i * 0.05 } );

	}

	function sfxWin() { [ 523.25, 659.25, 783.99, 1046.5 ].forEach( ( f, i ) => tone( { freq: f, duration: 0.18, type: 'triangle', gain: 0.18, delay: i * 0.12 } ) ); }
	function sfxLose() { [ 392, 349.23, 293.66, 246.94 ].forEach( ( f, i ) => tone( { freq: f, duration: 0.22, type: 'sawtooth', gain: 0.15, delay: i * 0.14 } ) ); }

	// ── Layout — width/size-dependent numbers are derived from the loaded
	// scene's own Table/Bubble meshes (never hardcoded), so a re-exported GLB
	// with a different table width or bubble scale still lines up correctly:
	// a true hex grid, odd rows shifted half a bubble right (one fewer column),
	// so every bubble sits snugly against all 6 neighbors, not just 4.
	const TABLE_HALF_WIDTH = new THREE.Box3().setFromObject( $S( '#Table' ).toArray()[ 0 ] ).max.x;
	const BUBBLE_RADIUS = new THREE.Box3().setFromObject( bubbleProto ).getSize( new THREE.Vector3() ).x / 2;
	// the authored prototype's own Y sits it half-sunk into the table (a modeling
	// offset, not a gameplay choice) — every bubble instead rests tangent to the
	// table's own top surface, derived from the table's geometry, not baked-in.
	const TABLE_TOP_Y = new THREE.Box3().setFromObject( $S( '#Table' ).toArray()[ 0 ] ).max.y;
	const BUBBLE_Y = TABLE_TOP_Y + BUBBLE_RADIUS;
	const TOUCH_DIST = BUBBLE_RADIUS * 2; // true sphere-tangent distance — the threshold a flying shot snaps to the grid at
	const WALL_X = TABLE_HALF_WIDTH - BUBBLE_RADIUS; // rail inner face minus bubble radius
	const EDGE_MARGIN = BUBBLE_RADIUS * 0.27; // keeps the outer columns a hair clear of the rail instead of exactly tangent
	const USABLE_WIDTH = 2 * ( WALL_X - EDGE_MARGIN );
	const COLS = Math.max( 5, Math.round( USABLE_WIDTH / ( BUBBLE_RADIUS * 2 * 1.23 ) ) + 1 ); // ~snug hex spacing at whatever bubble size this export uses
	const SPACING = USABLE_WIDTH / ( COLS - 1 );
	const ROW_SPACING = SPACING * Math.sqrt( 3 ) / 2; // true hex packing: diagonal neighbors end up exactly SPACING apart too
	const GRID_LEFT_X = - ( COLS - 1 ) / 2 * SPACING;
	const TOP_Z = - 11;             // topmost grid row's z
	const SHOOTER_Z = bubbleProto.position.z; // the authored prototype's own spot
	const DANGER_Z = 6.5;            // a bubble reaching this far down the lane ends the game
	const INITIAL_ROWS = 3;
	const SHOT_SPEED = 14;
	const AIM_SPEED = 1.6;           // radians/sec
	const MAX_AIM = Math.PI / 2.6;   // ~69° either side of straight ahead
	const DESCEND_EVERY = 6;         // shots between a new row dropping in — the genre's own pressure valve
	const QUEUE_SIZE = 3;            // upcoming bubbles shown behind the shooter
	const QUEUE_SPACING = BUBBLE_RADIUS * 0.8; // tight enough that the camera can stay zoomed in on the board
	const QUEUE_SCALE_RATIO = 0.65; // relative to the shooter's own baked-in scale, not an absolute size
	const COLORS = [ 0xff4d4d, 0xffd23f, 0x3dd6d0, 0x4d79ff, 0xb366ff ];

	let topAbsoluteRow = 0; // the true identity of array index 0 — shifts by -1 each descend so a row's real offset parity never flips just because unshift moved it to a new array index
	function isOffsetRow( row ) { return ( ( topAbsoluteRow + row ) % 2 + 2 ) % 2 === 1; }
	function colsInRow( row ) { return isOffsetRow( row ) ? COLS - 1 : COLS; }
	function rowZ( row ) { return TOP_Z + row * ROW_SPACING; }
	function colX( row, col ) { return GRID_LEFT_X + col * SPACING + ( isOffsetRow( row ) ? SPACING / 2 : 0 ); }

	// The 6 hex neighbors of (row,col) — which two diagonal columns they are
	// depends on whether THIS row is itself offset (see isOffsetRow above).
	function neighborsOf( row, col ) {

		const diag = isOffsetRow( row ) ? [ 0, 1 ] : [ - 1, 0 ];
		return [
			[ row, col - 1 ], [ row, col + 1 ],
			[ row - 1, col + diag[ 0 ] ], [ row - 1, col + diag[ 1 ] ],
			[ row + 1, col + diag[ 0 ] ], [ row + 1, col + diag[ 1 ] ],
		];

	}

	const popping = []; // { mesh, t, from } — bubbles mid shrink-and-spin pop animation
	const POP_DURATION = 0.28;

	const sliding = []; // { mesh, from, to, t } — bubbles easing into their post-descend row instead of snapping
	const SLIDE_DURATION = 0.35;

	function slideTo( mesh, to ) {

		const existing = sliding.findIndex( ( s ) => s.mesh === mesh );
		if ( existing !== -1 ) sliding.splice( existing, 1 ); // a mesh only ever rides ONE slide at a time
		sliding.push( { mesh, from: mesh.position.clone(), to, t: 0 } );

	}

	function popBubble( mesh ) {

		popping.push( { mesh, t: 0, from: mesh.scale.x } );

	}

	function makeBubble( color ) {

		const mesh = bubbleProto.clone();
		mesh.material = bubbleProto.material.clone();
		mesh.material.color.setHex( color );
		mesh.visible = true;
		bubbleParent.add( mesh );
		return mesh;

	}

	// grid[row][col] = { mesh, color } | null — row 0 is topmost (nearest the sign)
	let grid = [];

	function colorsInGrid() {

		const set = new Set();
		for ( const row of grid ) if ( row ) for ( const cell of row ) if ( cell ) set.add( cell.color );
		return set.size ? Array.from( set ) : COLORS.slice();

	}

	function randomColor() { const pool = colorsInGrid(); return pool[ Math.floor( Math.random() * pool.length ) ]; }
	function randomGridColor() { return COLORS[ Math.floor( Math.random() * COLORS.length ) ]; }

	function clearGrid() {

		for ( const row of grid ) if ( row ) for ( const cell of row ) if ( cell ) bubbleParent.remove( cell.mesh );
		grid = [];

	}

	function fillInitialGrid() {

		clearGrid();
		for ( let row = 0; row < INITIAL_ROWS; row ++ ) {

			grid[ row ] = new Array( COLS ).fill( null );
			const cols = colsInRow( row );
			for ( let col = 0; col < cols; col ++ ) {

				const color = randomGridColor();
				const mesh = makeBubble( color );
				mesh.position.set( colX( row, col ), BUBBLE_Y, rowZ( row ) );
				grid[ row ][ col ] = { mesh, color };

			}

		}

	}

	// ── Score / status display — ctx.hud textures the scene's own Sign_Panel
	// directly (fresh material, never mutates one shared with another
	// Sign_*/Post_* mesh); a no-op handle if the panel mesh isn't in the scene.
	const hud = ctx.hud.panel( '#Sign_Panel', { width: 640, height: 192 } );
	hud.draw( ( c2d, canvas ) => {

		c2d.fillStyle = '#12200f';
		c2d.fillRect( 0, 0, canvas.width, canvas.height );
		c2d.textAlign = 'center';
		c2d.textBaseline = 'middle';
		c2d.fillStyle = '#d9f0c8';

		if ( state.winner === 'player' ) { c2d.font = 'bold 90px monospace'; c2d.fillText( 'CLEARED!', canvas.width / 2, canvas.height / 2 ); }
		else if ( state.winner === 'computer' ) { c2d.font = 'bold 90px monospace'; c2d.fillText( 'GAME OVER', canvas.width / 2, canvas.height / 2 ); }
		else { c2d.font = 'bold 110px monospace'; c2d.fillText( String( state.score ), canvas.width / 2, canvas.height / 2 ); }

	} );

	// ── Camera — identical fit-by-distance approach as this repo's Pong (same
	// court, same reference framing): FOV stays fixed, only the camera's
	// distance along a fixed "behind the shooter" direction adapts to the
	// current aspect ratio each resize, so the shooter/grid/sign never clip at
	// any window shape.
	const FIXED_VFOV = 60;
	const CAMERA_LOOKAT = new THREE.Vector3( 0, 2, 7 ); // biased toward the shooter so the sign lands near the top edge
	const CAMERA_DIR = new THREE.Vector3( 0, 20, 22 ).normalize();
	const FIT_K = 7; // re-tuned for this export's sign sitting much further back (deeper total lane), keeping both edges clear

	camera.fov = FIXED_VFOV;

	function fitCamera() {

		const vFovHalf = FIXED_VFOV * Math.PI / 360;
		const hFovHalf = Math.atan( Math.tan( vFovHalf ) * camera.aspect );
		const limitingHalf = Math.min( vFovHalf, hFovHalf );
		const distance = FIT_K / Math.sin( limitingHalf );

		camera.position.copy( CAMERA_LOOKAT ).addScaledVector( CAMERA_DIR, distance );
		camera.lookAt( CAMERA_LOOKAT );
		camera.updateProjectionMatrix();

	}

	fitCamera();
	ctx.onResize( fitCamera );

	// ── Shooter + upcoming queue ──
	let aimAngle = 0; // radians, 0 = straight up the lane (-z)
	let shotBubble = null; // { mesh, color, vx, vz } while a shot is in flight
	let shotCount = 0;

	bubbleProto.material = bubbleProto.material.clone(); // never mutate anything the GLB might share
	// the authored mesh must stay a pristine CLONE TEMPLATE forever — using it directly
	// as a live bubble meant its first pop/settle animation permanently mutated (shrank)
	// bubbleProto itself, corrupting every bubble cloned from it for the rest of the game
	bubbleProto.visible = false;
	let shooterMesh = makeBubble( bubbleProto.material.color.getHex() );
	shooterMesh.position.set( bubbleProto.position.x, BUBBLE_Y, bubbleProto.position.z );
	let upcoming = []; // upcoming[0] is the shooter's own (already-loaded) color; the rest are the visible queue behind it

	function refillUpcoming() { while ( upcoming.length < QUEUE_SIZE + 1 ) upcoming.push( randomColor() ); }

	const queueMeshes = [];
	for ( let i = 0; i < QUEUE_SIZE; i ++ ) {

		const mesh = makeBubble( 0xffffff );
		mesh.scale.setScalar( bubbleProto.scale.x * QUEUE_SCALE_RATIO );
		queueMeshes.push( mesh );

	}

	function syncQueueVisuals() {

		shooterMesh.material.color.setHex( upcoming[ 0 ] );
		for ( let i = 0; i < QUEUE_SIZE; i ++ ) {

			queueMeshes[ i ].material.color.setHex( upcoming[ i + 1 ] );
			queueMeshes[ i ].position.set( 0, BUBBLE_Y, SHOOTER_Z + ( i + 1 ) * QUEUE_SPACING );

		}

	}

	// A rotating aim indicator — sweeps the SAME forward hemisphere (±MAX_AIM
	// off straight-ahead, never backward) the shot direction is already
	// clamped to, so the player can see where a shot will actually go before
	// firing. Fixed low + black, deliberately NOT color-matched to the
	// shooter — it's a sight, not part of the bubble itself. Built from mesh
	// primitives (not ArrowHelper's 1px Line) so the shaft actually reads as
	// thick regardless of GPU/driver line-width support.
	const ARROW_SCALE = BUBBLE_RADIUS / 0.45; // sized off the original 0.45-radius bubble this arrow was tuned for
	const arrowMat = new THREE.MeshBasicMaterial( { color: 0xffd700 } );
	const arrowShaft = new THREE.Mesh( new THREE.CylinderGeometry( 0.09, 0.09, 1.7, 10 ), arrowMat );
	arrowShaft.position.y = 0.85;
	const arrowHead = new THREE.Mesh( new THREE.ConeGeometry( 0.24, 0.55, 10 ), arrowMat );
	arrowHead.position.y = 1.7 + 0.275;
	const arrowPivot = new THREE.Group();
	arrowPivot.add( arrowShaft, arrowHead );
	arrowPivot.rotation.x = - Math.PI / 2; // local +Y (shaft axis) now points along -Z (straight ahead)
	arrowPivot.scale.setScalar( ARROW_SCALE );
	const aimArrow = new THREE.Group();
	aimArrow.position.set( 0, BUBBLE_Y + 0.1, SHOOTER_Z - BUBBLE_RADIUS - 0.3 * ARROW_SCALE );
	aimArrow.add( arrowPivot );
	bubbleParent.add( aimArrow );

	function fireShot() {

		if ( shotBubble || state.winner ) return;

		sfxFire();
		shotBubble = {
			mesh: shooterMesh,
			color: upcoming[ 0 ],
			vx: Math.sin( aimAngle ) * SHOT_SPEED,
			vz: - Math.cos( aimAngle ) * SHOT_SPEED,
		};

		upcoming.shift();
		refillUpcoming();
		shooterMesh = makeBubble( upcoming[ 0 ] );
		shooterMesh.position.set( 0, BUBBLE_Y, SHOOTER_Z );
		syncQueueVisuals();

	}

	function findFreeCell( row, col ) {

		// BFS outward for the NEAREST free cell — checking only the immediate 6
		// neighbors isn't enough once the cluster is dense (everything around the
		// landing spot occupied), which used to fall straight through to a brand
		// new row far below, leaving an isolated bubble dangling off on its own.
		const seen = new Set( [ row + ',' + col ] );
		const queue = [ [ row, col ] ];
		while ( queue.length ) {

			const [ r, c ] = queue.shift();
			if ( r >= 0 && c >= 0 && c < colsInRow( r ) && ( ! grid[ r ] || ! grid[ r ][ c ] ) ) return { row: r, col: c };
			for ( const [ nr, nc ] of neighborsOf( r, c ) ) {

				const key = nr + ',' + nc;
				if ( seen.has( key ) || nr < 0 || nr > grid.length ) continue;
				seen.add( key );
				queue.push( [ nr, nc ] );

			}

		}
		return { row: grid.length, col: Math.min( col, colsInRow( grid.length ) - 1 ) };

	}

	function popMatches( row, col ) {

		const start = grid[ row ] && grid[ row ][ col ];
		if ( ! start ) return;

		const color = start.color;
		const seen = new Set();
		const stack = [ [ row, col ] ];
		const group = [];

		while ( stack.length ) {

			const [ r, c ] = stack.pop();
			const key = r + ',' + c;
			if ( seen.has( key ) ) continue;
			seen.add( key );
			const cell = grid[ r ] && grid[ r ][ c ];
			if ( ! cell || cell.color !== color ) continue;
			group.push( [ r, c ] );
			for ( const [ nr, nc ] of neighborsOf( r, c ) ) if ( nc >= 0 && nc < colsInRow( nr ) ) stack.push( [ nr, nc ] );

		}

		if ( group.length >= 3 ) {

			for ( const [ r, c ] of group ) { popBubble( grid[ r ][ c ].mesh ); grid[ r ][ c ] = null; }
			state.score += group.length * 10;
			sfxPop( group.length );

		}

	}

	function dropFloating() {

		const reachable = new Set();
		const stack = [];
		if ( grid[ 0 ] ) for ( let c = 0; c < COLS; c ++ ) if ( grid[ 0 ][ c ] ) stack.push( [ 0, c ] );

		while ( stack.length ) {

			const [ r, c ] = stack.pop();
			const key = r + ',' + c;
			if ( reachable.has( key ) ) continue;
			reachable.add( key );
			for ( const [ nr, nc ] of neighborsOf( r, c ) ) {

				if ( nc < 0 || nc >= colsInRow( nr ) ) continue;
				if ( grid[ nr ] && grid[ nr ][ nc ] && ! reachable.has( nr + ',' + nc ) ) stack.push( [ nr, nc ] );

			}

		}

		let fallen = 0;
		for ( let r = 0; r < grid.length; r ++ ) {

			if ( ! grid[ r ] ) continue;
			for ( let c = 0; c < COLS; c ++ ) {

				const cell = grid[ r ][ c ];
				if ( cell && ! reachable.has( r + ',' + c ) ) { popBubble( cell.mesh ); grid[ r ][ c ] = null; fallen ++; }

			}

		}

		if ( fallen ) state.score += fallen * 5;

	}

	function isGridEmpty() {

		for ( const row of grid ) if ( row ) for ( const cell of row ) if ( cell ) return false;
		return true;

	}

	function checkLose() {

		for ( let row = 0; row < grid.length; row ++ ) {

			if ( grid[ row ] && grid[ row ].some( ( c ) => c ) && rowZ( row ) >= DANGER_Z ) { state.winner = 'computer'; sfxLose(); return; }

		}

	}

	function descend() {

		sfxDescend();
		topAbsoluteRow --;

		// every existing bubble shifts down one row — record where each one IS
		// right now so it can ease to its new spot instead of jumping there
		const moves = [];
		for ( let row = 0; row < grid.length; row ++ ) {

			if ( ! grid[ row ] ) continue;
			for ( let col = 0; col < COLS; col ++ ) {

				const cell = grid[ row ][ col ];
				if ( cell ) moves.push( { mesh: cell.mesh, newRow: row + 1, col } );

			}

		}

		const cols = colsInRow( 0 ); // the new row always lands at index 0 after unshift, below
		const newRow = new Array( COLS ).fill( null );
		for ( let col = 0; col < cols; col ++ ) {

			const color = randomGridColor();
			const mesh = makeBubble( color );
			// starts one row further out and eases in, matching the direction everything else is sliding
			mesh.position.set( colX( 0, col ), BUBBLE_Y, rowZ( 0 ) - ROW_SPACING );
			newRow[ col ] = { mesh, color };
			moves.push( { mesh, newRow: 0, col } );

		}

		grid.unshift( newRow );

		for ( const m of moves ) {

			const to = new THREE.Vector3( colX( m.newRow, m.col ), BUBBLE_Y, rowZ( m.newRow ) );
			slideTo( m.mesh, to );

		}

		checkLose();

	}

	function attachShot() {

		const z = shotBubble.mesh.position.z;
		const x = shotBubble.mesh.position.x;
		let row = Math.max( 0, Math.round( ( z - TOP_Z ) / ROW_SPACING ) );
		const offset = isOffsetRow( row ) ? SPACING / 2 : 0;
		let col = Math.max( 0, Math.min( colsInRow( row ) - 1, Math.round( ( x - GRID_LEFT_X - offset ) / SPACING ) ) );

		while ( ! grid[ row ] ) grid[ row ] = new Array( COLS ).fill( null );
		if ( grid[ row ][ col ] ) { const free = findFreeCell( row, col ); row = free.row; col = free.col; }
		while ( ! grid[ row ] ) grid[ row ] = new Array( COLS ).fill( null );

		// ease into the snapped cell from wherever it actually collided, instead of jumping there
		const settleTo = new THREE.Vector3( colX( row, col ), BUBBLE_Y, rowZ( row ) );
		slideTo( shotBubble.mesh, settleTo );
		sfxSettle();
		grid[ row ][ col ] = { mesh: shotBubble.mesh, color: shotBubble.color };
		shotBubble = null;

		popMatches( row, col );
		dropFloating();

		if ( isGridEmpty() ) { state.winner = 'player'; sfxWin(); }
		else {

			shotCount ++;
			if ( shotCount % DESCEND_EVERY === 0 ) descend();
			checkLose();

		}

		hud.update();

	}

	function resetGame() {

		for ( const p of popping ) bubbleParent.remove( p.mesh );
		popping.length = 0;
		sliding.length = 0;
		state.score = 0;
		state.winner = null;
		shotBubble = null;
		shotCount = 0;
		aimAngle = 0;
		topAbsoluteRow = 0;
		fillInitialGrid();
		upcoming = [];
		refillUpcoming();
		shooterMesh.position.set( 0, BUBBLE_Y, SHOOTER_Z );
		syncQueueVisuals();
		hud.update();

	}

	onReset( resetGame );
	resetGame();

	// Keyboard fires on press; touch/pointer drags to aim (the SAME axis() call
	// used for keyboard) and fires on release — see sandbox.html's makeInput.
	input.onKey( ( { type, code } ) => {

		if ( type !== 'down' ) return;
		if ( state.winner ) { if ( code === 'Enter' || code === 'Space' ) reset(); return; }
		if ( code === 'Space' || code === 'Enter' ) fireShot();

	} );

	input.onPointer( ( { type } ) => { if ( type === 'up' ) fireShot(); } );

	onFrame( ( dt ) => {

		const axis = input.axis( [ 'ArrowLeft', 'KeyA' ], [ 'ArrowRight', 'KeyD' ] );
		aimAngle = Math.max( - MAX_AIM, Math.min( MAX_AIM, aimAngle + axis * AIM_SPEED * dt ) );
		aimArrow.rotation.y = - aimAngle; // THREE's +Y rotation sense is mirrored vs. the shot's sin/cos direction above

		for ( let i = popping.length - 1; i >= 0; i -- ) {

			const p = popping[ i ];
			p.t += dt;
			const k = Math.min( 1, p.t / POP_DURATION );
			p.mesh.scale.setScalar( Math.max( 0.0001, p.from * ( 1 - k ) ) );
			p.mesh.rotation.y += dt * 6;
			if ( k >= 1 ) { bubbleParent.remove( p.mesh ); popping.splice( i, 1 ); }

		}

		for ( let i = sliding.length - 1; i >= 0; i -- ) {

			const s = sliding[ i ];
			s.t += dt;
			const k = Math.min( 1, s.t / SLIDE_DURATION );
			const eased = 1 - Math.pow( 1 - k, 3 ); // ease-out cubic
			s.mesh.position.lerpVectors( s.from, s.to, eased );
			// a small hop so the settle always reads as motion even when the actual
			// from/to correction is tiny (a solid-color sphere sliding half an inch
			// is nearly invisible; a little arc makes every landing legible)
			s.mesh.position.y += Math.sin( k * Math.PI ) * 0.16;
			if ( k >= 1 ) sliding.splice( i, 1 );

		}

		if ( state.winner || ! shotBubble ) return;

		shotBubble.mesh.position.x += shotBubble.vx * dt;
		shotBubble.mesh.position.z += shotBubble.vz * dt;

		if ( shotBubble.mesh.position.x > WALL_X ) { shotBubble.mesh.position.x = WALL_X; shotBubble.vx = - Math.abs( shotBubble.vx ); sfxBounce(); }
		else if ( shotBubble.mesh.position.x < - WALL_X ) { shotBubble.mesh.position.x = - WALL_X; shotBubble.vx = Math.abs( shotBubble.vx ); sfxBounce(); }

		let collided = shotBubble.mesh.position.z <= TOP_Z; // leading edge of a flying bubble reaches the back wall exactly when its center passes row 0's own line — the wall sits BUBBLE_RADIUS behind row 0, tangent to it
		if ( ! collided ) {

			search: for ( const row of grid ) if ( row ) for ( const cell of row ) if ( cell ) {

				const dx = cell.mesh.position.x - shotBubble.mesh.position.x;
				const dz = cell.mesh.position.z - shotBubble.mesh.position.z;
				if ( dx * dx + dz * dz < TOUCH_DIST * TOUCH_DIST ) { collided = true; break search; }

			}

		}

		if ( collided ) attachShot();

	} );

}
