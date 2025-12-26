import { createClient } from '@supabase/supabase-js'
import process from 'node:process'
import dotenv from 'dotenv'

// supaya bisa: DOTENV_CONFIG_PATH=.env.test
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default supabase
