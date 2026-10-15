import {build} from 'esbuild';
await build({entryPoints:['src/main.tsx'],outfile:'docs/app.js',bundle:true,minify:true,platform:'browser',format:'iife',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
console.log('Built docs/app.js. Runtime Sheets endpoint remains in docs/config.js.');
