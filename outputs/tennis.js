// ── game.js (Tennis) ───────────────────────────────────────────────────────
// Strata Play entry module for outputs/tennis.glb. The scene ships one
// reference "human" rig parked beside the court — cloned twice (player,
// computer) and repositioned onto the baselines, never mutated/used live
// itself (same clone-the-template discipline this repo's Bubble Shooter uses
// for its own "#Bubble" prototype). No physics labels, so ctx.world is null;
// movement/ball flight are plain per-frame math against the court's own
// authored line geometry.
//
// Honesty note: the rig's two skins ship with every joint set to `null` (a
// broken export — outputs/tennis.glb was patched to drop the unusable skins
// so GLTFLoader can parse the file at all). With no working skin there is no
// skeletal deformation, so both clones render in their authored bind pose
// (a T-pose) and only ever translate as a whole rigid body — there is no
// walking/swinging animation. The racquet is attached to the (still very
// much real, still posable-in-principle) mmRightHand bone so at least the
// bone hierarchy — and anything parented to it — behaves correctly.

export default function init( ctx ) {

	const { THREE, $S, input, camera, onFrame, onReset, reset, state } = ctx;

	const humanProto = $S( '#human' ).toArray()[ 0 ];
	humanProto.visible = false; // the pristine template — cloned below, never used live directly

	const ball = $S( '#Tennis_Ball' ).toArray()[ 0 ];
	const BALL_RADIUS = new THREE.Box3().setFromObject( ball ).getSize( new THREE.Vector3() ).x / 2;
	const BALL_REST_Y = BALL_RADIUS;

	// ── Court geometry — read from the scene's own line markings, never
	// hardcoded, so a re-exported court with different real-world dimensions
	// still lines up (same philosophy as this repo's Pong/Bubbles).
	const SINGLES_HALF_X = new THREE.Box3().setFromObject( $S( '#Singles_Sideline_Right' ).toArray()[ 0 ] ).min.x;
	const BASELINE_Z = new THREE.Box3().setFromObject( $S( '#Baseline_Far' ).toArray()[ 0 ] ).min.z;
	const PLAYER_HALF_X = SINGLES_HALF_X - 1.5; // movement clamp, kept a hair inside the lines
	const PLAYER_Z = BASELINE_Z - 7;   // near baseline — some run-off room behind, matching this repo's Pong paddle-inset convention
	const COMPUTER_Z = - PLAYER_Z;
	const OUT_OF_BOUNDS_Z = BASELINE_Z + 1;
	const NET_CLEAR_HEIGHT = 1.5; // a fair, playable "must clear the net" height — independent of the net MESH's own (visibly oversized) geometry

	// ── Flight — every rally shot uses the SAME total flight time, so a fixed
	// gravity + launch speed always arcs the ball to the same apex height
	// exactly over the net (the two baselines are equidistant from z=0).
	const FLIGHT_TIME = 2.0; // seconds, baseline to baseline
	const RALLY_VZ = ( PLAYER_Z - COMPUTER_Z ) / FLIGHT_TIME;
	const APEX_HEIGHT = 3;
	const GRAVITY = - 8 * APEX_HEIGHT / ( FLIGHT_TIME * FLIGHT_TIME );
	const LAUNCH_VY = - GRAVITY * FLIGHT_TIME / 2;

	const HIT_DEPTH = 3;   // z-window either side of a player's own baseline z where a return is possible
	const HIT_REACH = 3.5; // x-window around the hitter's current x
	const PLAYER_SPEED = 16;
	const AI_SPEED = 9;    // capped below the player's — beatable, same convention as Pong/Bubbles

	// ── Sound effects — Web Audio only (no audio files), routed through
	// ctx.audio.destination so the header's mute toggle silences all of it.
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

	function sfxHit() { tone( { freq: 480, freqEnd: 220, duration: 0.08, type: 'triangle', gain: 0.2 } ); }
	function sfxBounce() { tone( { freq: 200, duration: 0.05, type: 'square', gain: 0.08 } ); }
	function sfxFault() { tone( { freq: 300, freqEnd: 140, duration: 0.22, type: 'sawtooth', gain: 0.16 } ); }
	function sfxWin() { [ 523.25, 659.25, 783.99, 1046.5 ].forEach( ( f, i ) => tone( { freq: f, duration: 0.18, type: 'triangle', gain: 0.18, delay: i * 0.12 } ) ); }
	function sfxLose() { [ 392, 349.23, 293.66, 246.94 ].forEach( ( f, i ) => tone( { freq: f, duration: 0.22, type: 'sawtooth', gain: 0.15, delay: i * 0.14 } ) ); }

	// ── Racquet — a small procedural mesh (no racquet asset in the scene),
	// parented to a rig's own mmRightHand bone. The hand's world rotation is
	// identity (confirmed live), and its own fingers point down local -X, so
	// the racquet is authored directly in that local space, no extra rotation
	// math needed. Counter-scaled by the hand's cumulative ancestor scale
	// (the "human" root carries a 0.02 scale) so it renders at an actual
	// racquet's real size regardless of how deep in the rig it's parented.
	function makeRacquet() {

		const group = new THREE.Group();
		const mat = new THREE.MeshStandardMaterial( { color: 0x2b2b2b } );
		const stringMat = new THREE.MeshBasicMaterial( { color: 0xe8e8e0, wireframe: true } );

		const handle = new THREE.Mesh( new THREE.CylinderGeometry( 0.035, 0.04, 0.45, 8 ), mat );
		handle.rotation.z = Math.PI / 2; // cylinder's own axis is Y — lay it along local X
		handle.position.x = - 0.22;
		group.add( handle );

		const rim = new THREE.Mesh( new THREE.TorusGeometry( 0.17, 0.02, 8, 20 ), mat );
		rim.rotation.y = Math.PI / 2; // torus's own face is XY — turn it to face along X, like a real racquet head
		rim.position.x = - 0.52;
		group.add( rim );

		const strings = new THREE.Mesh( new THREE.CircleGeometry( 0.16, 16 ), stringMat );
		strings.rotation.y = Math.PI / 2;
		strings.position.x = - 0.52;
		group.add( strings );

		return group;

	}

	function attachRacquet( rig ) {

		const hand = rig.getObjectByName( 'mmRightHand' );
		const scale = hand.getWorldScale( new THREE.Vector3() );
		const racquet = makeRacquet();
		racquet.scale.setScalar( 1 / scale.x );
		racquet.position.x = - 0.3; // just beyond the fingertips, continuing the (fixed, T-pose) arm's own reach direction
		hand.add( racquet );

	}

	function makeRig( z, facing ) {

		const rig = humanProto.clone( true );
		rig.visible = true;
		rig.position.set( 0, 0, z );
		rig.rotation.y = facing;
		humanProto.parent.add( rig );
		attachRacquet( rig );
		return rig;

	}

	const playerRig = makeRig( PLAYER_Z, Math.PI ); // faces -Z (the net) from the near baseline
	const computerRig = makeRig( COMPUTER_Z, 0 );   // the rig's own unrotated front already faces +Z (the net) from the far baseline

	// ── Camera (fit-by-distance, same approach as this repo's Pong/Bubbles) —
	// a real tennis court's own extreme aspect ratio (long and narrow) is
	// exactly what that approach is for: whichever of horizontal/vertical FOV
	// is tighter for the current window shape drives the distance, so the
	// full doubles court + a little run-off always fits, any aspect ratio.
	const FIXED_VFOV = 50;
	const CAMERA_LOOKAT = new THREE.Vector3( 0, 1, 0 );
	const CAMERA_DIR = new THREE.Vector3( 0, 30, 38 ).normalize();
	const FIT_K = 30;

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

	// ── Ball flight state ──
	let vx = 0, vy = 0, vz = 0;
	let lastHitBy = null; // 'player' | 'computer' | null — whoever last sent the ball this way, for fault attribution
	let prevZ = 0;

	state.scorePlayer = 0;
	state.scoreComputer = 0;
	state.winner = null;

	function serve( towardPlayer ) {

		ball.position.set( 0, BALL_REST_Y + 1, 0 );
		vx = ( Math.random() * 2 - 1 ) * 2;
		vz = towardPlayer ? RALLY_VZ : - RALLY_VZ;
		vy = LAUNCH_VY;
		lastHitBy = towardPlayer ? 'computer' : 'player'; // the "server" — whoever it's launched away from
		prevZ = ball.position.z;

	}

	function pointTo( winnerSide ) {

		if ( winnerSide === 'player' ) state.scorePlayer ++; else state.scoreComputer ++;
		if ( state.scorePlayer >= 7 || state.scoreComputer >= 7 ) {

			state.winner = state.scorePlayer > state.scoreComputer ? 'player' : 'computer';
			if ( state.winner === 'player' ) sfxWin(); else sfxLose();
			ball.position.set( 0, BALL_REST_Y, 0 );
			vx = vy = vz = 0;

		} else serve( winnerSide !== 'player' );

	}

	onReset( () => { state.scorePlayer = 0; state.scoreComputer = 0; state.winner = null; serve( true ); } );

	serve( true );

	// Once a match ends, freeze play until Enter/Space starts a new one —
	// ctx.reset() re-runs the SAME onReset handler above, no separate lifecycle.
	input.onKey( ( { type, code } ) => {

		if ( type === 'down' && state.winner && ( code === 'Enter' || code === 'Space' ) ) reset();

	} );

	function tryHit( rig, z, facing, halfX, side ) {

		const withinDepth = Math.abs( ball.position.z - z ) < HIT_DEPTH;
		const approaching = facing > 0 ? vz > 0 : vz < 0; // heading toward this baseline
		const withinReach = Math.abs( ball.position.x - rig.position.x ) < HIT_REACH;
		if ( ! withinDepth || ! approaching || ! withinReach ) return false;

		sfxHit();
		const offset = ( ball.position.x - rig.position.x ) / HIT_REACH; // -1..1 across the racquet's reach
		vx = offset * 6;
		vz = facing > 0 ? - RALLY_VZ : RALLY_VZ;
		vy = LAUNCH_VY;
		lastHitBy = side;
		return true;

	}

	onFrame( ( dt ) => {

		if ( state.winner ) return;

		// Player: held-key axis, same input contract as every other game here.
		const axis = input.axis( [ 'ArrowLeft', 'KeyA' ], [ 'ArrowRight', 'KeyD' ] );
		playerRig.position.x = Math.max( - PLAYER_HALF_X, Math.min( PLAYER_HALF_X, playerRig.position.x + axis * PLAYER_SPEED * dt ) );

		// Computer: lerp toward the ball, capped speed — beatable, no ML.
		const diff = ball.position.x - computerRig.position.x;
		const step = Math.max( - AI_SPEED * dt, Math.min( AI_SPEED * dt, diff ) );
		computerRig.position.x = Math.max( - PLAYER_HALF_X, Math.min( PLAYER_HALF_X, computerRig.position.x + step ) );

		// Ball integration — no physics body for an unlabeled scene; plain math.
		prevZ = ball.position.z;
		vy += GRAVITY * dt;
		ball.position.x += vx * dt;
		ball.position.y += vy * dt;
		ball.position.z += vz * dt;

		if ( ball.position.y <= BALL_REST_Y && vy < 0 ) { ball.position.y = BALL_REST_Y; vy = - vy * 0.55; sfxBounce(); }

		// Went wide of the singles sidelines — a fault against whoever hit it.
		if ( Math.abs( ball.position.x ) > SINGLES_HALF_X ) {

			sfxFault();
			pointTo( lastHitBy === 'player' ? 'computer' : 'player' );
			return;

		}

		// Crossed the net below the required clearance — into the net.
		if ( prevZ !== 0 && Math.sign( prevZ ) !== Math.sign( ball.position.z ) && ball.position.y < NET_CLEAR_HEIGHT ) {

			sfxFault();
			pointTo( lastHitBy === 'player' ? 'computer' : 'player' );
			return;

		}

		// In range of either racquet — auto-return, exactly like this repo's
		// Pong paddle (position yourself; contact does the rest).
		if ( tryHit( playerRig, PLAYER_Z, 1, PLAYER_HALF_X, 'player' ) ) return;
		if ( tryHit( computerRig, COMPUTER_Z, -1, PLAYER_HALF_X, 'computer' ) ) return;

		// Missed entirely — past a baseline uncaught.
		if ( ball.position.z > OUT_OF_BOUNDS_Z ) pointTo( 'computer' );
		else if ( ball.position.z < - OUT_OF_BOUNDS_Z ) pointTo( 'player' );

	} );

}
