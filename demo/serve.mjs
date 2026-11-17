import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath( new URL( '../', import.meta.url ) );
const mime = { '.json': 'application/json', '.geojson': 'application/geo+json', '.mjs': 'application/javascript', '.md': 'text/plain', '.wav': 'audio/wav' };
const server = http.createServer( async ( req, res ) => {
  if ( ! [ 'GET', 'HEAD' ].includes( req.method ) ) { res.writeHead( 405 ); res.end( 'Read-only server' ); return; }
  const origin = req.headers.origin;
  if ( origin === 'https://strataeditor.dev' ) res.setHeader( 'Access-Control-Allow-Origin', origin );
  res.setHeader( 'Cache-Control', 'no-store' );
  const pathname = new URL( req.url, 'http://localhost' ).pathname;
  let file;
  try { file = path.resolve( root, '.' + decodeURIComponent( pathname ) ); }
  catch { res.writeHead( 400 ); res.end( 'Invalid path' ); return; }
  const relative = path.relative( root, file );
  if ( relative.startsWith( '..' ) || path.isAbsolute( relative ) || relative.split( path.sep ).some( part => part.startsWith( '.' ) || part === 'node_modules' ) || ! ( pathname === '/flux.json' || pathname.startsWith( '/demo/' ) ) ) { res.writeHead( 403 ); res.end( 'Not a public demo asset' ); return; }
  try {
    const data = await readFile( file );
    res.writeHead( 200, { 'Content-Type': mime[ path.extname( file ) ] || 'application/octet-stream' } );
    res.end( req.method === 'HEAD' ? undefined : data );
  } catch ( error ) {
    if ( error.code !== 'ENOENT' && error.code !== 'EISDIR' ) console.error( error );
    res.writeHead( error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500 ); res.end( 'Demo asset unavailable' );
  }
} );
server.listen( Number( process.env.PORT || 5623 ), '127.0.0.1', () => console.log( `FutureFlux assets: http://127.0.0.1:${server.address().port}/flux.json` ) );
