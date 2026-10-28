const { ozonPost } = await import('./m9-ozon-push.js');

async function getTaskInfo() {
    const taskId = process.argv[2] || 4097519129;
    console.log(`=== Checking Ozon Import Task: ${taskId} ===\n`);

    try {
        const res = await ozonPost("/v1/product/import/info", {
            task_id: taskId
        });
        
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            console.log("Task Result JSON:", JSON.stringify(res.json, null, 2));
        } else {
            console.log("Task Result Text:", res.text.slice(0, 500));
        }

    } catch (err) {
        console.error("Fatal Error:", err.message);
    }
}

getTaskInfo();
