import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import worker from './src/index.js'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const parseVars = file => Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => {
  const index = line.indexOf('=')
  const key = line.slice(0, index).trim()
  let value = line.slice(index + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  return [key, value]
}))
const secrets = parseVars(path.join(root, '.dev.vars'))
const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'))
const kvPath = path.join(root, '.local-kv.json')
let records = fs.existsSync(kvPath) ? JSON.parse(fs.readFileSync(kvPath, 'utf8')) : {}
const save = () => fs.writeFileSync(kvPath, JSON.stringify(records), 'utf8')
const STRAVA_TOKENS = {
  async get(key, type) { const item = records[key]; if (!item || (item.expires && item.expires < Date.now())) { delete records[key]; return null } return type === 'json' ? JSON.parse(item.value) : item.value },
  async put(key, value, options = {}) { records[key] = { value, expires: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null }; save() },
  async delete(key) { delete records[key]; save() },
}
const env = { ...config.vars, ...secrets, STRAVA_TOKENS }
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const request = new Request(`http://127.0.0.1:8790${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body })
    const response = await worker.fetch(request, env)
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })) }
})
server.listen(8790, '127.0.0.1', () => console.log('Fit Logic Strava API ready on http://127.0.0.1:8790'))