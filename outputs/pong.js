// ── game.js (Pong) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Strata Play entry module for outputs/pong.glb. This scene ships no physics
// labels (no .static/.kinematic/.dynamic classes), so there is no cannon-es
// world (ctx.world is null) and no bodies to bind — per the label → physics
// body vocabulary, no label means no body. Movement/collision here are plain
// per-frame math against the scene's own authored geometry instead.

export default function init( ctx ) {

	const { THREE, $S, input, camera, onFrame, onReset, reset, state } = ctx;

	const player = $S( '#Player_Paddle' ).toArray()[ 0 ];
	const ai = $S( '#Computer_Paddle' ).toArray()[ 0 ];
	const ball = $S( '#Ball' ).toArray()[ 0 ];
	const spawn = $S( '#Ball_Spawn' ).toArray()[ 0 ];
	const scoreboard = $S( '#Scoreboard' ).toArray()[ 0 ];

	// Derived from the authored scene's own bounds (Table ±6 x / ±12 z,
	// Rail_Left/Right at ±6–6.3 x, paddles ±1.1 half-width at z ±10.3–10.7).
	const BALL_RADIUS = 0.35;
	const PADDLE_HALF_WIDTH = 1.1;
	const PADDLE_HALF_X = 4.9;    // table half-width (6) minus paddle half-width
	const BALL_HALF_X = 5.65;     // table half-width (6) minus ball radius
	const PLAYER_FRONT_Z = 10.3;  // Player_Paddle's near face
	const AI_FRONT_Z = - 10.3;    // Computer_Paddle's near face
	const OUT_OF_BOUNDS_Z = 10.9; // just past each paddle's far edge

	const PLAYER_SPEED = 8;   // units/sec
	const AI_SPEED = 4.2;     // capped below the player's — beatable
	const SERVE_SPEED = 6;
	const MAX_BALL_SPEED = 13; // rally speed-up cap — keeps late rallies fair
	const SPEEDUP = 1.07;      // multiplier applied on each paddle hit
	const WIN_SCORE = 7;

	// ── In-scene scoreboard ── the authored Scoreboard mesh gets its own canvas
	// texture (a fresh material, so this never mutates a material shared with
	// another node) instead of any DOM/HUD overlay — the ctx contract has no
	// HUD hook, and the scene already ships a surface built for exactly this.
	let drawScoreboard = () => {};
	if ( scoreboard ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 512; canvas.height = 170;
		const c2d = canvas.getContext( '2d' );
		const scoreTexture = new THREE.CanvasTexture( canvas );
		scoreTexture.colorSpace = THREE.SRGBColorSpace;
		scoreboard.material = new THREE.MeshStandardMaterial( {
			map: scoreTexture, emissiveMap: scoreTexture, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.5,
		} );

		drawScoreboard = () => {

			c2d.fillStyle = '#0b0e12';
			c2d.fillRect( 0, 0, canvas.width, canvas.height );
			c2d.textAlign = 'center';
			c2d.textBaseline = 'middle';
			if ( state.winner ) {

				c2d.fillStyle = '#7fd0ff';
				c2d.font = 'bold 64px monospace';
				c2d.fillText( state.winner === 'player' ? 'YOU WIN' : 'CPU WINS', canvas.width / 2, canvas.height / 2 );

			} else {

				c2d.fillStyle = '#7fd0ff';
				c2d.font = 'bold 96px monospace';
				c2d.fillText( state.scorePlayer + '   -   ' + state.scoreComputer, canvas.width / 2, canvas.height / 2 );

			}

			scoreTexture.needsUpdate = true;

		};

	}

	// ── Camera ── focused behind the player's paddle, angled down the table so
	// both paddles and the full court are always in frame (the runtime's own
	// default framing fits the WHOLE scene incl. backdrop/scoreboard, which
	// reads as zoomed-out for actual play).
	camera.position.set( 0, 11.5, 23 );
	camera.lookAt( 0, 2.5, - 6 );

	let vx = 0, vz = 0;

	state.scorePlayer = 0;
	state.scoreComputer = 0;
	state.winner = null;

	function serve( towardPlayer ) {

		ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z );
		vx = ( Math.random() * 2 - 1 ) * 0.5 * SERVE_SPEED;
		vz = ( towardPlayer ? 1 : - 1 ) * SERVE_SPEED;

	}

	onReset( () => { state.scorePlayer = 0; state.scoreComputer = 0; state.winner = null; serve( true ); drawScoreboard(); } );

	serve( true );
	drawScoreboard();

	// Once a match ends, freeze play until Enter/Space starts a new one —
	// ctx.reset() re-runs the SAME onReset handler above, no separate lifecycle.
	input.onKey( ( { type, code } ) => {

		if ( type === 'down' && state.winner && ( code === 'Enter' || code === 'Space' ) ) reset();

	} );

	onFrame( ( dt ) => {

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
			vz = - Math.min( Math.abs( vz ) * SPEEDUP, MAX_BALL_SPEED );
			vx = Math.max( - MAX_BALL_SPEED, Math.min( MAX_BALL_SPEED, vx * SPEEDUP ) );

		} else if ( vz < 0 && ball.position.z - BALL_RADIUS <= AI_FRONT_Z && Math.abs( ball.position.x - ai.position.x ) <= PADDLE_HALF_WIDTH + BALL_RADIUS ) {

			ball.position.z = AI_FRONT_Z + BALL_RADIUS;
			vz = Math.min( Math.abs( vz ) * SPEEDUP, MAX_BALL_SPEED );
			vx = Math.max( - MAX_BALL_SPEED, Math.min( MAX_BALL_SPEED, vx * SPEEDUP ) );

		}

		// Score + deterministic reset once the ball passes a paddle's far edge;
		// first to WIN_SCORE ends the match instead of serving again.
		if ( ball.position.z > OUT_OF_BOUNDS_Z ) {

			state.scoreComputer ++;
			if ( state.scoreComputer >= WIN_SCORE ) { state.winner = 'computer'; ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z ); vx = 0; vz = 0; }
			else serve( false );
			drawScoreboard();

		} else if ( ball.position.z < - OUT_OF_BOUNDS_Z ) {

			state.scorePlayer ++;
			if ( state.scorePlayer >= WIN_SCORE ) { state.winner = 'player'; ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z ); vx = 0; vz = 0; }
			else serve( true );
			drawScoreboard();

		}

	} );

}
