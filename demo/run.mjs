import { chromium } from 'playwright';
import OBSWebSocket from 'obs-websocket-js';
import { readFile, writeFile, readdir, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath( new URL( '.', import.meta.url ) );
const args = process.argv.slice( 2 );
const value = key => { const i = args.indexOf( key ); return i < 0 ? null : args[ i + 1 ]; };
const beat = value( '--beat' ) || 'english';
const rehearse = args.includes( '--rehearse' ), record = args.includes( '--record' );
if ( rehearse === record ) throw new Error( 'Choose exactly one: --rehearse (no capture claim) or --record (requires OBS).' );
if ( ! [ 'english', 'spanish', 'heat' ].includes( beat ) ) throw new Error( 'Unknown --beat. Use english, spanish or heat.' );
if ( beat === 'heat' ) throw new Error( 'no-heat-layer: beat 8 is cut until a licensed, pinned ASU layer is verified. Beat 7 is independent.' );

const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );
async function click( page, locator ) {
  await page.bringToFront();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if ( ! box ) throw new Error( 'Capture target is not visible.' );
  await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2, { steps: 35 } );
  await sleep( 180 );
  await page.mouse.down(); await sleep( 90 ); await page.mouse.up();
}
async function type( page, locator, text ) {
  await click( page, locator );
  await locator.press( process.platform === 'darwin' ? 'Meta+A' : 'Control+A' );
  await locator.press( 'Backspace' );
  await locator.type( text, { delay: 65 } );
}
async function cursor( page ) {
  await page.evaluate( () => {
    if ( document.getElementById( 'flux-cursor' ) ) return;
    const pointer = document.createElement( 'div' ); pointer.id = 'flux-cursor';
    pointer.style.cssText = 'pointer-events:none;position:fixed;left:0;top:0;width:17px;height:17px;border:2px solid white;border-radius:50%;background:#10292d88;z-index:2147483647';
    document.body.appendChild( pointer );
    addEventListener( 'pointermove', e => { pointer.style.transform = `translate(${e.clientX - 8}px,${e.clientY - 8}px)`; } );
  } );
}
async function synthesize( dub, name ) {
  const wav = path.join( dir, 'speech', name + '.wav' ), report = path.join( dir, 'speech', name + '.report.json' );
  const srt = path.join( dir, 'speech', name + '.srt' );
  const srtHash = createHash( 'sha256' ).update( await readFile( srt ) ).digest( 'hex' );
  try {
    await access( wav );
    const metadata = JSON.parse( await readFile( report, 'utf8' ) );
    const wavHash = createHash( 'sha256' ).update( await readFile( wav ) ).digest( 'hex' );
    if ( metadata.ok && metadata.futureflux?.srt_sha256 === srtHash && metadata.wav_sha256 === wavHash ) return wav;
    console.log( 'Regenerating stale/unverified Dub audio:', name );
  }
  catch ( error ) { if ( error.code !== 'ENOENT' ) throw error; }
  await dub.goto( 'https://dub.webcli.app/' );
  await dub.locator( '#file' ).setInputFiles( srt );
  await click( dub, dub.locator( '#dubBtn' ) );
  await dub.locator( '#player' ).waitFor( { state: 'visible', timeout: 600000 } );
  await dub.waitForFunction( () => document.getElementById( 'player' ).getAttribute( 'src' )?.startsWith( 'blob:' ), null, { timeout: 600000 } );
  for ( const [ id, destination ] of [ [ '#dlWav', wav ], [ '#dlReport', report ] ] ) {
    const downloading = dub.waitForEvent( 'download' );
    await click( dub, dub.locator( id ) );
    await ( await downloading ).saveAs( destination );
  }
  const metadata = JSON.parse( await readFile( report, 'utf8' ) );
  if ( ! metadata.ok ) throw new Error( `Dub failed for ${name}; see ${report}. No take was recorded.` );
  const wavHash = createHash( 'sha256' ).update( await readFile( wav ) ).digest( 'hex' );
  if ( wavHash !== metadata.wav_sha256 ) throw new Error( `Dub WAV/report integrity mismatch for ${name}.` );
  metadata.futureflux = { srt_sha256: srtHash };
  await writeFile( report, JSON.stringify( metadata, null, 2 ) + '\n' );
  return wav;
}
async function transcribe( whisper, wav, language ) {
  await whisper.goto( 'https://whisper.webcli.app/' );
  await whisper.waitForFunction( () => window.app?.worker );
  await whisper.locator( '#audio-file' ).setInputFiles( wav );
  const languageSelect = whisper.getByRole( 'combobox', { name: 'Language', exact: true } );
  await click( whisper, languageSelect );
  await languageSelect.selectOption( language );
  if ( language === 'es' ) {
    const model = whisper.getByRole( 'combobox', { name: 'Model', exact: true } );
    await click( whisper, model ); await model.selectOption( 'small' );
  }
  await cursor( whisper );
  await click( whisper, whisper.locator( '#transcribe-button' ) );
  await whisper.waitForFunction( () => Array.isArray( window.app?.currentTranscript ) && window.app.currentTranscript.length > 0 && ! window.app.isTranscribing, null, { timeout: 600000 } );
  return whisper.evaluate( () => window.app.currentTranscript.map( s => s.text ).join( ' ' ).trim() );
}
async function sendTranscript( editor, text ) {
  await editor.bringToFront();
  await type( editor, editor.locator( '#flux-transcript' ), text );
  const previous = await editor.locator( '#flux-status' ).getAttribute( 'data-finished' );
  await click( editor, editor.locator( '#flux-send' ) );
  await editor.waitForFunction( old => {
    const status = document.getElementById( 'flux-status' );
    return status.dataset.finished && status.dataset.finished !== old;
  }, previous, { timeout: 600000 } );
  await editor.locator( '#flux-status' ).scrollIntoViewIfNeeded();
  const visible = await editor.locator( '#flux-status' ).evaluate( element => {
    const box = element.getBoundingClientRect(), panel = element.closest( '#futureflux' ).getBoundingClientRect();
    return box.top >= Math.max( 0, panel.top ) && box.bottom <= Math.min( innerHeight, panel.bottom );
  } );
  if ( ! visible ) throw new Error( 'FX5 failed: the complete refusal/result is clipped on screen.' );
  return editor.evaluate( () => window.flux.journal.at( -1 ) );
}
export async function beatEnglish( pages, speech ) {
  const first = await transcribe( pages.whisper, speech[ 0 ], 'en' );
  const refusal = await sendTranscript( pages.editor, first );
  if ( refusal.reason !== 'ambiguous-path' ) throw new Error( `FX5 failed: ${JSON.stringify( refusal )}` );
  const holdStarted = Date.now(); await sleep( 3500 );
  const refusalHoldMs = Date.now() - holdStarted;
  if ( refusalHoldMs < 3000 ) throw new Error( 'FX5 failed: refusal was not held for three seconds.' );
  const clarification = await transcribe( pages.whisper, speech[ 1 ], 'en' );
  const result = await sendTranscript( pages.editor, clarification );
  if ( ! result.ok || result.path !== 'center-walk' || result.kind !== 'canopy' ) throw new Error( `Clarification failed: ${JSON.stringify( result )}` );
  await sleep( 3500 );
  return { transcripts: [ first, clarification ], refusal, result, refusalHoldMs, synthetic: true };
}
export async function beatSpanish( pages, speech ) {
  const first = await transcribe( pages.whisper, speech[ 0 ], 'es' );
  const refusal = await sendTranscript( pages.editor, first );
  if ( refusal.reason !== 'ambiguous-path' ) throw new Error( `Spanish ambiguity failed: ${JSON.stringify( refusal )}` );
  await sleep( 3500 );
  const clarification = await transcribe( pages.whisper, speech[ 1 ], 'es' );
  const result = await sendTranscript( pages.editor, clarification );
  if ( ! result.ok || result.path !== 'center-walk' || result.kind !== 'canopy' ) throw new Error( `Spanish clarification failed: ${JSON.stringify( result )}` );
  await sleep( 3500 );
  return { transcripts: [ first, clarification ], refusal, result, synthetic: true, originalFX3: false, note: 'Dub currently has English voices only; Spanish synthesis is experimental, not a human/native-speaker gate pass.' };
}
export async function beatHeat() {
  throw new Error( 'no-heat-layer: ASU reuse licence not verified. Do not record a simulated heat surface.' );
}
async function prepare( editor ) {
  editor.on( 'dialog', dialog => dialog.accept() );
  await editor.goto( 'https://strataeditor.dev/' );
  await editor.waitForFunction( () => window.editor?.aiEngine && window.THREE );
  const json = JSON.parse( await readFile( path.join( dir, 'scene.json' ), 'utf8' ) );
  await editor.evaluate( async json => { window.disposeFlux?.(); window.editor.clear(); await window.editor.fromJSON( json ); }, json );
  const sources = await Promise.all( [ 'ops.mjs', 'panel.mjs', 'install.mjs' ].map( name => readFile( path.join( dir, name ), 'utf8' ) ) );
  const code = sources.map( source => source.replace( /^import .*;$/gm, '' ).replace( /^export /gm, '' ) ).join( '\n' );
  await editor.evaluate( async code => new Function( code + '\nreturn installFlux(window.editor,window.THREE);' )(), code );
  await editor.locator( 'select[title^="as render:"]' ).selectOption( 'render' );
  const paths = await editor.evaluate( () => window.flux.candidates() );
  if ( paths.length !== 2 ) throw new Error( `FX4 failed: expected 2 visible paths, found ${paths.length}.` );
  if ( ! await editor.evaluate( () => window.editor.aiEngine.ready ) ) {
    const shell = editor.locator( '.Tab' ).filter( { has: editor.locator( '.tab-label', { hasText: /^Shell$/ } ) } );
    await click( editor, shell );
    await click( editor, editor.locator( '#shell-load-btn' ) );
    console.log( 'Waiting for real Strata model load (cached after the first run)...' );
    await editor.waitForFunction( () => window.editor.aiEngine.ready, null, { timeout: 900000 } );
  }
  await cursor( editor );
}
async function main() {
  const existing = await readdir( path.join( dir, 'takes' ) );
  const number = 1 + Math.max( 0, ...existing.map( f => Number( /^(\d+)-/.exec( f )?.[ 1 ] || 0 ) ) );
  const name = `${String( number ).padStart( 3, '0' )}-${beat}`;
  const report = { beat, started: new Date().toISOString(), captured: false, rehearsal: rehearse, originalFX3: false, FX7: false, FX8: 'not applicable: heat cut' };
  let context, obs, started = false, previousDirectory;
  try {
    context = await chromium.launchPersistentContext( path.join( dir, '.browser' ), {
      headless: false, channel: process.env.FLUX_BROWSER_CHANNEL || undefined, viewport: null,
      args: [ '--window-size=1920,1080', '--start-fullscreen', '--disable-background-timer-throttling' ]
    } );
    const pages = { editor: context.pages()[ 0 ], dub: await context.newPage(), whisper: await context.newPage() };
    const speechNames = beat === 'spanish' ? [ 'spanish', 'clarify-es' ] : [ 'english', 'clarify' ];
    const speech = [];
    for ( const name of speechNames ) { console.log( 'Preparing Dub audio:', name ); speech.push( await synthesize( pages.dub, name ) ); }
    report.audio = await Promise.all( speech.map( async file => ( { file: path.basename( file ), sha256: createHash( 'sha256' ).update( await readFile( file ) ).digest( 'hex' ) } ) ) );
    await prepare( pages.editor );
    await pages.editor.bringToFront();
    report.browser = await pages.editor.evaluate( () => ( { innerWidth, innerHeight, outerWidth, outerHeight, screenWidth: screen.width, screenHeight: screen.height, userAgent: navigator.userAgent, model: window.editor.aiEngine.modelId } ) );
    if ( record ) {
      if ( report.browser.innerWidth !== 1920 || report.browser.innerHeight !== 1080 ) throw new Error( 'FX2 failed: headed browser content is not 1920x1080. Configure a 1920x1080 display and fullscreen Chromium.' );
      obs = new OBSWebSocket();
      await obs.connect( process.env.FLUX_OBS_URL || 'ws://127.0.0.1:4455', process.env.FLUX_OBS_PASSWORD );
      const video = await obs.call( 'GetVideoSettings' );
      if ( video.baseWidth !== 1920 || video.baseHeight !== 1080 || video.outputWidth !== 1920 || video.outputHeight !== 1080 ) throw new Error( 'FX2 failed: OBS canvas/output must both be 1920x1080.' );
      if ( ( await obs.call( 'GetRecordStatus' ) ).outputActive ) throw new Error( 'OBS is already recording. Refusing to interfere with another take.' );
      const scene = await obs.call( 'GetCurrentProgramScene' );
      const items = await obs.call( 'GetSceneItemList', { sceneName: scene.currentProgramSceneName } );
      if ( ! items.sceneItems.some( item => item.sceneItemEnabled ) ) throw new Error( 'OBS has no enabled capture source.' );
      previousDirectory = ( await obs.call( 'GetRecordDirectory' ) ).recordDirectory;
      await obs.call( 'SetRecordDirectory', { recordDirectory: path.join( dir, 'takes' ) } );
      report.obs = { ...video, scene: scene.currentProgramSceneName, sources: items.sceneItems.map( item => ( { name: item.sourceName, enabled: item.sceneItemEnabled } ) ) };
      await obs.call( 'StartRecord' ); started = true;
    }
    console.log( 'Running real Whisper/model beat:', beat );
    report.result = await ( beat === 'spanish' ? beatSpanish : beatEnglish )( pages, speech );
    report.journal = await pages.editor.evaluate( () => window.flux.journal );
    report.completed = true;
  } catch ( error ) {
    report.completed = false; report.error = error.message; process.exitCode = 1;
    console.error( error );
  } finally {
    const cleanup = async ( label, action ) => {
      try { await action(); }
      catch ( error ) {
        console.error( `${label}: ${error.message}` ); process.exitCode = 1; report.completed = false;
        ( report.cleanupErrors ||= [] ).push( `${label}: ${error.message}` );
      }
    };
    if ( started ) await cleanup( 'Stop/save OBS recording', async () => {
      const result = await obs.call( 'StopRecord' ); report.recording = result.outputPath; report.captured = true;
      const destination = path.join( dir, 'takes', name + path.extname( result.outputPath ) );
      await rename( result.outputPath, destination ); report.recording = destination;
    } );
    if ( previousDirectory ) await cleanup( 'Restore OBS directory', () => obs.call( 'SetRecordDirectory', { recordDirectory: previousDirectory } ) );
    if ( obs ) await cleanup( 'Disconnect OBS', () => obs.disconnect() );
    if ( context ) await cleanup( 'Close Chromium', () => context.close() );
    report.finished = new Date().toISOString();
    await writeFile( path.join( dir, 'takes', name + '.json' ), JSON.stringify( report, null, 2 ) + '\n', { flag: 'wx' } );
    console.log( JSON.stringify( report, null, 2 ) );
  }
}
if ( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) await main();
