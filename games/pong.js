// ── game.js (Pong) ───────────────────────────────────────────────────────────
// Shared entry module (work order "one logic, many scenes") — drives ANY
// scene carrying the labels in `requires` below, never a hardcoded court size.
// No physics labels in these scenes (no .static/.kinematic/.dynamic classes),
// so there is no cannon-es world (ctx.world is null) and no bodies to bind —
// movement/collision are plain per-frame math against the loaded scene's own
// authored geometry/bounds instead.

export const requires = [ '#Table', '#Player_Paddle', '#Computer_Paddle', '#Ball', '#Ball_Spawn' ];

// §3 declarative settings — host renders the actual UI (Menu -> Settings),
// this module only ever declares the schema and reads ctx.settings/onSetting.
export const config = { settings: [ { key: 'ballSpeed', type: 'range', min: 0.5, max: 4, step: 0.25, default: 2, label: 'Ball Speed' } ] };

export default function init( ctx ) {

	const { THREE, $S, input, camera, onFrame, onReset, reset, state } = ctx;

	// live-updatable — read at init for the initial value, kept in sync by
	// onSetting below for a change made mid-game (scales the next serve and
	// the rally speed-up cap; doesn't retroactively rescale a ball already in
	// flight).
	let speedMult = ctx.settings.ballSpeed ?? 1;
	ctx.onSetting( ( key, value ) => { if ( key === 'ballSpeed' ) speedMult = value; } );

	// ── Background music — Web Audio only (no audio files), a short looping
	// chiptune-y arpeggio scheduled ahead of real time. Routed through its own
	// gain into ctx.audio.destination, so the header's mute toggle silences it
	// exactly like every other sound; ticked from onFrame below (not a
	// standalone timer) so it naturally pauses/resumes with the rest of the
	// game (tab blur, click-to-play gate, etc.) instead of playing underneath.
	const audioCtx = ctx.audio.context;
	const musicGain = audioCtx.createGain();
	musicGain.gain.value = 0.07;
	musicGain.connect( ctx.audio.destination );

	// §1 lifecycle: disconnecting on cleanup silences both the currently
	// audible note AND every note already scheduled ahead of time by
	// tickMusic() below (they still fire internally on schedule, but with
	// nowhere left to route to) — so a Code-tab Save never leaves the OLD
	// instance's music playing underneath the new one.
	ctx.onCleanup( () => musicGain.disconnect() );

	const MELODY = [ 261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 392.0 ]; // C4 E4 G4 C5 G4 E4 D4 G4
	const NOTE_DURATION = 0.26;
	const NOTE_GAP = 0.02;
	const LOOP_DURATION = MELODY.length * ( NOTE_DURATION + NOTE_GAP );
	let nextLoopStart = 0;

	function scheduleMusicLoop() {

		for ( let i = 0; i < MELODY.length; i ++ ) {

			const start = nextLoopStart + i * ( NOTE_DURATION + NOTE_GAP );
			const osc = audioCtx.createOscillator();
			const g = audioCtx.createGain();
			osc.type = 'triangle';
			osc.frequency.value = MELODY[ i ];
			g.gain.setValueAtTime( 0.0001, start );
			g.gain.exponentialRampToValueAtTime( 1, start + 0.02 );
			g.gain.exponentialRampToValueAtTime( 0.0001, start + NOTE_DURATION );
			osc.connect( g ).connect( musicGain );
			osc.start( start );
			osc.stop( start + NOTE_DURATION + 0.02 );

		}

		nextLoopStart += LOOP_DURATION;

	}

	// keep ~2 loops queued up at all times; only tops up while onFrame is
	// actually running (see the pause guard below), never via its own timer
	function tickMusic() {

		if ( nextLoopStart === 0 ) nextLoopStart = audioCtx.currentTime;
		while ( nextLoopStart < audioCtx.currentTime + LOOP_DURATION * 2 ) scheduleMusicLoop();

	}

	const player = $S( '#Player_Paddle' ).toArray()[ 0 ];
	const ai = $S( '#Computer_Paddle' ).toArray()[ 0 ];
	const ball = $S( '#Ball' ).toArray()[ 0 ];
	const spawn = $S( '#Ball_Spawn' ).toArray()[ 0 ];

	// ── Midday beach — bright, high overhead sun with minimal shadow contrast
	// (strong ambient skylight), a vivid blue sky, and sunlit sand. Sets
	// explicit values rather than reversing a previous tint, since each fresh
	// load starts from the GLB's own authored lights/materials every time.
	for ( const light of $S( 'DirectionalLight' ).toArray() ) { light.color.set( 0xfff2d9 ); light.intensity = 1.8; }
	const ambient = $S( 'AmbientLight' ).toArray()[ 0 ];
	if ( ambient ) { ambient.color.set( 0xffffff ); ambient.intensity = 0.9; }
	const sky = $S( '#Sky' ).toArray()[ 0 ];
	if ( sky ) sky.material.color.set( 0xffffff ); // full brightness — shows the dome's own baked day-sky texture as authored
	const ground = $S( '#Sand_Ground' ).toArray()[ 0 ];
	if ( ground ) ground.material.color.set( 0xe8c58c ); // bright sunlit sand

	// §2 "one logic, many scenes" — every court/paddle/ball dimension below is
	// DERIVED from the loaded scene's own labelled bounds
	// (Box3().setFromObject), never hardcoded, so this SAME file also drives
	// a differently-sized table (see scenes/pong/bar.glb) with no changes.
	const table = $S( '#Table' ).toArray()[ 0 ];
	const tableBox = new THREE.Box3().setFromObject( table );
	const playerBox = new THREE.Box3().setFromObject( player );
	const aiBox = new THREE.Box3().setFromObject( ai );
	const ballBox = new THREE.Box3().setFromObject( ball );

	const TABLE_HALF_X = tableBox.getSize( new THREE.Vector3() ).x / 2;
	const TABLE_HALF_Z = tableBox.getSize( new THREE.Vector3() ).z / 2;
	const BALL_RADIUS = ballBox.getSize( new THREE.Vector3() ).x / 2;
	const PADDLE_HALF_WIDTH = playerBox.getSize( new THREE.Vector3() ).x / 2;
	const PADDLE_HALF_DEPTH = playerBox.getSize( new THREE.Vector3() ).z / 2;
	const PADDLE_HALF_X = TABLE_HALF_X - PADDLE_HALF_WIDTH; // paddle travel clamp — stops exactly at the table edge
	const BALL_HALF_X = TABLE_HALF_X - BALL_RADIUS;
	const PLAYER_FRONT_Z = playerBox.min.z; // Player_Paddle sits on the +Z side — its near (net-facing) face is the box's own min z
	const AI_FRONT_Z = aiBox.max.z;         // Computer_Paddle sits on the -Z side — its near face is the box's own max z
	// Just past each paddle's OWN far edge, plus a ball's width of clearance
	// — scales with the scene, never hardcoded.
	const OUT_OF_BOUNDS_Z = Math.abs( player.position.z ) + PADDLE_HALF_DEPTH + BALL_RADIUS * 2;

	const PLAYER_SPEED = 8;   // units/sec — gameplay pacing, not a scene dimension, stays authored
	const AI_SPEED = 4.2;     // capped below the player's — beatable
	const SERVE_SPEED = 6;
	const MAX_BALL_SPEED = 13; // rally speed-up cap — keeps late rallies fair
	const SPEEDUP = 1.07;      // multiplier applied on each paddle hit
	const WIN_SCORE = 7;

	// ── Score display ── the scene ships a proper Marquee_Scoreboard (posts +
	// bezel + bulbs + a blank Marquee_Panel "screen"); ctx.hud textures that
	// panel directly (fresh material, never mutates one shared with another
	// Marquee_* mesh) — a no-op handle if the panel mesh isn't in the scene.
	const hud = ctx.hud.panel( '#Marquee_Panel', { width: 640, height: 192 } );
	hud.draw( ( c2d, canvas ) => {

		c2d.fillStyle = '#0b0e12';
		c2d.fillRect( 0, 0, canvas.width, canvas.height );
		c2d.textAlign = 'center';
		c2d.textBaseline = 'middle';
		c2d.fillStyle = '#ffcf6b';

		if ( state.winner ) {

			c2d.font = 'bold 88px monospace';
			c2d.fillText( state.winner === 'player' ? 'YOU WIN' : 'CPU WINS', canvas.width / 2, canvas.height / 2 );

		} else {

			c2d.font = 'bold 120px monospace';
			c2d.fillText( state.scorePlayer + '   -   ' + state.scoreComputer, canvas.width / 2, canvas.height / 2 );

		}

	} );

	// ── Camera (responsive: fit-by-distance, not fit-by-FOV) ──────────────────
	// The FOV never changes — only the camera's DISTANCE along a fixed "behind
	// and above the player" direction does, solved each resize so the court +
	// marquee always fit inside whichever of (horizontal, vertical) FOV is
	// tighter for the CURRENT aspect ratio. Stretching vertical FOV instead (an
	// earlier version of this file did that) avoids clipping too, but on a
	// narrow/portrait window it just pads the frame with empty sky/ground
	// around a small court — this keeps the exact same look/angle at any
	// aspect, dollying back only as far as the shape of the window demands.
	// LOOKAT + FIT_K are derived from the table's own bounds (§2 — never a
	// fixed pose), calibrated so a table of this reference size reproduces
	// this project's own approved framing (camera at (0,7,22) looking at
	// (0,2,-6), 46.6° vertical FOV, 16:9) exactly, and scales proportionally
	// for a differently-sized table (see scenes/pong/bar.glb).
	const FIXED_VFOV = 46.6; // degrees
	const tableCenter = tableBox.getCenter( new THREE.Vector3() );
	const CAMERA_LOOKAT = new THREE.Vector3( tableCenter.x, tableCenter.y + 2, tableCenter.z - TABLE_HALF_Z * 0.5 );
	const CAMERA_DIR = new THREE.Vector3( 0, 5, 28 ).normalize();
	const FIT_K = tableBox.getSize( new THREE.Vector3() ).length() * 0.503; // 0.503 = the reference table's own 13.5 / its size-vector length (~26.83)

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
	ctx.onResize( fitCamera ); // after the harness's own resize listener updates camera.aspect first; also unregistered automatically on the next Save/reload

	let vx = 0, vz = 0;

	state.scorePlayer = 0;
	state.scoreComputer = 0;
	state.winner = null;

	function serve( towardPlayer ) {

		// Starts right in front of whichever paddle is serving it away, not the
		// board's center — matches that paddle's current x so it looks like it
		// actually comes off the racquet/paddle.
		const server = towardPlayer ? ai : player;
		ball.position.set( server.position.x, spawn.position.y, towardPlayer ? AI_FRONT_Z + BALL_RADIUS : PLAYER_FRONT_Z - BALL_RADIUS );
		vx = ( Math.random() * 2 - 1 ) * 0.5 * SERVE_SPEED * speedMult;
		vz = ( towardPlayer ? 1 : - 1 ) * SERVE_SPEED * speedMult;

	}

	onReset( () => { state.scorePlayer = 0; state.scoreComputer = 0; state.winner = null; serve( true ); hud.update(); } );

	serve( true );
	hud.update();

	// Once a match ends, freeze play until Enter/Space starts a new one —
	// ctx.reset() re-runs the SAME onReset handler above, no separate lifecycle.
	input.onKey( ( { type, code } ) => {

		if ( type === 'down' && state.winner && ( code === 'Enter' || code === 'Space' ) ) reset();

	} );

	onFrame( ( dt ) => {

		tickMusic();

		// Player input — arrow keys / A-D (a touch/pointer drag falls back to
		// the SAME axis() call; see sandbox.html's makeInput).
		const axis = input.axis( [ 'ArrowLeft', 'KeyA' ], [ 'ArrowRight', 'KeyD' ] );
		player.position.x = Math.max( - PADDLE_HALF_X, Math.min( PADDLE_HALF_X, player.position.x + axis * PLAYER_SPEED * dt ) );

		// AI: lerp toward the ball, clamped + speed-capped (beatable). No ML.
		const diff = ball.position.x - ai.position.x;
		const step = Math.max( - AI_SPEED * dt, Math.min( AI_SPEED * dt, diff ) );
		ai.position.x = Math.max( - PADDLE_HALF_X, Math.min( PADDLE_HALF_X, ai.position.x + step ) );

		if ( state.winner ) return; // match over — ball stays parked at center

		// Manual ball integration — no physics body exists for an unlabeled node.
		ball.position.x += vx * dt;
		ball.position.z += vz * dt;

		// Side-rail bounce.
		if ( ball.position.x > BALL_HALF_X ) { ball.position.x = BALL_HALF_X; vx = - Math.abs( vx ); }
		else if ( ball.position.x < - BALL_HALF_X ) { ball.position.x = - BALL_HALF_X; vx = Math.abs( vx ); }

		// Paddle bounce — only while heading toward that paddle and within its
		// width; each hit speeds the rally up a little (capped) rather than
		// staying at serve speed forever.
		if ( vz > 0 && ball.position.z + BALL_RADIUS >= PLAYER_FRONT_Z && Math.abs( ball.position.x - player.position.x ) <= PADDLE_HALF_WIDTH + BALL_RADIUS ) {

			ball.position.z = PLAYER_FRONT_Z - BALL_RADIUS;
			vz = - Math.min( Math.abs( vz ) * SPEEDUP, MAX_BALL_SPEED * speedMult );
			vx = Math.max( - MAX_BALL_SPEED * speedMult, Math.min( MAX_BALL_SPEED * speedMult, vx * SPEEDUP ) );

		} else if ( vz < 0 && ball.position.z - BALL_RADIUS <= AI_FRONT_Z && Math.abs( ball.position.x - ai.position.x ) <= PADDLE_HALF_WIDTH + BALL_RADIUS ) {

			ball.position.z = AI_FRONT_Z + BALL_RADIUS;
			vz = Math.min( Math.abs( vz ) * SPEEDUP, MAX_BALL_SPEED * speedMult );
			vx = Math.max( - MAX_BALL_SPEED * speedMult, Math.min( MAX_BALL_SPEED * speedMult, vx * SPEEDUP ) );

		}

		// Score + deterministic reset once the ball passes a paddle's far edge;
		// first to WIN_SCORE ends the match instead of serving again.
		if ( ball.position.z > OUT_OF_BOUNDS_Z ) {

			state.scoreComputer ++;
			if ( state.scoreComputer >= WIN_SCORE ) { state.winner = 'computer'; ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z ); vx = 0; vz = 0; }
			else serve( false );
			hud.update();

		} else if ( ball.position.z < - OUT_OF_BOUNDS_Z ) {

			state.scorePlayer ++;
			if ( state.scorePlayer >= WIN_SCORE ) { state.winner = 'player'; ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z ); vx = 0; vz = 0; }
			else serve( true );
			hud.update();

		}

	} );

}