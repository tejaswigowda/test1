// ── game.js (Pong) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Strata Play entry module for outputs/pong.glb. This scene ships no physics
// labels (no .static/.kinematic/.dynamic classes), so there is no cannon-es
// world (ctx.world is null) and no bodies to bind — per the label → physics
// body vocabulary, no label means no body. Movement/collision here are plain
// per-frame math against the scene's own authored geometry instead.

export default function init( ctx ) {

	const { $S, input, onFrame, onReset, state } = ctx;

	const player = $S( '#Player_Paddle' ).toArray()[ 0 ];
	const ai = $S( '#Computer_Paddle' ).toArray()[ 0 ];
	const ball = $S( '#Ball' ).toArray()[ 0 ];
	const spawn = $S( '#Ball_Spawn' ).toArray()[ 0 ];

	// Derived from the authored scene's own bounds (Table ±6 x / ±12 z,
	// Rail_Left/Right at ±6–6.3 x, paddles ±1.1 half-width at z ±10.3–10.7).
	const BALL_RADIUS = 0.35;
	const PADDLE_HALF_WIDTH = 1.1;
	const PADDLE_HALF_X = 4.9;    // table half-width (6) minus paddle half-width
	const BALL_HALF_X = 5.65;     // table half-width (6) minus ball radius
	const PLAYER_FRONT_Z = 10.3;  // Player_Paddle's near face
	const AI_FRONT_Z = - 10.3;    // Computer_Paddle's near face
	const OUT_OF_BOUNDS_Z = 10.9; // just past each paddle's far edge

	const PLAYER_SPEED = 8;  // units/sec
	const AI_SPEED = 4.2;    // capped below the player's — beatable
	const SERVE_SPEED = 6;

	let vx = 0, vz = 0;

	state.scorePlayer = 0;
	state.scoreComputer = 0;

	function serve( towardPlayer ) {

		ball.position.set( spawn.position.x, spawn.position.y, spawn.position.z );
		vx = ( Math.random() * 2 - 1 ) * 0.5 * SERVE_SPEED;
		vz = ( towardPlayer ? 1 : - 1 ) * SERVE_SPEED;

	}

	onReset( () => { state.scorePlayer = 0; state.scoreComputer = 0; serve( true ); } );

	serve( true );

	onFrame( ( dt ) => {

		// Player input — arrow keys / A-D (a touch/pointer drag falls back to
		// the SAME axis() call; see sandbox.html's makeInput).
		const axis = input.axis( [ 'ArrowLeft', 'KeyA' ], [ 'ArrowRight', 'KeyD' ] );
		player.position.x = Math.max( - PADDLE_HALF_X, Math.min( PADDLE_HALF_X, player.position.x + axis * PLAYER_SPEED * dt ) );

		// AI: lerp toward the ball, clamped + speed-capped (beatable). No ML.
		const diff = ball.position.x - ai.position.x;
		const step = Math.max( - AI_SPEED * dt, Math.min( AI_SPEED * dt, diff ) );
		ai.position.x = Math.max( - PADDLE_HALF_X, Math.min( PADDLE_HALF_X, ai.position.x + step ) );

		// Manual ball integration — no physics body exists for an unlabeled node.
		ball.position.x += vx * dt;
		ball.position.z += vz * dt;

		// Side-rail bounce.
		if ( ball.position.x > BALL_HALF_X ) { ball.position.x = BALL_HALF_X; vx = - Math.abs( vx ); }
		else if ( ball.position.x < - BALL_HALF_X ) { ball.position.x = - BALL_HALF_X; vx = Math.abs( vx ); }

		// Paddle bounce — only while the ball is heading toward that paddle and
		// within its width.
		if ( vz > 0 && ball.position.z + BALL_RADIUS >= PLAYER_FRONT_Z && Math.abs( ball.position.x - player.position.x ) <= PADDLE_HALF_WIDTH + BALL_RADIUS ) {

			ball.position.z = PLAYER_FRONT_Z - BALL_RADIUS;
			vz = - Math.abs( vz );

		} else if ( vz < 0 && ball.position.z - BALL_RADIUS <= AI_FRONT_Z && Math.abs( ball.position.x - ai.position.x ) <= PADDLE_HALF_WIDTH + BALL_RADIUS ) {

			ball.position.z = AI_FRONT_Z + BALL_RADIUS;
			vz = Math.abs( vz );

		}

		// Score + deterministic reset once the ball passes a paddle's far edge.
		if ( ball.position.z > OUT_OF_BOUNDS_Z ) { state.scoreComputer ++; serve( false ); }
		else if ( ball.position.z < - OUT_OF_BOUNDS_Z ) { state.scorePlayer ++; serve( true ); }

	} );

}
