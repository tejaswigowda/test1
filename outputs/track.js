// ── track.js — lap race for a labelled circuit scene (outputs/track.glb) ─────
// Logic only: the scene is geometry + labels. Everything here is derived from
// those labels and the loaded geometry (Box3 / geometry bounds / raycasts) —
// no world coordinates — so any scene labelled the same way can reuse this file.
//
//   #StartLine  .checkpoint (#Checkpoint01..N, crossing order)  .spawn-point
//   .item-box   .boost-pad  #Road/.drivable  #Terrain/.offroad
//
// Crossing tests are done in each gate's own local space (the harness' cannon
// sensor boxes are not used for gameplay), against the gate's real geometry
// bounds, as a swept plane test so a fast car can never tunnel through the 1.2 m
// thick gate.

export const requires = [
	'#StartLine', '#SpawnPoint01',
	'#Checkpoint01', '#Checkpoint02', '#Checkpoint03', '#Checkpoint04', '#Checkpoint05', '#Checkpoint06', '#Checkpoint07',
	'#Road',
];

export default function init( ctx ) {

	const { THREE, scene, $S, camera, input, onFrame, onReset, onCleanup, state } = ctx;
	const { Vector3, Quaternion, Matrix4, Box3 } = THREE;

	// ── tuning (gameplay pacing, not scene dimensions) ──────────────────────
	const TOTAL_LAPS = 3;
	const COUNTDOWN = 3; // s
	const TOP_SPEED = 32; // m/s on the road
	const OFFROAD_TOP = 0.42; // fraction of TOP_SPEED allowed on grass
	const OFFROAD_DRAG = 1.6; // 1/s extra drag on grass
	const ACCEL = 18;
	const BRAKE = 40;
	const COAST = 6;
	const TURN_RATE = 2.2; // rad/s at full lock and speed
	const GRAVITY = 28;
	const BOOST_TIME = 1.5; // s
	const BOOST_MULT = 1.55;
	const ITEM_RESPAWN = 5; // s
	const BOT_SKILL = [ 0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.66 ];

	// ── label helpers ───────────────────────────────────────────────────────
	// $S( '.x' ) also matches groups that merely contain a mesh whose material
	// is named x, so only meshes, or nodes carrying the class in their own
	// authored extras, count.
	const has = ( n, cls ) => ( n.userData.customClasses || [] ).includes( cls );
	const own = ( sel, cls ) => $S( sel ).toArray().filter( ( n ) => n.isMesh || has( n, cls ) );
	const byName = ( a, b ) => a.name.localeCompare( b.name, undefined, { numeric: true } );
	const first = ( sel ) => $S( sel ).toArray()[ 0 ];

	scene.updateMatrixWorld( true );

	// Older harness builds gave every ancestor of a `Trigger`-material mesh (e.g.
	// #Gameplay) a scene-sized sensor body; drop any such body so nothing that
	// overlaps-tests against it can fire constantly.
	if ( ctx.world ) {

		for ( const n of $S( '.trigger' ).toArray() ) {

			if ( ! n.isMesh && ! has( n, 'trigger' ) && n.userData.physicsBody ) ctx.world.removeBody( n.userData.physicsBody );

		}

	}

	// ── scene read-out ──────────────────────────────────────────────────────
	const roadMeshes = [ ...new Set( [ ...own( '.drivable', 'drivable' ), ...own( '#Road', 'road' ) ].filter( ( n ) => n.isMesh ) ) ];
	const terrainMeshes = [ ...new Set( [ ...own( '.offroad', 'offroad' ), ...own( '#Terrain', 'terrain' ) ].filter( ( n ) => n.isMesh ) ) ];
	const terrainBox = new Box3();
	for ( const m of terrainMeshes ) terrainBox.expandByObject( m );
	const worldBox = new Box3().setFromObject( scene );
	const terrainTop = ( terrainBox.isEmpty() ? worldBox.max.y : terrainBox.max.y ) + 1;
	const killY = ( terrainBox.isEmpty() ? worldBox.min.y : terrainBox.min.y ) - 15;

	const startNode = first( '#StartLine' );
	const cpNodes = own( '.checkpoint', 'checkpoint' ).sort( byName );
	const spawnNodes = own( '.spawn-point', 'spawn-point' ).sort( byName );
	const itemNodes = own( '.item-box', 'item-box' ).filter( ( n ) => ! n.isMesh );
	const padNodes = own( '.boost-pad', 'boost-pad' );
	const N = cpNodes.length;

	// Local-space bounds of a node's geometry, so a rotated gate keeps its true footprint.
	function localBox( node ) {

		const inv = node.matrixWorld.clone().invert();
		const box = new Box3();
		const m = new Matrix4();
		node.traverse( ( o ) => {

			if ( ! o.geometry ) return;
			if ( ! o.geometry.boundingBox ) o.geometry.computeBoundingBox();
			box.union( o.geometry.boundingBox.clone().applyMatrix4( m.multiplyMatrices( inv, o.matrixWorld ) ) );

		} );
		return box;

	}

	function makeZone( node ) {

		const box = localBox( node );
		return { node, box, inv: node.matrixWorld.clone().invert(), center: box.getCenter( new Vector3() ).applyMatrix4( node.matrixWorld ) };

	}

	// Gate order: checkpoints 1..N, then the start line (index N). Each gate's
	// travel direction is its local +Z, confirmed/flipped against the chord from
	// the previous gate to the next one, so it never depends on authoring axes.
	const gates = [ ...cpNodes, startNode ].map( makeZone );
	gates.forEach( ( g, i ) => {

		const prev = gates[ ( i + gates.length - 1 ) % gates.length ].center;
		const next = gates[ ( i + 1 ) % gates.length ].center;
		const fwd = new Vector3( 0, 0, 1 ).transformDirection( g.node.matrixWorld ).setY( 0 ).normalize();
		const chord = next.clone().sub( prev ).setY( 0 );
		g.sign = fwd.dot( chord ) >= 0 ? 1 : - 1;
		g.dir = fwd.multiplyScalar( g.sign );
		g.heading = Math.atan2( g.dir.x, g.dir.z );
		if ( g.sign < 0 ) console.warn( `track.js: ${ g.node.name } local +Z points against the lap direction; flipped` );

	} );

	const pads = padNodes.map( makeZone );

	// Sizes derive from the scene's own props.
	const itemSize = itemNodes.length ? new Box3().setFromObject( itemNodes[ 0 ] ).getSize( new Vector3() ) : null;
	const unit = itemSize ? itemSize.x : gates[ 0 ].box.getSize( new Vector3() ).x / 8;
	const CAR_W = unit * 0.85;
	const CAR_L = unit * 1.85;
	const CAR_H = unit * 0.55;
	const WHEEL_R = unit * 0.17;
	const PICKUP_R = itemSize ? Math.max( itemSize.x, itemSize.z ) / 2 + CAR_W / 2 : unit;
	const PROBE_UP = CAR_L * 0.6;
	const PROBE_DOWN = CAR_L * 1.6;

	// ── ground ──────────────────────────────────────────────────────────────
	const ray = new THREE.Raycaster();
	const DOWN = new Vector3( 0, - 1, 0 );
	const rayOrigin = new Vector3();

	function groundAt( x, y, z ) {

		rayOrigin.set( x, y + PROBE_UP, z );
		ray.set( rayOrigin, DOWN );
		ray.far = PROBE_UP + PROBE_DOWN;
		let hit = ray.intersectObjects( roadMeshes, false )[ 0 ];
		let kind = 'road';
		if ( ! hit ) {

			rayOrigin.y = terrainTop;
			ray.set( rayOrigin, DOWN );
			ray.far = terrainTop - killY;
			hit = ray.intersectObjects( terrainMeshes, false )[ 0 ];
			kind = 'offroad';

		}

		if ( ! hit ) return null;
		const normal = hit.face ? hit.face.normal.clone().transformDirection( hit.object.matrixWorld ) : new Vector3( 0, 1, 0 );
		if ( normal.y < 0 ) normal.negate();
		return { y: hit.point.y, kind, normal };

	}

	// ── road centreline (for the bots) ──────────────────────────────────────
	// Works for a ribbon road: vertex pairs (left,right) per sample, closed loop.
	function buildCenterline() {

		const road = roadMeshes[ 0 ];
		if ( ! road || ! road.geometry.index ) return null;
		const pos = road.geometry.attributes.position;
		const idx = road.geometry.index.array;
		if ( pos.count % 2 || idx.length < 6 || idx[ 0 ] !== 0 || idx[ 1 ] !== 1 || idx[ 2 ] !== 2 || idx[ 3 ] !== 1 || idx[ 4 ] !== 3 ) return null;

		const M = pos.count / 2;
		const pts = [];
		for ( let i = 0; i < M; i ++ ) {

			const a = new Vector3().fromBufferAttribute( pos, i * 2 ).applyMatrix4( road.matrixWorld );
			const b = new Vector3().fromBufferAttribute( pos, i * 2 + 1 ).applyMatrix4( road.matrixWorld );
			pts.push( { p: a.clone().add( b ).multiplyScalar( 0.5 ), half: a.clone().sub( b ).setY( 0 ).multiplyScalar( 0.5 ) } );

		}

		const nearest = ( c ) => {

			let best = 0, bd = Infinity;
			pts.forEach( ( s, i ) => { const d = ( s.p.x - c.x ) ** 2 + ( s.p.z - c.z ) ** 2; if ( d < bd ) { bd = d; best = i; } } );
			return best;

		};

		const at = gates.map( ( g ) => nearest( g.center ) );
		let S = 0;
		for ( let k = 0; k < at.length; k ++ ) S += ( at[ ( k + 1 ) % at.length ] - at[ k ] + M ) % M;
		const forward = S < ( at.length * M ) / 2; // one lap's worth of steps => samples ascend along the lap
		if ( ! forward ) pts.reverse();
		return pts;

	}

	const line = buildCenterline();

	// ── audio (oscillators only, through the host's master gain) ────────────
	const ac = ctx.audio.context;
	const live = new Set();

	function beep( freq, dur, { type = 'square', vol = 0.07, to = 0, delay = 0 } = {} ) {

		const t0 = ac.currentTime + delay;
		const osc = ac.createOscillator();
		const g = ac.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime( freq, t0 );
		if ( to ) osc.frequency.exponentialRampToValueAtTime( to, t0 + dur );
		g.gain.setValueAtTime( 0.0001, t0 );
		g.gain.exponentialRampToValueAtTime( vol, t0 + 0.01 );
		g.gain.exponentialRampToValueAtTime( 0.0001, t0 + dur );
		osc.connect( g );
		g.connect( ctx.audio.destination );
		osc.start( t0 );
		osc.stop( t0 + dur + 0.03 );
		live.add( osc );
		osc.onended = () => { live.delete( osc ); g.disconnect(); };

	}

	const sfx = {
		tick: () => beep( 440, 0.14 ),
		go: () => beep( 880, 0.5 ),
		checkpoint: () => beep( 660, 0.12, { type: 'triangle', vol: 0.09 } ),
		lap: () => [ 523, 659, 784 ].forEach( ( f, i ) => beep( f, 0.18, { type: 'triangle', vol: 0.1, delay: i * 0.1 } ) ),
		finish: () => [ 523, 659, 784, 1047, 784, 1047 ].forEach( ( f, i ) => beep( f, 0.22, { type: 'triangle', vol: 0.1, delay: i * 0.13 } ) ),
		item: () => beep( 500, 0.25, { type: 'sine', vol: 0.12, to: 1000 } ),
		boost: () => beep( 180, 0.5, { type: 'sawtooth', vol: 0.08, to: 900 } ),
		respawn: () => beep( 300, 0.3, { type: 'sine', vol: 0.1, to: 120 } ),
	};

	const engine = ac.createOscillator();
	const engineGain = ac.createGain();
	engine.type = 'sawtooth';
	engine.frequency.value = 50;
	engineGain.gain.value = 0.025;
	engine.connect( engineGain );
	engineGain.connect( ctx.audio.destination );
	engine.start();

	// ── vehicles ────────────────────────────────────────────────────────────
	function buildCar( color ) {

		const g = new THREE.Group();
		const paint = new THREE.MeshStandardMaterial( { color, roughness: 0.45, metalness: 0.2 } );
		const dark = new THREE.MeshStandardMaterial( { color: 0x151515, roughness: 0.9 } );
		const marker = new THREE.MeshStandardMaterial( { color: 0xffd400, emissive: 0xffa000, emissiveIntensity: 0.8 } );

		const body = new THREE.Mesh( new THREE.BoxGeometry( CAR_W, CAR_H * 0.45, CAR_L ), paint );
		body.position.y = WHEEL_R + CAR_H * 0.3;
		const cabin = new THREE.Mesh( new THREE.BoxGeometry( CAR_W * 0.72, CAR_H * 0.42, CAR_L * 0.38 ), dark );
		cabin.position.set( 0, WHEEL_R + CAR_H * 0.72, - CAR_L * 0.1 );
		const nose = new THREE.Mesh( new THREE.ConeGeometry( CAR_W * 0.24, CAR_L * 0.28, 4 ), marker );
		nose.rotation.x = Math.PI / 2;
		nose.position.set( 0, WHEEL_R + CAR_H * 0.3, CAR_L * 0.5 + CAR_L * 0.1 );
		g.add( body, cabin, nose );

		const wheelGeo = new THREE.CylinderGeometry( WHEEL_R, WHEEL_R, CAR_W * 0.18, 12 );
		for ( const [ sx, sz ] of [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) {

			const w = new THREE.Mesh( wheelGeo, dark );
			w.rotation.z = Math.PI / 2;
			w.position.set( sx * CAR_W * 0.5, WHEEL_R, sz * CAR_L * 0.32 );
			g.add( w );

		}

		return g;

	}

	const up = new Vector3( 0, 1, 0 );
	const wrapPi = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
	const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );

	function makeRacer( color, isPlayer, spawn, skill ) {

		const mesh = buildCar( color );
		scene.add( mesh );
		return {
			mesh, isPlayer, spawn, skill,
			heading: 0, speed: 0, vy: 0, boost: 0, ground: 'road', offGround: 0,
			normal: new Vector3( 0, 1, 0 ),
			prev: new Vector3(),
			nextCp: 0, lap: 0, lapStart: null, finished: false,
			safe: null, idx: 0, lane: 0, offroadTime: 0,
			inPad: new Set(),
		};

	}

	const racers = [];
	const player = makeRacer( 0xd8232a, true, spawnNodes[ 0 ], 1 );
	racers.push( player );
	const BOT_COLORS = [ 0x2a6fdb, 0x2ea44f, 0xf28c28, 0x8e44ad, 0x16a3a3, 0xe84393, 0xeeeeee ];
	if ( line ) {

		spawnNodes.slice( 1 ).forEach( ( s, i ) => {

			const b = makeRacer( BOT_COLORS[ i % BOT_COLORS.length ], false, s, BOT_SKILL[ i % BOT_SKILL.length ] );
			b.lane = ( i % 2 ? 1 : - 1 ) * 0.35;
			racers.push( b );

		} );

	}

	const sensor = ( r ) => r.mesh.position.clone().addScaledVector( up, CAR_H * 0.5 );

	function place( r, x, z, heading, yHint ) {

		r.heading = heading;
		r.speed = 0;
		r.vy = 0;
		r.boost = 0;
		r.offGround = 0;
		r.offroadTime = 0;
		const g = groundAt( x, yHint, z );
		r.mesh.position.set( x, g ? g.y : yHint, z );
		r.normal.copy( g ? g.normal : up );
		r.ground = g ? g.kind : 'road';
		orient( r );
		r.prev.copy( sensor( r ) );

	}

	const qYaw = new Quaternion();
	const qTilt = new Quaternion();
	function orient( r ) {

		qYaw.setFromAxisAngle( up, r.heading );
		qTilt.setFromUnitVectors( up, r.normal );
		r.mesh.quaternion.copy( qTilt ).multiply( qYaw );

	}

	function spawnWorld( node ) {

		const p = new Vector3();
		const q = new Quaternion();
		node.getWorldPosition( p );
		node.getWorldQuaternion( q );
		const f = new Vector3( 0, 0, 1 ).applyQuaternion( q );
		return { p, heading: Math.atan2( f.x, f.z ) };

	}

	// ── per-vehicle physics ─────────────────────────────────────────────────
	function stepRacer( r, dt, throttle, steer, topSpeed ) {

		const offroad = r.ground === 'offroad';
		const cap = topSpeed * ( offroad ? OFFROAD_TOP : 1 ) * ( r.boost > 0 ? BOOST_MULT : 1 );
		const boosting = r.boost > 0;

		if ( throttle > 0 ) {

			const room = clamp( 1 - r.speed / cap, 0.12, 1 );
			r.speed += ACCEL * ( boosting ? 2.4 : 1 ) * throttle * room * dt;

		} else if ( throttle < 0 ) {

			if ( r.speed > 0.5 ) r.speed -= BRAKE * - throttle * dt;
			else r.speed -= ACCEL * 0.5 * - throttle * dt;

		} else {

			const c = COAST * dt;
			r.speed = Math.abs( r.speed ) <= c ? 0 : r.speed - Math.sign( r.speed ) * c;

		}

		if ( offroad ) r.speed -= r.speed * OFFROAD_DRAG * dt;
		if ( r.speed > cap ) r.speed -= ( r.speed - cap ) * Math.min( 1, 4 * dt );
		r.speed = Math.max( r.speed, - topSpeed * 0.3 );
		if ( r.boost > 0 ) r.boost = Math.max( 0, r.boost - dt );

		const grip = clamp( Math.abs( r.speed ) / ( topSpeed * 0.2 ), 0, 1 ) * Math.sign( r.speed );
		r.heading = wrapPi( r.heading + steer * TURN_RATE * grip * dt * ( 1 - 0.35 * clamp( Math.abs( r.speed ) / topSpeed, 0, 1 ) ) );

		const pos = r.mesh.position;
		pos.x += Math.sin( r.heading ) * r.speed * dt;
		pos.z += Math.cos( r.heading ) * r.speed * dt;

		const g = groundAt( pos.x, pos.y, pos.z );
		if ( g ) {

			r.ground = g.kind;
			r.offGround = 0;
			if ( pos.y - g.y > 0.2 ) {

				r.vy -= GRAVITY * dt;
				pos.y += r.vy * dt;
				if ( pos.y <= g.y ) { pos.y = g.y; r.vy = 0; }
				r.normal.lerp( up, Math.min( 1, dt * 3 ) ).normalize();

			} else {

				pos.y = g.y;
				r.vy = 0;
				r.normal.lerp( g.normal, Math.min( 1, dt * 10 ) ).normalize();

			}

		} else {

			r.offGround += dt;
			r.vy -= GRAVITY * dt;
			pos.y += r.vy * dt;

		}

		orient( r );

	}

	function respawn( r ) {

		const s = r.safe;
		place( r, s.x, s.z, s.heading, s.y + 1 );
		r.mesh.position.y = s.y;
		r.prev.copy( sensor( r ) );
		if ( r.isPlayer ) { sfx.respawn(); snapCamera(); }

	}

	// ── gates, pads, items ──────────────────────────────────────────────────
	const _a = new Vector3();
	const _b = new Vector3();
	const Y_MARGIN = CAR_H * 2;

	// 1 = crossed forward through the gate's plane within its bounds, -1 = backward, 0 = no crossing.
	function crossing( g, from, to ) {

		_a.copy( from ).applyMatrix4( g.inv );
		_b.copy( to ).applyMatrix4( g.inv );
		const cz = ( g.box.min.z + g.box.max.z ) / 2;
		const za = g.sign * ( _a.z - cz );
		const zb = g.sign * ( _b.z - cz );
		let dir = 0;
		if ( za < 0 && zb >= 0 ) dir = 1;
		else if ( za >= 0 && zb < 0 ) dir = - 1;
		if ( ! dir ) return 0;
		const t = za / ( za - zb );
		const x = _a.x + ( _b.x - _a.x ) * t;
		const y = _a.y + ( _b.y - _a.y ) * t;
		if ( x < g.box.min.x || x > g.box.max.x || y < g.box.min.y - Y_MARGIN || y > g.box.max.y + Y_MARGIN ) return 0;
		return dir;

	}

	function inZone( z, p ) {

		_a.copy( p ).applyMatrix4( z.inv );
		return _a.x >= z.box.min.x && _a.x <= z.box.max.x && _a.z >= z.box.min.z && _a.z <= z.box.max.z
			&& _a.y >= z.box.min.y - Y_MARGIN && _a.y <= z.box.max.y + Y_MARGIN;

	}

	let phase = 'countdown'; // countdown | racing
	let raceTime = 0;
	let countdown = COUNTDOWN;
	let lastTick = Infinity;
	let finishInfo = null;

	function markSafe( r, gate ) {

		const c = gate.center;
		const g = groundAt( c.x, c.y, c.z );
		r.safe = { x: c.x, y: g ? g.y : c.y, z: c.z, heading: gate.heading };

	}

	function progress( r ) {

		const nextGate = gates[ r.nextCp ];
		const prevGate = gates[ ( r.nextCp + N ) % ( N + 1 ) ];
		const span = Math.max( prevGate.center.distanceTo( nextGate.center ), 1e-3 );
		const frac = clamp( 1 - r.mesh.position.distanceTo( nextGate.center ) / span, 0, 1 );
		return r.lap * ( N + 1 ) + r.nextCp + frac;

	}

	function rank() {

		const mine = progress( player );
		return 1 + racers.filter( ( r ) => r !== player && ( r.finished || progress( r ) > mine ) ).length;

	}

	function passGate( r, gi, dir ) {

		if ( r.finished ) return;

		if ( dir > 0 ) {

			if ( gi < N && gi === r.nextCp ) {

				r.nextCp ++;
				markSafe( r, gates[ gi ] );
				if ( r.isPlayer ) { state.checkpoint = r.nextCp; sfx.checkpoint(); }

			} else if ( gi === N && r.nextCp === N ) {

				const lapTime = raceTime - ( r.lapStart ?? 0 );
				r.lap ++;
				r.nextCp = 0;
				r.lapStart = raceTime;
				markSafe( r, gates[ N ] );

				if ( r.isPlayer ) {

					state.lap = r.lap;
					state.checkpoint = 0;
					state.lastLap = lapTime;
					state.lapTimes.push( lapTime );
					if ( state.bestLap === null || lapTime < state.bestLap ) state.bestLap = lapTime;
					if ( r.lap >= TOTAL_LAPS ) finish( r ); else sfx.lap();

				} else if ( r.lap >= TOTAL_LAPS ) r.finished = true;

			} else if ( gi === N && r.nextCp === 0 && r.lapStart === null ) {

				r.lapStart = raceTime; // leaving the grid: starts lap 1's clock, never counts as a lap

			}

		} else if ( gi < N && gi === r.nextCp - 1 ) {

			r.nextCp --; // driving back over the last gate un-crosses it
			if ( r.isPlayer ) state.checkpoint = r.nextCp;

		}

	}

	function finish( r ) {

		r.finished = true;
		state.finished = true;
		state.finishTime = raceTime;
		state.position = rank();
		finishInfo = { place: state.position, time: raceTime };
		sfx.finish();

	}

	// Item boxes: the Object3D is hidden/shown, never its parts.
	const items = itemNodes.map( ( node ) => ( { node, pos: node.getWorldPosition( new Vector3() ), timer: 0 } ) );

	function setItemVisible( it, v ) {

		$S( [ it.node ] ).setVisible( v );
		it.node.visible = v;

	}

	function useItem() {

		if ( phase !== 'racing' || player.finished || ! state.item ) return;
		state.item = null;
		player.boost = Math.max( player.boost, BOOST_TIME * 1.5 );
		sfx.boost();

	}

	// ── race lifecycle ──────────────────────────────────────────────────────
	function resetRace() {

		state.lap = 0;
		state.checkpoint = 0;
		state.lapTime = 0;
		state.bestLap = null;
		state.lastLap = null;
		state.lapTimes = [];
		state.item = null;
		state.finished = false;
		state.finishTime = null;
		state.position = 1;
		state.totalLaps = TOTAL_LAPS;
		state.phase = 'countdown';
		finishInfo = null;
		phase = 'countdown';
		countdown = COUNTDOWN;
		lastTick = Infinity;
		raceTime = 0;

		for ( const r of racers ) {

			const s = spawnWorld( r.spawn );
			place( r, s.p.x, s.p.z, s.heading, s.p.y );
			r.nextCp = 0;
			r.lap = 0;
			r.lapStart = null;
			r.finished = false;
			r.inPad.clear();
			r.idx = 0;
			r.safe = { x: s.p.x, y: r.mesh.position.y, z: s.p.z, heading: s.heading };
			if ( ! r.isPlayer && line ) r.idx = nearestIndex( r, 0, line.length );

		}

		for ( const it of items ) { it.timer = 0; setItemVisible( it, true ); }
		snapCamera();

	}

	function nearestIndex( r, from, count ) {

		const p = r.mesh.position;
		let best = from, bd = Infinity;
		for ( let k = 0; k < count; k ++ ) {

			const i = ( from + k + line.length ) % line.length;
			const d = ( line[ i ].p.x - p.x ) ** 2 + ( line[ i ].p.z - p.z ) ** 2;
			if ( d < bd ) { bd = d; best = i; }

		}

		return best;

	}

	// ── bots: follow the road centreline in lap order ───────────────────────
	function driveBot( r, dt ) {

		const M = line.length;
		const w = 14;
		r.idx = nearestIndex( r, ( r.idx - 4 + M ) % M, w );
		const look = clamp( Math.round( 3 + Math.abs( r.speed ) / 8 ), 3, 9 );
		const s = line[ ( r.idx + look ) % M ];
		const tx = s.p.x + s.half.x * r.lane;
		const tz = s.p.z + s.half.z * r.lane;
		const diff = wrapPi( Math.atan2( tx - r.mesh.position.x, tz - r.mesh.position.z ) - r.heading );
		const target = TOP_SPEED * r.skill * ( 1 - Math.min( 0.55, Math.abs( diff ) * 0.9 ) );
		const throttle = r.speed < target ? 1 : - 0.25;
		stepRacer( r, dt, throttle, clamp( diff * 2.5, - 1, 1 ), TOP_SPEED * r.skill );

	}

	// Soft car-to-car separation so nobody drives through anybody.
	function separate() {

		const minD = CAR_W * 1.5;
		for ( let i = 0; i < racers.length; i ++ ) {

			for ( let j = i + 1; j < racers.length; j ++ ) {

				const a = racers[ i ].mesh.position;
				const b = racers[ j ].mesh.position;
				const dx = b.x - a.x, dz = b.z - a.z;
				const d = Math.hypot( dx, dz );
				if ( d >= minD || d < 1e-4 || Math.abs( a.y - b.y ) > CAR_H * 2 ) continue;
				const push = ( minD - d ) / 2 / d;
				a.x -= dx * push; a.z -= dz * push;
				b.x += dx * push; b.z += dz * push;
				racers[ i ].speed *= 0.995; racers[ j ].speed *= 0.995;

			}

		}

	}

	// ── chase camera ────────────────────────────────────────────────────────
	const CAM_DIST = CAR_L * 3;
	const CAM_HEIGHT = CAR_L * 1.05;
	let camYaw = 0;
	const camTarget = new Vector3();

	function camPose( dt ) {

		const p = player.mesh.position;
		camYaw = dt === null ? player.heading : wrapPi( camYaw + wrapPi( player.heading - camYaw ) * Math.min( 1, dt * 4 ) );
		camTarget.set( p.x - Math.sin( camYaw ) * CAM_DIST, p.y + CAM_HEIGHT, p.z - Math.cos( camYaw ) * CAM_DIST );
		// keep the camera above whatever ground is under it (hillsides, road crests)
		const under = groundAt( camTarget.x, camTarget.y, camTarget.z );
		if ( under ) camTarget.y = Math.max( camTarget.y, under.y + CAR_H * 2 );
		if ( dt === null ) camera.position.copy( camTarget );
		else camera.position.lerp( camTarget, 1 - Math.exp( - dt * 9 ) );
		camera.lookAt( p.x + Math.sin( camYaw ) * CAR_L, p.y + CAR_H * 1.2, p.z + Math.cos( camYaw ) * CAR_L );

	}

	function snapCamera() { camPose( null ); }

	// ── in-world HUD (no HUD panel mesh in the scene, so planes attached to the camera) ──
	scene.add( camera );
	function textPlane( w, h, pxW, pxH, order ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = pxW;
		canvas.height = pxH;
		const tex = new THREE.CanvasTexture( canvas );
		tex.colorSpace = THREE.SRGBColorSpace;
		const mat = new THREE.MeshBasicMaterial( { map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false } );
		const mesh = new THREE.Mesh( new THREE.PlaneGeometry( w, h ), mat );
		mesh.renderOrder = order;
		mesh.frustumCulled = false;
		camera.add( mesh );
		return { mesh, canvas, g: canvas.getContext( '2d' ), tex, key: '' };

	}

	const panel = textPlane( 0.35, 0.2, 448, 256, 1000 );
	const banner = textPlane( 0.62, 0.172, 720, 200, 1001 );
	const HUD_Z = - 1;

	function layoutHud() {

		const halfH = Math.tan( THREE.MathUtils.degToRad( camera.fov / 2 ) ) * - HUD_Z;
		const halfW = halfH * camera.aspect;
		panel.mesh.position.set( - halfW + 0.2, halfH - 0.12, HUD_Z );
		banner.mesh.position.set( 0, halfH * 0.42, HUD_Z );

	}

	ctx.onResize( layoutHud );
	layoutHud();

	const fmt = ( t ) => t === null || t === undefined ? '--:--.--' : `${ Math.floor( t / 60 ) }:${ ( t % 60 ).toFixed( 2 ).padStart( 5, '0' ) }`;

	function drawPanel() {

		const lines = [
			`LAP ${ Math.min( state.lap + 1, TOTAL_LAPS ) }/${ TOTAL_LAPS }   CP ${ state.checkpoint }/${ N }`,
			`TIME ${ fmt( state.lapTime ) }`,
			`BEST ${ fmt( state.bestLap ) }`,
			`POS ${ state.position }/${ racers.length }   ${ Math.round( Math.abs( player.speed ) * 3.6 ) } km/h`,
			state.item ? `ITEM: TURBO  [Space]` : 'ITEM: -',
		];
		const key = lines.join( '|' );
		if ( key === panel.key ) return;
		panel.key = key;
		const g = panel.g;
		g.clearRect( 0, 0, panel.canvas.width, panel.canvas.height );
		g.fillStyle = 'rgba(10,12,18,0.62)';
		g.beginPath();
		g.roundRect( 4, 4, 440, 248, 18 );
		g.fill();
		g.fillStyle = '#fff';
		g.font = 'bold 30px monospace';
		g.textBaseline = 'middle';
		lines.forEach( ( t, i ) => { g.fillStyle = i === 4 && state.item ? '#ffd400' : '#fff'; g.fillText( t, 22, 34 + i * 46 ); } );
		panel.tex.needsUpdate = true;

	}

	function drawBanner( text, sub ) {

		const key = text + '|' + sub;
		if ( key === banner.key ) return;
		banner.key = key;
		const g = banner.g;
		g.clearRect( 0, 0, banner.canvas.width, banner.canvas.height );
		banner.mesh.visible = !! text;
		if ( ! text ) { banner.tex.needsUpdate = true; return; }
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.lineWidth = 8;
		g.strokeStyle = 'rgba(0,0,0,0.75)';
		g.fillStyle = '#ffd400';
		g.font = 'bold 96px monospace';
		g.strokeText( text, 360, sub ? 52 : 100 );
		g.fillText( text, 360, sub ? 52 : 100 );
		g.font = 'bold 34px monospace';
		g.fillStyle = '#fff';
		( sub ? sub.split( '\n' ) : [] ).forEach( ( line, i ) => {

			g.strokeText( line, 360, 120 + i * 42 );
			g.fillText( line, 360, 120 + i * 42 );

		} );

		banner.tex.needsUpdate = true;

	}

	// ── input ───────────────────────────────────────────────────────────────
	input.onKey( ( e ) => {

		if ( e.type !== 'down' ) return;
		if ( [ 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE' ].includes( e.code ) ) useItem();
		else if ( e.code === 'KeyR' && phase === 'racing' && ! player.finished ) respawn( player );
		else if ( e.code === 'Enter' && player.finished ) ctx.reset();

	} );

	// ── main loop ───────────────────────────────────────────────────────────
	let hudTick = 0;
	let bannerUntil = 0;
	let bannerText = '';
	let lapSeen = 0;

	onFrame( ( dt ) => {

		// countdown / clock
		if ( phase === 'countdown' ) {

			countdown -= dt;
			const n = Math.ceil( countdown );
			if ( n < lastTick && n > 0 ) { sfx.tick(); lastTick = n; }
			if ( countdown <= 0 ) { phase = 'racing'; state.phase = 'racing'; sfx.go(); bannerText = 'GO!'; bannerUntil = 1; }

		} else {

			raceTime += dt;
			state.raceTime = raceTime;

		}

		const racing = phase === 'racing';

		// player
		const pr = player;
		const finished = pr.finished;
		const throttle = racing && ! finished ? input.axis( [ 'KeyS', 'ArrowDown' ], [ 'KeyW', 'ArrowUp' ] ) : ( finished ? - 0.4 : 0 );
		const steer = racing && ! finished ? input.axis( [ 'KeyD', 'ArrowRight' ], [ 'KeyA', 'ArrowLeft' ] ) : 0;
		if ( racing || finished ) stepRacer( pr, dt, finished && pr.speed < 0.5 ? 0 : throttle, steer, TOP_SPEED );

		// bots
		if ( racing ) {

			for ( const r of racers ) {

				if ( r.isPlayer ) continue;
				driveBot( r, dt );
				r.offroadTime = r.ground === 'offroad' ? r.offroadTime + dt : 0;
				if ( r.offroadTime > 4 || r.mesh.position.y < killY ) respawn( r );

			}

			separate();

		}

		// out of bounds / fell off the world: back to the last gate
		if ( racing && ( pr.offGround > 1.2 || pr.mesh.position.y < killY ) ) respawn( pr );

		// gates, pads, pickups
		for ( const r of racers ) {

			const cur = sensor( r );
			for ( let gi = 0; gi < gates.length; gi ++ ) {

				const dir = crossing( gates[ gi ], r.prev, cur );
				if ( dir ) passGate( r, gi, dir );

			}

			for ( let pi = 0; pi < pads.length; pi ++ ) {

				const inside = inZone( pads[ pi ], cur );
				if ( inside && ! r.inPad.has( pi ) ) {

					r.inPad.add( pi );
					r.boost = Math.max( r.boost, BOOST_TIME );
					r.speed = Math.max( r.speed, TOP_SPEED * 0.6 );
					if ( r.isPlayer ) sfx.boost();

				} else if ( ! inside ) r.inPad.delete( pi );

			}

			r.prev.copy( cur );

		}

		for ( const it of items ) {

			if ( it.timer > 0 ) {

				it.timer -= dt;
				if ( it.timer <= 0 ) setItemVisible( it, true );
				continue;

			}

			for ( const part of it.node.children ) part.rotation.y += dt * 1.6;
			if ( ! state.item && Math.hypot( it.pos.x - pr.mesh.position.x, it.pos.z - pr.mesh.position.z ) < PICKUP_R && Math.abs( it.pos.y - pr.mesh.position.y ) < PICKUP_R + CAR_H ) {

				it.timer = ITEM_RESPAWN;
				setItemVisible( it, false );
				state.item = 'turbo';
				sfx.item();

			}

		}

		// state, camera, audio, HUD
		state.lapTime = pr.finished ? ( state.lapTimes[ state.lapTimes.length - 1 ] ?? 0 ) : ( pr.lapStart === null ? 0 : raceTime - pr.lapStart );
		if ( ! pr.finished ) state.position = rank();
		state.speed = pr.speed;
		state.boost = pr.boost;

		camPose( dt );
		engine.frequency.setTargetAtTime( 45 + clamp( Math.abs( pr.speed ) / TOP_SPEED, 0, 1.6 ) * 150, ac.currentTime, 0.05 );
		engineGain.gain.setTargetAtTime( racing || finished ? 0.025 : 0.008, ac.currentTime, 0.1 );

		if ( state.lap !== lapSeen ) {

			lapSeen = state.lap;
			if ( ! state.finished ) { bannerText = `LAP ${ state.lap + 1 }`; bannerUntil = 1.6; }

		}

		if ( bannerUntil > 0 ) bannerUntil -= dt;

		if ( ++ hudTick % 3 === 0 ) {

			drawPanel();
			if ( state.finished && finishInfo ) drawBanner( 'FINISH!', `P${ finishInfo.place } of ${ racers.length }   ${ fmt( finishInfo.time ) }\nEnter to restart` );
			else if ( phase === 'countdown' ) drawBanner( String( Math.max( 1, Math.ceil( countdown ) ) ), '' );
			else drawBanner( bannerUntil > 0 ? bannerText : '', '' );

		}

	} );

	onReset( resetRace );

	onCleanup( () => {

		try { engine.stop(); } catch ( e ) { /* already stopped */ }
		engine.disconnect();
		engineGain.disconnect();
		for ( const osc of live ) { try { osc.stop(); osc.disconnect(); } catch ( e ) { /* ended */ } }
		live.clear();
		camera.remove( panel.mesh, banner.mesh );
		scene.remove( camera );
		for ( const t of [ panel, banner ] ) { t.tex.dispose(); t.mesh.material.dispose(); t.mesh.geometry.dispose(); }

	} );

	scene.background = new THREE.Color( 0x8fc4ee );
	state.player = player;
	state.racers = racers;
	state.totalLaps = TOTAL_LAPS;
	resetRace();

}
