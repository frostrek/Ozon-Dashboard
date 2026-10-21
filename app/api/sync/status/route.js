import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const running = await prisma.pipelineRun.findFirst({
        where: { status: 'running' }
    });

    const lastSuccess = await prisma.pipelineRun.findFirst({
        where: { status: 'success' },
        orderBy: { start_time: 'desc' }
    });

    const isSyncing = !!running;
    const lastSync = lastSuccess ? lastSuccess.start_time : null;
    
    let ageMinutes = null;
    if (lastSync) {
        ageMinutes = Math.floor((new Date() - new Date(lastSync)) / 60000);
    }

    return NextResponse.json({
        isSyncing,
        lastSync,
        ageMinutes
    });
}
