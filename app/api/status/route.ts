import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getStats } from '@/lib/storage'

export async function GET() {
  // stay dynamic
  cookies().get('token')

  const stats = await getStats()
  return NextResponse.json(stats)
}
