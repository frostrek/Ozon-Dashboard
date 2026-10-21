import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
    const products = await prisma.product.findMany({ take: 1 });
    if(products.length === 0) return console.log('No products');
    
    // Simulate LangGraph Orchestrator call
    const res = await fetch('http://localhost:3000/api/agents/langgraph-orchestrator', {
        method: 'POST',
        body: JSON.stringify({ productId: products[0].id }),
        headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await res.json();
    console.log('LangGraph Status:', data.status);
    if (data.finalState) {
        console.log('Amazon State Data:', data.finalState.amazonMasterData.title);
    }
    
    const amzRef = await prisma.amazonReference.findFirst({ where: { product_id: products[0].id } });
    console.log('Amazon Reference Table Match Level:', amzRef?.match_level);
    console.log('Amazon Reference Match Confidence:', amzRef?.match_confidence + '%');
    console.log('Needs Manual Review?', amzRef?.needs_manual_review);
}

test().catch(console.error).finally(()=>prisma.$disconnect());
