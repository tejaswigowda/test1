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
	const signPanel = $S( '#Sign_Panel' ).toArray()[ 0 ];
	const bubbleParent = bubbleProto.parent;

	// the re-exported scene's ground/backdrop planes are finite; a matching clear
	// color hides their edges at wide aspect ratios instead of showing void
	scene.background = new THREE.Color( 0x93b48e );

	// ── Layout (same court this repo's Pong uses: Table x:±6 / z:±12, rails at
	// x:±6–6.3) — a true hex grid: odd rows are shifted half a bubble to the
	// right (and have one fewer column) so every bubble sits snugly against
	// its 6 neighbors, not just the 4 directly above/below/left/right.
	const BUBBLE_RADIUS = 0.45;
	const COLS = 11;
	const SPACING = 1;
	const ROW_SPACING = SPACING * Math.sqrt( 3 ) / 2; // true hex packing: diagonal neighbors end up exactly SPACING apart too
	const GRID_LEFT_X = - ( COLS - 1 ) / 2 * SPACING;
	const TOP_Z = - 11;             // topmost grid row's z
	const SHOOTER_Z = bubbleProto.position.z; // the authored prototype's own spot
	const DANGER_Z = 6.5;            // a bubble reaching this far down the lane ends the game
	const WALL_X = 6 - BUBBLE_RADIUS; // rail inner face minus bubble radius
	const INITIAL_ROWS = 6;
	const SHOT_SPEED = 14;
	const AIM_SPEED = 1.6;           // radians/sec
	const MAX_AIM = Math.PI / 2.6;   // ~69° either side of straight ahead
	const DESCEND_EVERY = 6;         // shots between a new row dropping in — the genre's own pressure valve
	const QUEUE_SIZE = 3;            // upcoming bubbles shown behind the shooter
	const QUEUE_SPACING = 0.65;
	const QUEUE_SCALE = 0.65;
	const COLORS = [ 0xff4d4d, 0xffd23f, 0x3dd6d0, 0x4d79ff, 0xb366ff ];

	function isOffsetRow( row ) { return row % 2 === 1; }
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

	function repositionGrid() {

		for ( let row = 0; row < grid.length; row ++ ) {

			if ( ! grid[ row ] ) continue;
			for ( let col = 0; col < COLS; col ++ ) {

				const cell = grid[ row ][ col ];
				if ( cell ) cell.mesh.position.set( colX( row, col ), bubbleProto.position.y, rowZ( row ) );

			}

		}

	}

	function fillInitialGrid() {

		clearGrid();
		for ( let row = 0; row < INITIAL_ROWS; row ++ ) {

			grid[ row ] = new Array( COLS ).fill( null );
			const cols = colsInRow( row );
			for ( let col = 0; col < cols; col ++ ) {

				const color = randomGridColor();
				const mesh = makeBubble( color );
				mesh.position.set( colX( row, col ), bubbleProto.position.y, rowZ( row ) );
				grid[ row ][ col ] = { mesh, color };

			}

		}

	}

	// ── Score / status display — texture the scene's own Sign_Panel, a fresh
	// material so this never mutates one shared with another Sign_*/Post_* mesh.
	let drawScore = () => {};
	if ( signPanel ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 640; canvas.height = 192;
		const c2d = canvas.getContext( '2d' );
		const texture = new THREE.CanvasTexture( canvas );
		texture.colorSpace = THREE.SRGBColorSpace;
		signPanel.material = new THREE.MeshBasicMaterial( { map: texture } );

		drawScore = () => {

			c2d.fillStyle = '#12200f';
			c2d.fillRect( 0, 0, canvas.width, canvas.height );
			c2d.textAlign = 'center';
			c2d.textBaseline = 'middle';
			c2d.fillStyle = '#d9f0c8';

			if ( state.winner === 'player' ) { c2d.font = 'bold 90px monospace'; c2d.fillText( 'CLEARED!', canvas.width / 2, canvas.height / 2 ); }
			else if ( state.winner === 'computer' ) { c2d.font = 'bold 90px monospace'; c2d.fillText( 'GAME OVER', canvas.width / 2, canvas.height / 2 ); }
			else { c2d.font = 'bold 110px monospace'; c2d.fillText( String( state.score ), canvas.width / 2, canvas.height / 2 ); }

			texture.needsUpdate = true;

		};

	}

	// ── Camera — identical fit-by-distance approach as this repo's Pong (same
	// court, same reference framing): FOV stays fixed, only the camera's
	// distance along a fixed "behind the shooter" direction adapts to the
	// current aspect ratio each resize, so the shooter/grid/sign never clip at
	// any window shape.
	const FIXED_VFOV = 46.6;
	const CAMERA_LOOKAT = new THREE.Vector3( 0, 2, 0 );
	const CAMERA_DIR = new THREE.Vector3( 0, 20, 22 ).normalize();
	const FIT_K = 12;

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
	window.addEventListener( 'resize', fitCamera );

	// ── Shooter + upcoming queue ──
	let aimAngle = 0; // radians, 0 = straight up the lane (-z)
	let shotBubble = null; // { mesh, color, vx, vz } while a shot is in flight
	let shotCount = 0;

	bubbleProto.material = bubbleProto.material.clone(); // never mutate anything the GLB might share
	let shooterMesh = bubbleProto; // the authored prototype IS the first shooter bubble — already positioned correctly
	let upcoming = []; // upcoming[0] is the shooter's own (already-loaded) color; the rest are the visible queue behind it

	function refillUpcoming() { while ( upcoming.length < QUEUE_SIZE + 1 ) upcoming.push( randomColor() ); }

	const queueMeshes = [];
	for ( let i = 0; i < QUEUE_SIZE; i ++ ) {

		const mesh = makeBubble( 0xffffff );
		mesh.scale.setScalar( QUEUE_SCALE );
		queueMeshes.push( mesh );

	}

	function syncQueueVisuals() {

		shooterMesh.material.color.setHex( upcoming[ 0 ] );
		for ( let i = 0; i < QUEUE_SIZE; i ++ ) {

			queueMeshes[ i ].material.color.setHex( upcoming[ i + 1 ] );
			queueMeshes[ i ].position.set( 0, bubbleProto.position.y, SHOOTER_Z + ( i + 1 ) * QUEUE_SPACING );

		}

	}

	// A rotating aim indicator — sweeps the SAME forward hemisphere (±MAX_AIM
	// off straight-ahead, never backward) the shot direction is already
	// clamped to, so the player can see where a shot will actually go before
	// firing. Fixed low + black, deliberately NOT color-matched to the
	// shooter — it's a sight, not part of the bubble itself.
	const aimArrow = new THREE.ArrowHelper(
		new THREE.Vector3( 0, 0, - 1 ),
		new THREE.Vector3( 0, bubbleProto.position.y + 0.1, SHOOTER_Z - BUBBLE_RADIUS - 0.3 ),
		2.2, 0x000000, 0.75, 0.55,
	);
	bubbleParent.add( aimArrow );

	function fireShot() {

		if ( shotBubble || state.winner ) return;

		shotBubble = {
			mesh: shooterMesh,
			color: upcoming[ 0 ],
			vx: Math.sin( aimAngle ) * SHOT_SPEED,
			vz: - Math.cos( aimAngle ) * SHOT_SPEED,
		};

		upcoming.shift();
		refillUpcoming();
		shooterMesh = makeBubble( upcoming[ 0 ] );
		shooterMesh.position.set( 0, bubbleProto.position.y, SHOOTER_Z );
		syncQueueVisuals();

	}

	function findFreeCell( row, col ) {

		const candidates = [ [ row, col ], ...neighborsOf( row, col ) ];
		for ( const [ r, c ] of candidates ) {

			if ( r < 0 || c < 0 || c >= colsInRow( r ) ) continue;
			if ( ! grid[ r ] || ! grid[ r ][ c ] ) return { row: r, col: c };

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

			for ( const [ r, c ] of group ) { bubbleParent.remove( grid[ r ][ c ].mesh ); grid[ r ][ c ] = null; }
			state.score += group.length * 10;

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
				if ( cell && ! reachable.has( r + ',' + c ) ) { bubbleParent.remove( cell.mesh ); grid[ r ][ c ] = null; fallen ++; }

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

			if ( grid[ row ] && grid[ row ].some( ( c ) => c ) && rowZ( row ) >= DANGER_Z ) { state.winner = 'computer'; return; }

		}

	}

	function descend() {

		const cols = colsInRow( 0 ); // the new row always lands at index 0 after unshift, below
		const newRow = new Array( COLS ).fill( null );
		for ( let col = 0; col < cols; col ++ ) {

			const color = randomGridColor();
			const mesh = makeBubble( color );
			newRow[ col ] = { mesh, color };

		}
		grid.unshift( newRow );
		repositionGrid();
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

		shotBubble.mesh.position.set( colX( row, col ), bubbleProto.position.y, rowZ( row ) );
		grid[ row ][ col ] = { mesh: shotBubble.mesh, color: shotBubble.color };
		shotBubble = null;

		popMatches( row, col );
		dropFloating();

		if ( isGridEmpty() ) state.winner = 'player';
		else {

			shotCount ++;
			if ( shotCount % DESCEND_EVERY === 0 ) descend();
			checkLose();

		}

		drawScore();

	}

	function resetGame() {

		state.score = 0;
		state.winner = null;
		shotBubble = null;
		shotCount = 0;
		aimAngle = 0;
		fillInitialGrid();
		upcoming = [];
		refillUpcoming();
		shooterMesh.position.set( 0, bubbleProto.position.y, SHOOTER_Z );
		syncQueueVisuals();
		drawScore();

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
		aimArrow.setDirection( new THREE.Vector3( Math.sin( aimAngle ), 0, - Math.cos( aimAngle ) ) );

		if ( state.winner || ! shotBubble ) return;

		shotBubble.mesh.position.x += shotBubble.vx * dt;
		shotBubble.mesh.position.z += shotBubble.vz * dt;

		if ( shotBubble.mesh.position.x > WALL_X ) { shotBubble.mesh.position.x = WALL_X; shotBubble.vx = - Math.abs( shotBubble.vx ); }
		else if ( shotBubble.mesh.position.x < - WALL_X ) { shotBubble.mesh.position.x = - WALL_X; shotBubble.vx = Math.abs( shotBubble.vx ); }

		let collided = shotBubble.mesh.position.z <= TOP_Z - BUBBLE_RADIUS;
		if ( ! collided ) {

			search: for ( const row of grid ) if ( row ) for ( const cell of row ) if ( cell ) {

				const dx = cell.mesh.position.x - shotBubble.mesh.position.x;
				const dz = cell.mesh.position.z - shotBubble.mesh.position.z;
				if ( dx * dx + dz * dz < ( BUBBLE_RADIUS * 1.9 ) * ( BUBBLE_RADIUS * 1.9 ) ) { collided = true; break search; }

			}

		}

		if ( collided ) attachShot();

	} );

}
