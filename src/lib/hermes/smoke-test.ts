// Smoke test: valida el port del protocolo cliente contra hermes serve real.
// Uso: npx tsx src/lib/hermes/smoke-test.ts
import { getStatus, getHermesConfig } from './config'
import { listSessions } from './sessions'
import { getCronJobs } from './cron'
import { getSkills } from './skills'
import { login, setServeBaseUrl } from './api-client'

async function main() {
  const base = process.env.NIM_SERVE_URL ?? 'http://127.0.0.1:9119'
  const user = process.env.NIM_SERVE_USER ?? 'nim'
  const pass = process.env.NIM_SERVE_PASS ?? 'Nim6444dd09728d5011'
  setServeBaseUrl(base)
  console.log(`Conectando a ${base}...`)

  // 0. Login
  try {
    await login(user, pass)
    console.log('✅ login OK (cookie capturada)')
  } catch (e) {
    console.log('⚠️ login falló (continuando sin auth):', (e as Error).message.slice(0, 120))
  }

  // 1. Status
  const status = await getStatus()
  console.log('✅ getStatus:', JSON.stringify({ version: status.version, gateway: status.gateway_state }))

  // 2. Config
  const cfg = await getHermesConfig()
  console.log('✅ getHermesConfig: keys =', Object.keys(cfg).slice(0, 5).join(', '))

  // 3. Sessions
  try {
    const sessions = await listSessions(3)
    console.log('✅ listSessions: total =', sessions?.total ?? '?', '| items =', (sessions?.sessions ?? []).length)
  } catch (e) {
    console.log('⚠️ listSessions:', (e as Error).message.slice(0, 120))
  }

  // 4. Cron
  try {
    const jobs = await getCronJobs()
    console.log('✅ getCronJobs:', jobs.length, 'jobs')
  } catch (e) {
    console.log('⚠️ getCronJobs:', (e as Error).message.slice(0, 120))
  }

  // 5. Skills
  try {
    const skills = await getSkills()
    console.log('✅ getSkills:', skills.length, 'skills')
  } catch (e) {
    console.log('⚠️ getSkills:', (e as Error).message.slice(0, 120))
  }

  console.log('SMOKE TEST COMPLETADO')
}

main().catch(e => {
  console.error('SMOKE TEST FALLÓ:', e)
  process.exit(1)
})
