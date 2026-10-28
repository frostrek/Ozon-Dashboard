#!/usr/bin/env bun

/**
 * M30 — Supabase Cleanup Script
 * Run this script to delete files in the product-images bucket
 * and free up storage quota limits.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (Bun.env.SUPABASE_URL ?? "").trim();
const SUPABASE_KEY = (Bun.env.SUPABASE_SERVICE_KEY ?? "").trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanupStorage() {
  console.log("=== Supabase Storage Cleanup ===");
  console.log("Fetching files from 'product-images' bucket...");
  
  // Storage list only returns 100 files by default. We need to loop.
  let allFiles = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data: files, error } = await supabase.storage.from('product-images').list('', {
      limit: 1000,
      offset: offset,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    
    if (error) {
      console.error("Error listing files:", error.message);
      return;
    }
    
    if (!files || files.length === 0) {
      hasMore = false;
    } else {
      // Exclude placeholder or hidden files like .emptyFolderPlaceholder
      const validFiles = files.filter(f => f.name !== '.emptyFolderPlaceholder');
      allFiles.push(...validFiles);
      offset += files.length;
      if (files.length < 1000) {
        hasMore = false;
      }
    }
  }
  
  if (allFiles.length === 0) {
    console.log("Bucket 'product-images' is empty. No cleanup needed.");
    return;
  }
  
  console.log(`Found ${allFiles.length} files. Starting deletion...`);
  
  // Delete in batches of 100 (Supabase limit for .remove())
  const BATCH_SIZE = 100;
  let deletedCount = 0;
  
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, i + BATCH_SIZE).map(f => f.name);
    const { error: deleteError } = await supabase.storage.from('product-images').remove(batch);
    
    if (deleteError) {
      console.error(`Error deleting batch ${i}-${i + BATCH_SIZE}:`, deleteError.message);
    } else {
      deletedCount += batch.length;
      console.log(`Deleted ${deletedCount}/${allFiles.length} files...`);
    }
  }
  
  console.log("Storage cleanup complete. Your quota should be restored.");
}

cleanupStorage().catch(console.error);
