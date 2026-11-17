export function makeSurface( THREE, name, color, repeat, seed, bumpScale, joints = false ) {
  const size = 64, data = new Uint8Array( size * size * 4 );
  let state = seed;
  for ( let y = 0; y < size; y ++ ) {
    for ( let x = 0; x < size; x ++ ) {
      state = ( Math.imul( state, 1664525 ) + 1013904223 ) >>> 0;
      const grain = state / 4294967296;
      const value = joints && ( x < 1 || y < 2 ) ? 155 : Math.round( 224 + ( grain - 0.5 ) * 34 );
      const index = ( y * size + x ) * 4;
      data[ index ] = data[ index + 1 ] = data[ index + 2 ] = value;
      data[ index + 3 ] = 255;
    }
  }
  const map = new THREE.DataTexture( data, size, size, THREE.RGBAFormat );
  map.name = name + ' / seeded grain';
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set( ...repeat );
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial( {
    name, color, map, bumpMap: map, bumpScale, roughness: 0.9, metalness: 0
  } );
}
