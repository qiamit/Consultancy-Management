'use strict'

console.error(
  [
    'This Railway project is disconnected from hosted Supabase, Vercel, and github.com/qiamit/Qirlpl_Lims.git.',
    'Apply SQL against Railway Postgres. Do not use supabase link, db push, or Vercel deploy from this repo.',
  ].join('\n'),
)
process.exit(1)
