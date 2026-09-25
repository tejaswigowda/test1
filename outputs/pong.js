// ── game.js (Pong) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
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
	const playerAnchor = $S( '#Score_Anchor_Player' ).toArray()[ 0 ];
	const computerAnchor = $S( '#Score_Anchor_Computer' ).toArray()[ 0 ];

	// Derived from the authored scene's own bounds (Table ±6 x / ±12 z,
	// Rail_Left/Right at ±6–6.3 x, paddles ±1.1 half-width at z ±10.3–10.7) —
	// unchanged by the desert re-skin, so the court/paddle/ball constants below
	// still hold exactly.
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

	// ── Score display ── the desert re-skin dropped the old Scoreboard mesh, but
	// kept both Score_Anchor_* nodes — read as "put each side's own number
	// here" rather than one shared backdrop. A THREE.Sprite always faces the
	// camera regardless of the anchor's own orientation, so it's the natural
	// fit; each gets its own canvas texture (never a HUD/DOM overlay — the ctx
	// contract has no hook for one).
	function makeScoreSprite( anchor ) {

		if ( ! anchor ) return null;
		const canvas = document.createElement( 'canvas' );
		canvas.width = 128; canvas.height = 128;
		const c2d = canvas.getContext( '2d' );
		const texture = new THREE.CanvasTexture( canvas );
		texture.colorSpace = THREE.SRGBColorSpace;
		const sprite = new THREE.Sprite( new THREE.SpriteMaterial( { map: texture, transparent: true, depthTest: false } ) );
		sprite.scale.set( 1.4, 1.4, 1 );
		anchor.add( sprite );

		return ( text ) => {

			c2d.clearRect( 0, 0, canvas.width, canvas.height );
			c2d.fillStyle = 'rgba(10,14,18,0.55)';
			c2d.beginPath();
			c2d.arc( canvas.width / 2, canvas.height / 2, canvas.width / 2 - 4, 0, Math.PI * 2 );
			c2d.fill();
			c2d.fillStyle = '#7fd0ff';
			c2d.font = 'bold 64px monospace';
			c2d.textAlign = 'center';
			c2d.textBaseline = 'middle';
			c2d.fillText( String( text ), canvas.width / 2, canvas.height / 2 + 4 );
			texture.needsUpdate = true;

		};

	}

	const drawPlayerScore = makeScoreSprite( playerAnchor );
	const drawComputerScore = makeScoreSprite( computerAnchor );

	function drawScore() {

		const playerText = state.winner === 'player' ? 'WIN' : state.scorePlayer;
		const computerText = state.winner === 'computer' ? 'WIN' : state.scoreComputer;
		if ( drawPlayerScore ) drawPlayerScore( playerText );
		if ( drawComputerScore ) drawComputerScore( computerText );

	}

	// ── Camera ── focused behind the player's paddle, angled down the table so
	// both paddles and the full court stay in frame; pulled in a bit tighter
	// than before (the old framing budgeted extra height for the now-removed
	// Scoreboard mesh) so the desert horizon (mesas around z≈-40–-46) reads as
	// backdrop rather than empty sky.
	camera.position.set( 0, 8, 19 );
	camera.lookAt( 0, 1, - 8 );

	let vx = 0, vz = 0;

	state.scorePlayer = 0;
	state.scoreComputer = 0;
	state.winner = null;

	function serve( towardPlayer ) {

		ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z );
		vx = ( Math.random() * 2 - 1 ) * 0.5 * SERVE_SPEED;
		vz = ( towardPlayer ? 1 : - 1 ) * SERVE_SPEED;

	}

	onReset( () => { state.scorePlayer = 0; state.scoreComputer = 0; state.winner = null; serve( true ); drawScore(); } );

	serve( true );
	drawScore();

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
			drawScore();

		} else if ( ball.position.z < - OUT_OF_BOUNDS_Z ) {

			state.scorePlayer ++;
			if ( state.scorePlayer >= WIN_SCORE ) { state.winner = 'player'; ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z ); vx = 0; vz = 0; }
			else serve( true );
			drawScore();

		}

	} );

}
