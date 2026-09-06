#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const port=Number(process.argv[process.argv.indexOf('--port')+1]||8123);
const host='127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.obj':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav'};
function safePath(url){let raw;try{raw=decodeURIComponent(String(url||'/').split('?')[0]);}catch{return null;}if(raw.includes('\0'))return null;const rel=raw==='/'?'index.html':raw.replace(/^\/+/, '');const file=path.resolve(repo,rel);if(file!==repo&&!file.startsWith(repo+path.sep))return null;return file;}
const server=http.createServer((req,res)=>{let file=safePath(req.url);if(!file){res.writeHead(403);return res.end('forbidden');}try{const st=fs.statSync(file);if(st.isDirectory())file=path.join(file,'index.html');const ext=path.extname(file).toLowerCase();res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('not found');}});
server.listen(port,host,()=>{console.log(`[JWEB visual harness] serving ${repo}`);console.log(`world:    http://${host}:${port}/?visualProbe=1`);console.log(`fixture:  http://${host}:${port}/tools/visual-harness/specimen.html?mode=fixture&fixture=apartment-stair&target=flight-low`);console.log(`generator:http://${host}:${port}/tools/visual-harness/specimen.html?mode=generator&target=stair`);});
