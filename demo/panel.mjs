export function mountFluxPanel( host, engine ) {
  document.getElementById( 'futureflux' )?.remove();
  const root = document.createElement( 'section' );
  root.id = 'futureflux';
  root.innerHTML = `<style>
    #futureflux{position:fixed;left:28px;top:28px;width:365px;max-height:calc(100vh - 100px);overflow:auto;z-index:10000;background:#10292ded;color:#eef6ef;border:1px solid #6c9290;border-radius:16px;padding:24px;font:16px/1.5 system-ui;box-shadow:0 12px 50px #0005}
    #futureflux *{box-sizing:border-box}#futureflux h1{font-size:30px;line-height:1.1;margin:7px 0 15px}#futureflux h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#acd0c5;margin-top:22px}
    #futureflux .eyebrow{font-size:11px;letter-spacing:2px;color:#d9bc7e}#futureflux .badge{display:block;color:#f1d49b;font-size:12px;padding:8px 0;border-top:1px solid #55716b}
    #futureflux textarea{width:100%;height:90px;background:#082024;color:white;border:1px solid #6c9290;border-radius:7px;padding:10px;font:16px system-ui}
    #futureflux button{background:#d4be89;color:#10292d;border:0;border-radius:7px;padding:10px 14px;font-weight:700;cursor:pointer;margin-top:8px}#futureflux button:disabled{opacity:.5}
    #futureflux ul{padding-left:20px}#futureflux li{margin:9px 0}#futureflux code{color:#f5dca0;font-size:13px}#flux-status{white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #d4be89;padding-left:12px;margin:15px 0;min-height:75px}
    #flux-model{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#b1d0c7}#futureflux small{display:block;color:#bdd2ca;font-size:12px}
    #flux-cursor{pointer-events:none;position:fixed;left:0;top:0;width:17px;height:17px;border:2px solid white;border-radius:50%;background:#10292d88;z-index:2147483647}
  </style><div class="eyebrow">CITIES DELIVER / FUTUREFLUX</div>
  <h1>A little shade.<br>A shared possibility.</h1>
  <small>Red Mountain Multigenerational Center<br>Mesa, Arizona / representative massing</small>
  <h2>Host-enumerated paths in view</h2><ul id="flux-candidates"></ul>
  <h2>Whisper transcript</h2><textarea id="flux-transcript" aria-label="Whisper transcript" placeholder="Transcribe speech in Whisper, then send the actual result."></textarea>
  <button id="flux-send">Ask the model</button>
  <div id="flux-status" role="status">Ready. No model response is pre-recorded.</div>
  <pre id="flux-model"></pre>
  <span class="badge">SYNTHETIC SPEECH / Dub-generated test audio</span>
  <small>City of Mesa GIS: mapped paths + footprint.<br>Conceptual shade only; no cooling prediction.<br>Heat layer withheld: reuse licence not verified.</small>`;
  document.body.appendChild( root );
  const status = root.querySelector( '#flux-status' ), list = root.querySelector( '#flux-candidates' );
  const refresh = paths => {
    list.replaceChildren();
    for ( const path of paths ) {
      const li = document.createElement( 'li' ), name = document.createElement( 'strong' ), id = document.createElement( 'code' );
      name.textContent = path.label; id.textContent = path.id;
      li.append( name, document.createElement( 'br' ), id ); list.appendChild( li );
    }
  };
  refresh( host.candidates() );
  const button = root.querySelector( '#flux-send' ), transcript = root.querySelector( '#flux-transcript' );
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = 'Enumerating paths; waiting for the real model...';
    const result = await host.hear( transcript.value, engine?.ready ? ( messages, schema ) => engine.complete( messages, { schema, maxTokens: 200, temperature: 0 } ) : null, event => {
      if ( event.phase === 'candidates' ) refresh( event.paths );
      if ( event.phase === 'model' ) root.querySelector( '#flux-model' ).textContent = `Model / ${( event.elapsedMs / 1000 ).toFixed( 2 )}s\n${event.raw}`;
    } );
    status.textContent = result.ok ? `Applied ${result.op}: ${result.id || ''}` : `${result.reason}\n${result.detail}`;
    status.dataset.reason = result.reason || ''; status.dataset.ok = String( result.ok ); status.dataset.finished = String( Date.now() );
    button.disabled = false;
  };
  window.flux = host;
  return () => { root.remove(); if ( window.flux === host ) delete window.flux; };
}
