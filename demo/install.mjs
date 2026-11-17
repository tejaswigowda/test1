import { createFluxHost } from './ops.mjs';
import { mountFluxPanel } from './panel.mjs';

export async function installFlux( editor, THREE ) {
  const look = editor.scene.userData.flux.look;
  for ( const key of [ 'shadows', 'shadowType', 'toneMapping', 'toneMappingExposure' ] ) {
    editor.config.setKey( 'project/renderer/' + key, look[ key ] );
  }
  const base = location.origin + '/editor/js/commands/';
  const [ { AddObjectCommand }, { RemoveObjectCommand }, { MultiCmdsCommand } ] = await Promise.all( [
    import( base + 'AddObjectCommand.js' ), import( base + 'RemoveObjectCommand.js' ), import( base + 'MultiCmdsCommand.js' )
  ] );
  window.disposeFlux?.();
  const host = createFluxHost( {
    THREE, scene: editor.scene, camera: editor.camera,
    changed: () => { editor.signals.sceneGraphChanged.dispatch(); editor.signals.cameraChanged.dispatch(); },
    commit: ( add, remove ) => {
      const commands = [];
      if ( remove ) commands.push( new RemoveObjectCommand( editor, remove ) );
      if ( add ) commands.push( new AddObjectCommand( editor, add ) );
      editor.execute( new MultiCmdsCommand( editor, commands ) );
    }
  } );
  window.disposeFlux = mountFluxPanel( host, editor.aiEngine );
  return host.candidates();
}
