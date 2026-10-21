import { Queue } from 'bullmq';

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Define strictly typed Queues for the AI OS Pipeline
export const Queues = {
    AmazonCrossReference: new Queue('amazon-reference-queue', { connection }),
    Compliance:           new Queue('compliance-queue', { connection }),
    GroqSEO:              new Queue('groq-seo-queue', { connection }),
    ListingOptimization:  new Queue('listing-optimization-queue', { connection }),
    CompetitorPricing:    new Queue('competitor-pricing-queue', { connection }),
    CostCalculator:       new Queue('cost-calculator-queue', { connection }),
    ApprovalQueue:        new Queue('approval-queue', { connection }),
    OzonPush:             new Queue('push-to-ozon-queue', { connection }),
    Verification:         new Queue('verification-queue', { connection }),
    Reanalysis:           new Queue('reanalysis-queue', { connection })
};

export async function addJobToQueue(queueName, data, options = {}) {
    // Allows looking up by key ('AmazonCrossReference') or strict name ('amazon-reference-queue')
    let queue = Queues[queueName] || Object.values(Queues).find(q => q.name === queueName);
    
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    
    return await queue.add(data.product_id || crypto.randomUUID(), data, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false, // Leave in failed state for Dead Letter Queue inspection
        ...options
    });
}
