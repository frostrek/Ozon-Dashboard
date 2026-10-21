import { ProductWorkflowOrchestrator } from '../lib/agents/ProductWorkflowOrchestrator.js';
const orch = new ProductWorkflowOrchestrator();
console.log('[Workflow] Starting 200-product pipeline run...');
orch.runBatch(200).then(n => console.log('[Workflow] Done:', n)).catch(console.error);
