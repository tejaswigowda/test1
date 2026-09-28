// ── game.js (Tennis) ───────────────────────────────────────────────────────
// Strata Play entry module for outputs/tennis.glb. The scene ships one
// reference "human" rig parked beside the court — cloned twice (player,
// computer) and repositioned onto the baselines, never mutated/used live
// itself (same clone-the-template discipline this repo's Bubble Shooter uses
// for its own "#Bubble" prototype). No physics labels, so ctx.world is null;
// movement/ball flight are plain per-frame math against the court's own
// authored line geometry.
//
// Rig note: the file originally shipped with both skins' `joints` arrays set
// to `null` (a broken export — GLTFLoader can't even parse a file in that
// state). outputs/tennis.glb has since been patched twice: first to drop the
// unusable skins just to get it loading at all, then properly repaired by
// reconstructing the real joints list (recovered from the file's own leftover
// animation-channel targets, cross-checked against every bone's inverse bind
// matrix — a bone-for-bone match to float precision). Real skeletal skinning
// now works, which is what makes the procedural walk/idle/swing animation
// below actually deform the mesh instead of just moving an inert prop.
//
// Cloning a SkinnedMesh with plain Object3D#clone(true) leaves both copies
// sharing ONE THREE.Skeleton (a well-known three.js gotcha) — every clone
// below goes through SkeletonUtils.clone() instead, which rebuilds an
// independent skeleton per clone so the player and computer can be posed
// separately.

import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export default function init( ctx ) {

	const { THREE, $S, input, camera, onFrame, onReset, reset, state, animations } = ctx;

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

	const REACH_RADIUS = 6;  // 2D (x,z) radius around a player's own position where a return is possible — wider than a bot's own reach would need, since a human's reaction time (unlike the AI's perfect tracking) needs the extra margin to actually connect
	const MAX_HIT_Y = BALL_REST_Y + APEX_HEIGHT * 2; // generous vs. a normal arc's own apex, but firmly rules out an overhead ball no racquet could reach
	const PLAYER_SPEED = 16;
	const AI_SPEED = 9;      // capped below the player's — beatable, same convention as Pong/Bubbles

	// ── Full-court movement — both axes now, each clamped to a player's own
	// half so neither side can cross the net; some run-off room behind the
	// baseline (a real player stands back there for a deep return) and a
	// hard stop just short of the net itself.
	const NET_APPROACH_MARGIN = 5; // kept comfortably beyond REACH_RADIUS — every serve starts dead center at the net (z=0), so anyone allowed closer than the reach radius could volley their own side's serve the instant it spawns
	const BACK_MARGIN = 3;
	const PLAYER_Z_MIN = NET_APPROACH_MARGIN;
	const PLAYER_Z_MAX = BASELINE_Z + BACK_MARGIN;
	const COMPUTER_Z_MIN = - PLAYER_Z_MAX;
	const COMPUTER_Z_MAX = - NET_APPROACH_MARGIN;

	// ── Effort — hold Space to charge a stroke (an audible rising pitch tracks
	// it live); releasing isn't required — a charged racquet swings the
	// instant the ball is actually in range, at whatever power has built up
	// so far, so timing the approach still matters as much as the hold.
	const CHARGE_TIME = 0.7;    // seconds to reach full charge from a cold tap
	const MIN_POWER_MULT = 0.6; // shot-speed multiplier for a bare tap
	const MAX_POWER_MULT = 1.4; // shot-speed multiplier at full charge — enough to sail a mistimed full-power shot long

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

	// A held oscillator whose pitch tracks charge live (0..1) — the "natural"
	// feedback for an otherwise invisible hold-to-charge effort meter, same
	// synth-only convention as every other sound here. Cleaned up on a
	// Code-tab Save / new game load like any other live audio node.
	let chargeOsc = null, chargeGain = null;
	function setCharging( active, charge ) {

		if ( active && ! chargeOsc ) {

			chargeOsc = audioCtx.createOscillator();
			chargeGain = audioCtx.createGain();
			chargeOsc.type = 'sine';
			chargeGain.gain.value = 0.07;
			chargeOsc.connect( chargeGain ).connect( ctx.audio.destination );
			chargeOsc.start();

		}

		if ( chargeOsc ) chargeOsc.frequency.setTargetAtTime( 220 + charge * 440, audioCtx.currentTime, 0.05 );

		if ( ! active && chargeOsc ) {

			chargeGain.gain.setTargetAtTime( 0, audioCtx.currentTime, 0.05 );
			chargeOsc.stop( audioCtx.currentTime + 0.12 );
			chargeOsc = null; chargeGain = null;

		}

	}
	ctx.onCleanup( () => { try { chargeOsc && chargeOsc.stop(); } catch ( e ) {} } );

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

	// ── Animation — outputs/tennis.glb ships 4 clips authored directly for
	// this rig (Idle, Run, Swing Forehand, Swing Backhand) — no retargeting
	// needed (a prior attempt to reuse an unrelated rig's mocap library via
	// SkeletonUtils.retargetClip distorted the pose from a bind-rotation
	// mismatch between skeletons; these clips have no such mismatch since
	// they're keyed against this exact rig's own bind pose). Real
	// THREE.AnimationMixer playback: Idle/Run cross-fade by movement speed,
	// Forehand/Backhand play as a one-shot on hit (picked by which side of
	// the racquet the ball was struck from).
	const clipIdle = animations.find( ( a ) => a.name === 'Idle' );
	const clipRun = animations.find( ( a ) => a.name === 'Run' );
	const clipForehand = animations.find( ( a ) => a.name === 'Swing Forehand' );
	const clipBackhand = animations.find( ( a ) => a.name === 'Swing Backhand' );

	const IDLE_BOB_AMP = 0.035; // world units — a subtle standing weight-shift, layered on top of the mixer
	const TURN_SPEED = Math.PI * 4; // radians/sec — how fast the rig turns to face its direction of travel

	function makeAnimator( rig, baseFacing ) {

		const mixer = new THREE.AnimationMixer( rig );
		const idleAction = mixer.clipAction( clipIdle ).play();
		const runAction = mixer.clipAction( clipRun ).play();
		const foreAction = mixer.clipAction( clipForehand );
		const backAction = mixer.clipAction( clipBackhand );
		for ( const a of [ foreAction, backAction ] ) { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; }

		// The scene's own "Idle" clip is just a single held keyframe of the
		// rig's bind pose (a T-pose), not a relaxed stance — corrected here by
		// rotating the shoulders so the arms hang at the sides instead, scaled
		// by how much of the blend is actually idle (0 while running/swinging,
		// so it never fights the Run clip's own arm swing or a swing's own
		// pose).
		const lShoulder = rig.getObjectByName( 'mmLeftArm' );
		const rShoulder = rig.getObjectByName( 'mmRightArm' );
		const ARMS_DOWN = Math.PI / 2;
		const armsDownAxis = new THREE.Vector3( 0, 0, 1 );
		const armsDownQuatL = new THREE.Quaternion().setFromAxisAngle( armsDownAxis, - ARMS_DOWN );
		const armsDownQuatR = new THREE.Quaternion().setFromAxisAngle( armsDownAxis, ARMS_DOWN );

		let idleT = Math.random() * 10; // desynced so both rigs don't bob in lockstep
		let swingAction = null;

		function triggerSwing( forehand ) {

			swingAction = forehand ? foreAction : backAction;
			swingAction.reset().play();

		}

		function update( dt, dx, dz, baseY ) {

			idleT += dt;
			rig.position.y = baseY + Math.sin( idleT * 2 ) * IDLE_BOB_AMP;

			const swinging = swingAction && swingAction.isRunning();
			const dist = Math.sqrt( dx * dx + dz * dz );
			const speed = Math.min( 1, dist / dt / PLAYER_SPEED );
			const idleWeight = swinging ? 0 : 1 - speed;
			idleAction.setEffectiveWeight( idleWeight );
			runAction.setEffectiveWeight( swinging ? 0 : speed );
			if ( swingAction ) swingAction.setEffectiveWeight( swinging ? 1 : 0 );

			// Full-court movement is a real 2D heading now, not just left/right —
			// turn the whole rig to actually face the way it's running (the Run
			// clip is an ordinary forward gait), and back to facing the net once
			// it stops. atan2(dx,dz) matches this rig's own bind orientation:
			// yaw 0 faces +Z, yaw +90° faces +X (confirmed live against the
			// loaded rig), i.e. exactly the world heading of (dx,dz).
			const targetYaw = speed > 0.05 ? Math.atan2( dx, dz ) : baseFacing;
			const yawDiff = ( ( targetYaw - rig.rotation.y + Math.PI ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 ) - Math.PI;
			const maxStep = TURN_SPEED * dt;
			rig.rotation.y += Math.max( - maxStep, Math.min( maxStep, yawDiff ) );

			mixer.update( dt );

			// Blends the mixer's own T-pose arms toward "arms down" by
			// idleWeight — NOT a binary gate at idleWeight>0.99, because the AI
			// is almost never fully stationary (constant tiny corrective steps
			// chasing the ball keep speed just above 0), which left the
			// computer stuck in a permanent half-T-pose blend. Safe from the
			// earlier accumulation bug (see memory notes) because the slerp
			// always starts fresh FROM whatever the mixer just wrote this
			// frame, never from our own previous frame's corrected output.
			if ( ! swinging ) {

				lShoulder.quaternion.slerp( armsDownQuatL, idleWeight );
				rShoulder.quaternion.slerp( armsDownQuatR, idleWeight );

			}

		}

		return { update, triggerSwing };

	}

	function makeRig( z, facing, bodyColor ) {

		const rig = cloneSkinned( humanProto );
		rig.visible = true;
		rig.position.set( 0, 0, z );
		rig.rotation.y = facing;
		// A SkinnedMesh's default frustum-culling bounding sphere is computed
		// once from the bind pose in the PROTO's own local space (parked well
		// off-court) — moved + re-posed like this, it no longer reliably
		// overlaps the camera frustum, silently culling one whole clone.
		rig.traverse( ( o ) => { if ( o.isSkinnedMesh ) o.frustumCulled = false; } );
		// Tell player and computer apart — SkeletonUtils.clone() shares the
		// body's own material instance across every clone (unlike a couple of
		// the racquet's own materials, which it happens to clone already), so
		// recoloring it in place would tint BOTH rigs at once; clone it first.
		const body = rig.getObjectByName( 'Alpha_Surface' );
		body.material = body.material.clone();
		body.material.color.set( bodyColor );
		humanProto.parent.add( rig );
		attachRacquet( rig );
		return { rig, animator: makeAnimator( rig, facing ) };

	}

	const player = makeRig( PLAYER_Z, Math.PI, 0x3b82f6 ); // faces -Z (the net) from the near baseline — blue
	const computer = makeRig( COMPUTER_Z, 0, 0xef4444 );   // the rig's own unrotated front already faces +Z (the net) from the far baseline — red



	// ── Camera (fit-by-distance, same approach as this repo's Pong/Bubbles) —
	// a real tennis court's own extreme aspect ratio (long and narrow) is
	// exactly what that approach is for: whichever of horizontal/vertical FOV
	// is tighter for the current window shape drives the distance, so the
	// full doubles court + a little run-off always fits, any aspect ratio.
	const FIXED_VFOV = 50;
	const CAMERA_LOOKAT = new THREE.Vector3( 0, 1, 0 );
	const CAMERA_DIR = new THREE.Vector3( 0, 30, 38 ).normalize();
	const FIT_K = 42; // wide enough that PLAYER_Z_MAX/COMPUTER_Z_MIN (baseline + BACK_MARGIN run-off) stay in frame, not just the court's own line markings — a fixed, low broadcast-style camera angle like this one needs MORE margin for near-camera depths, not less (same world-space offset subtends a bigger screen angle up close), so this was previously cropping the player's own back-court run-off room

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
	let bounces = 0; // ground touches since the last hit — a real tennis point ends on the second one
	let playerCharge = 0; // 0..1, held Space charges a stroke's effort — see tryHit

	state.scorePlayer = 0;
	state.scoreComputer = 0;
	state.winner = null;

	function serve( towardPlayer ) {

		ball.position.set( 0, BALL_REST_Y + 1, 0 );
		vx = ( Math.random() * 2 - 1 ) * 2;
		vz = towardPlayer ? RALLY_VZ : - RALLY_VZ;
		vy = LAUNCH_VY;
		lastHitBy = towardPlayer ? 'computer' : 'player'; // the "server" — whoever it's launched away from
		bounces = 0;
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

	onReset( () => {

		state.scorePlayer = 0; state.scoreComputer = 0; state.winner = null;
		player.rig.position.set( 0, 0, PLAYER_Z );
		computer.rig.position.set( 0, 0, COMPUTER_Z );
		serve( true );

	} );

	serve( true );

	// Once a match ends, freeze play until Enter/Space starts a new one —
	// ctx.reset() re-runs the SAME onReset handler above, no separate lifecycle.
	input.onKey( ( { type, code } ) => {

		if ( type === 'down' && state.winner && ( code === 'Enter' || code === 'Space' ) ) reset();

	} );

	function tryHit( rigInfo, facing, side, power ) {

		const rig = rigInfo.rig;
		const onThisSide = facing > 0 ? ball.position.z > 0 : ball.position.z < 0;
		const approaching = facing > 0 ? vz > 0 : vz < 0; // heading toward this side, not just hit away from it
		const dx = ball.position.x - rig.position.x;
		const dz = ball.position.z - rig.position.z;
		const withinReach = ( dx * dx + dz * dz ) < REACH_RADIUS * REACH_RADIUS; // full 2D reach — the player can be anywhere in their half now
		const withinRacquetHeight = ball.position.y < MAX_HIT_Y; // a racquet can't reach a ball sailing far overhead — without this, back-to-back volleys near the net can re-launch the ball with a fresh upward LAUNCH_VY before it ever comes back down, ratcheting the height indefinitely
		if ( ! onThisSide || ! approaching || ! withinReach || ! withinRacquetHeight ) return false;

		sfxHit();
		const lateralOffset = Math.max( - 1, Math.min( 1, dx / REACH_RADIUS ) ); // -1..1 across the racquet's reach — aim, and which side of the body picks forehand vs backhand
		rigInfo.animator.triggerSwing( lateralOffset > 0 );
		const speedMul = MIN_POWER_MULT + ( MAX_POWER_MULT - MIN_POWER_MULT ) * power;
		vx = lateralOffset * 6 * speedMul;
		vz = ( facing > 0 ? - RALLY_VZ : RALLY_VZ ) * speedMul;
		vy = LAUNCH_VY * speedMul;
		lastHitBy = side;
		bounces = 0;
		return true;

	}

	onFrame( ( dt ) => {

		if ( state.winner ) return;

		// Player: full 2D court movement — held-key axis on both, same input
		// contract as every other game here. "Up"/W steps toward the net
		// (decreasing z, since the player's own half is the positive side).
		const axisX = input.axis( [ 'ArrowLeft', 'KeyA' ], [ 'ArrowRight', 'KeyD' ] );
		const axisZ = input.axis( [ 'ArrowUp', 'KeyW' ], [ 'ArrowDown', 'KeyS' ] );
		const playerDx = Math.max( - PLAYER_HALF_X - player.rig.position.x, Math.min( PLAYER_HALF_X - player.rig.position.x, axisX * PLAYER_SPEED * dt ) );
		const playerDz = Math.max( PLAYER_Z_MIN - player.rig.position.z, Math.min( PLAYER_Z_MAX - player.rig.position.z, axisZ * PLAYER_SPEED * dt ) );
		player.rig.position.x += playerDx;
		player.rig.position.z += playerDz;

		// Computer: chase the ball's own (x,z) directly, capped speed on each
		// axis — beatable, no ML, same convention as this repo's Pong/Bubbles.
		const diffX = ball.position.x - computer.rig.position.x;
		const diffZ = ball.position.z - computer.rig.position.z;
		const rawComputerDx = Math.max( - AI_SPEED * dt, Math.min( AI_SPEED * dt, diffX ) );
		const rawComputerDz = Math.max( - AI_SPEED * dt, Math.min( AI_SPEED * dt, diffZ ) );
		const computerDx = Math.max( - PLAYER_HALF_X - computer.rig.position.x, Math.min( PLAYER_HALF_X - computer.rig.position.x, rawComputerDx ) );
		const computerDz = Math.max( COMPUTER_Z_MIN - computer.rig.position.z, Math.min( COMPUTER_Z_MAX - computer.rig.position.z, rawComputerDz ) );
		computer.rig.position.x += computerDx;
		computer.rig.position.z += computerDz;

		player.animator.update( dt, playerDx, playerDz, 0 );
		computer.animator.update( dt, computerDx, computerDz, 0 );

		// Effort — hold Space to charge; releasing isn't required, whatever's
		// built up fires the instant a hit actually connects (see tryHit below).
		const charging = input.isDown( 'Space' );
		playerCharge = charging ? Math.min( 1, playerCharge + dt / CHARGE_TIME ) : 0;
		setCharging( charging, playerCharge );

		// Ball integration — no physics body for an unlabeled scene; plain math.
		prevZ = ball.position.z;
		vy += GRAVITY * dt;
		ball.position.x += vx * dt;
		ball.position.y += vy * dt;
		ball.position.z += vz * dt;

		if ( ball.position.y <= BALL_REST_Y && vy < 0 ) {

			ball.position.y = BALL_REST_Y;
			vy = - vy * 0.55;
			sfxBounce();
			bounces ++;
			if ( bounces >= 2 ) { pointTo( lastHitBy ); return; } // a real tennis rule: the second bounce ends the point, wherever it lands

		}

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

		// In reach — a real stroke now: the player only ever swings while
		// actively charging (Space held), volley or after one bounce alike;
		// the computer still swings automatically, picking its own effort.
		if ( charging && tryHit( player, 1, 'player', playerCharge ) ) { playerCharge = 0; return; }
		if ( tryHit( computer, -1, 'computer', 0.45 + Math.random() * 0.45 ) ) return;

		// Missed entirely — past a baseline uncaught.
		if ( ball.position.z > OUT_OF_BOUNDS_Z ) pointTo( 'computer' );
		else if ( ball.position.z < - OUT_OF_BOUNDS_Z ) pointTo( 'player' );

	} );

}
