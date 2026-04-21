import { type NextRequest } from 'next/server';

import { handleLocalBootstrapRequest } from '@/server/local-bootstrap-handler';

export async function POST(request: NextRequest): Promise<Response> {
  return handleLocalBootstrapRequest(request);
}